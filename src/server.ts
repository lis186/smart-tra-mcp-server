#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class SmartTRAServer {
  private server: Server;
  private isShuttingDown = false;
  private requestCount = new Map<string, number>();
  private lastRequestTime = new Map<string, number>();
  
  // Security limits
  private readonly MAX_QUERY_LENGTH = 1000;
  private readonly MAX_CONTEXT_LENGTH = 500;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute
  private readonly GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds

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

    this.setupHandlers();
    this.setupGracefulShutdown();
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

      const { name, arguments: args } = request.params;

      // Input validation
      if (!args || typeof args !== 'object') {
        throw new Error('Invalid arguments: expected object');
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
      
      // Basic rate limiting (use a simple client identifier)
      this.checkRateLimit('stdio-client');

      // Sanitize inputs for logging (remove potential control characters)
      const sanitizedQuery = query.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
      const sanitizedContext = context ? context.replace(/[\x00-\x1f\x7f-\x9f]/g, '') : undefined;

      switch (name) {
        case 'search_trains':
          return {
            content: [
              {
                type: 'text',
                text: `Mock response for search_trains: ${sanitizedQuery}${sanitizedContext ? ` (context: ${sanitizedContext})` : ''}`,
              },
            ],
          };

        case 'search_station':
          return {
            content: [
              {
                type: 'text',
                text: `Mock response for search_station: ${sanitizedQuery}${sanitizedContext ? ` (context: ${sanitizedContext})` : ''}`,
              },
            ],
          };

        case 'plan_trip':
          return {
            content: [
              {
                type: 'text',
                text: `Mock response for plan_trip: ${sanitizedQuery}${sanitizedContext ? ` (context: ${sanitizedContext})` : ''}`,
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private checkRateLimit(clientId: string): void {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;
    
    // Clean old entries
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
      version: '1.0.0'
    };
  }
}

// Export the class for testing
export { SmartTRAServer };

const server = new SmartTRAServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});