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
        const errorContext = {
          method: req.method,
          url: req.url,
          headers: {
            'content-type': req.get('content-type'),
            'accept': req.get('accept'),
            'origin': req.get('origin'),
            'user-agent': req.get('user-agent')?.substring(0, 100), // Truncate for logs
          },
          bodySize: req.body ? JSON.stringify(req.body).length : 0,
          transportInitialized: !!this.globalTransport,
          serverInitialized: !!this.globalServer,
          timestamp: new Date().toISOString(),
        };

        // Categorize MCP protocol errors for better debugging
        let errorType = 'unknown';
        let statusCode = 500;
        
        if (error instanceof Error) {
          if (error.message.includes('stream is not readable')) {
            errorType = 'transport_stream';
            statusCode = 400;
          } else if (error.message.includes('Parse error')) {
            errorType = 'mcp_parse';
            statusCode = 400;
          } else if (error.message.includes('Invalid request')) {
            errorType = 'mcp_validation';
            statusCode = 400;
          } else if (error.message.includes('timeout')) {
            errorType = 'transport_timeout';
            statusCode = 504;
          } else {
            errorType = 'server_internal';
          }
        }

        console.error('MCP request failed', {
          ...errorContext,
          errorType,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: this.config.environment === 'development' && error instanceof Error ? error.stack : undefined
        });

        if (!res.headersSent) {
          res.status(statusCode).json({
            error: `MCP ${errorType} error`,
            message: this.config.environment === 'development' 
              ? error instanceof Error ? error.message : String(error)
              : 'Internal server error',
            type: errorType,
            timestamp: errorContext.timestamp,
            ...(this.config.environment === 'development' && {
              debug: {
                transport: errorContext.transportInitialized ? 'ready' : 'not_initialized',
                method: errorContext.method,
                contentType: errorContext.headers['content-type']
              }
            })
          });
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

      // Start HTTP server
      const server = this.app.listen(this.config.port, this.config.host, () => {
        console.log(`Smart TRA MCP Server running on http://${this.config.host}:${this.config.port}`);
        console.log(`Environment: ${this.config.environment}`);
        console.log('Available endpoints:');
        console.log(`  Health check: http://${this.config.host}:${this.config.port}/health`);
        console.log(`  MCP endpoint: http://${this.config.host}:${this.config.port}/mcp`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown(server));
      process.on('SIGINT', () => this.shutdown(server));

    } catch (error) {
      console.error('Failed to start Express server:', error);
      throw error;
    }
  }

  private async shutdown(server: any): Promise<void> {
    console.log('Shutting down Express server...');
    
    server.close(() => {
      console.log('Express server stopped');
      process.exit(0);
    });
  }
}