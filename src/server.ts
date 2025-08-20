#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { QueryParser, ParsedQuery } from './query-parser.js';
import { SmartTrainSearchEngine, SmartSearchResult } from './smart-train-search.js';
import * as fs from 'fs';
import * as path from 'path';

// Type definitions for better type safety
interface NodeSystemError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  path?: string;
}

interface TransportError extends Error {
  code?: string;
  details?: unknown;
}

// Process exit codes
const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  UNCAUGHT_EXCEPTION: 1,
} as const;

// Timeout constants
const TIMEOUTS = {
  GRACEFUL_SHUTDOWN: 5000,      // 5 seconds for graceful shutdown
  SHUTDOWN_WAIT: 1000,           // 1 second wait before shutdown
  REQUEST_COMPLETE_WAIT: 100,    // 100ms wait for requests to complete
} as const;

// Retry configuration for API calls
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,           // 1 second initial delay
  MAX_DELAY: 10000,              // 10 seconds max delay
  BACKOFF_MULTIPLIER: 2,         // Double the delay each retry
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504] as readonly number[], // Rate limit and server errors
} as const;

// Load environment variables before any other code
// Using manual parsing instead of dotenv to avoid stdout pollution
// The dotenv package outputs to stdout which corrupts MCP JSON-RPC protocol
function loadEnvironmentVariables(): void {
  if (process.env.NODE_ENV === 'production') {
    return; // Skip loading .env in production
  }

  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      return; // No .env file, skip silently
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }
      
      // Handle KEY=VALUE format with support for quotes and multi-line values
      const equalsIndex = line.indexOf('=');
      if (equalsIndex === -1) {
        continue; // Invalid format, skip
      }
      
      const key = line.substring(0, equalsIndex).trim();
      let value = line.substring(equalsIndex + 1).trim();
      
      // Handle quoted values (single or double quotes)
      const isQuoted = (value.startsWith('"') && value.endsWith('"')) || 
                       (value.startsWith("'") && value.endsWith("'"));
      
      if (isQuoted) {
        // Remove surrounding quotes
        value = value.slice(1, -1);
        
        // Handle multi-line values for quoted strings
        while (!line.endsWith(value[0]) && i + 1 < lines.length) {
          i++;
          value += '\n' + lines[i];
        }
        
        // Unescape escaped characters
        value = value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'");
      }
      
      // Only set if not already defined (allows overrides from actual env)
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    // Silently ignore .env loading errors to avoid stdout pollution
    // Errors will be caught when trying to use the missing env vars
  }
}

// Load environment variables at startup
loadEnvironmentVariables();

// Constants - TPASS Monthly Pass Restrictions
// These train types are NOT eligible for TPASS monthly pass
const TPASS_RESTRICTED_TRAIN_TYPES = {
  TAROKO: '1',         // 太魯閣號 (Taroko Express)
  PUYUMA: '2',         // 普悠瑪號 (Puyuma Express) 
  EMU3000: '11'        // 新自強號 EMU3000 (New Tze-Chiang)
} as const;

// Common eligible train types for reference
// Based on TDX documentation, all types except 1, 2, 11 are eligible
const TPASS_ELIGIBLE_EXAMPLES = {
  TZE_CHIANG: '3',     // 自強號 (Tze-Chiang) - includes business/push-pull models
  CHU_KUANG: '4',      // 莒光號 (Chu-Kuang)
  FU_HSING: '5',       // 復興號 (Fu-Hsing)
  LOCAL: '6',          // 區間車 (Local Train)
  ORDINARY: '7',       // 普快車 (Ordinary Train)
  FAST_LOCAL: '10'     // 區間快 (Fast Local)
} as const;

const API_CONFIG = {
  TOKEN_CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds  
  TOKEN_SAFETY_BUFFER: 5 * 60 * 1000,       // 5 minutes in milliseconds
  LIVE_DATA_CACHE_DURATION: 45 * 1000,      // 45 seconds in milliseconds
  RATE_LIMIT_WINDOW: 60 * 1000,             // 1 minute in milliseconds
  MAX_REQUESTS_PER_WINDOW: 50,
  MAX_QUERY_LENGTH: 500,
  MAX_CONTEXT_LENGTH: 200
} as const;

// Time and data quality constants
const TIME_CONSTANTS = {
  DEFAULT_TIME_WINDOW_HOURS: 2,
  MAX_REASONABLE_TRAVEL_HOURS: 6,     // Filter out abnormal travel times
  TIME_LOOKBACK_HOURS: 1,             // Show trains 1 hour before target time
  MILLISECONDS_PER_HOUR: 60 * 60 * 1000,
  HOURS_IN_DAY: 24,
  LATE_WARNING_MINUTES: 15,           // Show warning when train departs in 15 minutes
  EPOCH_DATE_PREFIX: '1970-01-01T',   // Used for time calculations
  TOKEN_SAFETY_BUFFER_SECONDS: 300,   // 5 minutes in seconds for token refresh
  FAR_FUTURE_DAYS: 365                // Days in the future for invalid date fallback
} as const;

// HTTP and API constants
const HTTP_CONSTANTS = {
  NOT_FOUND: 404,
  SESSION_ID_LENGTH: 9               // Length of random session ID suffix
} as const;

// Memory management constants
const MEMORY_CONSTANTS = {
  MAX_CACHE_ENTRIES: 1000,           // Maximum entries in live data cache
  CACHE_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes between cache cleanups
  MAX_TRAINS_PER_RESULT: 50,         // Limit train results to prevent memory bloat
  MAX_STATION_SEARCH_RESULTS: 10     // Limit station search results
} as const;

// Response optimization constants (Stage 8: Context Window Optimization)
const RESPONSE_CONSTANTS = {
  MAX_RESPONSE_TOKENS: 2000,         // Target maximum tokens per response
  MAX_TRAINS_IN_JSON: 10,            // Reduce JSON train count for context efficiency
  MAX_TRAINS_FOR_SIMPLE_QUERY: 5,   // Even fewer for "find fastest" type queries
  COMPACT_JSON: true,                // Use compact JSON formatting (no pretty-print)
  INCLUDE_FULL_JSON: false           // Whether to include comprehensive JSON by default
} as const;

// Validation constants for input bounds
const VALIDATION_BOUNDS = {
  YEAR_MIN: 2020,                    // Minimum valid year for train dates
  YEAR_MAX: 2030,                    // Maximum valid year for train dates
  MONTH_MIN: 1,
  MONTH_MAX: 12,
  DAY_MIN: 1,
  DAY_MAX: 31,
  HOUR_MIN: 0,
  HOUR_MAX: 23,
  MINUTE_MIN: 0,
  MINUTE_MAX: 59,
  SECOND_MIN: 0,
  SECOND_MAX: 59,
  TIME_WINDOW_MIN: 1,                // Minimum time window in hours
  TIME_WINDOW_MAX: 24                // Maximum time window in hours
} as const;

// Utility function to check if running in test environment
function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
}

// Fare calculation configuration
// Based on TRA official rules: https://www.railway.gov.tw/tra-tip-web/tip
interface FareRules {
  child: number;    // 兒童票: 成人票價半數
  senior: number;   // 敬老愛心票: 成人票價半數
  disabled: number; // 愛心票: 成人票價半數
  roundingMethod: 'round' | 'floor' | 'ceil'; // 四捨五入方式
}

const DEFAULT_FARE_RULES: FareRules = {
  child: 0.5,     // 50% of adult fare
  senior: 0.5,    // 50% of adult fare
  disabled: 0.5,  // 50% of adult fare
  roundingMethod: 'round' // 四捨五入
};

// TDX API Types
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface CachedLiveData {
  data: Map<string, TDXLiveBoardEntry>;
  fetchedAt: number;
  expiresAt: number;
}

// Error categorization for better handling and monitoring
enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication', 
  RATE_LIMIT = 'rate_limit',
  VALIDATION = 'validation',
  DATA_NOT_FOUND = 'data_not_found',
  API_ERROR = 'api_error',
  SYSTEM = 'system'
}

interface CategorizedError {
  category: ErrorCategory;
  message: string;
  originalError?: Error;
  context?: Record<string, any>;
}

interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

class TRAError extends Error {
  public readonly category: ErrorCategory;
  public readonly context?: Record<string, any>;
  
