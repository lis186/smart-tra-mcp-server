import express, { Request, Response, NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SmartTRAServer } from '../server.js';
import { ServerConfig } from '../types/server.types.js';

export class ExpressServer {
  private app: express.Application;
  private config: ServerConfig;
  private mcpServer: SmartTRAServer;
  private globalTransport: StreamableHTTPServerTransport | undefined;
  private globalServer: Server | undefined;
  private httpServer: any; // HTTP server instance for proper cleanup

  // Pre-compiled error patterns for efficient categorization
  private static readonly ERROR_PATTERNS = [
    { pattern: /stream is not readable/i, type: 'transport_stream', status: 400 },
    { pattern: /parse error/i, type: 'mcp_parse', status: 400 },
    { pattern: /invalid request/i, type: 'mcp_validation', status: 400 },
    { pattern: /timeout/i, type: 'transport_timeout', status: 504 },
  ] as const;

  private static readonly DEFAULT_ERROR = { type: 'server_internal', status: 500 } as const;

  constructor(config: ServerConfig) {
    this.app = express();
    this.config = config;
    this.mcpServer = new SmartTRAServer();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS configuration
    this.app.use((req, res, next) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS;
      
      if (this.config.environment === 'development') {
        // Allow all origins in development
        res.header('Access-Control-Allow-Origin', '*');
      } else if (allowedOrigins) {
        // In production, only allow specified origins
        const origins = allowedOrigins.split(',').map(o => o.trim());
        const origin = req.get('Origin');
        
        if (origin && origins.includes(origin)) {
          res.header('Access-Control-Allow-Origin', origin);
        }
      }
      
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      
      next();
    });
  }

  private async setupMCPTransport(): Promise<void> {
    // Create a single StreamableHTTP transport for all connections
    // Using stateless mode for Cloud Run compatibility
    this.globalTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode for Cloud Run
      enableJsonResponse: true,
      // MCP spec requires Origin validation to prevent DNS rebinding
      enableDnsRebindingProtection: true,
    });

    // Create a single MCP server instance
    this.globalServer = new Server(
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

    // Set up handlers using our existing MCP server logic
    await this.setupMCPServerHandlers(this.globalServer);

    // Connect the transport to the server
    await this.globalServer.connect(this.globalTransport);
    
    console.error('StreamableHTTP transport initialized in stateless mode');
  }

  private async setupMCPServerHandlers(server: Server): Promise<void> {
    // Initialize the MCP server's data
    await this.mcpServer.loadStationDataForTest();

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
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
                  description: 'Trip planning query with origin and destination'
                },
                context: {
                  type: 'string',
                  description: 'Optional context or preferences for trip planning'
                }
              },
              required: ['query']
            }
          }
        ]
      };
    });

    // Call tool handler - delegate to our existing server methods
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const query = args?.query as string;
      const context = args?.context as string;

      switch (name) {
        case 'search_trains':
          return await this.mcpServer.handleSearchTrainsForTest(query, context);
        case 'search_station':
          return await this.mcpServer.handleSearchStationForTest(query, context);
        case 'plan_trip':
          return await this.mcpServer.handlePlanTripForTest(query, context);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private setupRoutes(): void {
    // Health check endpoint for Cloud Run with MCP transport monitoring
    this.app.get('/health', async (req: Request, res: Response) => {
      const timestamp = new Date().toISOString();
      let overallStatus = 'healthy';
      const checks: Record<string, any> = {};

      // Check MCP transport health
      try {
        checks.mcpTransport = {
          status: this.globalTransport ? 'ready' : 'not_initialized',
          initialized: !!this.globalTransport,
          serverReady: !!this.globalServer,
        };
        
        // If transport isn't ready, try to initialize it
        if (!this.globalTransport) {
          await this.setupMCPTransport();
          checks.mcpTransport.status = 'initialized_on_demand';
          checks.mcpTransport.initialized = true;
        }
      } catch (error) {
        checks.mcpTransport = {
          status: 'error',
          initialized: false,
          error: error instanceof Error ? error.message : String(error)
        };
        overallStatus = 'degraded';
      }

      // Check system health
      checks.system = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
      };

      // Check TDX client health (basic check)
      try {
        const clientId = process.env.TDX_CLIENT_ID;
        checks.tdxClient = {
          status: clientId ? 'configured' : 'not_configured',
          mockMode: clientId === 'test_client_id' || process.env.USE_MOCK_DATA === 'true'
        };
      } catch (error) {
        checks.tdxClient = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        };
        overallStatus = 'degraded';
      }

      const response = {
        status: overallStatus,
        timestamp,
        service: 'smart-tra-mcp-server',
        version: '1.0.0',
        environment: this.config.environment,
        checks,
        transport: {
          mode: 'http',
          endpoints: {
            mcp: '/mcp',
            health: '/health'
          }
        }
      };

      const statusCode = overallStatus === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Smart TRA MCP Server',
        version: '1.0.0',
        description: 'Intelligent Taiwan Railway query MCP server with natural language understanding',
        transport: 'http',
        endpoints: {
          health: '/health',
          mcp: '/mcp'
        },
        tools: ['search_trains', 'search_station', 'plan_trip']
      });
    });

    // Streamable HTTP endpoint for MCP - handles both GET (SSE stream) and POST (messages)
    this.app.all('/mcp', async (req: Request, res: Response) => {
      try {
        if (!this.globalTransport) {
          await this.setupMCPTransport();
        }

        // Let the StreamableHTTP transport handle the request
        // It will automatically handle GET for SSE and POST for messages
        await this.globalTransport!.handleRequest(req, res, req.body);

      } catch (error) {
        // Efficient error categorization using pre-compiled patterns
        const { type: errorType, status: statusCode } = this.categorizeError(error);
        
        // Build optimized error context
        const errorContext = this.buildErrorContext(req, error, errorType);

        console.error('MCP request failed', errorContext);

        if (!res.headersSent) {
          this.sendErrorResponse(res, error, errorType, statusCode, errorContext.timestamp);
        }
      }
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        availableEndpoints: ['/', '/health', '/mcp'],
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Express server error', { path: req.path, method: req.method }, err);
      res.status(500).json({
        error: 'Internal server error',
        details: this.config.environment === 'development' ? err.message : 'Something went wrong',
      });
    });
  }


  async start(): Promise<void> {
    try {
      // Initialize MCP transport
      await this.setupMCPTransport();

      // Start HTTP server and store reference for cleanup
      this.httpServer = this.app.listen(this.config.port, this.config.host, () => {
        console.log(`Smart TRA MCP Server running on http://${this.config.host}:${this.config.port}`);
        console.log(`Environment: ${this.config.environment}`);
        console.log('Available endpoints:');
        console.log(`  Health check: http://${this.config.host}:${this.config.port}/health`);
        console.log(`  MCP endpoint: http://${this.config.host}:${this.config.port}/mcp`);
      });

      // Graceful shutdown handling - bind to instance to avoid multiple handlers
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('Failed to start Express server:', error);
      throw error;
    }
  }

  /**
   * Efficient error categorization using pre-compiled patterns
   */
  private categorizeError(error: unknown): { type: string; status: number } {
    if (!(error instanceof Error)) {
      return ExpressServer.DEFAULT_ERROR;
    }

    // Use pre-compiled patterns for efficient matching
    for (const { pattern, type, status } of ExpressServer.ERROR_PATTERNS) {
      if (pattern.test(error.message)) {
        return { type, status };
      }
    }
    
    return ExpressServer.DEFAULT_ERROR;
  }

  /**
   * Build optimized error context - minimizes object creation and serialization
   */
  private buildErrorContext(req: Request, error: unknown, errorType: string): Record<string, any> {
    const timestamp = new Date().toISOString();
    const isDevelopment = this.config.environment === 'development';
    
    const context: Record<string, any> = {
      method: req.method,
      url: req.url,
      errorType,
      timestamp,
      transportInitialized: !!this.globalTransport,
      serverInitialized: !!this.globalServer,
    };

    // Add error details
    if (error instanceof Error) {
      context.errorMessage = error.message;
      if (isDevelopment) {
        context.errorStack = error.stack;
      }
    } else {
      context.errorMessage = String(error);
    }

    // Add request details only in development or for specific error types
    if (isDevelopment || errorType === 'mcp_parse') {
      context.headers = {
        'content-type': req.get('content-type'),
        'origin': req.get('origin'),
        'user-agent': req.get('user-agent')?.substring(0, 50), // Shorter truncation
      };
      
      if (req.body) {
        context.bodySize = typeof req.body === 'string' ? req.body.length : JSON.stringify(req.body).length;
      }
    }

    return context;
  }

  /**
   * Send optimized error response
   */
  private sendErrorResponse(res: Response, error: unknown, errorType: string, statusCode: number, timestamp: string): void {
    const isDevelopment = this.config.environment === 'development';
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: Record<string, any> = {
      error: `MCP ${errorType} error`,
      type: errorType,
      timestamp,
      message: isDevelopment ? errorMessage : 'Internal server error'
    };

    // Add debug info only in development
    if (isDevelopment) {
      response.debug = {
        transport: this.globalTransport ? 'ready' : 'not_initialized',
        method: res.req.method,
        contentType: res.req.get('content-type')
      };
    }

    res.status(statusCode).json(response);
  }

  /**
   * Setup graceful shutdown handlers (only once per instance)
   */
  private setupGracefulShutdown(): void {
    const shutdownHandler = () => this.shutdown();
    
    // Remove any existing handlers to prevent accumulation
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    
    // Add fresh handlers
    process.once('SIGTERM', shutdownHandler);
    process.once('SIGINT', shutdownHandler);
  }

  /**
   * Optimized shutdown with proper resource cleanup
   */
  private async shutdown(): Promise<void> {
    console.log('Shutting down Express server gracefully...');
    
    try {
      // Close MCP transport connections
      if (this.globalTransport) {
        // StreamableHTTPServerTransport doesn't have explicit close method
        // but we can clean up references
        this.globalTransport = undefined;
      }

      // Close MCP server
      if (this.globalServer) {
        // MCP Server doesn't have explicit close method in current version
        // but we can clean up references  
        this.globalServer = undefined;
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer.close(() => {
            console.log('HTTP server closed');
            resolve();
          });
        });
      }

      console.log('Express server stopped gracefully');
      process.exit(0);
      
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Add a stop method for programmatic shutdown (useful for testing)
   */
  async stop(): Promise<void> {
    await this.shutdown();
  }
}