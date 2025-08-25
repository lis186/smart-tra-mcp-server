#!/usr/bin/env node

/**
 * Unified Smart TRA MCP Server
 * Supports multiple transport modes: STDIO, Streamable HTTP
 * Usage:
 *   node dist/unified-server.js --mode=stdio
 *   node dist/unified-server.js --mode=http --port=8080
 *   node dist/unified-server.js --mode=http --host=0.0.0.0 --port=8080
 */

import { SmartTRAServer } from './server.js';
import { ExpressServer } from './core/express-server.js';
import { CLIArgs, ServerConfig } from './types/server.types.js';

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    mode: 'stdio', // Default to STDIO for Claude Desktop compatibility
  };

  process.argv.slice(2).forEach(arg => {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--mode=')) {
      const mode = arg.split('=')[1] as 'stdio' | 'http';
      if (mode === 'stdio' || mode === 'http') {
        args.mode = mode;
      } else {
        console.error('Invalid mode specified', { mode, validModes: ['stdio', 'http'] });
        process.exit(1);
      }
    } else if (arg.startsWith('--port=')) {
      args.port = parseInt(arg.split('=')[1], 10);
      if (isNaN(args.port)) {
        console.error('Invalid port specified', { port: arg.split('=')[1] });
        process.exit(1);
      }
    } else if (arg.startsWith('--host=')) {
      args.host = arg.split('=')[1];
    }
  });

  return args;
}

function showHelp(): void {
  console.log(`
Smart TRA MCP Server - Unified Transport

Usage:
  node dist/unified-server.js [options]

Options:
  --mode=<stdio|http>     Transport mode (default: stdio)
  --host=<host>          Host to bind (default: 0.0.0.0, HTTP mode only)  
  --port=<port>          Port to listen (default: 8080, HTTP mode only)
  --help, -h             Show this help

Examples:
  # STDIO mode (for Claude Desktop)
  node dist/unified-server.js --mode=stdio

  # Streamable HTTP mode (for web clients)
  node dist/unified-server.js --mode=http --port=8080

  # HTTP mode with custom host
  node dist/unified-server.js --mode=http --host=localhost --port=3000

Environment Variables:
  NODE_ENV               development|production
  PORT                   Override default port (8080)
  HOST                   Override default host (0.0.0.0)
  TDX_CLIENT_ID          TDX API client ID
  TDX_CLIENT_SECRET      TDX API client secret
`);
}

async function startSTDIOServer(): Promise<void> {
  try {
    console.error('Starting Smart TRA MCP Server in STDIO mode...');
    
    // Start MCP server with STDIO transport
    const mcpServer = new SmartTRAServer();
    await mcpServer.start();

  } catch (error) {
    console.error('Failed to start STDIO MCP server:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function startHTTPServer(host: string, port: number): Promise<void> {
  try {
    // Load configuration
    const config: ServerConfig = {
      port,
      host,
      environment: (process.env.NODE_ENV as 'development' | 'production') || 'development',
    };

    console.log('Starting Smart TRA MCP Server in HTTP mode');
    console.log(`Environment: ${config.environment}`);
    console.log(`Host: ${config.host}`);
    console.log(`Port: ${config.port}`);

    // Start Express server with Streamable HTTP transport
    const expressServer = new ExpressServer(config);
    await expressServer.start();

    console.log('Smart TRA MCP Server started successfully in HTTP mode');

  } catch (error) {
    console.error('Failed to start HTTP MCP server:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  console.error(`Smart TRA MCP Server v1.0.0 - Mode: ${args.mode}`);

  if (args.mode === 'stdio') {
    await startSTDIOServer();
  } else {
    // HTTP mode configuration
    const host = args.host || process.env.HOST || '0.0.0.0';
    const port = args.port || parseInt(process.env.PORT || '8080', 10);
    
    await startHTTPServer(host, port);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});