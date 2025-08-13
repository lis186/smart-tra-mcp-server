#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';
import { QueryParser, ParsedQuery } from './query-parser';

// Load environment variables
dotenv.config();

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
  TrainNo: string;
  RouteID: string;
  Direction: number;
  TrainClassificationID: string;
  TrainTypeID: string;
  TrainTypeName: { Zh_tw: string; En: string };
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
  TrainDate: string;
  StopTimes: TRATrainTimetableStop[];
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
}

class SmartTRAServer {
  private server: Server;
  private isShuttingDown = false;
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
  
  // Query parsing
  private queryParser: QueryParser;
  
  // Performance indexes for fast station search
  private stationNameIndex = new Map<string, TRAStation[]>();
  private stationEnNameIndex = new Map<string, TRAStation[]>();
  private stationPrefixIndex = new Map<string, TRAStation[]>();
  
  // Rate limiting cleanup
  private lastRateLimitCleanup = Date.now();
  
  // Security limits
  private readonly MAX_QUERY_LENGTH = 1000;
  private readonly MAX_CONTEXT_LENGTH = 500;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute
  private readonly GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds

  constructor() {
    // Generate unique session identifier for rate limiting
    this.sessionId = `pid-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize query parser
    this.queryParser = new QueryParser();
    
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
    this.loadStationData();
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
        console.error(`Security: Malformed request from session ${this.sessionId}:`, error instanceof Error ? error.message : String(error));
        throw error;
      }

      const query = args.query;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Invalid query: must be a non-empty string');
      }
      
      // Security: Check input length limits
      if (query.length > this.MAX_QUERY_LENGTH) {
        throw new Error(`Query too long: maximum ${this.MAX_QUERY_LENGTH} characters allowed`);
      }

      // Validate context parameter if provided
      const context = args.context;
      if (context !== undefined && typeof context !== 'string') {
        throw new Error('Invalid context: must be a string if provided');
      }
      
      if (context && context.length > this.MAX_CONTEXT_LENGTH) {
        throw new Error(`Context too long: maximum ${this.MAX_CONTEXT_LENGTH} characters allowed`);
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
      throw new Error('TDX credentials not configured. Please set TDX_CLIENT_ID and TDX_CLIENT_SECRET environment variables.');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TDX authentication failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const tokenData = await response.json() as TokenResponse;
    
    // Cache the token (expires in 24 hours minus 5 minutes for safety)
    const expiresAt = Date.now() + (tokenData.expires_in - 300) * 1000;
    this.tokenCache = {
      token: tokenData.access_token,
      expiresAt
    };
    
    console.log('TDX access token obtained successfully');
    return tokenData.access_token;
  }

  // Call TDX Daily Train Timetable API with data availability handling
  private async getDailyTrainTimetable(originStationId: string, destinationStationId: string, trainDate?: string): Promise<TRATrainTimetable[]> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      // Use today if no date specified
      const date = trainDate || new Date().toISOString().split('T')[0];
      
      // Use the OD (Origin-Destination) endpoint for efficient filtering
      const endpoint = `/v2/Rail/TRA/DailyTrainTimetable/OD/${originStationId}/to/${destinationStationId}/${date}`;
      
      const response = await fetch(`${baseUrl}${endpoint}?%24format=JSON`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // Handle common API failure scenarios
        if (response.status === 404) {
          console.log(`No timetable data found for route ${originStationId} → ${destinationStationId} on ${date}`);
          return []; // Return empty array for no data found
        }
        throw new Error(`Failed to fetch train timetable: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as TRATrainTimetable[];
      
      // Handle data availability scenarios
      if (!data || data.length === 0) {
        console.log(`No trains available for route ${originStationId} → ${destinationStationId} on ${date}`);
        console.log('This could happen if:');
        console.log('- No trains run on this route on the specified date');
        console.log('- Trains are suspended due to maintenance or weather');
        console.log('- Date is outside of available timetable data');
        return [];
      }
      
      console.log(`Retrieved ${data.length} trains for ${originStationId} → ${destinationStationId} on ${date}`);
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
      
      // Count intermediate stops
      const originIndex = train.StopTimes.findIndex(stop => stop.StationID === originStationId);
      const destinationIndex = train.StopTimes.findIndex(stop => stop.StationID === destinationStationId);
      const stops = Math.abs(destinationIndex - originIndex) - 1; // Exclude origin and destination
      
      // Check if eligible for monthly pass (區間車, 區間快車)
      const monthlyPassTrainTypes = ['10', '11']; // 區間車 (10), 區間快車 (11)
      const isMonthlyPassEligible = monthlyPassTrainTypes.includes(train.TrainTypeID);
      
      results.push({
        trainNo: train.TrainNo,
        trainType: train.TrainTypeName.Zh_tw,
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
      const departure = new Date(`1970-01-01T${departureTime}`);
      const arrival = new Date(`1970-01-01T${arrivalTime}`);
      
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

  // Get fare information between two stations
  private async getODFare(originStationId: string, destinationStationId: string): Promise<FareInfo | null> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      // Use the OD (Origin-Destination) fare endpoint
      const endpoint = `/v3/Rail/TRA/ODFare/${originStationId}/to/${destinationStationId}`;
      
      const response = await fetch(`${baseUrl}${endpoint}?%24format=JSON`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log(`Fare data not available for route ${originStationId} → ${destinationStationId} (${response.status})`);
        return null;
      }

      const fareData = await response.json() as TDXFareResponse[];
      
      if (!Array.isArray(fareData) || fareData.length === 0) {
        console.log(`No fare data found for route ${originStationId} → ${destinationStationId}`);
        return null;
      }

      // Process fare data to extract common ticket types
      const fareInfo = this.processFareData(fareData[0]);
      console.log(`Retrieved fare data for ${originStationId} → ${destinationStationId}`);
      return fareInfo;
    } catch (error) {
      console.log(`Failed to get fare data for ${originStationId} → ${destinationStationId}:`, error instanceof Error ? error.message : String(error));
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

    // If we only have adult fare, calculate others based on TRA pricing rules
    // All reduced fares are 50% of adult fare, rounded to nearest integer
    if (fareInfo.adult > 0) {
      if (fareInfo.child === 0) {
        fareInfo.child = Math.round(fareInfo.adult * 0.5); // 兒童票: 成人票價半數四捨五入
      }
      if (fareInfo.senior === 0) {
        fareInfo.senior = Math.round(fareInfo.adult * 0.5); // 敬老愛心票: 成人票價半數四捨五入
      }
      if (fareInfo.disabled === 0) {
        fareInfo.disabled = Math.round(fareInfo.adult * 0.5); // 愛心票: 成人票價半數四捨五入
      }
    }

    return fareInfo;
  }

  // Attempt to get live delay data (optional enhancement when available)
  private async tryGetLiveDelayData(stationId: string): Promise<any[]> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      const response = await fetch(`${baseUrl}/v3/Rail/TRA/StationLiveBoard/Station/${stationId}?%24format=JSON&%24top=20`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log(`Live data not available for station ${stationId} (${response.status})`);
        return [];
      }

      const liveData = await response.json() as any[];
      
      if (!Array.isArray(liveData) || liveData.length === 0) {
        console.log(`No live trains found for station ${stationId} - trains may not be running`);
        return [];
      }
      
      console.log(`Found ${liveData.length} live trains for station ${stationId}`);
      return liveData;
    } catch (error) {
      console.log(`Failed to get live data for station ${stationId}:`, error instanceof Error ? error.message : String(error));
      return []; // Graceful fallback - return empty array
    }
  }