  constructor(category: ErrorCategory, message: string, context?: Record<string, any>, originalError?: Error) {
    super(message);
    this.name = 'TRAError';
    this.category = category;
    this.context = context;
    
    if (originalError && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

interface TRAStation {
  StationID: string;
  StationName: { Zh_tw: string; En: string };
  StationAddress?: string;
  StationPosition?: { PositionLat: number; PositionLon: number };
}

interface StationSearchResult {
  stationId: string;
  name: string;
  confidence: number;
  address?: string;
  coordinates?: { lat: number; lon: number };
}

interface TRATrainTimetableStop {
  StationID: string;
  StationName: { Zh_tw: string; En: string };
  ArrivalTime: string;
  DepartureTime: string;
  StopTime: number;
}

interface TRATrainTimetable {
  TrainInfo: {
    TrainNo: string;
    Direction: number;
    TrainTypeID: string;
    TrainTypeCode: string;
    TrainTypeName: { Zh_tw: string; En: string };
    TripHeadSign: string;
    StartingStationID: string;
    StartingStationName: { Zh_tw: string; En: string };
    EndingStationID: string;
    EndingStationName: { Zh_tw: string; En: string };
    TripLine: number;
    WheelChairFlag: number;
    PackageServiceFlag: number;
    DiningFlag: number;
    BreastFeedFlag: number;
    BikeFlag: number;
    CarFlag: number;
    DailyFlag: number;
    ExtraTrainFlag: number;
    SuspendedFlag: number;
    Note?: string;
  };
  StopTimes: Array<{
    StopSequence: number;
    StationID: string;
    StationName: { Zh_tw: string; En: string };
    ArrivalTime: string;
    DepartureTime: string;
    SuspendedFlag: number;
  }>;
}

// v3 API response wrappers
interface TDXDateRangeResponse {
  UpdateTime: string;
  UpdateInterval: number;
  AuthorityCode: string;
  StartDate: string;
  EndDate: string;
  TrainDates: string[];
  Count: number;
}

interface TDXTrainTimetableResponse {
  UpdateTime: string;
  UpdateInterval: number;
  SrcUpdateTime?: string;
  SrcUpdateInterval?: number;
  TrainDate: string;
  TrainTimetables: TRATrainTimetable[];
}

// TDX API fare response structure
interface TDXFareResponse {
  OriginStationID: string;
  OriginStationName: {
    Zh_tw: string;
    En: string;
  };
  DestinationStationID: string;
  DestinationStationName: {
    Zh_tw: string;
    En: string;
  };
  Direction: number;
  Fares: TDXFareDetail[];
}

interface TDXFareDetail {
  TicketType: string;
  FareClass: string;
  CabinClass?: string;
  Price: number;
}

interface FareInfo {
  adult: number;
  child: number;
  senior: number;
  disabled: number;
  currency: string;
}

// Live Board response structure for real-time train information
interface TDXLiveBoardEntry {
  StationID: string;
  StationName: { Zh_tw: string; En: string };
  TrainNo: string;
  TrainTypeID: string;
  TrainTypeName: { Zh_tw: string; En: string };
  Direction: number;
  EndingStationID: string;
  EndingStationName: { Zh_tw: string; En: string };
  ScheduledDepartureTime: string;
  ActualDepartureTime?: string;
  DelayTime?: number;  // Delay in minutes
  TrainStatus?: string; // e.g., "準點", "誤點", "取消"
  Platform?: string;
}

interface TrainSearchResult {
  trainNo: string;
  trainType: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  travelTime: string;
  isMonthlyPassEligible: boolean;
  stops: number;
  minutesUntilDeparture?: number;
  isLate?: boolean;
  hasLeft?: boolean;
  lateWarning?: string;
  isBackupOption?: boolean;
  fareInfo?: FareInfo;
  // Real-time delay information
  delayMinutes?: number;
  actualDepartureTime?: string;
  actualArrivalTime?: string;
  trainStatus?: string; // "準點", "誤點", "取消"
}

class SmartTRAServer {
  private server: Server;
  private isShuttingDown = false;
  private isConnected = false;
  private requestCount = new Map<string, number>();
  private lastRequestTime = new Map<string, number>();
  private readonly sessionId: string;
  
  // TDX API integration
  private tokenCache: CachedToken | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;
  private stationData: TRAStation[] = [];
  private stationDataLoaded = false;
  private stationLoadFailed = false;
  private lastStationLoadAttempt = 0;
  
  // Live data caching - reduces API calls to TDX
  private liveDataCache = new Map<string, CachedLiveData>();
  
  // Query parsing
  private queryParser: QueryParser;
  
  // Smart train search engine
  private smartSearchEngine: SmartTrainSearchEngine;
  
  // Performance indexes for fast station search
  private stationNameIndex = new Map<string, TRAStation[]>();
  private stationEnNameIndex = new Map<string, TRAStation[]>();
  private stationPrefixIndex = new Map<string, TRAStation[]>();
  
  // Rate limiting and cache cleanup
  private lastRateLimitCleanup = Date.now();
  private lastCacheCleanup = Date.now();
  
  // Security limits
  private readonly MAX_QUERY_LENGTH = API_CONFIG.MAX_QUERY_LENGTH;
  private readonly MAX_CONTEXT_LENGTH = API_CONFIG.MAX_CONTEXT_LENGTH;
  private readonly RATE_LIMIT_WINDOW = API_CONFIG.RATE_LIMIT_WINDOW;
  private readonly RATE_LIMIT_MAX_REQUESTS = API_CONFIG.MAX_REQUESTS_PER_WINDOW;
  private readonly GRACEFUL_SHUTDOWN_TIMEOUT = TIMEOUTS.GRACEFUL_SHUTDOWN;
  
  // Pre-compiled regex patterns for performance optimization
  private readonly REGEX_PATTERNS = {
    ISO_DATE: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    TIME_FORMAT: /^(\d{1,2}):(\d{2})$/,
    TIME_WITH_SECONDS: /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  } as const;

  constructor() {
    // Generate unique session identifier for rate limiting
    this.sessionId = `pid-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, HTTP_CONSTANTS.SESSION_ID_LENGTH)}`;
    
    // Initialize query parser and smart search engine
    this.queryParser = new QueryParser();
    this.smartSearchEngine = new SmartTrainSearchEngine();
    
    this.server = new Server(
      {
        name: 'smart-tra-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupGracefulShutdown();
    // Station data will be loaded after connection is established in start() method
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_trains',
            description: 'Search for train schedules, real-time status, and fares using natural language queries',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language query about trains (e.g., "Tomorrow morning 8am Taipei to Taichung fastest train")',
                },
                context: {
                  type: 'string',
                  description: 'Optional additional context or preferences',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'search_station',
            description: 'Find and confirm train station information',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Station name or location to search for',
                },
                context: {
                  type: 'string',
                  description: 'Optional additional context',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'plan_trip',
            description: 'Plan a train journey with recommendations and alternatives',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Trip planning request in natural language',
                },
                context: {
                  type: 'string',
                  description: 'Optional preferences (fastest, cheapest, fewest transfers)',
                },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Check if server is shutting down
      if (this.isShuttingDown) {
        throw new Error('Server is shutting down');
      }

      let name: string;
      let args: Record<string, any>;

      try {
        const params = request.params;
        name = params.name;
        args = params.arguments || {};

        // Enhanced input validation with error handling
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }

        // Additional safety check for args structure
        if (Array.isArray(args)) {
          throw new Error('Invalid arguments: expected object, got array');
        }

        // Ensure args can be safely accessed
        if (args === null) {
          throw new Error('Invalid arguments: arguments cannot be null');
        }
      } catch (error) {
        // Log security event for malformed requests
        this.logError('Security: Malformed request detected', error, { sessionId: this.sessionId });
        throw error;
      }

      const query = args.query;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new TRAError(ErrorCategory.VALIDATION, 'Invalid query: must be a non-empty string', { 
          providedType: typeof query,
          providedValue: query 
        });
      }
      
      // Security: Check input length limits
      if (query.length > this.MAX_QUERY_LENGTH) {
        throw new TRAError(ErrorCategory.VALIDATION, 
          `Query too long: maximum ${this.MAX_QUERY_LENGTH} characters allowed`,
          { 
            queryLength: query.length,
            maxLength: this.MAX_QUERY_LENGTH 
          }
        );
      }

      // Validate context parameter if provided
      const context = args.context;
      if (context !== undefined && typeof context !== 'string') {
        throw new TRAError(ErrorCategory.VALIDATION, 'Invalid context: must be a string if provided', {
          providedType: typeof context,
          providedValue: context
        });
      }
      
      if (context && context.length > this.MAX_CONTEXT_LENGTH) {
        throw new TRAError(ErrorCategory.VALIDATION,
          `Context too long: maximum ${this.MAX_CONTEXT_LENGTH} characters allowed`,
          {
            contextLength: context.length,
            maxLength: this.MAX_CONTEXT_LENGTH
          }
        );
      }
      
      // Rate limiting with session-based identification
      this.checkRateLimit(this.sessionId);

      // Sanitize inputs for logging (remove potential control characters)
      const sanitizedQuery = query.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
      const sanitizedContext = context ? context.replace(/[\x00-\x1f\x7f-\x9f]/g, '') : undefined;

      // STAGE 2 FOUNDATION: Mock responses for MCP protocol validation
      // These will be replaced with real TDX API integration in Stage 3
      switch (name) {
        case 'search_trains':
          return await this.handleSearchTrains(sanitizedQuery, sanitizedContext);

        case 'search_station':
          return await this.handleSearchStation(sanitizedQuery, sanitizedContext);

        case 'plan_trip':
          return {
            content: [
              {
                type: 'text',
                text: `[STAGE 2 MOCK] Trip planning for: "${sanitizedQuery}"${sanitizedContext ? ` (context: ${sanitizedContext})` : ''}\n\n` +
                      `🗺️ This is a mock response demonstrating MCP protocol functionality.\n` +
                      `✅ Query validated, sanitized, and rate-limited successfully.\n` +
                      `🔄 Real TDX trip planning integration coming in Stage 3.\n\n` +
                      `Expected future response: Route options, timing, transfers, costs.`,
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  // TDX API Authentication with race condition protection
  // Utility function for API calls with retry logic and exponential backoff
  private async fetchWithRetry(
    url: string, 
    options: RequestInit, 
    retryCount = 0
  ): Promise<Response> {
    try {
      const response = await fetch(url, options);
      
      // Check if we should retry based on status code
      if (RETRY_CONFIG.RETRYABLE_STATUS_CODES.includes(response.status) && 
          retryCount < RETRY_CONFIG.MAX_RETRIES) {
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount),
          RETRY_CONFIG.MAX_DELAY
        );
        
        console.error(
          `API request failed with status ${response.status}, retrying in ${delay}ms... ` +
          `(attempt ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES})`
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, options, retryCount + 1);
      }
      
      return response;
    } catch (error) {
      // Network errors or timeouts
      if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount),
          RETRY_CONFIG.MAX_DELAY
        );
        
        console.error(
          `API request failed with error: ${error}, retrying in ${delay}ms... ` +
          `(attempt ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES})`
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, options, retryCount + 1);
      }
      
      throw error; // Re-throw after all retries exhausted
    }
  }

  private async getAccessToken(): Promise<string> {
    // Check cache first
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    // If token refresh is already in progress, wait for it
    if (this.tokenRefreshPromise) {
      return await this.tokenRefreshPromise;
    }

    // Start token refresh
    this.tokenRefreshPromise = this.refreshToken();
    
    try {
      const token = await this.tokenRefreshPromise;
      return token;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  private async refreshToken(): Promise<string> {
    const clientId = process.env.TDX_CLIENT_ID;
    const clientSecret = process.env.TDX_CLIENT_SECRET;
    const authUrl = process.env.TDX_AUTH_URL || 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

    if (!clientId || !clientSecret) {
      const missingVars: string[] = [];
      if (!clientId) missingVars.push('TDX_CLIENT_ID');
      if (!clientSecret) missingVars.push('TDX_CLIENT_SECRET');
      
      throw new TRAError(
        ErrorCategory.AUTHENTICATION,
        `TDX credentials not configured. Missing: ${missingVars.join(', ')}\n\n` +
        `Please:\n` +
        `1. Create a .env file in the project root\n` +
        `2. Add your TDX API credentials:\n` +
        `   TDX_CLIENT_ID=your_client_id\n` +
        `   TDX_CLIENT_SECRET=your_client_secret\n\n` +
        `Get credentials from: https://tdx.transportdata.tw/`,
        { missingVars }
      );
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await this.fetchWithRetry(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TRAError(
        ErrorCategory.AUTHENTICATION,
        `TDX authentication failed: ${response.status} ${response.statusText} - ${errorText}`,
        { 
          status: response.status, 
          statusText: response.statusText, 
          authUrl,
          errorDetails: errorText 
        }
      );
    }

    const tokenData = await response.json() as TokenResponse;
    
    // Cache the token (expires in 24 hours minus 5 minutes for safety)
    const expiresAt = Date.now() + (tokenData.expires_in - TIME_CONSTANTS.TOKEN_SAFETY_BUFFER_SECONDS) * 1000;
    this.tokenCache = {
      token: tokenData.access_token,
      expiresAt
    };
    
    console.error('TDX access token obtained successfully');
    return tokenData.access_token;
  }

  // Call TDX Daily Train Timetable API with data availability handling
  private async getDailyTrainTimetable(originStationId: string, destinationStationId: string, trainDate?: string): Promise<TRATrainTimetable[]> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      // First, check available date range from v3 API
      const dateRangeResponse = await this.fetchWithRetry(`${baseUrl}/v3/Rail/TRA/DailyTrainTimetable/TrainDates?%24format=JSON`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!dateRangeResponse.ok) {
        this.logError('Failed to fetch available dates from TDX API', undefined, { 
          status: dateRangeResponse.status, 
          statusText: dateRangeResponse.statusText 
        });
        throw new Error('Service temporarily unavailable. Please try again later.');
      }
      
      const dateRange = await dateRangeResponse.json() as TDXDateRangeResponse;
      const availableDates = dateRange.TrainDates || [];
      
      // Use today if no date specified, or validate requested date
      let date = trainDate || new Date().toISOString().split('T')[0];
      
      // Validate date is within available range
      if (trainDate && !availableDates.includes(trainDate)) {
        console.error(`Requested date ${trainDate} is not available in TDX data. Available dates: ${dateRange.StartDate} to ${dateRange.EndDate}`);
        date = new Date().toISOString().split('T')[0];
        
        // Double-check today is available, otherwise use first available date
        if (!availableDates.includes(date) && availableDates.length > 0) {
          date = availableDates[0];
          console.error(`Using first available date: ${date}`);
        }
      }
      
      // Use v3 API endpoints for better data availability  
      // Always use the date format - "Today" endpoint doesn't work for OD queries
      const endpoint = `/v3/Rail/TRA/DailyTrainTimetable/OD/${originStationId}/to/${destinationStationId}/${date}`;
      
      const response = await this.fetchWithRetry(`${baseUrl}${endpoint}?%24format=JSON`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // Handle common API failure scenarios
        if (response.status === HTTP_CONSTANTS.NOT_FOUND) {
          console.error(`No timetable data found for route ${originStationId} → ${destinationStationId} on ${date}`);
          return []; // Return empty array for no data found
        }
        this.logError('Failed to fetch train timetable from TDX API', undefined, { 
          status: response.status, 
          statusText: response.statusText,
          originStationId,
          destinationStationId,
          date
        });
        throw new Error('Unable to retrieve train schedule. Please check your route and try again.');
      }

      const responseData = await response.json() as TDXTrainTimetableResponse;
      
      // v3 API returns wrapped data structure - limit results to prevent memory issues
      const data = (responseData.TrainTimetables || []).slice(0, MEMORY_CONSTANTS.MAX_TRAINS_PER_RESULT);
      
      // Handle data availability scenarios
      if (!data || data.length === 0) {
        console.error(`No trains available for route ${originStationId} → ${destinationStationId} on ${date}`);
        console.error('This could happen if:');
        console.error('- No trains run on this route on the specified date');
        console.error('- Trains are suspended due to maintenance or weather');
        console.error('- Route does not exist or station IDs are incorrect');
        return [];
      }
      
      console.error(`Retrieved ${data.length} trains for ${originStationId} → ${destinationStationId} on ${date}`);
      return data;
    } catch (error) {
      console.error('Error fetching train timetable:', error);
      throw error;
    }
  }

  // Process train timetable data for search results
  private processTrainSearchResults(trains: TRATrainTimetable[], originStationId: string, destinationStationId: string): TrainSearchResult[] {
    const results: TrainSearchResult[] = [];
    
    for (const train of trains) {
      // Find origin and destination stops
      const originStop = train.StopTimes.find(stop => stop.StationID === originStationId);
      const destinationStop = train.StopTimes.find(stop => stop.StationID === destinationStationId);
      
      if (!originStop || !destinationStop) {
        continue; // Skip trains that don't stop at both stations
      }
      
      // Calculate travel time
      const departureTime = originStop.DepartureTime || originStop.ArrivalTime;
      const arrivalTime = destinationStop.ArrivalTime || destinationStop.DepartureTime;
      const travelTime = this.calculateTravelTime(departureTime, arrivalTime);
      
      // Data quality check: Skip trains with abnormally long travel times
      // Taipei to Taichung should never take more than 5 hours
      // This filters out bad data from TDX API
      const travelTimeHours = this.getTravelTimeInHours(departureTime, arrivalTime);
      if (travelTimeHours > TIME_CONSTANTS.MAX_REASONABLE_TRAVEL_HOURS) {
        this.logError(`Skipping train due to abnormal travel time`, undefined, {
          trainNo: train.TrainInfo.TrainNo,
          travelTimeHours,
          threshold: TIME_CONSTANTS.MAX_REASONABLE_TRAVEL_HOURS
        });
        continue;
      }
      
      // Count intermediate stops
      // Note: OD endpoint only returns origin and destination stops, so we use StopSequence
      // to calculate the actual number of intermediate stations
      const originSequence = originStop.StopSequence;
      const destinationSequence = destinationStop.StopSequence;
      const stops = Math.abs(destinationSequence - originSequence) - 1; // Exclude origin and destination
      
      // Check TPASS monthly pass eligibility using restriction-based approach
      // All trains are eligible EXCEPT those explicitly restricted
      const restrictedTrainTypes: string[] = Object.values(TPASS_RESTRICTED_TRAIN_TYPES);
      const isMonthlyPassEligible = !restrictedTrainTypes.includes(train.TrainInfo.TrainTypeCode);
      
      results.push({
        trainNo: train.TrainInfo.TrainNo,
        trainType: train.TrainInfo.TrainTypeName.Zh_tw,
        origin: originStop.StationName.Zh_tw,
        destination: destinationStop.StationName.Zh_tw,
        departureTime,
        arrivalTime,
        travelTime,
        isMonthlyPassEligible,
        stops
      });
    }
    
    return results;
  }

  // Calculate travel time between two time strings
  private calculateTravelTime(departureTime: string, arrivalTime: string): string {
    try {
      const departure = new Date(`${TIME_CONSTANTS.EPOCH_DATE_PREFIX}${departureTime}`);
      const arrival = new Date(`${TIME_CONSTANTS.EPOCH_DATE_PREFIX}${arrivalTime}`);
      
      // Handle next-day arrivals
      if (arrival < departure) {
        arrival.setDate(arrival.getDate() + 1);
      }
      
      const diffMs = arrival.getTime() - departure.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours === 0) {
        return `${minutes}分`;
      } else {
        return `${hours}小時${minutes}分`;
      }
    } catch (error) {
      return '未知';
    }
  }
  
  // Get travel time in hours for data quality checks
  private getTravelTimeInHours(departureTime: string, arrivalTime: string): number {
    try {
      const departure = new Date(`${TIME_CONSTANTS.EPOCH_DATE_PREFIX}${departureTime}`);
      const arrival = new Date(`${TIME_CONSTANTS.EPOCH_DATE_PREFIX}${arrivalTime}`);
      
      // Handle next-day arrivals
      if (arrival < departure) {
        arrival.setDate(arrival.getDate() + 1);
      }
      
      const diffMs = arrival.getTime() - departure.getTime();
      return diffMs / (1000 * 60 * 60);
    } catch (error) {
      return 0;
    }
  }

  // Get fare information between two stations
  private async getODFare(originStationId: string, destinationStationId: string): Promise<FareInfo | null> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      // Use the OD (Origin-Destination) fare endpoint
      const endpoint = `/v3/Rail/TRA/ODFare/${originStationId}/to/${destinationStationId}`;
      
      const response = await this.fetchWithRetry(`${baseUrl}${endpoint}?%24format=JSON`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        this.logError('Fare data not available from TDX API', undefined, { 
          originStationId, 
          destinationStationId, 
          status: response.status 
        });
        return null;
      }

      const fareData = await response.json() as TDXFareResponse[];
      
      if (!Array.isArray(fareData) || fareData.length === 0) {
        console.error(`No fare data found for route ${originStationId} → ${destinationStationId}`);
        return null;
      }

      // Process fare data to extract common ticket types
      const fareInfo = this.processFareData(fareData[0]);
      console.error(`Retrieved fare data for ${originStationId} → ${destinationStationId}`);
      return fareInfo;
    } catch (error) {
      this.logError('Failed to get fare data', error, { 
        originStationId, 
        destinationStationId,
        operation: 'getODFare'
      });
      return null; // Graceful fallback
    }
  }

