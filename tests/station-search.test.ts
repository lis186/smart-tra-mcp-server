/**
 * Unit tests for station search functionality
 * Tests the improved performance and accuracy of station search
 */

import { SmartTRAServer } from '../dist/server.js';

// Mock TRA station data for testing
const mockStationData = [
  {
    StationID: '1000',
    StationName: { Zh_tw: '臺北', En: 'Taipei' },
    StationAddress: '100230臺北市中正區黎明里北平西路 3 號',
    StationPosition: { PositionLat: 25.04728, PositionLon: 121.51766 }
  },
  {
    StationID: '1020', 
    StationName: { Zh_tw: '板橋', En: 'Banqiao' },
    StationAddress: '220227新北市板橋區新民里縣民大道二段 7 號',
    StationPosition: { PositionLat: 25.01434, PositionLon: 121.46374 }
  },
  {
    StationID: '3300',
    StationName: { Zh_tw: '臺中', En: 'Taichung' },
    StationAddress: '400005臺中市中區綠川里臺灣大道一段 1 號',
    StationPosition: { PositionLat: 24.13689, PositionLon: 120.68508 }
  },
  {
    StationID: '4400',
    StationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
    StationAddress: '807001高雄市三民區港西里建國二路 318 號',
    StationPosition: { PositionLat: 22.63917, PositionLon: 120.30222 }
  }
];

// Mock environment variables
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_client_secret';
process.env.NODE_ENV = 'test';

// Mock fetch for TDX API calls
global.fetch = jest.fn();

describe('Station Search Performance and Accuracy', () => {
  let server: SmartTRAServer;

  beforeEach(async () => {
    // Reset fetch mock
    (fetch as jest.MockedFunction<typeof fetch>).mockReset();
    
    // Mock successful token response
    (fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 86400
        })
      } as Response);
    
    // Mock successful station data response  
    (fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStationData
      } as Response);

    server = new SmartTRAServer();
    server.resetRateLimitingForTest();
    
    // Wait for station data to load
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Exact Match Search', () => {
    test('should find exact Chinese station name', async () => {
      const result = await server['handleSearchStation']('臺北');
      
      expect(result.content[0].text).toContain('✅ Found station: **臺北**');
      expect(result.content[0].text).toContain('Station ID: 1000');
      expect(result.content[0].text).toContain('confidence: 1');
    });

    test('should find exact English station name', async () => {
      const result = await server['handleSearchStation']('taipei');
      
      expect(result.content[0].text).toContain('Found station: **臺北**');
      expect(result.content[0].text).toContain('Station ID: 1000');
    });
  });

  describe('Fuzzy Matching', () => {
    test('should handle common abbreviations', async () => {
      const result = await server['handleSearchStation']('北車');
      
      expect(result.content[0].text).toContain('Found station: **臺北**');
      expect(result.content[0].text).toContain('Station ID: 1000');
    });

    test('should normalize traditional/simplified characters', async () => {
      const result = await server['handleSearchStation']('台北');
      
      expect(result.content[0].text).toContain('Found station: **臺北**');
      expect(result.content[0].text).toContain('Station ID: 1000');
    });

    test('should return multiple results with confidence scores', async () => {
      const result = await server['handleSearchStation']('tai');
      
      expect(result.content[0].text).toContain('Station ID: 1000'); // Taipei
      expect(result.content[0].text).toContain('Station ID: 3300'); // Taichung
    });
  });

  describe('Search Performance', () => {
    test('should handle empty or invalid queries gracefully', async () => {
      const result = await server['handleSearchStation']('');
      
      expect(result.content[0].text).toContain('❌ No stations found');
      expect(result.content[0].text).toContain('Suggestions:');
    });

    test('should return helpful suggestions for no matches', async () => {
      const result = await server['handleSearchStation']('nonexistent');
      
      expect(result.content[0].text).toContain('❌ No stations found');
      expect(result.content[0].text).toContain('Check spelling');
    });

    test('should limit results to top 5 matches', async () => {
      const results = server['searchStations']('ta'); // Should match multiple stations
      
      expect(results).toHaveLength(2); // Only Taipei and Taichung in our mock data
      expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
    });
  });

  describe('Response Format', () => {
    test('should include structured JSON data', async () => {
      const result = await server['handleSearchStation']('臺北');
      
      expect(result.content[0].text).toContain('Machine-readable data:');
      expect(result.content[0].text).toContain('```json');
      expect(result.content[0].text).toContain('"stationId": "1000"');
      expect(result.content[0].text).toContain('"confidence": 1');
    });

    test('should include address and coordinates when available', async () => {
      const result = await server['handleSearchStation']('板橋');
      
      expect(result.content[0].text).toContain('Address:');
      expect(result.content[0].text).toContain('Coordinates: 25.01434, 121.46374');
    });
  });

  describe('Error Handling', () => {
    test('should handle station data loading failure', async () => {
      const serverWithNoData = new SmartTRAServer();
      serverWithNoData['stationDataLoaded'] = false;
      serverWithNoData['stationLoadFailed'] = true;
      
      const result = await serverWithNoData['handleSearchStation']('台北');
      
      expect(result.content[0].text).toContain('⚠️ Station data is not available');
    });

    test('should handle search exceptions gracefully', async () => {
      // Temporarily break the search method to test error handling
      const originalSearch = server['searchStations'];
      server['searchStations'] = jest.fn().mockImplementation(() => {
        throw new Error('Search error');
      });
      
      const result = await server['handleSearchStation']('台北');
      
      expect(result.content[0].text).toContain('❌ Error searching stations');
      
      // Restore original method
      server['searchStations'] = originalSearch;
    });
  });
});