  // Filter trains based on commuter preferences
  private filterCommuterTrains(trains: TrainSearchResult[], preferences?: any): TrainSearchResult[] {
    let filtered = [...trains];
    
    // Default: Filter to monthly pass eligible trains only
    if (!preferences?.includeAllTrainTypes) {
      filtered = filtered.filter(train => train.isMonthlyPassEligible);
    }
    
    // Apply time window filtering (next 2 hours by default for commuters)
    const now = new Date();
    const timeWindowHours = preferences?.timeWindowHours || 2;
    const maxTime = new Date(now.getTime() + timeWindowHours * 60 * 60 * 1000);
    
    filtered = filtered.filter(train => {
      const trainTime = this.parseTrainTime(train.departureTime);
      return trainTime >= now && trainTime <= maxTime;
    });
    
    // Add late indicators and status
    filtered = filtered.map(train => {
      const trainTime = this.parseTrainTime(train.departureTime);
      const minutesUntilDeparture = Math.round((trainTime.getTime() - now.getTime()) / (1000 * 60));
      
      // Add late warning if departure is very soon
      const isLate = minutesUntilDeparture <= 15 && minutesUntilDeparture > 0;
      const hasLeft = minutesUntilDeparture <= 0;
      
      return {
        ...train,
        minutesUntilDeparture,
        isLate,
        hasLeft,
        lateWarning: isLate ? '⚠️ 即將發車' : hasLeft ? '❌ 已發車' : undefined
      };
    });
    
    // Sort by departure time (upcoming first)
    filtered.sort((a, b) => {
      const timeA = a.departureTime.replace(':', '');
      const timeB = b.departureTime.replace(':', '');
      return timeA.localeCompare(timeB);
    });
    
    // Include backup options - if we have fewer than 3 trains, include some non-monthly-pass trains
    const primaryResults = filtered.slice(0, preferences?.maxResults || 3);
    
    if (primaryResults.length < 3 && !preferences?.includeAllTrainTypes) {
      const allTrains = trains.map(train => {
        const trainTime = this.parseTrainTime(train.departureTime);
        const minutesUntilDeparture = Math.round((trainTime.getTime() - now.getTime()) / (1000 * 60));
        const isLate = minutesUntilDeparture <= 15 && minutesUntilDeparture > 0;
        const hasLeft = minutesUntilDeparture <= 0;
        
        return {
          ...train,
          minutesUntilDeparture,
          isLate,
          hasLeft,
          lateWarning: isLate ? '⚠️ 即將發車' : hasLeft ? '❌ 已發車' : undefined,
          isBackupOption: !train.isMonthlyPassEligible
        };
      });
      
      const backupTrains = allTrains
        .filter(train => !train.isMonthlyPassEligible && train.minutesUntilDeparture > 0)
        .slice(0, 3 - primaryResults.length);
      
      return [...primaryResults, ...backupTrains];
    }
    
    return primaryResults;
  }
  
