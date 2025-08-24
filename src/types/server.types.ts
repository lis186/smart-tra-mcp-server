/**
 * Server configuration types for dual transport support
 */

export interface ServerConfig {
  port: number;
  host: string;
  environment: 'development' | 'production';
  secrets?: Record<string, unknown>;
}

export interface CLIArgs {
  mode: 'stdio' | 'http';
  port?: number;
  host?: string;
  help?: boolean;
}

