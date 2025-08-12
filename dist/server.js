#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
class SmartTRAServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'smart-tra-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    setupHandlers() {
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
            const { name, arguments: args } = request.params;
            switch (name) {
                case 'search_trains':
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Mock response for search_trains: ${args?.query || 'no query provided'}`,
                            },
                        ],
                    };
                case 'search_station':
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Mock response for search_station: ${args?.query || 'no query provided'}`,
                            },
                        ],
                    };
                case 'plan_trip':
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Mock response for plan_trip: ${args?.query || 'no query provided'}`,
                            },
                        ],
                    };
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }
    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Smart TRA MCP Server started successfully');
    }
}
const server = new SmartTRAServer();
server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map