  // Helper method to parse train departure time to today's date
  private parseTrainTime(timeString: string): Date {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const now = new Date();
    const trainTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds || 0);
    
    // If the time has already passed today, assume it's for tomorrow
    if (trainTime < now) {
      trainTime.setDate(trainTime.getDate() + 1);
    }
    
    return trainTime;
  }

  // Load station data from TDX API with failure state tracking
  private async loadStationData(): Promise<void> {
    if (this.stationDataLoaded) return;
    
    // Avoid repeated failed attempts (retry once per 5 minutes)
    const now = Date.now();
    if (this.stationLoadFailed && (now - this.lastStationLoadAttempt) < 300000) {
      return;
    }

    this.lastStationLoadAttempt = now;

    try {
      console.log('Loading TRA station data from TDX API...');
      const token = await this.getAccessToken();
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      const response = await fetch(`${baseUrl}/v2/Rail/TRA/Station?%24format=JSON`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load station data: ${response.status} ${response.statusText}`);
      }

      this.stationData = await response.json() as TRAStation[];
      this.buildSearchIndexes();
      this.stationDataLoaded = true;
      this.stationLoadFailed = false;
      console.log(`Loaded ${this.stationData.length} TRA stations from TDX API`);
    } catch (error) {
      console.error('Failed to load station data:', error);
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

    console.log(`Built search indexes: ${this.stationNameIndex.size} names, ${this.stationPrefixIndex.size} prefixes`);
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
    return finalResults.slice(0, 5);
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

  // Handle search_station tool request
  private async handleSearchStation(query: string, context?: string): Promise<any> {
    try {
      // Ensure station data is loaded
      if (!this.stationDataLoaded) {
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
      console.error('Error in handleSearchStation:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Error searching stations: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }

  // Handle search_trains tool request with query parsing
  private async handleSearchTrains(query: string, context?: string): Promise<any> {
    try {
      // Parse the natural language query
      const parsed = this.queryParser.parse(query);
      
      // Check if we have enough information to proceed
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
                  `• "桃園到新竹今天晚上直達車"`
          }]
        };
      }

      // Ensure station data is loaded
      if (!this.stationDataLoaded) {
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
      
      // Add fare information to train results (runs in parallel with processing)
      const fareInfo = await this.getODFare(originStation.stationId, destinationStation.stationId);
      const trainResultsWithFares = trainResults.map(train => ({
        ...train,
        fareInfo: fareInfo || undefined
      }));
      
      const filteredResults = this.filterCommuterTrains(trainResultsWithFares, parsed.preferences);

      // Format response
      let responseText = `🚄 **Train Search Results**\n\n`;
      responseText += `**Route:** ${originStation.name} → ${destinationStation.name}\n`;
      responseText += `**Date:** ${parsed.date || 'Today'}\n`;
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
          responseText += `**月票可搭 (接下來2小時):**\n\n`;
          primaryTrains.forEach((train, index) => {
            const passIcon = train.isMonthlyPassEligible ? '🎫' : '💰';
            const lateWarning = train.lateWarning ? ` ${train.lateWarning}` : '';
            const timeInfo = train.minutesUntilDeparture ? ` (${train.minutesUntilDeparture}分後)` : '';
            const fareText = train.fareInfo ? ` | 票價: $${train.fareInfo.adult}` : '';
            
            responseText += `${index + 1}. **${train.trainType} ${train.trainNo}** ${passIcon}${lateWarning}\n`;
            responseText += `   出發: ${train.departureTime}${timeInfo} → 抵達: ${train.arrivalTime}\n`;
            responseText += `   行程時間: ${train.travelTime} (${train.stops} 個中間站)${fareText}\n\n`;
          });
        }
        
        if (backupTrains.length > 0) {
          responseText += `**備選車次 (需另購票):**\n\n`;
          backupTrains.forEach((train, index) => {
            const timeInfo = train.minutesUntilDeparture ? ` (${train.minutesUntilDeparture}分後)` : '';
            const lateWarning = train.lateWarning ? ` ${train.lateWarning}` : '';
            const fareText = train.fareInfo ? ` | 票價: $${train.fareInfo.adult}` : '';
            
            responseText += `${primaryTrains.length + index + 1}. **${train.trainType} ${train.trainNo}** 💰${lateWarning}\n`;
            responseText += `   出發: ${train.departureTime}${timeInfo} → 抵達: ${train.arrivalTime}\n`;
            responseText += `   行程時間: ${train.travelTime} (${train.stops} 個中間站)${fareText}\n\n`;
          });
        }

        responseText += `🎫 = 月票可搭 | 💰 = 需另購票 | ⚠️ = 即將發車\n`;
        responseText += `時間視窗: 接下來2小時 | 可用 "接下來4小時" 擴展搜尋\n\n`;
        
        // Add fare summary if available
        if (fareInfo) {
          responseText += `**票價資訊:**\n`;
          responseText += `• 全票: $${fareInfo.adult} | 兒童票: $${fareInfo.child} | 敬老愛心票: $${fareInfo.senior}\n\n`;
        }
      }

      // Add machine-readable data
      const structuredData = JSON.stringify({
        route: {
          origin: { id: originStation.stationId, name: originStation.name },
          destination: { id: destinationStation.stationId, name: destinationStation.name }
        },
        date: parsed.date || new Date().toISOString().split('T')[0],
        totalTrains: timetableData.length,
        filteredTrains: filteredResults.length,
        trains: filteredResults.map(train => ({
          trainNo: train.trainNo,
          trainType: train.trainType,
          departure: train.departureTime,
          arrival: train.arrivalTime,
          travelTime: train.travelTime,
          monthlyPassEligible: train.isMonthlyPassEligible,
          stops: train.stops,
          minutesUntilDeparture: train.minutesUntilDeparture,
          isLate: train.isLate,
          hasLeft: train.hasLeft,
          lateWarning: train.lateWarning,
          isBackupOption: train.isBackupOption,
          fareInfo: train.fareInfo
        }))
      }, null, 2);

      responseText += `**Machine-readable data:**\n\`\`\`json\n${structuredData}\n\`\`\``;

      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };

    } catch (error) {
      console.error('Error in handleSearchTrains:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Error searching trains: ${error instanceof Error ? error.message : String(error)}\n\n` +
                `This might be due to:\n` +
                `• Network connectivity issues\n` +
                `• TDX API service unavailable\n` +
                `• Invalid station IDs or date format`
        }]
      };
    }
  }

  // Generate suggestions for incomplete queries
  private generateSuggestions(parsed: ParsedQuery): string {
    const missing = [];
    
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

  // Validate station names using existing search functionality
  private async validateStations(parsed: ParsedQuery): Promise<{ valid: boolean; message: string }> {
    if (!parsed.origin || !parsed.destination) {
      return { valid: false, message: 'Origin and destination are required' };
    }

    // Validate origin station
    const originResults = this.searchStations(parsed.origin);
    if (originResults.length === 0) {
      return {
        valid: false,
        message: `Cannot find origin station "${parsed.origin}". Try using full station names like "臺北" or "台中".`
      };
    }

    // Validate destination station
    const destinationResults = this.searchStations(parsed.destination);
    if (destinationResults.length === 0) {
      return {
        valid: false,
        message: `Cannot find destination station "${parsed.destination}". Try using full station names like "臺北" or "台中".`
      };
    }

    // Check confidence of matches
    const originMatch = originResults[0];
    const destinationMatch = destinationResults[0];

    if (originMatch.confidence < 0.7 || destinationMatch.confidence < 0.7) {
      return {
        valid: false,
        message: `Station names need clarification:\n` +
                 `• Origin: "${parsed.origin}" → best match: "${originMatch.name}" (${Math.round(originMatch.confidence * 100)}%)\n` +
                 `• Destination: "${parsed.destination}" → best match: "${destinationMatch.name}" (${Math.round(destinationMatch.confidence * 100)}%)\n\n` +
                 `Please use more specific station names.`
      };
    }

    return { valid: true, message: 'Stations validated successfully' };
  }

  private checkRateLimit(clientId: string): void {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;
    
    // Periodic cleanup to prevent memory leaks (every 5 minutes)
    if (now - this.lastRateLimitCleanup > 300000) {
      this.cleanupRateLimiting(windowStart);
      this.lastRateLimitCleanup = now;
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
      throw new Error(`Rate limit exceeded: maximum ${this.RATE_LIMIT_MAX_REQUESTS} requests per minute`);
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
      console.log(`Rate limit cleanup: removed ${beforeCount - afterCount} inactive clients`);
    }
  }

  private setupGracefulShutdown() {
    // Only set up shutdown handlers if not in test environment
    if (process.env.NODE_ENV !== 'test' && process.env.JEST_WORKER_ID === undefined) {
      const gracefulShutdown = async (signal: string) => {
        console.log(`Received ${signal}, starting graceful shutdown...`);
        this.isShuttingDown = true;
        
        // Give ongoing requests time to complete with proper timeout
        const shutdownTimer = setTimeout(() => {
          console.log('Graceful shutdown timeout reached, forcing exit');
          process.exit(1);
        }, this.GRACEFUL_SHUTDOWN_TIMEOUT);
        
        // Clear timeout if shutdown completes naturally
        try {
          // Wait a bit for current requests to finish
          await new Promise(resolve => setTimeout(resolve, 1000));
          clearTimeout(shutdownTimer);
          console.log('Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          clearTimeout(shutdownTimer);
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Smart TRA MCP Server started successfully');
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

  // Test helper methods for better test isolation
  resetRateLimitingForTest(): void {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      this.requestCount.clear();
      this.lastRequestTime.clear();
    }
  }

  setRateLimitForTest(clientId: string, count: number, timestamp?: number): void {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      this.requestCount.set(clientId, count);
      this.lastRequestTime.set(clientId, timestamp || Date.now());
    }
  }

  getSessionIdForTest(): string {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      return this.sessionId;
    }
    throw new Error('Test methods only available in test environment');
  }

  checkRateLimitForTest(clientId: string): void {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
      this.checkRateLimit(clientId);
    } else {
      throw new Error('Test methods only available in test environment');
    }
  }
}

// Export the class for testing
export { SmartTRAServer };

const server = new SmartTRAServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});