  /**
   * Process TDX fare response into structured fare information
   * 
   * TRA Fare Rules (台鐵票價規則):
   * - 成人票: 按乘車區間營業里程乘票價率計算
   * - 兒童票: 未滿12歲，滿115公分未滿150公分，票價按成人票價半數四捨五入
   * - 敬老愛心票: 年滿65歲或身心障礙者，票價按成人票價半數四捨五入
   * - 愛心陪伴票: 身心障礙者的必要陪伴者一人享有優惠
   */
  private processFareData(fareResponse: TDXFareResponse): FareInfo {
    const fareInfo: FareInfo = {
      adult: 0,
      child: 0,
      senior: 0,
      disabled: 0,
      currency: 'TWD'
    };

    // Map TDX ticket types to our structure
    for (const fare of fareResponse.Fares) {
      const price = fare.Price;
      
      switch (fare.TicketType) {
        case '全票':
        case 'Adult':
          fareInfo.adult = price;
          break;
        case '兒童票':  // Standard term for child ticket
        case '孩童票':  // Alternative term sometimes used
        case 'Child':
          fareInfo.child = price;
          break;
        case '敬老愛心票':  // Standard combined term
        case '敬老票':  // Senior ticket
        case '老人票':  // Alternative senior term
        case 'Senior':
          fareInfo.senior = price;
          break;
        case '愛心票':  // Disability discount ticket
        case '愛心陪伴票':  // Companion ticket for disabled
        case '身心障礙票':
        case 'Disabled':
          fareInfo.disabled = price;
          break;
        default:
          // If we don't have adult fare yet, use the first fare as adult
          if (fareInfo.adult === 0) {
            fareInfo.adult = price;
          }
      }
    }

    // If we only have adult fare, calculate others based on configurable fare rules
    // Load fare rules from environment or use defaults
    const fareRules = this.getFareRules();
    
    if (fareInfo.adult > 0) {
      const roundFn = this.getRoundingFunction(fareRules.roundingMethod);
      
      if (fareInfo.child === 0) {
        fareInfo.child = roundFn(fareInfo.adult * fareRules.child); // 兒童票: 成人票價 * 配置比例
      }
      if (fareInfo.senior === 0) {
        fareInfo.senior = roundFn(fareInfo.adult * fareRules.senior); // 敬老愛心票: 成人票價 * 配置比例
      }
      if (fareInfo.disabled === 0) {
        fareInfo.disabled = roundFn(fareInfo.adult * fareRules.disabled); // 愛心票: 成人票價 * 配置比例
      }
    }

    return fareInfo;
  }

