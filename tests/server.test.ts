import { SmartTRAServer } from '../src/server';

// Mock the MCP SDK to avoid STDIO dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('SmartTRAServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create server instance', () => {
      const server = new SmartTRAServer();
      expect(server).toBeDefined();
    });
  });

  describe('health check', () => {
    it('should return healthy status by default', () => {
      const server = new SmartTRAServer();
      const health = server.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.version).toBe('1.0.0');
      expect(health.timestamp).toBeDefined();
    });

    it('should return shutting_down status when shutting down', () => {
      const server = new SmartTRAServer();
      (server as any).isShuttingDown = true;
      
      const health = server.getHealthStatus();
      expect(health.status).toBe('shutting_down');
    });
  });

  describe('basic functionality', () => {
    it('should have start method', () => {
      const server = new SmartTRAServer();
      expect(typeof server.start).toBe('function');
    });

    it('should have getHealthStatus method', () => {
      const server = new SmartTRAServer();
      expect(typeof server.getHealthStatus).toBe('function');
    });
  });
});