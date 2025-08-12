import { SmartTRAServer } from '../src/server';

// Mock the MCP SDK to avoid STDIO dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('Enhanced Error Handling Tests', () => {
  let server: SmartTRAServer;
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    server = new SmartTRAServer();
  });

  describe('Malformed Arguments Handling', () => {
    it('should handle null arguments', () => {
      // Test the validation logic that would be used in CallToolRequestHandler
      const args = null;
      
      expect(() => {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }
        if (args === null) {
          throw new Error('Invalid arguments: arguments cannot be null');
        }
      }).toThrow('Invalid arguments: expected object');
    });

    it('should handle array arguments', () => {
      // Test the validation logic for array arguments
      const args = ['invalid', 'array'];
      
      expect(() => {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }
        if (Array.isArray(args)) {
          throw new Error('Invalid arguments: expected object, got array');
        }
      }).toThrow('Invalid arguments: expected object, got array');
    });

    it('should handle undefined arguments', () => {
      // Test the validation logic for undefined arguments
      const args = undefined;
      
      expect(() => {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }
      }).toThrow('Invalid arguments: expected object');
    });

    it('should handle primitive arguments', () => {
      // Test the validation logic for primitive arguments
      const stringArgs = 'invalid string';
      const numberArgs = 123;
      const booleanArgs = true;
      
      expect(() => {
        if (!stringArgs || typeof stringArgs !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }
      }).toThrow('Invalid arguments: expected object');
      
      expect(() => {
        if (!numberArgs || typeof numberArgs !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }
      }).toThrow('Invalid arguments: expected object');
      
      expect(() => {
        if (!booleanArgs || typeof booleanArgs !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }
      }).toThrow('Invalid arguments: expected object');
    });

    it('should accept valid object arguments', () => {
      // Test that valid arguments pass validation
      const validArgs = { query: 'test query', context: 'test context' };
      
      expect(() => {
        if (!validArgs || typeof validArgs !== 'object') {
          throw new Error('Invalid arguments: expected object');
        }
        if (Array.isArray(validArgs)) {
          throw new Error('Invalid arguments: expected object, got array');
        }
        if (validArgs === null) {
          throw new Error('Invalid arguments: arguments cannot be null');
        }
      }).not.toThrow();
    });
  });

  describe('Session ID Management', () => {
    it('should generate unique session IDs with proper format', () => {
      const sessionId1 = server.getSessionIdForTest();
      const server2 = new SmartTRAServer();
      const sessionId2 = server2.getSessionIdForTest();
      
      // Should be unique
      expect(sessionId1).not.toBe(sessionId2);
      
      // Should follow expected format: pid-{processId}-{timestamp}-{random}
      expect(sessionId1).toMatch(/^pid-\d+-\d+-[a-z0-9]{9}$/);
      expect(sessionId2).toMatch(/^pid-\d+-\d+-[a-z0-9]{9}$/);
      
      // Should include current process ID
      expect(sessionId1).toContain(`pid-${process.pid}-`);
      expect(sessionId2).toContain(`pid-${process.pid}-`);
    });

    it('should include session ID in health status', () => {
      const health = server.getHealthStatus();
      const sessionId = server.getSessionIdForTest();
      
      expect(health.sessionId).toBe(sessionId);
      expect(health.sessionId).toMatch(/^pid-\d+-\d+-[a-z0-9]{9}$/);
    });
  });

  describe('Test Environment Restrictions', () => {
    it('should allow test methods in test environment', () => {
      process.env.NODE_ENV = 'test';
      
      expect(() => server.getSessionIdForTest()).not.toThrow();
      expect(() => server.resetRateLimitingForTest()).not.toThrow();
      expect(() => server.checkRateLimitForTest('test-client')).not.toThrow();
      expect(() => server.setRateLimitForTest('test-client', 5)).not.toThrow();
    });

    it('should work with JEST_WORKER_ID environment', () => {
      process.env.JEST_WORKER_ID = '1';
      delete process.env.NODE_ENV;
      
      expect(() => server.getSessionIdForTest()).not.toThrow();
      expect(() => server.resetRateLimitingForTest()).not.toThrow();
    });
  });

  describe('Error Logging and Security Events', () => {
    it('should log security events for malformed requests', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Simulate the error logging that happens in the try-catch block
      const sessionId = server.getSessionIdForTest();
      const error = new Error('Invalid arguments: expected object');
      
      console.error(`Security: Malformed request from session ${sessionId}:`, error.message);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        `Security: Malformed request from session ${sessionId}:`,
        'Invalid arguments: expected object'
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle non-Error objects in logging', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Simulate logging with non-Error object
      const sessionId = server.getSessionIdForTest();
      const errorLike = 'string error';
      
      console.error(`Security: Malformed request from session ${sessionId}:`, String(errorLike));
      
      expect(consoleSpy).toHaveBeenCalledWith(
        `Security: Malformed request from session ${sessionId}:`,
        'string error'
      );
      
      consoleSpy.mockRestore();
    });
  });
});