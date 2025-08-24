/**
 * Smart TRA MCP Server - Production Version
 * 
 * Main MCP server class that orchestrates the Taiwan Railway system
 * Fully modular architecture replacing the original 3,753-line monolith
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Core modules
import { AuthManager } from './core/auth-manager.js';
import { DataManager } from './core/data-manager.js';
import { ErrorHandler, ErrorCategory } from './core/error-handler.js';

// Services
import { TrainService } from './services/train-service.js';
import { TripPlanner } from './services/trip-planner.js';

// Utilities
import { ValidationUtils } from './utils/validation-utils.js';

// Query parsing
import { QueryParser, ParsedQuery } from './query-parser.js';
import { SmartTrainSearchEngine } from './smart-train-search.js';

// Environment loading
function loadEnvironmentVariables(): void {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');
      
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    // Silently ignore .env loading errors to avoid stdout pollution
  }
}

loadEnvironmentVariables();

// Constants
const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  CONFIG_ERROR: 2
};

const TIMEOUTS = {
  GRACEFUL_SHUTDOWN: 10000,
  REQUEST_TIMEOUT: 30000,
  SHUTDOWN_WAIT: 1000
};

// Use the correct MCP response interface
interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

/**
 * Main Smart TRA MCP Server class - NOW FULLY MODULAR
 * Reduced from 3,753 lines to ~400 lines using service architecture
 */
export class SmartTRAServer {
  private server: Server;
  private authManager: AuthManager;
  private dataManager: DataManager;
  private errorHandler: ErrorHandler;
  private trainService: TrainService;
  private tripPlanner: TripPlanner;
  private queryParser: QueryParser;
  private smartSearchEngine: SmartTrainSearchEngine;
  
  private isShuttingDown = false;
  private isConnected = false;
  private readonly sessionId: string;

  constructor() {
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

    // Generate unique session ID
    this.sessionId = `pid-${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2)}`;

    // Initialize core components
    const clientId = process.env.TDX_CLIENT_ID;
    const clientSecret = process.env.TDX_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('TDX_CLIENT_ID and TDX_CLIENT_SECRET environment variables are required');
    }

    // Initialize modular architecture
    this.authManager = new AuthManager(clientId, clientSecret);
    this.errorHandler = new ErrorHandler(this.sessionId);
    this.dataManager = new DataManager(this.authManager, this.errorHandler);
    this.trainService = new TrainService(this.authManager, this.errorHandler);
    this.queryParser = new QueryParser();
    this.smartSearchEngine = new SmartTrainSearchEngine();
    this.tripPlanner = new TripPlanner(this.dataManager, this.trainService, this.queryParser);