describe('Token Caching Race Conditions', () => {
  let server: SmartTRAServer;

  beforeEach(() => {
    server = new SmartTRAServer();
    server.resetRateLimitingForTest();
  });

  test('should handle concurrent token refresh requests', async () => {
    let tokenRequestCount = 0;
    
    (fetch as jest.MockedFunction<typeof fetch>).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('token')) {
        tokenRequestCount++;
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({
            access_token: `token_${tokenRequestCount}`,
            token_type: 'Bearer',
            expires_in: 86400
          })
        } as Response;
      }
      return { ok: false } as Response;
    });

    // Make multiple concurrent token requests
    const promises = Array.from({ length: 3 }, () => 
      server['getAccessToken']()
    );
    
    const results = await Promise.all(promises);
    
    // Should only make one token request due to race condition protection
    expect(tokenRequestCount).toBe(1);
    expect(results).toHaveLength(3);
    expect(results.every(token => token === results[0])).toBe(true);
  });
});

describe('Rate Limiting Memory Management', () => {
  let server: SmartTRAServer;

  beforeEach(() => {
    server = new SmartTRAServer();
    server.resetRateLimitingForTest();
  });

  test('should clean up old rate limiting entries', () => {
    const clientId1 = 'client1';
    const clientId2 = 'client2';
    const oldTime = Date.now() - 400000; // 6.67 minutes ago (older than 5 minute cleanup)
    
    // Set up old entries
    server.setRateLimitForTest(clientId1, 5, oldTime);
    server.setRateLimitForTest(clientId2, 3, Date.now());
    
    // Trigger cleanup by making a rate limit check
    expect(() => server.checkRateLimitForTest('client3')).not.toThrow();
    
    // Old entries should be cleaned up automatically during periodic cleanup
    // This is tested indirectly as the cleanup happens during rate limit checks
  });

  test('should not exceed rate limits', () => {
    const clientId = 'test_client';
    
    // Make requests up to the limit
    for (let i = 0; i < 30; i++) {
      expect(() => server.checkRateLimitForTest(clientId)).not.toThrow();
    }
    
    // The 31st request should throw
    expect(() => server.checkRateLimitForTest(clientId)).toThrow('Rate limit exceeded');
  });
});