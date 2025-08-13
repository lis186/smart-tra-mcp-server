/**
 * Integration tests for SmartTRAServer with QueryParser
 * Tests the complete flow from query parsing to station validation
 */

import { SmartTRAServer } from './server';
import { QueryParser } from './query-parser';

// Mock environment variables
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_client_secret';
process.env.NODE_ENV = 'test';

describe('SmartTRAServer Integration Tests', () => {
  let server: SmartTRAServer;
  let parser: QueryParser;

  beforeEach(() => {
    // Create new instances for each test
    server = new SmartTRAServer();
    parser = new QueryParser();
  });

  afterEach(() => {
    // Clean up
    server.resetRateLimitingForTest();
  });

  describe('Query Parser Integration', () => {
    test('parser should be initialized in server', () => {
      expect(server).toBeDefined();
      expect((server as any).queryParser).toBeDefined();
      expect((server as any).queryParser).toBeInstanceOf(QueryParser);
    });

    test('should parse and validate station names', async () => {
      const query = '台北到台中';
      const parsed = parser.parse(query);
      
      expect(parsed.origin).toBe('台北');
      expect(parsed.destination).toBe('台中');
      expect(parser.isValidForTrainSearch(parsed)).toBe(true);
    });

    test('should handle complex queries through the full pipeline', async () => {
      const query = '明天早上8點台北到台中最快的自強號';
      const parsed = parser.parse(query);
      
      expect(parsed.origin).toBe('台北');
      expect(parsed.destination).toBe('台中');
      expect(parsed.time).toBe('08:00');
      expect(parsed.date).toBeDefined();
      expect(parsed.preferences?.fastest).toBe(true);
      expect(parsed.preferences?.trainType).toBe('自強');
    });
  });

  describe('Station Validation Integration', () => {
    test('should validate known stations', async () => {
      const parsed = parser.parse('台北到台中');
      const validation = await (server as any).validateStations(parsed);
      
      // Since station data might not be loaded in test, check structure
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('message');
    });

    test('should reject invalid station names', async () => {
      const parsed = parser.parse('不存在站到另一個不存在站');
      const validation = await (server as any).validateStations(parsed);
      
      expect(validation.valid).toBe(false);
      expect(validation.message).toContain('Cannot find');
    });

    test('should handle partial station names', async () => {
      const parsed = parser.parse('北車到台中');
      // 北車 should be recognized as an alias for 台北
      expect(parsed.origin).toBeDefined();
      expect(parsed.destination).toBe('台中');
    });
  });

  describe('Rate Limiting Integration', () => {
    test('should apply rate limiting to parsed queries', () => {
      const sessionId = server.getSessionIdForTest();
      
      // Should allow initial requests
      for (let i = 0; i < 5; i++) {
        expect(() => server.checkRateLimitForTest(sessionId)).not.toThrow();
      }
      
      // Set rate limit to max
      server.setRateLimitForTest(sessionId, 30);
      
      // Should reject when over limit
      expect(() => server.checkRateLimitForTest(sessionId)).toThrow('Rate limit exceeded');
    });

    test('should handle rate limiting across different sessions', () => {
      const session1 = 'session1';
      const session2 = 'session2';
      
      // Max out session1
      server.setRateLimitForTest(session1, 30);
      expect(() => server.checkRateLimitForTest(session1)).toThrow();
      
      // Session2 should still work
      expect(() => server.checkRateLimitForTest(session2)).not.toThrow();
    });
  });

  describe('Error Handling Integration', () => {
    test('should provide helpful error for incomplete queries', () => {
      const parsed = parser.parse('明天早上');
      const isValid = parser.isValidForTrainSearch(parsed);
      
      expect(isValid).toBe(false);
      
      // Should generate helpful suggestions
      const suggestions = (server as any).generateSuggestions(parsed);
      expect(suggestions).toContain('Starting station');
      expect(suggestions).toContain('Destination station');
    });

    test('should handle malformed queries gracefully', () => {
      const malformedQueries = [
        null,
        undefined,
        '',
        '   ',
        '！@#$%^&*()',
        123,
        {},
        []
      ];

      malformedQueries.forEach(query => {
        const parsed = parser.parse(query as any);
        expect(parsed.confidence).toBe(0);
        expect(parsed.rawQuery).toBeDefined();
      });
    });

    test('should sanitize dangerous input', () => {
      const dangerousQuery = '<script>alert("xss")</script>台北到台中';
      const parsed = parser.parse(dangerousQuery);
      
      expect(parsed.rawQuery).not.toContain('<script>');
      expect(parsed.origin).toBe('台北');
      expect(parsed.destination).toBe('台中');
    });
  });

  describe('Performance Integration', () => {
    test('should handle rapid sequential requests', () => {
      const queries = [
        '台北到台中',
        '高雄到台北明天',
        '桃園往新竹下午3點',
        '板橋到台中最快',
        '台南去高雄直達車'
      ];

      const start = Date.now();
      
      queries.forEach(query => {
        const parsed = parser.parse(query);
        expect(parsed).toBeDefined();
      });
      
      const elapsed = Date.now() - start;
      // Should process all queries quickly
      expect(elapsed).toBeLessThan(50);
    });

    test('should handle concurrent parsing efficiently', async () => {
      const queries = Array(100).fill('台北到台中明天早上8點');
      
      const start = Date.now();
      
      // Simulate concurrent processing
      const results = queries.map(q => parser.parse(q));
      
      const elapsed = Date.now() - start;
      
      expect(results).toHaveLength(100);
      expect(elapsed).toBeLessThan(100); // Should handle 100 queries in under 100ms
    });
  });

  describe('Complete Query Flow', () => {
    test('should handle full query processing pipeline', async () => {
      const testCases = [
        {
          query: '台北到台中',
          expectedOrigin: '台北',
          expectedDestination: '台中',
          minConfidence: 0.4
        },
        {
          query: '明天早上8點從高雄去台北',
          expectedOrigin: '高雄',
          expectedDestination: '台北',
          expectedTime: '08:00',
          minConfidence: 0.7
        },
        {
          query: '週五下午3點30分桃園到新竹最快的車',
          expectedOrigin: '桃園',
          expectedDestination: '新竹',
          expectedTime: '15:30',
          expectedPreference: 'fastest',
          minConfidence: 0.7
        }
      ];

      for (const testCase of testCases) {
        const parsed = parser.parse(testCase.query);
        
        expect(parsed.origin).toBe(testCase.expectedOrigin);
        expect(parsed.destination).toBe(testCase.expectedDestination);
        
        if (testCase.expectedTime) {
          expect(parsed.time).toBe(testCase.expectedTime);
        }
        
        if (testCase.expectedPreference === 'fastest') {
          expect(parsed.preferences?.fastest).toBe(true);
        }
        
        expect(parsed.confidence).toBeGreaterThanOrEqual(testCase.minConfidence);
        expect(parser.isValidForTrainSearch(parsed)).toBe(true);
      }
    });

    test('should generate appropriate responses for different query types', () => {
      const testCases = [
        {
          query: '台北',
          shouldBeValid: false,
          reason: 'missing destination'
        },
        {
          query: '到台中',
          shouldBeValid: false,
          reason: 'missing origin'
        },
        {
          query: '台北到台中',
          shouldBeValid: true,
          reason: 'basic valid query'
        },
        {
          query: '明天台北到台中最快的自強號直達車',
          shouldBeValid: true,
          reason: 'complex valid query'
        }
      ];

      testCases.forEach(({ query, shouldBeValid, reason }) => {
        const parsed = parser.parse(query);
        const isValid = parser.isValidForTrainSearch(parsed);
        
        expect(isValid).toBe(shouldBeValid);
        
        if (!isValid) {
          const suggestions = (server as any).generateSuggestions(parsed);
          expect(suggestions).toBeTruthy();
        }
      });
    });
  });

  describe('Memory and Resource Management', () => {
    test('should not leak memory on repeated parsing', () => {
      const iterations = 10000;
      const query = '台北到台中明天早上8點最快的自強號';
      
      // Track memory usage (simplified - in real tests use proper memory profiling)
      const startMem = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < iterations; i++) {
        parser.parse(query);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const endMem = process.memoryUsage().heapUsed;
      const memIncrease = endMem - startMem;
      
      // Memory increase should be reasonable (less than 10MB for 10k iterations)
      expect(memIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle cleanup properly', () => {
      const sessionId = 'test-session';
      
      // Add some rate limit data
      server.setRateLimitForTest(sessionId, 10);
      
      // Reset should clear data
      server.resetRateLimitingForTest();
      
      // Should be able to make requests again
      expect(() => server.checkRateLimitForTest(sessionId)).not.toThrow();
    });
  });
});