    this.setupHandlers();
    this.setupGracefulShutdown();
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_trains',
            description: 'Search for train schedules, timetables, and real-time information between stations',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language query for train schedules (e.g., "台北到花蓮明天早上")'
                },
                context: {
                  type: 'string',
                  description: 'Optional context or preferences for the search'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'search_station',
            description: 'Find and confirm TRA station names with fuzzy matching',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Station name or partial name to search for'
                },
                context: {
                  type: 'string',
                  description: 'Optional context for the search'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'plan_trip',
            description: 'Plan trips with transfer recommendations and route optimization',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Trip planning request (e.g., "台北到九份怎麼去")'
                },
                context: {
                  type: 'string',
                  description: 'Optional preferences like speed, cost, or comfort'
                }
              },
              required: ['query']
            }
          }
        ]
      };
    });

    // Handle tool calls with consistent error handling  
    // @ts-ignore - Temporary fix for MCP SDK type mismatch
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
      } catch (error) {
        this.errorHandler.logError('Security: Malformed request detected', error, { sessionId: this.sessionId });
        throw error;
      }

      const query = args.query;
      const context = args.context;

      // Sanitize inputs
      const sanitizedQuery = this.sanitizeInput(query);
      const sanitizedContext = context ? this.sanitizeInput(context) : undefined;

      // STAGE 2 FOUNDATION: Mock responses for MCP protocol validation
      // These will be replaced with real TDX API integration in Stage 3
      switch (name) {
        case 'search_trains':
          return await this.handleSearchTrains(sanitizedQuery, sanitizedContext);

        case 'search_station':
          return await this.handleSearchStation(sanitizedQuery, sanitizedContext);

        case 'plan_trip':
          return await this.handlePlanTrip(sanitizedQuery, sanitizedContext);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Handle search_station tool requests - CONSISTENT ERROR HANDLING
   */
  private async handleSearchStation(query: string, context?: string): Promise<MCPToolResponse> {
    try {
      // Ensure station data is loaded
      if (!this.dataManager.isStationDataLoaded()) {
        await this.dataManager.loadStationData();
      }

      const results = this.dataManager.searchStations(query);

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
        responseText += `🔍 Best match: **${main.name}** (${Math.round(main.confidence * 100)}% confidence)\n`;
      }
      
      responseText += `📍 Station ID: ${main.station.StationID}\n`;
      
      if (main.station.StationName?.En) {
        responseText += `🌐 English: ${main.station.StationName.En}\n`;
      }

      if (needsConfirmation && alternatives.length > 0) {
        responseText += `\n🤔 **Other possible matches:**\n`;
        alternatives.slice(0, 3).forEach((alt, index) => {
          responseText += `${index + 1}. ${alt.name} (${Math.round(alt.confidence * 100)}% confidence)\n`;
        });
        responseText += `\n💡 Use the station name in your next query if this matches your intent.`;
      }

      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };

    } catch (error) {
      const categorizedError = this.errorHandler.categorizeError(error);
      this.errorHandler.logError('Error in handleSearchStation', categorizedError, { query, context });
      return this.errorHandler.createErrorResponse(categorizedError, query, 'search_station');
    }
  }

  /**
   * Handle search_trains tool requests - ENHANCED NLP + CONSISTENT ERROR HANDLING
   */
  private async handleSearchTrains(query: string, context?: string): Promise<MCPToolResponse> {
    try {
      // Parse the natural language query
      const parsed = this.queryParser.parse(query);
      
      // Handle train number queries
      if (this.queryParser.isTrainNumberQuery(parsed)) {
        return await this.handleTrainNumberQuery(parsed);
      }
      
      // Validate that we have enough information
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
                  `• "152" (車次號碼查詢)`
          }]
        };
      }

      // Ensure station data is loaded
      if (!this.dataManager.isStationDataLoaded()) {
        await this.dataManager.loadStationData();
      }

      // Get station information for origin and destination
      const originResults = this.dataManager.searchStations(parsed.origin || '');
      const destResults = this.dataManager.searchStations(parsed.destination || '');

      if (originResults.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ Unable to find origin station: "${parsed.origin}"\n\n` +
                  `Please try:\n` +
                  `• Use search_station to find the correct station name\n` +
                  `• Check spelling or try alternative names\n` +
                  `• Example: "台北", "台北車站", "Taipei"`
          }]
        };
      }

      if (destResults.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ Unable to find destination station: "${parsed.destination}"\n\n` +
                  `Please try:\n` +
                  `• Use search_station to find the correct station name\n` +
                  `• Check spelling or try alternative names\n` +
                  `• Example: "花蓮", "花蓮車站", "Hualien"`
          }]
        };
      }

      const originStation = originResults[0].station;
      const destStation = destResults[0].station;

      // Make API call to get train schedules using service layer
      const trains = await this.trainService.getDailyTrainTimetable(
        originStation.StationID, 
        destStation.StationID, 
        parsed.date
      );

      if (trains.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `😔 No direct trains found between ${originStation.StationName.Zh_tw} and ${destStation.StationName.Zh_tw}\n\n` +
                  `This might mean:\n` +
                  `• No direct service on this route\n` +
                  `• Transfer required (try plan_trip tool)\n` +
                  `• Service not available on selected date\n\n` +
                  `💡 Try using plan_trip for routes requiring transfers`
          }]
        };
      }

      // Process and format results using service layer
      const processedTrains = this.trainService.processTrainSearchResults(trains, originStation.StationID, destStation.StationID);
      const responseText = this.trainService.formatTrainResults(processedTrains, originStation.StationName.Zh_tw, destStation.StationName.Zh_tw);

      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };

    } catch (error) {
      const categorizedError = this.errorHandler.categorizeError(error);
      this.errorHandler.logError('Error in handleSearchTrains', categorizedError, { query, context });
      return this.errorHandler.createErrorResponse(categorizedError, query, 'search_trains');
    }
  }

  /**
   * Handle plan_trip tool requests - ENHANCED NLP + CONSISTENT ERROR HANDLING
   */
  private async handlePlanTrip(query: string, context?: string): Promise<MCPToolResponse> {
    try {
      // Enhanced NLP parsing for trip planning using service layer
      const parsed = this.tripPlanner.parseEnhancedTripQuery(query);
      
      // Check if destination is a known non-station location using service layer
      const nearestStationMapping = this.tripPlanner.getNearestStationForDestination(parsed.destination || query);
      
      if (nearestStationMapping && nearestStationMapping.isNonStation) {
        return this.handleNonStationDestination(parsed, nearestStationMapping, query, context);
      }
      
      // Check if transfer is needed using service layer
      const requiresTransfer = await this.tripPlanner.checkIfTransferRequired(
        parsed.origin || '',
        parsed.destination || ''
      );
      
      if (requiresTransfer) {
        const tripPlan = await this.tripPlanner.planMultiSegmentJourney(parsed, query, context);
        const responseText = this.tripPlanner.formatTripPlan(tripPlan, parsed.origin || '', parsed.destination || '');
        
        return {
          content: [{
            type: 'text',
            text: responseText
          }]
        };
      } else {
        // Direct route available - use search_trains functionality
        return await this.handleSearchTrains(query, context);
      }
      
    } catch (error) {
      const categorizedError = this.errorHandler.categorizeError(error);
      this.errorHandler.logError('plan_trip error', categorizedError);
      return this.errorHandler.createErrorResponse(categorizedError, query, 'plan_trip');
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Sanitize user input by removing potentially problematic characters
   */
  private sanitizeInput(input: unknown): string {
    if (typeof input !== 'string') {
      throw new Error('Invalid input: must be a string');
    }

    return input
      .trim()
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 500); // Ensure length limit
  }

  /**
   * Generate suggestions for incomplete queries
   */
  private generateSuggestions(parsed: ParsedQuery): string {
    const missing = [];
    if (!parsed.origin) missing.push('Starting station (e.g., "台北", "高雄")');
    if (!parsed.destination) missing.push('Destination station (e.g., "台中", "桃園")');
    return missing.map(item => `• ${item}`).join('\n');
  }

  /**
   * Handle train number queries using smart search engine
   */
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
      
      // Format and return smart suggestions
      const responseText = this.smartSearchEngine.formatSearchResult(searchResult);
      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };
      
    } catch (error) {
      this.errorHandler.logError('Error in handleTrainNumberQuery', error, { 
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

  /**
   * Handle non-station destinations (tourist attractions)
   */
  private handleNonStationDestination(
    parsed: ParsedQuery, 
    mapping: any, 
    query: string, 
    context?: string
  ): Promise<MCPToolResponse> {
    const responseText = `🎯 **${mapping.destination}交通指南**\n\n` +
      `📍 最近的火車站: **${mapping.station}**\n\n` +
      `🚆 **建議路線:**\n${mapping.instructions}\n\n` +
      `💡 **下一步:** 使用 search_trains 查詢到 ${mapping.station} 的班次\n` +
      `例如: "${parsed.origin || '台北'}到${mapping.station}"`;

    return Promise.resolve({
      content: [{
        type: 'text',
        text: responseText
      }]
    });
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      console.error(`Received ${signal}. Starting graceful shutdown...`);
      this.isShuttingDown = true;
      
      const shutdownTimer = setTimeout(() => {
        console.error('Shutdown timeout reached. Forcing exit.');
        process.exit(EXIT_CODES.ERROR);
      }, TIMEOUTS.GRACEFUL_SHUTDOWN);
      
      try {
        // Clean up resources
        this.dataManager.cleanupCache();
        
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

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      console.error('Test environment detected - skipping server startup');
      return;
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.isConnected = true;
      console.error('Smart TRA MCP Server running on stdio');
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(EXIT_CODES.ERROR);
    }
  }

  // ==================== TEST SUPPORT METHODS ====================

  async loadStationDataForTest(mockData?: any[]): Promise<void> {
    if (mockData) {
      this.dataManager.loadMockData(mockData);
    } else {
      await this.dataManager.loadStationData();
    }
  }

  async handleSearchStationForTest(query: string, context?: string): Promise<MCPToolResponse> {
    return this.handleSearchStation(query, context);
  }

  async handleSearchTrainsForTest(query: string, context?: string): Promise<MCPToolResponse> {
    return this.handleSearchTrains(query, context);
  }

  async handlePlanTripForTest(query: string, context?: string): Promise<MCPToolResponse> {
    return this.handlePlanTrip(query, context);
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SmartTRAServer();
  server.start().catch((error) => {
    console.error('Startup failed:', error);
    process.exit(EXIT_CODES.ERROR);
  });
}