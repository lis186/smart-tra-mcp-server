#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';

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
          return {
            content: [
              {
                type: 'text',
                text: `[STAGE 2 MOCK] Train search for: "${sanitizedQuery}"${sanitizedContext ? ` (context: ${sanitizedContext})` : ''}\n\n` +
                      `🚄 This is a mock response demonstrating MCP protocol functionality.\n` +
                      `✅ Query validated, sanitized, and rate-limited successfully.\n` +
                      `🔄 Real TDX train data integration coming in Stage 3.\n\n` +
                      `Expected future response: Train schedules, real-time status, fares.`,
              },
            ],
          };

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