  /**
   * Get live delay data from TDX Station Live Board API with caching
   * Cache duration: 45 seconds to balance real-time accuracy with API rate limits
   * @param stationId - TRA station ID
   * @returns Map of train numbers to live board entries
   */
  private async tryGetLiveDelayData(stationId: string): Promise<Map<string, TDXLiveBoardEntry>> {
    const now = Date.now();
    
    // Check cache first - return cached data if still valid
    const cached = this.liveDataCache.get(stationId);
    if (cached && cached.data && now < cached.expiresAt) {
      console.error(`Using cached live data for station ${stationId} (${cached.data.size} trains)`);
      return new Map(cached.data); // Return a copy to prevent external modifications
    }
    
    const liveDataMap = new Map<string, TDXLiveBoardEntry>();
    
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      console.error(`Fetching fresh live data for station ${stationId}`);
      const response = await this.fetchWithRetry(`${baseUrl}/v3/Rail/TRA/StationLiveBoard/Station/${stationId}?%24format=JSON&%24top=50`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const categorizedError = this.categorizeError(
          `API returned ${response.status}: ${response.statusText}`,
          { stationId, endpoint: 'StationLiveBoard', status: response.status }
        );
        console.error(`Live data error for station ${stationId}: [${categorizedError.category}] ${categorizedError.message}`);
        
        // Return cached data if API fails, even if expired
        if (cached) {
          console.error(`Falling back to expired cache for station ${stationId} due to ${categorizedError.category} error`);
          return new Map(cached.data);
        }
        return liveDataMap;
      }

      const liveData = await response.json() as TDXLiveBoardEntry[];
      
      if (!Array.isArray(liveData) || liveData.length === 0) {
        console.error(`No live trains found for station ${stationId} - trains may not be running`);
        // Cache empty result to avoid repeated API calls
        this.liveDataCache.set(stationId, {
          data: liveDataMap,
          fetchedAt: now,
          expiresAt: now + API_CONFIG.LIVE_DATA_CACHE_DURATION
        });
        return liveDataMap;
      }
      
      // Build a map indexed by train number for quick lookup
      for (const entry of liveData) {
        liveDataMap.set(entry.TrainNo, entry);
      }
      
      // Cache the successful result
      this.liveDataCache.set(stationId, {
        data: new Map(liveDataMap), // Store a copy to prevent external modifications
        fetchedAt: now,
        expiresAt: now + API_CONFIG.LIVE_DATA_CACHE_DURATION
      });
      
      console.error(`Fetched and cached ${liveData.length} live trains for station ${stationId}`);
      return liveDataMap;
    } catch (error) {
      const categorizedError = this.categorizeError(error, { 
        stationId, 
        endpoint: 'StationLiveBoard',
        operation: 'tryGetLiveDelayData'
      });
      console.error(`Failed to get live data for station ${stationId}: [${categorizedError.category}] ${categorizedError.message}`);
      
      // Return cached data if available, even if expired, for network/temporary errors
      if (cached && cached.data && (categorizedError.category === ErrorCategory.NETWORK || 
                    categorizedError.category === ErrorCategory.API_ERROR)) {
        console.error(`${categorizedError.category} error - falling back to cached data for station ${stationId}`);
        return new Map(cached.data);
      }
      
      return liveDataMap; // Graceful fallback - return empty map
    }
  }

  // Filter trains based on commuter preferences
  private filterCommuterTrains(
    trains: TrainSearchResult[], 
    preferences?: {
      fastest?: boolean;
      cheapest?: boolean;
      directOnly?: boolean;
      trainType?: string;
      timeWindowHours?: number;
      includeAllTrainTypes?: boolean;
      maxResults?: number;
    },
    targetDate?: string,
    targetTime?: string
  ): TrainSearchResult[] {
    let filtered = [...trains];
    
    // Default: Filter to monthly pass eligible trains only
    if (!preferences?.includeAllTrainTypes) {
      filtered = filtered.filter(train => train.isMonthlyPassEligible);
    }
    
    // Filter for direct trains only if requested
    if (preferences?.directOnly) {
      filtered = filtered.filter(train => train.stops === 0);
    }
    
    // Determine base time for filtering with robust error handling
    let baseTime: Date;
    try {
      if (targetDate && targetTime) {
        // Use specified date and time with validation - using pre-compiled patterns
        const dateMatch = targetDate.match(this.REGEX_PATTERNS.ISO_DATE);
        const timeMatch = targetTime.match(this.REGEX_PATTERNS.TIME_FORMAT);
        
        if (!dateMatch || !timeMatch) {
          throw new Error(`Invalid date/time format: ${targetDate} ${targetTime}`);
        }
        
        const [, yearStr, monthStr, dayStr] = dateMatch;
        const [, hoursStr, minutesStr] = timeMatch;
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        const hours = parseInt(hoursStr, 10);
        const minutes = parseInt(minutesStr, 10);
        
        // Validate ranges with named constants
        if (year < VALIDATION_BOUNDS.YEAR_MIN || year > VALIDATION_BOUNDS.YEAR_MAX ||
            month < VALIDATION_BOUNDS.MONTH_MIN || month > VALIDATION_BOUNDS.MONTH_MAX ||
            day < VALIDATION_BOUNDS.DAY_MIN || day > VALIDATION_BOUNDS.DAY_MAX ||
            hours < VALIDATION_BOUNDS.HOUR_MIN || hours > VALIDATION_BOUNDS.HOUR_MAX ||
            minutes < VALIDATION_BOUNDS.MINUTE_MIN || minutes > VALIDATION_BOUNDS.MINUTE_MAX) {
          throw new Error(`Invalid date/time values: ${targetDate} ${targetTime}`);
        }
        
        baseTime = new Date(year, month - 1, day, hours, minutes, 0);
        
        // Check if the created date is valid
        if (isNaN(baseTime.getTime())) {
          throw new Error(`Invalid date created: ${targetDate} ${targetTime}`);
        }
      } else if (targetDate) {
        // Use specified date with current time with validation - using pre-compiled pattern
        const dateMatch = targetDate.match(this.REGEX_PATTERNS.ISO_DATE);
        if (!dateMatch) {
          throw new Error(`Invalid date format: ${targetDate}`);
        }
        
        const [, yearStr, monthStr, dayStr] = dateMatch;
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        
        if (year < VALIDATION_BOUNDS.YEAR_MIN || year > VALIDATION_BOUNDS.YEAR_MAX ||
            month < VALIDATION_BOUNDS.MONTH_MIN || month > VALIDATION_BOUNDS.MONTH_MAX ||
            day < VALIDATION_BOUNDS.DAY_MIN || day > VALIDATION_BOUNDS.DAY_MAX) {
          throw new Error(`Invalid date values: ${targetDate}`);
        }
        
        const now = new Date();
        baseTime = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), 0);
        
        if (isNaN(baseTime.getTime())) {
          throw new Error(`Invalid date created: ${targetDate}`);
        }
      } else {
        // Use current date and time
        baseTime = new Date();
      }
    } catch (error) {
      // Fallback to current time if date parsing fails
      this.logError('Invalid date/time format, falling back to current time', error, { targetDate, targetTime });
      baseTime = new Date();
    }
    
    // Apply time window filtering with bounds checking using validation constants
    const timeWindowHours = Math.min(Math.max(preferences?.timeWindowHours || TIME_CONSTANTS.DEFAULT_TIME_WINDOW_HOURS, VALIDATION_BOUNDS.TIME_WINDOW_MIN), VALIDATION_BOUNDS.TIME_WINDOW_MAX);
    
    // For user-specified times, show trains within window around that time
    // Include trains from 1 hour before to timeWindowHours after
    const lookbackMs = TIME_CONSTANTS.TIME_LOOKBACK_HOURS * TIME_CONSTANTS.MILLISECONDS_PER_HOUR;
    const forwardMs = timeWindowHours * TIME_CONSTANTS.MILLISECONDS_PER_HOUR;
    
    const minTime = new Date(baseTime.getTime() - lookbackMs);
    const maxTime = new Date(baseTime.getTime() + forwardMs);
    
    // Create reference date for parsing train times
    const referenceDate = targetDate ? new Date(targetDate + 'T00:00:00') : new Date();
    
    // For late indicators and status calculations
    const now = new Date();
    
    // Validate time window boundaries
    if (isNaN(minTime.getTime()) || isNaN(maxTime.getTime())) {
      this.logError('Invalid time window calculated', undefined, { 
        baseTime: baseTime.toISOString(), 
        timeWindowHours, 
        minTime: minTime.toString(), 
        maxTime: maxTime.toString() 
      });
      // Fallback to a simple 2-hour window from now
      const fallbackMinTime = new Date(now.getTime() - TIME_CONSTANTS.MILLISECONDS_PER_HOUR);
      const fallbackMaxTime = new Date(now.getTime() + TIME_CONSTANTS.DEFAULT_TIME_WINDOW_HOURS * TIME_CONSTANTS.MILLISECONDS_PER_HOUR);
      filtered = filtered.filter(train => {
        const trainTime = this.parseTrainTime(train.departureTime, referenceDate);
        return trainTime >= fallbackMinTime && trainTime <= fallbackMaxTime;
      });
    } else {
      // Normal time window filtering
      filtered = filtered.filter(train => {
        const trainTime = this.parseTrainTime(train.departureTime, referenceDate);
        return trainTime >= minTime && trainTime <= maxTime;
      });
    }
    
    // Add late indicators and status
    filtered = filtered.map(train => {
      const trainTime = this.parseTrainTime(train.departureTime, referenceDate);
      // Only show departure warnings if we're looking at today's trains
      const isToday = !targetDate || targetDate === new Date().toISOString().split('T')[0];
      const minutesUntilDeparture = isToday 
        ? Math.round((trainTime.getTime() - now.getTime()) / (1000 * 60))
        : Math.round((trainTime.getTime() - baseTime.getTime()) / (1000 * 60));
      
      // Add late warning only for today's trains
      const isLate = isToday && minutesUntilDeparture <= TIME_CONSTANTS.LATE_WARNING_MINUTES && minutesUntilDeparture > 0;
      const hasLeft = isToday && minutesUntilDeparture <= 0;
      
      return {
        ...train,
        minutesUntilDeparture,
        isLate,
        hasLeft,
        lateWarning: isLate ? '⚠️ 即將發車' : undefined
      };
    });
    
    // Filter out trains that have already departed (only for today's queries)
    const isToday = !targetDate || targetDate === new Date().toISOString().split('T')[0];
    if (isToday) {
      filtered = filtered.filter(train => !train.hasLeft);
    }
    
    // Sort by departure time (upcoming first)
    filtered.sort((a, b) => {
      const timeA = a.departureTime.replace(':', '');
      const timeB = b.departureTime.replace(':', '');
      return timeA.localeCompare(timeB);
    });
    
    // Include backup options - if we have fewer than 3 trains, include some non-monthly-pass trains
    const primaryResults = filtered.slice(0, preferences?.maxResults || 3);
    
    if (primaryResults.length < 3 && !preferences?.includeAllTrainTypes) {
      const isToday = !targetDate || targetDate === new Date().toISOString().split('T')[0];
      const allTrains = trains.map(train => {
        const trainTime = this.parseTrainTime(train.departureTime, referenceDate);
        const minutesUntilDeparture = isToday 
          ? Math.round((trainTime.getTime() - now.getTime()) / (1000 * 60))
          : Math.round((trainTime.getTime() - baseTime.getTime()) / (1000 * 60));
        const isLate = isToday && minutesUntilDeparture <= TIME_CONSTANTS.LATE_WARNING_MINUTES && minutesUntilDeparture > 0;
        const hasLeft = isToday && minutesUntilDeparture <= 0;
        
        return {
          ...train,
          minutesUntilDeparture,
          isLate,
          hasLeft,
          lateWarning: isLate ? '⚠️ 即將發車' : undefined,
          isBackupOption: !train.isMonthlyPassEligible
        };
      });
      
      // Filter backup trains within the time window and exclude departed trains
      const backupTrains = allTrains
        .filter(train => {
          const trainTime = this.parseTrainTime(train.departureTime, referenceDate);
          return !train.isMonthlyPassEligible && 
                 trainTime >= minTime && 
                 trainTime <= maxTime &&
                 !train.hasLeft;  // Exclude trains that have already departed
        })
        .slice(0, 3 - primaryResults.length);
      
      return [...primaryResults, ...backupTrains];
    }
    
    return primaryResults;
  }
  
  /**
   * Parse train departure time with explicit date context
   * @param timeString - Time in HH:MM:SS format
   * @param referenceDate - Optional reference date for the train schedule
   * @returns Date object with proper date context
   */
  private parseTrainTime(timeString: string, referenceDate?: Date): Date {
    // Validate time string format first - using pre-compiled pattern
    const timeMatch = timeString.match(this.REGEX_PATTERNS.TIME_WITH_SECONDS);
    if (!timeMatch) {
      this.logError('Invalid time format in parseTrainTime', undefined, { timeString });
      // Return a date far in the future to exclude from filtering
      return new Date(Date.now() + TIME_CONSTANTS.FAR_FUTURE_DAYS * TIME_CONSTANTS.HOURS_IN_DAY * TIME_CONSTANTS.MILLISECONDS_PER_HOUR);
    }
    
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    
    // Validate time component ranges using validation constants
    if (hours < VALIDATION_BOUNDS.HOUR_MIN || hours > VALIDATION_BOUNDS.HOUR_MAX ||
        minutes < VALIDATION_BOUNDS.MINUTE_MIN || minutes > VALIDATION_BOUNDS.MINUTE_MAX ||
        seconds < VALIDATION_BOUNDS.SECOND_MIN || seconds > VALIDATION_BOUNDS.SECOND_MAX) {
      this.logError('Invalid time values in parseTrainTime', undefined, { hours, minutes, seconds, timeString });
      return new Date(Date.now() + TIME_CONSTANTS.FAR_FUTURE_DAYS * TIME_CONSTANTS.HOURS_IN_DAY * TIME_CONSTANTS.MILLISECONDS_PER_HOUR);
    }
    
    const now = new Date();
    const refDate = referenceDate || now;
    
    // Create train time using reference date
    const trainTime = new Date(
      refDate.getFullYear(), 
      refDate.getMonth(), 
      refDate.getDate(), 
      hours, 
      minutes, 
      seconds
    );
    
    // Validate the created date
    if (isNaN(trainTime.getTime())) {
      this.logError('Invalid date created in parseTrainTime', undefined, { 
        refDate: refDate.toISOString(), 
        hours, 
        minutes, 
        seconds, 
        timeString 
      });
      return new Date(Date.now() + TIME_CONSTANTS.FAR_FUTURE_DAYS * TIME_CONSTANTS.HOURS_IN_DAY * TIME_CONSTANTS.MILLISECONDS_PER_HOUR);
    }
    
    // Handle midnight boundary cases more robustly
    if (!referenceDate && trainTime < now) {
      const timeDiffMs = now.getTime() - trainTime.getTime();
      const timeDiffHours = timeDiffMs / TIME_CONSTANTS.MILLISECONDS_PER_HOUR;
      
      // Improved logic for next-day trains:
      // 1. If train time is in early morning (0-6) and current time is late (20-23), likely tomorrow
      // 2. If time difference is > 18 hours, likely tomorrow  
      // 3. If time difference is < 2 hours in past, might be recent departure (keep same day)
      const isEarlyMorningTrain = hours >= 0 && hours <= 6;
      const isLateNow = now.getHours() >= 20;
      const isLikelyTomorrow = (isEarlyMorningTrain && isLateNow) || timeDiffHours > 18;
      const isRecentDeparture = timeDiffHours < 2;
      
      if (isLikelyTomorrow && !isRecentDeparture) {
        trainTime.setDate(trainTime.getDate() + 1);
      }
    }
    
    return trainTime;
  }

  /**
   * Add minutes to a time string with proper day boundary handling
   * This method is critical for calculating actual train times when delays occur,
   * especially for trains that cross midnight or have significant delays.
   * 
   * @param timeString - Time in HH:MM or HH:MM:SS format (e.g., "23:45", "14:30:25")
   * @param minutes - Minutes to add (can be negative for early arrivals)
   * @returns Updated time string in same format, properly wrapped around 24-hour boundaries
   * 
   * @example
   * addMinutesToTime("23:45", 30) returns "00:15" (crosses midnight)
   * addMinutesToTime("00:15", -30) returns "23:45" (goes to previous day)
   * addMinutesToTime("14:30", 90) returns "16:00" (normal case)
   */
  private addMinutesToTime(timeString: string, minutes: number): string {
    // Parse the time components - supports both HH:MM and HH:MM:SS formats
    const parts = timeString.split(':');
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parts[2] ? parseInt(parts[2], 10) : 0;
    
    // Convert everything to total minutes since midnight for easier calculation
    // This approach simplifies the math and handles edge cases more reliably
    let totalMinutes = hours * 60 + mins + minutes;
    
    // Handle day boundary crossings with wraparound logic
    // Taiwan railway operates within a 24-hour schedule, so we need to wrap properly
    
    // Case 1: Negative time (before midnight of previous day)
    // e.g., 00:15 - 30 minutes = -15 minutes = 23:45 of previous day
    while (totalMinutes < 0) {
      totalMinutes += 24 * 60; // Add 24 hours worth of minutes (1440)
    }
    
    // Case 2: Time beyond 24 hours (past midnight of next day)  
    // e.g., 23:45 + 30 minutes = 1455 minutes = 00:15 of next day
    while (totalMinutes >= 24 * 60) {
      totalMinutes -= 24 * 60; // Subtract 24 hours worth of minutes (1440)
    }
    
    // Convert back to hours and minutes within valid 24-hour range (0-23:59)
    const newHours = Math.floor(totalMinutes / 60);
    const newMins = totalMinutes % 60;
    
    // Format with zero-padding to maintain HH:MM format consistency
    // This ensures output like "09:05" instead of "9:5"
    const hourStr = newHours.toString().padStart(2, '0');
    const minStr = newMins.toString().padStart(2, '0');
    
    // Preserve original format: return with seconds if input had seconds
    if (parts[2]) {
      const secStr = secs.toString().padStart(2, '0');
      return `${hourStr}:${minStr}:${secStr}`;
    }
    return `${hourStr}:${minStr}`;
  }

  // Load station data from TDX API with failure state tracking
  private async loadStationData(): Promise<void> {
    if (this.stationDataLoaded) return;
    
    // Don't attempt to load if not connected to prevent EPIPE errors
    if (!this.isConnected) {
      this.stationLoadFailed = true;
      return;
    }
    
    // Avoid repeated failed attempts (retry once per 5 minutes)
    const now = Date.now();
    if (this.stationLoadFailed && (now - this.lastStationLoadAttempt) < 300000) {
      return;
    }

    this.lastStationLoadAttempt = now;

    try {
      // Check connection before any operations that might output
      if (!this.isConnected) {
        this.stationLoadFailed = true;
        return;
      }
      
      console.error('Loading TRA station data from TDX API...');
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      const response = await this.fetchWithRetry(`${baseUrl}/v3/Rail/TRA/Station?%24format=JSON`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        this.logError('Failed to load station data from TDX API', undefined, { 
          status: response.status, 
          statusText: response.statusText 
        });
        throw new Error('Unable to load station information. Service may be temporarily unavailable.');
      }

      const responseData = await response.json() as any;
      // v3 API wraps stations in a response object with Stations property
      this.stationData = responseData.Stations || responseData;
      this.buildSearchIndexes();
      this.stationDataLoaded = true;
      this.stationLoadFailed = false;
      
      // Only log success if still connected
      if (this.isConnected) {
        console.error(`Loaded ${this.stationData.length} TRA stations from TDX API`);
      }
    } catch (error) {
      // Only log errors if still connected
      if (this.isConnected) {
        console.error('Failed to load station data:', error);
      }
      this.stationDataLoaded = false;
      this.stationLoadFailed = true;
    }
  }

  // Build search indexes for performance
  private buildSearchIndexes(): void {
    this.stationNameIndex.clear();
    this.stationEnNameIndex.clear();
    this.stationPrefixIndex.clear();

    for (const station of this.stationData) {
      const zhName = station.StationName.Zh_tw.toLowerCase();
      const enName = station.StationName.En.toLowerCase();

      // Index by full names
      this.addToIndex(this.stationNameIndex, zhName, station);
      this.addToIndex(this.stationEnNameIndex, enName, station);

      // Index by prefixes (up to 3 characters)
      for (let i = 1; i <= Math.min(3, zhName.length); i++) {
        this.addToIndex(this.stationPrefixIndex, zhName.substring(0, i), station);
      }
      for (let i = 1; i <= Math.min(3, enName.length); i++) {
        this.addToIndex(this.stationPrefixIndex, enName.substring(0, i), station);
      }
    }

    console.error(`Built search indexes: ${this.stationNameIndex.size} names, ${this.stationPrefixIndex.size} prefixes`);
  }

  private addToIndex(index: Map<string, TRAStation[]>, key: string, station: TRAStation): void {
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(station);
  }

  // Search stations with optimized fuzzy matching using indexes
  private searchStations(query: string): StationSearchResult[] {
    if (!this.stationDataLoaded || this.stationData.length === 0) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();
    const results = new Map<string, StationSearchResult>();

    // Common abbreviations and aliases
    const aliases = new Map([
      ['北車', '臺北'],
      ['台北', '臺北'],
      ['台中', '臺中'],
      ['台南', '臺南'],
      ['高雄', '高雄'],
      ['板橋', '板橋'],
      ['桃園', '桃園'],
    ]);

    const expandedQuery = aliases.get(normalizedQuery) || normalizedQuery;
    const candidateStations = new Set<TRAStation>();

    // 1. Exact matches from indexes (highest confidence)
    const exactMatches = this.stationNameIndex.get(normalizedQuery) || [];
    const exactExpandedMatches = this.stationNameIndex.get(expandedQuery) || [];
    const exactEnMatches = this.stationEnNameIndex.get(normalizedQuery) || [];
    
    [...exactMatches, ...exactExpandedMatches, ...exactEnMatches].forEach(station => {
      candidateStations.add(station);
      this.addSearchResult(results, station, 1.0);
    });

    // 2. Prefix matches (high confidence)
    for (let i = Math.min(3, normalizedQuery.length); i >= 1; i--) {
      const prefix = normalizedQuery.substring(0, i);
      const prefixMatches = this.stationPrefixIndex.get(prefix) || [];
      
      prefixMatches.forEach(station => {
        if (!candidateStations.has(station)) {
          candidateStations.add(station);
          const zhName = station.StationName.Zh_tw.toLowerCase();
          const enName = station.StationName.En.toLowerCase();
          
          if (zhName.startsWith(normalizedQuery) || zhName.startsWith(expandedQuery) || enName.startsWith(normalizedQuery)) {
            this.addSearchResult(results, station, 0.9);
          } else if (zhName.includes(normalizedQuery) || zhName.includes(expandedQuery) || enName.includes(normalizedQuery)) {
            this.addSearchResult(results, station, 0.7);
          }
        }
      });
    }

    // 3. Fallback: broader search for partial matches (lower confidence)
    if (results.size < 3 && normalizedQuery.length >= 2) {
      const partialQuery = normalizedQuery.substring(0, 2);
      const partialMatches = this.stationPrefixIndex.get(partialQuery) || [];
      
      partialMatches.forEach(station => {
        if (!candidateStations.has(station)) {
          candidateStations.add(station);
          this.addSearchResult(results, station, 0.5);
        }
      });
    }

    // Convert to array and sort
    const finalResults = Array.from(results.values());
    finalResults.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return a.name.localeCompare(b.name);
    });

    // Return top 5 matches
    return finalResults.slice(0, MEMORY_CONSTANTS.MAX_STATION_SEARCH_RESULTS);
  }

  private addSearchResult(results: Map<string, StationSearchResult>, station: TRAStation, confidence: number): void {
    const key = station.StationID;
    if (!results.has(key) || results.get(key)!.confidence < confidence) {
      results.set(key, {
        stationId: station.StationID,
        name: station.StationName.Zh_tw,
        confidence,
        address: station.StationAddress,
        coordinates: station.StationPosition ? {
          lat: station.StationPosition.PositionLat,
          lon: station.StationPosition.PositionLon
        } : undefined
      });
    }
  }

  // Input validation utility
  private validateApiInput(input: unknown, fieldName: string, maxLength: number): string {
    if (typeof input !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }
    
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error(`${fieldName} cannot be empty`);
    }
    
    if (trimmed.length > maxLength) {
      throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
    }
    
    // Basic XSS/injection prevention
    const sanitized = trimmed
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
    
    return sanitized;
  }

  // Handle search_station tool request
  private async handleSearchStation(query: string, context?: string): Promise<any> {
    try {
      // Validate inputs
      const validatedQuery = this.validateApiInput(query, 'query', this.MAX_QUERY_LENGTH);
      const validatedContext = context ? 
        this.validateApiInput(context, 'context', this.MAX_CONTEXT_LENGTH) : 
        undefined;
      // Ensure station data is loaded
      if (!this.stationDataLoaded) {
        // Reset failure state if enough time has passed for a retry
        const now = Date.now();
        if (this.stationLoadFailed && (now - this.lastStationLoadAttempt) >= 300000) {
          this.stationLoadFailed = false;
        }
        await this.loadStationData();
      }

      if (!this.stationDataLoaded) {
        return {
          content: [{
            type: 'text',
            text: '⚠️ Station data is not available. Please check TDX credentials and network connection.'
          }]
        };
      }

      const results = this.searchStations(query);

      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ No stations found for "${query}"\n\n` +
                  `Suggestions:\n` +
                  `• Check spelling (try "台北", "台中", "高雄")\n` +
                  `• Use common abbreviations like "北車" for Taipei Main Station\n` +
                  `• Try partial station names`
          }]
        };
      }

      const main = results[0];
      const alternatives = results.slice(1);
      const needsConfirmation = main.confidence < 0.9 || alternatives.length > 0;

      // Format response
      let responseText = '';
      
      if (main.confidence >= 0.9) {
        responseText += `✅ Found station: **${main.name}**\n`;
      } else {
        responseText += `🔍 Best match: **${main.name}** (confidence: ${Math.round(main.confidence * 100)}%)\n`;
      }
      
      responseText += `• Station ID: ${main.stationId}\n`;
      if (main.address) {
        responseText += `• Address: ${main.address}\n`;
      }
      if (main.coordinates) {
        responseText += `• Coordinates: ${main.coordinates.lat}, ${main.coordinates.lon}\n`;
      }

      if (alternatives.length > 0) {
        responseText += `\n**Other possibilities:**\n`;
        alternatives.forEach((alt, index) => {
          responseText += `${index + 2}. ${alt.name} (confidence: ${Math.round(alt.confidence * 100)}%)\n`;
        });
      }

      // Include structured data for follow-up tools
      const structuredData = JSON.stringify({
        main: {
          stationId: main.stationId,
          name: main.name,
          confidence: main.confidence
        },
        alternatives: alternatives.map(alt => ({
          stationId: alt.stationId,
          name: alt.name,
          confidence: alt.confidence
        })),
        needsConfirmation
      }, null, 2);

      responseText += `\n\n**Machine-readable data:**\n\`\`\`json\n${structuredData}\n\`\`\``;

      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };

    } catch (error) {
      this.logError('Error in handleSearchStation', error, { query, context });
      return {
        content: [{
          type: 'text',
          text: `❌ Unable to search stations. Please try again or check your query format.`
        }]
      };
    }
  }

  // Determine optimal number of trains to include based on query intent (Stage 8 optimization)
  private getOptimalTrainCount(query: string, totalResults: number): number {
    // Input validation
    if (!query || typeof query !== 'string') {
      console.error('Invalid query provided to getOptimalTrainCount');
      return 0;
    }
    
    if (typeof totalResults !== 'number' || totalResults < 0) {
      console.error('Invalid totalResults provided to getOptimalTrainCount:', totalResults);
      return 0;
    }
    
    if (totalResults === 0) {
      return 0;
    }
    
    const lowerQuery = query.toLowerCase();
    
    // If user explicitly requests all trains, show more (but still limit for context)
    if (lowerQuery.includes('所有班次') || lowerQuery.includes('全部') || 
        lowerQuery.includes('all trains') || lowerQuery.includes('完整')) {
      return Math.min(MEMORY_CONSTANTS.MAX_TRAINS_PER_RESULT, totalResults);
    }
    
    // For "fastest", "quickest", "first" queries - show fewer options
    if (lowerQuery.includes('最快') || lowerQuery.includes('fastest') || 
        lowerQuery.includes('第一') || lowerQuery.includes('first') ||
        lowerQuery.includes('最早') || lowerQuery.includes('quickest')) {
      return Math.min(RESPONSE_CONSTANTS.MAX_TRAINS_FOR_SIMPLE_QUERY, totalResults);
    }
    
    // For general queries, use standard limit but cap at reasonable number
    return Math.min(RESPONSE_CONSTANTS.MAX_TRAINS_IN_JSON, totalResults);
  }

  // Check if user wants comprehensive JSON data (Stage 8 optimization)
  private shouldIncludeFullJSON(query: string, context?: string): boolean {
    const lowerQuery = query.toLowerCase();
    const lowerContext = (context || '').toLowerCase();
    
    return lowerQuery.includes('json') || lowerQuery.includes('structured') || 
           lowerQuery.includes('machine') || lowerQuery.includes('data') ||
           lowerContext.includes('json') || lowerContext.includes('structured') ||
           RESPONSE_CONSTANTS.INCLUDE_FULL_JSON;
  }

  // Create optimized structured data with minimal properties (Stage 8 optimization)
  private createOptimizedStructuredData(
    originStation: any, 
    destinationStation: any, 
    parsed: any, 
    timetableData: any[], 
    filteredResults: any[], 
    query: string
  ): string {
    // Input validation
    if (!originStation || !destinationStation || !Array.isArray(filteredResults)) {
      console.error('Invalid input data provided to createOptimizedStructuredData');
      return JSON.stringify({ error: 'Invalid input data' });
    }
    
    const trainCount = this.getOptimalTrainCount(query, filteredResults.length);
    // Pre-slice for efficiency instead of processing all then slicing
    const trainsToInclude = trainCount > 0 ? filteredResults.slice(0, trainCount) : [];
    
    const compactData = {
      route: {
        origin: { 
          id: originStation.stationId || 'unknown', 
          name: originStation.name || 'Unknown Station' 
        },
        destination: { 
          id: destinationStation.stationId || 'unknown', 
          name: destinationStation.name || 'Unknown Station' 
        }
      },
      date: parsed?.date || new Date().toISOString().split('T')[0],
      totalTrains: Array.isArray(timetableData) ? timetableData.length : 0,
      filteredTrains: filteredResults.length,
      shownTrains: trainCount,
      trains: trainsToInclude.map(train => ({
        trainNo: train?.trainNo || 'Unknown',
        trainType: train?.trainType || 'Unknown',
        departure: train?.departureTime || 'Unknown',
        arrival: train?.arrivalTime || 'Unknown',
        travelTime: train?.travelTime || 'Unknown',
        monthlyPassEligible: Boolean(train?.isMonthlyPassEligible)
        // Removed: stops, fareInfo, delayMinutes, etc. for context efficiency
      }))
    };
    
    try {
      // Use compact formatting to save space
      return RESPONSE_CONSTANTS.COMPACT_JSON ? 
        JSON.stringify(compactData) : 
        JSON.stringify(compactData, null, 2);
    } catch (error) {
      console.error('Error serializing structured data:', error);
      return JSON.stringify({ error: 'Serialization failed' });
    }
  }

  // Handle search_trains tool request with query parsing
  private async handleSearchTrains(query: string, context?: string): Promise<any> {
    try {
      // Validate inputs
      const validatedQuery = this.validateApiInput(query, 'query', this.MAX_QUERY_LENGTH);
      const validatedContext = context ? 
        this.validateApiInput(context, 'context', this.MAX_CONTEXT_LENGTH) : 
        undefined;
      // Parse the natural language query
      const parsed = this.queryParser.parse(query);
      
      // Handle train number queries with smart search
      if (this.queryParser.isTrainNumberQuery(parsed)) {
        return await this.handleTrainNumberQuery(parsed);
      }
      
      // Check if we have enough information to proceed for route queries
      if (!this.queryParser.isValidForTrainSearch(parsed)) {
        const suggestions = this.generateSuggestions(parsed);
        return {
          content: [{
            type: 'text',
            text: `⚠️ Need more information to search trains.\n\n` +
                  `**What I understood:**\n${this.queryParser.getSummary(parsed)}\n\n` +
                  `**Missing information:**\n${suggestions}\n\n` +
                  `**Examples of valid queries:**\n` +
                  `• "台北到台中明天早上"\n` +
                  `• "高雄去台北下午2點最快"\n` +
                  `• "桃園到新竹今天晚上直達車"\n` +
                  `• "152" (車次號碼查詢)\n` +
                  `• "自強152時刻表"`
          }]
        };
      }

      // Ensure station data is loaded
      if (!this.stationDataLoaded) {
        // Reset failure state if enough time has passed for a retry
        const now = Date.now();
        if (this.stationLoadFailed && (now - this.lastStationLoadAttempt) >= 300000) {
          this.stationLoadFailed = false;
        }
        await this.loadStationData();
      }

      if (!this.stationDataLoaded) {
        return {
          content: [{
            type: 'text',
            text: '⚠️ Station data is not available. Please check TDX credentials and network connection.'
          }]
        };
      }

      // Validate and get station IDs
      if (!parsed.origin || !parsed.destination) {
        return {
          content: [{
            type: 'text',
            text: `❌ Missing origin or destination station.\n\n` +
                  `**What I understood:**\n${this.queryParser.getSummary(parsed)}`
          }]
        };
      }

      const originResults = this.searchStations(parsed.origin);
      const destinationResults = this.searchStations(parsed.destination);

      if (originResults.length === 0 || destinationResults.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ Station validation failed:\n\n` +
                  `Could not find ${originResults.length === 0 ? 'origin' : 'destination'} station.\n\n` +
                  `**What I understood:**\n${this.queryParser.getSummary(parsed)}`
          }]
        };
      }

      const originStation = originResults[0];
      const destinationStation = destinationResults[0];

      // Get train timetable from TDX API
      const timetableData = await this.getDailyTrainTimetable(
        originStation.stationId,
        destinationStation.stationId,
        parsed.date
      );

      if (timetableData.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ No trains found for this route.\n\n` +
                  `**Route:** ${originStation.name} → ${destinationStation.name}\n` +
                  `**Date:** ${parsed.date || 'Today'}\n\n` +
                  `This might happen if:\n` +
                  `• **No service today**: Trains may not run on this route today\n` +
                  `• **Suspended service**: Trains temporarily suspended due to maintenance or weather\n` +
                  `• **Requires transfers**: Route needs connections (try nearby major stations)\n` +
                  `• **Future date**: Date is outside available timetable data\n` +
                  `• **No direct trains**: No direct service on this route\n\n` +
                  `**Suggestions:**\n` +
                  `• Try a different date or check for service alerts\n` +
                  `• Search for routes via major stations (台北, 台中, 高雄)\n` +
                  `• Check TRA official website for service updates`
          }]
        };
      }

      // Process and filter results
      const trainResults = this.processTrainSearchResults(timetableData, originStation.stationId, destinationStation.stationId);
      
      // Fetch live delay data and fare information in parallel
      const [liveDelayData, fareInfo] = await Promise.all([
        this.tryGetLiveDelayData(originStation.stationId),
        this.getODFare(originStation.stationId, destinationStation.stationId)
      ]);
      
      // Merge live delay data with train results
      const trainResultsWithLiveData = trainResults.map(train => {
        const liveEntry = liveDelayData.get(train.trainNo);
        
        if (liveEntry && typeof liveEntry.DelayTime === 'number') {
          // Calculate actual times based on delay
          const actualDepartureTime = this.addMinutesToTime(train.departureTime, liveEntry.DelayTime);
          const actualArrivalTime = this.addMinutesToTime(train.arrivalTime, liveEntry.DelayTime);
          
          return {
            ...train,
            fareInfo: fareInfo || undefined,
            delayMinutes: liveEntry.DelayTime,
            actualDepartureTime,
            actualArrivalTime,
            trainStatus: liveEntry.TrainStatus || (liveEntry.DelayTime > 0 ? '誤點' : '準點')
          };
        }
        
        return {
          ...train,
          fareInfo: fareInfo || undefined,
          trainStatus: '無即時資訊'
        };
      });
      
      const filteredResults = this.filterCommuterTrains(
        trainResultsWithLiveData, 
        parsed.preferences,
        parsed.date,
        parsed.time
      );

      // Format response
      let responseText = `🚄 **Train Search Results**\n\n`;
      responseText += `**Route:** ${originStation.name} → ${destinationStation.name}\n`;
      responseText += `**Date:** ${parsed.date || 'Today'}\n`;
      if (parsed.time) {
        responseText += `**Target Time:** ${parsed.time}\n`;
      }
      
      responseText += `**Found:** ${filteredResults.length} trains (${timetableData.length} total)\n\n`;

      if (filteredResults.length === 0) {
        responseText += `❌ No trains found in the next 2 hours.\n\n`;
        responseText += `Monthly pass is valid for: 區間車, 區間快車\n`;
        responseText += `Try:\n• Extending time window with "接下來4小時"\n• Including all train types with "所有車種"`;
      } else {
        // Separate primary and backup options
        const primaryTrains = filteredResults.filter(train => !train.isBackupOption);
        const backupTrains = filteredResults.filter(train => train.isBackupOption);
        
        if (primaryTrains.length > 0) {
          // Show appropriate time window message based on whether a specific time was given
          const actualTimeWindow = parsed.preferences?.timeWindowHours || 2;
          const timeWindowMessage = parsed.time 
            ? `目標時間 ${parsed.time} 前後` 
            : `接下來${actualTimeWindow}小時`;
          
          // Apply Stage 8 optimization: limit displayed trains
          const maxDisplayTrains = this.getOptimalTrainCount(query, primaryTrains.length);
          const trainsToShow = primaryTrains.slice(0, maxDisplayTrains);
          
          responseText += `**月票可搭 (${timeWindowMessage}):**\n\n`;
          trainsToShow.forEach((train, index) => {
            const passIcon = train.isMonthlyPassEligible ? '🎫' : '💰';
            
            // Format delay/status information
            let statusInfo = '';
            if (train.delayMinutes !== undefined && train.delayMinutes > 0) {
              statusInfo = ` 🚨 誤點${train.delayMinutes}分鐘`;
            } else if (train.trainStatus === '準點') {
              statusInfo = ' ✅ 準點';
            } else if (train.lateWarning) {
              statusInfo = ` ${train.lateWarning}`;
            }
            
            // Show actual times if delayed
            let departureDisplay = train.departureTime;
            let arrivalDisplay = train.arrivalTime;
            if (train.actualDepartureTime && train.delayMinutes && train.delayMinutes > 0) {
              departureDisplay = `${train.departureTime} → 實際: ${train.actualDepartureTime}`;
              arrivalDisplay = `${train.arrivalTime} → 實際: ${train.actualArrivalTime}`;
            }
            
            const timeInfo = train.minutesUntilDeparture ? ` (${train.minutesUntilDeparture}分後)` : '';
            const fareText = train.fareInfo ? ` | 票價: $${train.fareInfo.adult}` : '';
            
            const stopDescription = train.stops === 0 ? '直達' : `經停 ${train.stops} 站`;
            
            responseText += `${index + 1}. **${train.trainType} ${train.trainNo}** ${passIcon}${statusInfo}\n`;
            responseText += `   出發: ${departureDisplay}${timeInfo}\n`;
            responseText += `   抵達: ${arrivalDisplay}\n`;
            responseText += `   行程時間: ${train.travelTime} (${stopDescription})${fareText}\n`;
            if (train.trainStatus && train.trainStatus !== '無即時資訊') {
              responseText += `   狀態: ${train.trainStatus}\n`;
            }
            responseText += '\n';
          });
          
          // Add message if more trains are available (Stage 8 optimization)
          if (primaryTrains.length > maxDisplayTrains) {
            responseText += `⬇️ **${primaryTrains.length - maxDisplayTrains} more trains available** (use "列出所有班次" for complete list)\n\n`;
          }
        }
        
        if (backupTrains.length > 0) {
          responseText += `**備選車次 (需另購票):**\n\n`;
          backupTrains.forEach((train, index) => {
            // Format delay/status information
            let statusInfo = '';
            if (train.delayMinutes !== undefined && train.delayMinutes > 0) {
              statusInfo = ` 🚨 誤點${train.delayMinutes}分鐘`;
            } else if (train.trainStatus === '準點') {
              statusInfo = ' ✅ 準點';
            } else if (train.lateWarning) {
              statusInfo = ` ${train.lateWarning}`;
            }
            
            // Show actual times if delayed
            let departureDisplay = train.departureTime;
            let arrivalDisplay = train.arrivalTime;
            if (train.actualDepartureTime && train.delayMinutes && train.delayMinutes > 0) {
              departureDisplay = `${train.departureTime} → 實際: ${train.actualDepartureTime}`;
              arrivalDisplay = `${train.arrivalTime} → 實際: ${train.actualArrivalTime}`;
            }
            
            const timeInfo = train.minutesUntilDeparture ? ` (${train.minutesUntilDeparture}分後)` : '';
            const fareText = train.fareInfo ? ` | 票價: $${train.fareInfo.adult}` : '';
            
            const stopDescription = train.stops === 0 ? '直達' : `經停 ${train.stops} 站`;
            
            responseText += `${primaryTrains.length + index + 1}. **${train.trainType} ${train.trainNo}** 💰${statusInfo}\n`;
            responseText += `   出發: ${departureDisplay}${timeInfo}\n`;
            responseText += `   抵達: ${arrivalDisplay}\n`;
            responseText += `   行程時間: ${train.travelTime} (${stopDescription})${fareText}\n`;
            if (train.trainStatus && train.trainStatus !== '無即時資訊') {
              responseText += `   狀態: ${train.trainStatus}\n`;
            }
            responseText += '\n';
          });
        }

        responseText += `🎫 = 月票可搭 | 💰 = 需另購票 | ⚠️ = 即將發車 | 🚨 = 誤點 | ✅ = 準點\n`;
        
        // Show appropriate time window help text
        const actualTimeWindow = parsed.preferences?.timeWindowHours || 2;
        if (parsed.time) {
          responseText += `時間視窗: 目標時間前1小時到後${actualTimeWindow}小時 | 可用 "接下來4小時" 擴展搜尋\n\n`;
        } else {
          responseText += `時間視窗: 接下來${actualTimeWindow}小時 | 可用 "接下來4小時" 擴展搜尋\n\n`;
        }
        
        // Add fare summary if available
        if (fareInfo) {
          responseText += `**票價資訊:**\n`;
          responseText += `• 全票: $${fareInfo.adult} | 兒童票: $${fareInfo.child} | 敬老愛心票: $${fareInfo.senior}\n\n`;
        }
      }

      // Add optimized machine-readable data (Stage 8: Context Window Optimization)
      if (this.shouldIncludeFullJSON(query, context)) {
        const structuredData = this.createOptimizedStructuredData(
          originStation, destinationStation, parsed, timetableData, filteredResults, query
        );
        responseText += `**Machine-readable data:**\n\`\`\`json\n${structuredData}\n\`\`\``;
      } else {
        // For context efficiency, provide minimal summary instead of full JSON
        const trainCount = this.getOptimalTrainCount(query, filteredResults.length);
        responseText += `**Summary:** Found ${filteredResults.length} trains, showing top ${Math.min(trainCount, filteredResults.length)} options`;
        if (filteredResults.length > trainCount) {
          responseText += ` (${filteredResults.length - trainCount} more available)`;
        }
        responseText += `\n💡 Add "with JSON data" to your query for structured output`;
      }

      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };

    } catch (error) {
      this.logError('Error in handleSearchTrains', error, { query, context });
      return {
        content: [{
          type: 'text',
          text: `❌ Unable to search trains at this time.\n\n` +
                `This might be due to:\n` +
                `• Service temporarily unavailable\n` +
                `• Invalid station names or route\n` +
                `• Network connection issues\n\n` +
                `Please try again later or verify your station names.`
        }]
      };
    }
  }

  // Handle train number queries with smart search
  private async handleTrainNumberQuery(parsed: ParsedQuery): Promise<MCPToolResponse> {
    try {
      if (!parsed.trainNumber) {
        return {
          content: [{
            type: 'text',
            text: '❌ 無法識別車次號碼，請重新輸入'
          }]
        };
      }

      // Use smart search engine for train number queries
      const searchResult = this.smartSearchEngine.searchTrains(parsed.trainNumber);
      
      // If it's a partial match (like "2"), show smart suggestions
      if (parsed.isPartialTrainNumber || searchResult.searchStrategy !== 'exact') {
        const responseText = this.smartSearchEngine.formatSearchResult(searchResult);
        return {
          content: [{
            type: 'text',
            text: responseText
          }]
        };
      }

      // For exact matches, try to get detailed information from TDX API
      // This would integrate with the actual TDX SpecificTrainTimetable API
      return await this.getDetailedTrainInfo(parsed.trainNumber);
      
    } catch (error) {
      this.logError('Error in handleTrainNumberQuery', error, { 
        trainNumber: parsed.trainNumber,
        isPartial: parsed.isPartialTrainNumber 
      });
      
      return {
        content: [{
          type: 'text',
          text: `❌ 車次查詢失敗\n\n` +
                `請稍後再試，或使用路線查詢：\n` +
                `• "台北到高雄"\n` +
                `• "新竹到台中明天早上"`
        }]
      };
    }
  }

  // Get detailed train information for exact train number matches
  private async getDetailedTrainInfo(trainNumber: string): Promise<MCPToolResponse> {
    try {
      // Try to get specific train timetable from TDX API
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      // Get timetable data
      const specificEndpoint = `/v3/Rail/TRA/SpecificTrainTimetable/TrainNo/${trainNumber}?$format=JSON`;
      const timetableResponse = await this.fetchWithRetry(`${baseUrl}${specificEndpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      const timetableData = await timetableResponse.json() as any;
      let trainData = null;
      let source = 'specific';

      if (!timetableData || !timetableData.TrainTimetables || timetableData.TrainTimetables.length === 0) {
        // If no specific timetable found, try daily timetable
        const dailyEndpoint = `/v3/Rail/TRA/DailyTrainTimetable/Today?$format=JSON&$filter=TrainInfo/TrainNo eq '${trainNumber}'&$top=1`;
        const dailyResponse = await this.fetchWithRetry(`${baseUrl}${dailyEndpoint}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        
        const dailyData = await dailyResponse.json() as any;

        if (!dailyData || !dailyData.TrainTimetables || dailyData.TrainTimetables.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `❌ **車次 ${trainNumber} 查無資料**\n\n` +
                    `可能原因：\n` +
                    `• 車次號碼不存在或已停駛\n` +
                    `• 今日未營運此班次\n` +
                    `• 輸入的車次號碼有誤\n\n` +
                    `💡 建議：\n` +
                    `• 檢查車次號碼是否正確\n` +
                    `• 嘗試搜尋相似車次: "${trainNumber.substring(0, -1)}"\n` +
                    `• 或使用路線查詢: "台北到高雄"`
            }]
          };
        }

        trainData = dailyData.TrainTimetables[0];
        source = 'daily';
      } else {
        trainData = timetableData.TrainTimetables[0];
      }

      // Get live status data
      let liveData = null;
      try {
        const liveEndpoint = `/v3/Rail/TRA/TrainLiveBoard/TrainNo/${trainNumber}?$format=JSON`;
        const liveResponse = await this.fetchWithRetry(`${baseUrl}${liveEndpoint}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        
        const liveResponseData = await liveResponse.json() as any;
        if (liveResponseData && liveResponseData.TrainLiveBoards && liveResponseData.TrainLiveBoards.length > 0) {
          liveData = liveResponseData.TrainLiveBoards;
        }
      } catch (error) {
        this.logError('Error fetching live data', error, { trainNumber });
        // Continue without live data
      }

      return this.formatTrainTimetableResponse(trainData, trainNumber, source as 'specific' | 'daily', liveData);

    } catch (error) {
      this.logError('Error fetching detailed train info', error, { trainNumber });
      
      return {
        content: [{
          type: 'text',
          text: `⚠️ **車次 ${trainNumber} 查詢暫時無法使用**\n\n` +
                `系統正在維護中，請稍後再試。\n\n` +
                `💡 替代方案：\n` +
                `• 使用路線查詢: "台北到高雄"\n` +
                `• 查詢車站資訊: "台北車站時刻表"\n` +
                `• 或嘗試其他車次`
        }]
      };
    }
  }

  // Format train timetable response from TDX API
  private formatTrainTimetableResponse(trainData: any, trainNumber: string, source: 'specific' | 'daily', liveData?: any[]): MCPToolResponse {
    try {
      const trainInfo = trainData.TrainInfo;
      const stopTimes = trainData.StopTimes || [];

      // Extract basic train information
      const trainType = trainInfo.TrainTypeName?.Zh_tw || trainInfo.TrainTypeCode || '未知';
      const trainClass = trainInfo.TrainClassificationID;
      const note = trainInfo.Note || '';
      
      // Determine if monthly pass eligible (區間車 and some 自強號)
      const isMonthlyPassEligible = trainType.includes('區間') || 
                                   (trainType.includes('自強') && trainClass !== '1101'); // 1101 is premium express

      // Format stop times
      let timetableText = '';
      if (stopTimes.length > 0) {
        const origin = stopTimes[0]?.StationName?.Zh_tw || '起點';
        const destination = stopTimes[stopTimes.length - 1]?.StationName?.Zh_tw || '終點';
        const departureTime = stopTimes[0]?.DepartureTime || stopTimes[0]?.ArrivalTime;
        const arrivalTime = stopTimes[stopTimes.length - 1]?.ArrivalTime || stopTimes[stopTimes.length - 1]?.DepartureTime;
        
        // Calculate travel time
        let travelTime = '';
        if (departureTime && arrivalTime) {
          const depTime = new Date(`2000-01-01T${departureTime}`);
          const arrTime = new Date(`2000-01-01T${arrivalTime}`);
          if (arrTime < depTime) arrTime.setDate(arrTime.getDate() + 1); // Next day arrival
          
          const diffMs = arrTime.getTime() - depTime.getTime();
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          travelTime = `${hours}小時${minutes}分`;
        }

        timetableText += `🚄 **車次 ${trainNumber} 詳細資訊**\n\n`;
        timetableText += `📋 **基本資料**\n`;
        timetableText += `• 車種: ${trainType}\n`;
        timetableText += `• 路線: ${origin} → ${destination}\n`;
        if (travelTime) timetableText += `• 總行程: ${travelTime}\n`;
        timetableText += `• 月票適用: ${isMonthlyPassEligible ? '🎫 是' : '💰 否'}\n`;
        if (note) timetableText += `• 備註: ${note}\n`;
        timetableText += `\n⏰ **${source === 'daily' ? '今日' : ''}時刻表**\n`;

        // Create live status lookup for faster access
        const liveStatusMap = new Map();
        if (liveData) {
          liveData.forEach((live: any) => {
            liveStatusMap.set(live.StationID, live);
          });
        }

        // Find current position and overall delay status
        let currentPosition = null;
        let overallDelayMinutes = 0;
        let hasLiveData = false;
        
        if (liveData && liveData.length > 0) {
          hasLiveData = true;
          // Find the most recent position
          const sortedLive = liveData.sort((a, b) => {
            const timeA = new Date(a.UpdateTime || 0).getTime();
            const timeB = new Date(b.UpdateTime || 0).getTime();
            return timeB - timeA;
          });
          
          currentPosition = sortedLive[0];
          overallDelayMinutes = currentPosition.DelayTime || 0;
        }

        // Format each stop with live status and adjusted times
        stopTimes.forEach((stop: any, index: number) => {
          const stationName = stop.StationName?.Zh_tw || stop.StationID;
          const stationId = stop.StationID;
          const originalArrTime = stop.ArrivalTime;
          const originalDepTime = stop.DepartureTime;
          
          // Get live status for this station
          const liveStatus = liveStatusMap.get(stationId);
          let statusIcon = '';
          let delayInfo = '';
          let adjustedArrTime = originalArrTime;
          let adjustedDepTime = originalDepTime;
          let delayMinutes = 0;
          
          if (liveStatus) {
            delayMinutes = liveStatus.DelayTime || 0;
            const trainStationStatus = liveStatus.TrainStationStatus; // 0:'進站中',1:'在站上',2:'已離站'
            const runningStatus = liveStatus.RunningStatus; // 0:'準點',1:'誤點',2:'取消'
            
            // 計算調整後的時間
            if (delayMinutes > 0 && runningStatus !== 2) {
              if (originalArrTime) {
                adjustedArrTime = this.addMinutesToTime(originalArrTime, delayMinutes);
              }
              if (originalDepTime) {
                adjustedDepTime = this.addMinutesToTime(originalDepTime, delayMinutes);
              }
            }
            
            // 基本延誤狀態 (使用交通燈概念)
            if (runningStatus === 2) {
              statusIcon = '❌';
              delayInfo = ' 取消';
            } else if (delayMinutes > 10) {
              statusIcon = '🔴';
              delayInfo = ` 嚴重誤點${delayMinutes}分`;
            } else if (delayMinutes > 0 || runningStatus === 1) {
              statusIcon = '🟡';
              delayInfo = ` 輕微誤點${delayMinutes}分`;
            } else {
              statusIcon = '🟢';
              delayInfo = ' 準點';
            }
            
            // 車站狀態資訊 (使用更直觀的交通圖示)
            let stationStatusInfo = '';
            if (trainStationStatus === 0) {
              stationStatusInfo = ' 🚈進站中';
            } else if (trainStationStatus === 1) {
              stationStatusInfo = ' 🚏停靠中';
            } else if (trainStationStatus === 2) {
              stationStatusInfo = ' ➡️已離站';
            }
            
            // 判斷是否為目前位置
            const isCurrentPosition = currentPosition && currentPosition.StationID === stationId;
            if (isCurrentPosition) {
              statusIcon = '🎯' + statusIcon;
              if (trainStationStatus === 0) {
                delayInfo = ' 🚈正在進站' + (delayMinutes > 0 ? `(${delayMinutes}分鐘延誤)` : '(準點)');
              } else if (trainStationStatus === 1) {
                delayInfo = ' 🚏停靠中' + (delayMinutes > 0 ? `(${delayMinutes}分鐘延誤)` : '(準點)');
              } else {
                delayInfo = ' 目前位置' + delayInfo;
              }
            } else {
              delayInfo += stationStatusInfo;
            }
          } else if (overallDelayMinutes > 0) {
            // 如果沒有該站的具體即時資料，但整體有延誤，則使用整體延誤時間
            if (originalArrTime) {
              adjustedArrTime = this.addMinutesToTime(originalArrTime, overallDelayMinutes);
            }
            if (originalDepTime) {
              adjustedDepTime = this.addMinutesToTime(originalDepTime, overallDelayMinutes);
            }
          }
          
          // 格式化時間顯示
          const formatTimeWithDelay = (originalTime: string, adjustedTime: string, isArrival: boolean = true) => {
            if (!originalTime) return '';
            
            if (originalTime === adjustedTime) {
              return originalTime;
            } else {
              // 顯示調整後時間，並以較小字體顯示原定時間
              const timeType = isArrival ? '到' : '發';
              return `${adjustedTime}${timeType} (原定${originalTime})`;
            }
          };
          
          if (index === 0) {
            // Origin station
            const timeDisplay = formatTimeWithDelay(originalDepTime || originalArrTime, adjustedDepTime || adjustedArrTime, false);
            timetableText += `🚩 ${stationName.padEnd(8)} ${timeDisplay}${statusIcon}${delayInfo}\n`;
          } else if (index === stopTimes.length - 1) {
            // Destination station
            const timeDisplay = formatTimeWithDelay(originalArrTime || originalDepTime, adjustedArrTime || adjustedDepTime, true);
            timetableText += `🏁 ${stationName.padEnd(8)} ${timeDisplay}${statusIcon}${delayInfo}\n`;
          } else {
            // Intermediate stations
            if (originalArrTime && originalDepTime && originalArrTime !== originalDepTime) {
              const stopDuration = this.calculateStopDuration(originalArrTime, originalDepTime);
              const arrDisplay = formatTimeWithDelay(originalArrTime, adjustedArrTime, true);
              const depDisplay = formatTimeWithDelay(originalDepTime, adjustedDepTime, false);
              
              if (adjustedArrTime === originalArrTime && adjustedDepTime === originalDepTime) {
                // 無延誤，使用原格式
                timetableText += `   ${stationName.padEnd(8)} ${originalArrTime} → ${originalDepTime} (${stopDuration})${statusIcon}${delayInfo}\n`;
              } else {
                // 有延誤，顯示調整後時間
                timetableText += `   ${stationName.padEnd(8)} ${arrDisplay} → ${depDisplay} (${stopDuration})${statusIcon}${delayInfo}\n`;
              }
            } else {
              const singleTime = originalArrTime || originalDepTime;
              const adjustedSingleTime = adjustedArrTime || adjustedDepTime;
              const timeDisplay = formatTimeWithDelay(singleTime, adjustedSingleTime);
              timetableText += `   ${stationName.padEnd(8)} ${timeDisplay}${statusIcon}${delayInfo}\n`;
            }
          }
        });

        // Add live status summary
        if (hasLiveData && currentPosition) {
          const updateTime = new Date(currentPosition.UpdateTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
          const stationName = currentPosition.StationName?.Zh_tw || currentPosition.StationID;
          const trainStationStatus = currentPosition.TrainStationStatus;
          const runningStatus = currentPosition.RunningStatus;
          
          timetableText += `\n📊 **即時狀態** (${updateTime} 更新)\n`;
          
          // 整體運行狀態 (使用交通燈系統)
          if (runningStatus === 2) {
            timetableText += `❌ **列車已取消**\n`;
          } else if (overallDelayMinutes > 10) {
            timetableText += `🔴 **嚴重誤點 ${overallDelayMinutes} 分鐘**\n`;
          } else if (overallDelayMinutes > 0 || runningStatus === 1) {
            timetableText += `🟡 **輕微誤點 ${overallDelayMinutes} 分鐘**\n`;
          } else {
            timetableText += `🟢 **目前準點行駛**\n`;
          }
          
          // 目前位置和狀態 (使用更直觀的交通圖示)
          let positionStatus = '';
          if (trainStationStatus === 0) {
            positionStatus = '🚈 正在進站';
          } else if (trainStationStatus === 1) {
            positionStatus = '🚏 停靠中';
          } else if (trainStationStatus === 2) {
            positionStatus = '➡️ 已離站';
          }
          
          timetableText += `🎯 **${stationName}** ${positionStatus}\n`;
          
          // 統計即時資訊覆蓋率
          const totalStations = stopTimes.length;
          const stationsWithLiveData = liveData?.length || 0;
          const coveragePercent = Math.round((stationsWithLiveData / totalStations) * 100);
          
          timetableText += `📡 即時資料覆蓋: ${stationsWithLiveData}/${totalStations} 站 (${coveragePercent}%)\n`;
          
          // 預估下一站資訊
          if (trainStationStatus === 2 && runningStatus !== 2) { // 已離站且未取消
            const currentStationIndex = stopTimes.findIndex((stop: any) => stop.StationID === currentPosition.StationID);
            if (currentStationIndex >= 0 && currentStationIndex < stopTimes.length - 1) {
              const nextStation = stopTimes[currentStationIndex + 1];
              const nextStationName = nextStation.StationName?.Zh_tw || nextStation.StationID;
              const scheduledArrival = nextStation.ArrivalTime || nextStation.DepartureTime;
              
              if (scheduledArrival) {
                // 計算預估到達時間（加上延誤）
                const [hours, minutes] = scheduledArrival.split(':').map(Number);
                const estimatedTime = new Date();
                estimatedTime.setHours(hours, minutes + overallDelayMinutes, 0, 0);
                const estimatedArrival = estimatedTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                
                timetableText += `⏭️ 下一站: **${nextStationName}** 預估 ${estimatedArrival} 到達\n`;
              }
            }
          }
          
          // 終點站預估時間
          if (runningStatus !== 2 && stopTimes.length > 0) {
            const finalStation = stopTimes[stopTimes.length - 1];
            const finalArrival = finalStation.ArrivalTime || finalStation.DepartureTime;
            if (finalArrival && overallDelayMinutes > 0) {
              const [hours, minutes] = finalArrival.split(':').map(Number);
              const estimatedFinalTime = new Date();
              estimatedFinalTime.setHours(hours, minutes + overallDelayMinutes, 0, 0);
              const estimatedFinal = estimatedFinalTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
              const finalStationName = finalStation.StationName?.Zh_tw || finalStation.StationID;
              
              timetableText += `🏁 **${finalStationName}** 預估 ${estimatedFinal} 到達 (原定 ${finalArrival})\n`;
            }
          }
        }

        // Add monthly pass info
        if (isMonthlyPassEligible) {
          timetableText += `\n🎫 **月票適用**\n`;
          timetableText += `✅ 此班次適用月票優惠\n`;
          timetableText += `💡 建議搭配月票使用可節省費用\n`;
        }

        // Add real-time status info
        timetableText += `\n💡 **提醒**\n`;
        if (hasLiveData) {
          timetableText += `• 即時資訊已整合至時刻表中\n`;
          timetableText += `• 資料每分鐘更新，實際狀況請以車站公告為準\n`;
        } else {
          timetableText += `• 即時資訊暫時無法取得\n`;
          timetableText += `• 實際發車時間請以車站公告為準\n`;
        }
        
      } else {
        timetableText = `🚄 **車次 ${trainNumber}**\n\n車種: ${trainType}\n\n⚠️ 詳細時刻表資料暫時無法取得`;
      }

      return {
        content: [{
          type: 'text',
          text: timetableText
        }]
      };

    } catch (error) {
      this.logError('Error formatting train timetable response', error, { trainNumber, source });
      
      return {
        content: [{
          type: 'text',
          text: `🚄 **車次 ${trainNumber}**\n\n❌ 時刻表格式化失敗\n請稍後再試或聯繫系統管理員`
        }]
      };
    }
  }

  // Helper function to calculate stop duration
  private calculateStopDuration(arrivalTime: string, departureTime: string): string {
    try {
      const arrTime = new Date(`2000-01-01T${arrivalTime}`);
      const depTime = new Date(`2000-01-01T${departureTime}`);
      
      const diffMs = depTime.getTime() - arrTime.getTime();
      const minutes = Math.round(diffMs / (1000 * 60));
      
      return `${minutes}分`;
    } catch {
      return '停車';
    }
  }



  // Generate suggestions for incomplete queries
  private generateSuggestions(parsed: ParsedQuery): string {
    const missing: string[] = [];
    
    if (!parsed.origin) {
      missing.push('• Starting station (e.g., "台北", "高雄")');
    }
    if (!parsed.destination) {
      missing.push('• Destination station (e.g., "台中", "桃園")');
    }
    if (!parsed.date && !parsed.time) {
      missing.push('• When to travel (e.g., "明天", "下午3點", "今天早上")');
    }
    
    return missing.join('\n');
  }


  private checkRateLimit(clientId: string): void {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;
    
    // Periodic cleanup to prevent memory leaks (every 5 minutes)
    if (now - this.lastRateLimitCleanup > 300000) {
      this.cleanupRateLimiting(windowStart);
      this.lastRateLimitCleanup = now;
    }
    
    // Periodic cache cleanup using defined interval
    if (now - this.lastCacheCleanup > MEMORY_CONSTANTS.CACHE_CLEANUP_INTERVAL) {
      this.cleanupExpiredCache();
      this.lastCacheCleanup = now;
    }
    
    // Clean old entries for current window
    for (const [id, time] of this.lastRequestTime.entries()) {
      if (time < windowStart) {
        this.requestCount.delete(id);
        this.lastRequestTime.delete(id);
      }
    }
    
    // Check current client
    const currentCount = this.requestCount.get(clientId) || 0;
    if (currentCount >= this.RATE_LIMIT_MAX_REQUESTS) {
      throw new TRAError(
        ErrorCategory.RATE_LIMIT,
        `Rate limit exceeded: maximum ${this.RATE_LIMIT_MAX_REQUESTS} requests per minute`,
        {
          clientId,
          currentCount,
          maxRequests: this.RATE_LIMIT_MAX_REQUESTS,
          windowMs: this.RATE_LIMIT_WINDOW
        }
      );
    }
    
    // Update counters
    const newCount = currentCount + 1;
    this.requestCount.set(clientId, newCount);
    this.lastRequestTime.set(clientId, now);
    
    // Log security event for monitoring
    if (newCount > this.RATE_LIMIT_MAX_REQUESTS * 0.8) {
      console.error(`Security: Client ${clientId} approaching rate limit: ${newCount}/${this.RATE_LIMIT_MAX_REQUESTS}`);
    }
  }

  private cleanupRateLimiting(cutoffTime: number): void {
    const beforeCount = this.requestCount.size;
    
    // Remove all entries older than cutoff
    for (const [id, time] of this.lastRequestTime.entries()) {
      if (time < cutoffTime) {
        this.requestCount.delete(id);
        this.lastRequestTime.delete(id);
      }
    }
    
    const afterCount = this.requestCount.size;
    if (beforeCount !== afterCount) {
      console.error(`Rate limit cleanup: removed ${beforeCount - afterCount} inactive clients`);
    }
  }

  /**
   * Categorize and log errors for better monitoring and debugging
   * @param error - The original error or error message
   * @param context - Additional context for debugging
   * @returns A categorized error with proper classification
   */
  private logError(message: string, error?: unknown, context?: Record<string, any>): void {
    // Use console.error for structured logging (not console.log which corrupts MCP protocol)
    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      message,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      context
    };
    
    console.error(JSON.stringify(logEntry, null, 2));
  }

  private categorizeError(error: unknown, context?: Record<string, unknown>): TRAError {
    if (error instanceof TRAError) {
      return error; // Already categorized
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;
    
    // Network-related errors
    if (errorMessage.includes('fetch') || 
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ENOTFOUND')) {
      return new TRAError(ErrorCategory.NETWORK, `Network error: ${errorMessage}`, context, originalError);
    }
    
    // Authentication errors
    if (errorMessage.includes('401') || 
        errorMessage.includes('403') || 
        errorMessage.includes('authentication') ||
        errorMessage.includes('unauthorized')) {
      return new TRAError(ErrorCategory.AUTHENTICATION, `Authentication failed: ${errorMessage}`, context, originalError);
    }
    
    // Rate limiting errors
    if (errorMessage.includes('429') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return new TRAError(ErrorCategory.RATE_LIMIT, `Rate limit exceeded: ${errorMessage}`, context, originalError);
    }
    
    // Validation errors
    if (errorMessage.includes('Invalid') || 
        errorMessage.includes('must be') ||
        errorMessage.includes('too long') ||
        errorMessage.includes('required')) {
      return new TRAError(ErrorCategory.VALIDATION, `Validation error: ${errorMessage}`, context, originalError);
    }
    
    // Data not found errors
    if (errorMessage.includes(HTTP_CONSTANTS.NOT_FOUND.toString()) || 
        errorMessage.includes('not found') ||
        errorMessage.includes('No data') ||
        errorMessage.includes('empty')) {
      return new TRAError(ErrorCategory.DATA_NOT_FOUND, `Data not found: ${errorMessage}`, context, originalError);
    }
    
    // API errors (4xx, 5xx status codes)
    if (/[45]\d{2}/.test(errorMessage)) {
      return new TRAError(ErrorCategory.API_ERROR, `API error: ${errorMessage}`, context, originalError);
    }
    
    // Default to system error
    return new TRAError(ErrorCategory.SYSTEM, `System error: ${errorMessage}`, context, originalError);
  }

  /**
   * Clean up expired live data cache entries to prevent memory leaks
   * Removes cache entries that have expired beyond a grace period
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const beforeCount = this.liveDataCache.size;
    
    // Remove cache entries that expired more than 2 minutes ago
    // Keep recent expired entries for fallback purposes
    const graceExpiry = now - (2 * 60 * 1000);
    
    // First pass: remove expired entries
    for (const [stationId, cached] of this.liveDataCache.entries()) {
      if (cached.expiresAt < graceExpiry) {
        this.liveDataCache.delete(stationId);
      }
    }
    
    // Second pass: enforce maximum cache size to prevent memory bloat
    if (this.liveDataCache.size > MEMORY_CONSTANTS.MAX_CACHE_ENTRIES) {
      // Convert to array, sort by expiry time, and keep only the most recent entries
      const entries = Array.from(this.liveDataCache.entries())
        .sort(([,a], [,b]) => b.expiresAt - a.expiresAt)
        .slice(0, MEMORY_CONSTANTS.MAX_CACHE_ENTRIES);
      
      this.liveDataCache.clear();
      entries.forEach(([stationId, cached]) => {
        this.liveDataCache.set(stationId, cached);
      });
    }
    
    const afterCount = this.liveDataCache.size;
    if (beforeCount !== afterCount) {
      console.error(`Cache cleanup: removed ${beforeCount - afterCount} expired live data entries`);
    }
  }

  private setupGracefulShutdown() {
    // Only set up shutdown handlers if not in test environment
    if (!isTestEnvironment()) {
      const gracefulShutdown = async (signal: string) => {
        console.error(`Received ${signal}, starting graceful shutdown...`);
        this.isShuttingDown = true;
        
        // Give ongoing requests time to complete with proper timeout
        const shutdownTimer = setTimeout(() => {
          console.error('Graceful shutdown timeout reached, forcing exit');
          process.exit(EXIT_CODES.ERROR);
        }, this.GRACEFUL_SHUTDOWN_TIMEOUT);
        
        // Clear timeout if shutdown completes naturally
        try {
          // Wait a bit for current requests to finish
          await new Promise(resolve => setTimeout(resolve, TIMEOUTS.SHUTDOWN_WAIT));
          clearTimeout(shutdownTimer);
          console.error('Graceful shutdown complete');
          process.exit(EXIT_CODES.SUCCESS);
        } catch (error) {
          clearTimeout(shutdownTimer);
          console.error('Error during shutdown:', error);
          process.exit(EXIT_CODES.ERROR);
        }
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    
    // Handle EPIPE errors gracefully to prevent crashes when client disconnects
    process.on('uncaughtException', (error: Error) => {
      const systemError = error as NodeSystemError;
      if (systemError.code === 'EPIPE') {
        // Client disconnected - mark as disconnected and exit gracefully
        this.isConnected = false;
        process.exit(EXIT_CODES.SUCCESS);
      } else {
        // Log other uncaught exceptions and exit
        // Never re-throw from uncaughtException handler as it causes undefined behavior
        console.error('Uncaught exception:', error);
        console.error('Stack trace:', error.stack);
        process.exit(EXIT_CODES.UNCAUGHT_EXCEPTION);
      }
    });

    // Handle transport errors gracefully
    transport.onclose = () => {
      this.isConnected = false;
      process.exit(EXIT_CODES.SUCCESS);
    };
    
    transport.onerror = (error: Error) => {
      this.isConnected = false;
      const transportError = error as TransportError;
      if (transportError.code === 'EPIPE') {
        // Client disconnected - exit gracefully
        process.exit(EXIT_CODES.SUCCESS);
      } else {
        console.error('Transport error:', error);
        console.error('Error details:', transportError.details);
      }
    };

    await this.server.connect(transport);
    this.isConnected = true;
    console.error('Smart TRA MCP Server started successfully');
    
    // Load station data now that connection is established
    if (!this.stationDataLoaded && !this.stationLoadFailed) {
      await this.loadStationData();
    }
  }

  // Health check method for future use
  getHealthStatus() {
    return {
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      sessionId: this.sessionId
    };
  }

  /**
   * Get fare calculation rules from configuration or defaults
   * Can be overridden via environment variables for different deployments
   */
  private getFareRules(): FareRules {
    return {
      child: parseFloat(process.env.FARE_CHILD_RATIO || String(DEFAULT_FARE_RULES.child)),
      senior: parseFloat(process.env.FARE_SENIOR_RATIO || String(DEFAULT_FARE_RULES.senior)),
      disabled: parseFloat(process.env.FARE_DISABLED_RATIO || String(DEFAULT_FARE_RULES.disabled)),
      roundingMethod: (process.env.FARE_ROUNDING_METHOD as FareRules['roundingMethod']) || DEFAULT_FARE_RULES.roundingMethod
    };
  }

  /**
   * Get the appropriate rounding function based on configuration
   */
  private getRoundingFunction(method: FareRules['roundingMethod']): (n: number) => number {
    switch (method) {
      case 'floor':
        return Math.floor;
      case 'ceil':
        return Math.ceil;
      case 'round':
      default:
        return Math.round;
    }
  }

  // Test helper methods for better test isolation
  resetRateLimitingForTest(): void {
    if (isTestEnvironment()) {
      this.requestCount.clear();
      this.lastRequestTime.clear();
    }
  }

  setRateLimitForTest(clientId: string, count: number, timestamp?: number): void {
    if (isTestEnvironment()) {
      this.requestCount.set(clientId, count);
      this.lastRequestTime.set(clientId, timestamp || Date.now());
    }
  }

  getSessionIdForTest(): string {
    if (isTestEnvironment()) {
      return this.sessionId;
    }
    throw new Error('Test methods only available in test environment');
  }

  // Test helper to load station data without connection check
  async loadStationDataForTest(mockData?: any[]): Promise<void> {
    if (!isTestEnvironment()) {
      throw new Error('This method is only available in test environment');
    }
    
    if (mockData) {
      // Use provided mock data
      this.stationData = mockData;
      this.stationDataLoaded = true;
      this.stationLoadFailed = false;
      this.buildSearchIndexes(); // Build search indexes for the mock data
      console.error(`Loaded ${mockData.length} mock stations for testing`);
    } else {
      // Try to load from API but skip connection check
      const originalIsConnected = this.isConnected;
      this.isConnected = true; // Temporarily set to true for loading
      
      try {
        await this.loadStationData();
      } finally {
        this.isConnected = originalIsConnected; // Restore original state
      }
    }
  }

  checkRateLimitForTest(clientId: string): void {
    if (isTestEnvironment()) {
      this.checkRateLimit(clientId);
    } else {
      throw new Error('Test methods only available in test environment');
    }
  }

  // Public test wrappers for private handler methods
  async handleSearchStationForTest(query: string, context?: string): Promise<any> {
    if (!isTestEnvironment()) {
      throw new Error('Test methods only available in test environment');
    }
    return this.handleSearchStation(query, context);
  }

  async handleSearchTrainsForTest(query: string, context?: string): Promise<any> {
    if (!isTestEnvironment()) {
      throw new Error('Test methods only available in test environment');
    }
    return this.handleSearchTrains(query, context);
  }
}

// Export the class for testing
export { SmartTRAServer };

// Only start the server if this is the main module (not imported)
// Check if running directly (not in test environment)
if (!isTestEnvironment() && process.argv[1]?.endsWith('server.js')) {
  const server = new SmartTRAServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(EXIT_CODES.ERROR);
  });
}