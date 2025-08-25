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
  
  // Connection state tracking for stateless mode optimization
  private mcpInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private connectionMetrics = {
    initializationCount: 0,
    reuseCount: 0,
    lastInitialized: 0,
    averageInitTime: 0
  };

  // Pre-compiled error patterns for efficient categorization
  private static readonly ERROR_PATTERNS = [
    { pattern: /stream is not readable/i, type: 'transport_stream', status: 400 },
    { pattern: /parse error/i, type: 'mcp_parse', status: 400 },
    { pattern: /invalid request/i, type: 'mcp_validation', status: 400 },
    { pattern: /timeout/i, type: 'transport_timeout', status: 504 },
  ] as const;

  private static readonly DEFAULT_ERROR = { type: 'server_internal', status: 500 } as const;
  
  // Pre-allocated error context objects for performance
  private static readonly BASE_ERROR_CONTEXT = {
    transportInitialized: false,
    serverInitialized: false,
  };
  
  // Error context object pool to reduce GC pressure
  private errorContextPool: Record<string, any>[] = [];
  private readonly MAX_POOL_SIZE = 10;

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
    
    // CORS configuration with secure production defaults
    this.app.use((req, res, next) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS;
      const origin = req.get('Origin');
      
      if (this.config.environment === 'development') {
        // Allow all origins in development
        res.header('Access-Control-Allow-Origin', '*');
      } else {
        // Production: strict origin validation
        if (allowedOrigins) {
          const origins = allowedOrigins.split(',').map(o => o.trim());
          if (origin && origins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
          }
        } else {
          // Secure default: reject all CORS requests if no origins configured
          // This prevents accidental wildcard exposure in production
          console.error('CORS Warning: ALLOWED_ORIGINS not configured in production. CORS requests will be rejected.');
          if (origin) {
            // Don't set Access-Control-Allow-Origin header - browser will block the request
            return res.status(403).json({
              error: 'CORS policy violation',
              message: 'Origin not allowed. Contact administrator to configure allowed origins.',
              origin: origin
            });
          }
        }
      }
      
      // Set other CORS headers
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

  /**
   * Optimized MCP connection management with lazy singleton pattern
   * Safe to call multiple times - will reuse existing connections
   */
  private async ensureMCPReady(): Promise<void> {
    // If already initialized, increment reuse count and return
    if (this.mcpInitialized && this.globalTransport && this.globalServer) {
      this.connectionMetrics.reuseCount++;
      return;
    }

    // If initialization is already in progress, wait for it
    if (this.initializationPromise) {
      await this.initializationPromise;
      this.connectionMetrics.reuseCount++;
      return;
    }

    // Start new initialization
    this.initializationPromise = this.initializeMCP();
    await this.initializationPromise;
    this.initializationPromise = null;
  }

  /**
   * Internal MCP initialization - only called once per instance
   */
  private async initializeMCP(): Promise<void> {
    const startTime = Date.now();
    
    try {
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
      
      // Update connection metrics
      const initTime = Date.now() - startTime;
      this.connectionMetrics.initializationCount++;
      this.connectionMetrics.lastInitialized = Date.now();
      this.connectionMetrics.averageInitTime = 
        (this.connectionMetrics.averageInitTime * (this.connectionMetrics.initializationCount - 1) + initTime) 
        / this.connectionMetrics.initializationCount;
      
      this.mcpInitialized = true;
      console.error(`StreamableHTTP transport initialized in stateless mode (${initTime}ms)`);
      
    } catch (error) {
      // Reset state on failure
      this.mcpInitialized = false;
      this.globalTransport = undefined;
      this.globalServer = undefined;
      throw error;
    }
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
        
        // If transport isn't ready, ensure it's initialized
        if (!this.mcpInitialized) {
          await this.ensureMCPReady();
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

      // Add connection efficiency metrics
      checks.connectionMetrics = {
        initializationCount: this.connectionMetrics.initializationCount,
        reuseCount: this.connectionMetrics.reuseCount,
        averageInitTime: Math.round(this.connectionMetrics.averageInitTime * 100) / 100, // Round to 2 decimals
        lastInitialized: this.connectionMetrics.lastInitialized,
        efficiency: this.connectionMetrics.initializationCount > 0 
          ? Math.round((this.connectionMetrics.reuseCount / (this.connectionMetrics.initializationCount + this.connectionMetrics.reuseCount)) * 100)
          : 0,
        errorContextPoolSize: this.errorContextPool.length
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
        // Ensure MCP transport is ready (lazy initialization with reuse)
        await this.ensureMCPReady();

        // Let the StreamableHTTP transport handle the request
        // It will automatically handle GET for SSE and POST for messages
        await this.globalTransport!.handleRequest(req, res, req.body);

      } catch (error) {
        // Efficient error categorization using pre-compiled patterns
        const { type: errorType, status: statusCode } = this.categorizeError(error);
        
        // Build optimized error context with object pooling
        const errorContext = this.buildErrorContext(req, error, errorType);

        console.error('MCP request failed', errorContext);

        if (!res.headersSent) {
          this.sendErrorResponse(res, error, errorType, statusCode, errorContext.timestamp);
        }
        
        // Return context object to pool for reuse
        this.returnErrorContextToPool(errorContext);
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
      // Initialize MCP transport with optimized lazy loading
      await this.ensureMCPReady();

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
   * Build optimized error context with object pooling and minimal allocations
   */
  private buildErrorContext(req: Request, error: unknown, errorType: string): Record<string, any> {
    // Get context object from pool or create new one
    const context = this.getErrorContextFromPool();
    
    // Reset and populate with current data
    context.method = req.method;
    context.url = req.url;
    context.errorType = errorType;
    context.timestamp = new Date().toISOString();
    context.transportInitialized = this.mcpInitialized;
    context.serverInitialized = !!this.globalServer;

    // Add error details (optimized string handling)
    if (error instanceof Error) {
      context.errorMessage = error.message;
      if (this.config.environment === 'development') {
        context.errorStack = error.stack;
      } else {
        delete context.errorStack; // Remove if exists from pooled object
      }
    } else {
      context.errorMessage = String(error);
      delete context.errorStack;
    }

    // Add request details only when necessary (optimized conditions)
    const needsDetailedContext = this.config.environment === 'development' || errorType === 'mcp_parse';
    if (needsDetailedContext) {
      // Reuse headers object if exists, otherwise create
      if (!context.headers) {
        context.headers = {};
      }
      
      context.headers['content-type'] = req.get('content-type') || null;
      context.headers.origin = req.get('origin') || null;
      
      // Optimize user-agent truncation
      const userAgent = req.get('user-agent');
      context.headers['user-agent'] = userAgent ? userAgent.substring(0, 50) : null;
      
      // Optimize body size calculation
      if (req.body) {
        context.bodySize = typeof req.body === 'string' 
          ? req.body.length 
          : Buffer.byteLength(JSON.stringify(req.body), 'utf8');
      } else {
        delete context.bodySize;
      }
    } else {
      // Clean up detailed context if not needed
      delete context.headers;
      delete context.bodySize;
    }

    return context;
  }

  /**
   * Get error context object from pool or create new one
   */
  private getErrorContextFromPool(): Record<string, any> {
    if (this.errorContextPool.length > 0) {
      return this.errorContextPool.pop()!;
    }
    
    // Create new object based on base template
    return {
      ...ExpressServer.BASE_ERROR_CONTEXT,
      method: '',
      url: '',
      errorType: '',
      timestamp: '',
      errorMessage: ''
    };
  }

  /**
   * Return error context object to pool for reuse
   */
  private returnErrorContextToPool(context: Record<string, any>): void {
    if (this.errorContextPool.length < this.MAX_POOL_SIZE) {
      // Clear sensitive data before returning to pool
      delete context.errorStack;
      delete context.errorMessage;
      this.errorContextPool.push(context);
    }
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
      // Reset MCP initialization state
      this.mcpInitialized = false;
      this.initializationPromise = null;
      
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

      // Clear error context pool
      this.errorContextPool.length = 0;

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer.close(() => {
            console.log('HTTP server closed');
            resolve();
          });
        });
      }

      // Log final connection metrics
      console.log('Connection efficiency metrics:', {
        totalOperations: this.connectionMetrics.initializationCount + this.connectionMetrics.reuseCount,
        initializationCount: this.connectionMetrics.initializationCount,
        reuseCount: this.connectionMetrics.reuseCount,
        efficiency: this.connectionMetrics.initializationCount > 0 
          ? `${Math.round((this.connectionMetrics.reuseCount / (this.connectionMetrics.initializationCount + this.connectionMetrics.reuseCount)) * 100)}%`
          : '0%',
        averageInitTime: `${Math.round(this.connectionMetrics.averageInitTime)}ms`
      });

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