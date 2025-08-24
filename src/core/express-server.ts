import express, { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SmartTRAServer } from '../server.js';
import { ServerConfig, MCPConnection } from '../types/server.types.js';

export class ExpressServer {
  private app: express.Application;
  private config: ServerConfig;
  private mcpServer: SmartTRAServer;
  private mcpConnections: Map<string, MCPConnection> = new Map();
  private connectionCleanupInterval: NodeJS.Timeout | undefined;
  private globalTransport: StreamableHTTPServerTransport | undefined;
  private globalServer: Server | undefined;

  constructor(config: ServerConfig) {
    this.app = express();
    this.config = config;
    this.mcpServer = new SmartTRAServer();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.startConnectionCleanup();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for development
    if (this.config.environment === 'development') {
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        next();
      });
    }
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
    // Health check endpoint for Cloud Run
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'smart-tra-mcp-server',
        version: '1.0.0',
        environment: this.config.environment,
      });
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

    // MCP endpoint - will be set up after transport initialization
    this.app.post('/mcp', async (req: Request, res: Response) => {
      if (!this.globalTransport) {
        return res.status(500).json({ error: 'MCP transport not initialized' });
      }

      try {
        // Handle MCP over HTTP using StreamableHTTPServerTransport
        await this.globalTransport.handleRequest(req, res);
      } catch (error) {
        console.error('MCP request error:', error);
        res.status(500).json({ 
          error: 'MCP request failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  private startConnectionCleanup(): void {
    // Clean up stale connections every 5 minutes
    this.connectionCleanupInterval = setInterval(() => {
      const now = new Date();
      const staleThreshold = 30 * 60 * 1000; // 30 minutes

      for (const [id, connection] of this.mcpConnections) {
        if (now.getTime() - connection.lastActivity.getTime() > staleThreshold) {
          console.error(`Cleaning up stale connection: ${id}`);
          this.mcpConnections.delete(id);
        }
      }
    }, 5 * 60 * 1000);
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
    
    if (this.connectionCleanupInterval) {
      clearInterval(this.connectionCleanupInterval);
    }

    server.close(() => {
      console.log('Express server stopped');
      process.exit(0);
    });
  }
}