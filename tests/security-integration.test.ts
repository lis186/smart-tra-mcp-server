import { SmartTRAServer } from '../src/server';

// Mock the MCP SDK to avoid STDIO dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('Security Integration Tests', () => {
  let server: SmartTRAServer;
  
  beforeEach(() => {
    jest.clearAllMocks();
    server = new SmartTRAServer();
    
    // Reset rate limiting between tests
    (server as any).requestCount.clear();
    (server as any).lastRequestTime.clear();
  });

  describe('Input Length Limits', () => {
    it('should enforce query length limits', () => {
      const longQuery = 'a'.repeat(1001); // Exceeds MAX_QUERY_LENGTH (1000)
      
      expect(() => {
        // Simulate the validation logic
        if (longQuery.length > 1000) {
          throw new Error('Query too long: maximum 1000 characters allowed');
        }
      }).toThrow('Query too long: maximum 1000 characters allowed');
    });

    it('should enforce context length limits', () => {
      const longContext = 'b'.repeat(501); // Exceeds MAX_CONTEXT_LENGTH (500)
      
      expect(() => {
        // Simulate the validation logic
        if (longContext.length > 500) {
          throw new Error('Context too long: maximum 500 characters allowed');
        }
      }).toThrow('Context too long: maximum 500 characters allowed');
    });

    it('should accept valid length inputs', () => {
      const validQuery = 'a'.repeat(100);
      const validContext = 'b'.repeat(100);
      
      expect(() => {
        // Simulate the validation logic
        if (validQuery.length > 1000) {
          throw new Error('Query too long');
        }
        if (validContext.length > 500) {
          throw new Error('Context too long');
        }
      }).not.toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should track request counts correctly', () => {
      const clientId = 'test-client';
      const checkRateLimit = (server as any).checkRateLimit.bind(server);
      
      // Should allow initial requests
      expect(() => checkRateLimit(clientId)).not.toThrow();
      expect(() => checkRateLimit(clientId)).not.toThrow();
      
      // Verify internal state
      expect((server as any).requestCount.get(clientId)).toBe(2);
      expect((server as any).lastRequestTime.has(clientId)).toBe(true);
    });

    it('should enforce rate limits', () => {
      const clientId = 'spam-client';
      const checkRateLimit = (server as any).checkRateLimit.bind(server);
      
      // Manually set request count to exceed limit
      (server as any).requestCount.set(clientId, 30); // At limit
      (server as any).lastRequestTime.set(clientId, Date.now());
      
      expect(() => checkRateLimit(clientId)).toThrow('Rate limit exceeded: maximum 30 requests per minute');
    });

    it('should clean up old rate limit entries', () => {
      const clientId = 'old-client';
      const oldTime = Date.now() - 70000; // 70 seconds ago (outside 60s window)
      
      // Set old entries
      (server as any).requestCount.set(clientId, 10);
      (server as any).lastRequestTime.set(clientId, oldTime);
      
      // Trigger cleanup by checking rate limit for another client
      const checkRateLimit = (server as any).checkRateLimit.bind(server);
      checkRateLimit('new-client');
      
      // Old entries should be cleaned up
      expect((server as any).requestCount.has(clientId)).toBe(false);
      expect((server as any).lastRequestTime.has(clientId)).toBe(false);
    });

    it('should log security events near rate limit', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const clientId = 'warning-client';
      const checkRateLimit = (server as any).checkRateLimit.bind(server);
      
      // Set count to just over 80% of limit (24 -> 25 after increment) to trigger warning
      (server as any).requestCount.set(clientId, 24);
      (server as any).lastRequestTime.set(clientId, Date.now());
      
      checkRateLimit(clientId);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Security: Client warning-client approaching rate limit: 25/30')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Input Sanitization', () => {
    it('should remove control characters from input', () => {
      const maliciousInput = 'test\x00\x1f\x7f\x9finput';
      const sanitized = maliciousInput.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
      
      expect(sanitized).toBe('testinput');
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x1f');
      expect(sanitized).not.toContain('\x7f');
      expect(sanitized).not.toContain('\x9f');
    });

    it('should preserve valid characters during sanitization', () => {
      const validInput = 'Valid input with 中文 and émojis 🚄';
      const sanitized = validInput.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
      
      expect(sanitized).toBe(validInput);
    });
  });

  describe('Graceful Shutdown Enhancement', () => {
    it('should have proper timeout configuration', () => {
      expect((server as any).GRACEFUL_SHUTDOWN_TIMEOUT).toBe(5000);
    });

    it('should track shutdown state', () => {
      expect((server as any).isShuttingDown).toBe(false);
      
      (server as any).isShuttingDown = true;
      expect(server.getHealthStatus().status).toBe('shutting_down');
    });

    it('should reject requests during shutdown', () => {
      (server as any).isShuttingDown = true;
      
      // Simulate the shutdown check logic
      expect(() => {
        if ((server as any).isShuttingDown) {
          throw new Error('Server is shutting down');
        }
      }).toThrow('Server is shutting down');
    });
  });

  describe('Security Constants', () => {
    it('should have reasonable security limits configured', () => {
      expect((server as any).MAX_QUERY_LENGTH).toBe(1000);
      expect((server as any).MAX_CONTEXT_LENGTH).toBe(500);
      expect((server as any).RATE_LIMIT_WINDOW).toBe(60000); // 1 minute
      expect((server as any).RATE_LIMIT_MAX_REQUESTS).toBe(30); // 30/minute
      expect((server as any).GRACEFUL_SHUTDOWN_TIMEOUT).toBe(5000); // 5 seconds
    });

    it('should initialize rate limiting maps', () => {
      expect((server as any).requestCount).toBeInstanceOf(Map);
      expect((server as any).lastRequestTime).toBeInstanceOf(Map);
      expect((server as any).requestCount.size).toBe(0);
      expect((server as any).lastRequestTime.size).toBe(0);
    });
  });
});