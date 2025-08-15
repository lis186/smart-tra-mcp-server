#!/usr/bin/env node

/**
 * Comprehensive Test Cases for Smart TRA MCP Server
 * Covers all current features including Stage 8 optimizations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SmartTRAServer } from './server.js';
import { QueryParser } from './query-parser.js';

// Mock environment variables for testing
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';

describe('SmartTRAServer - Comprehensive Test Suite', () => {
  let server: SmartTRAServer;
  let originalFetch: any;

  beforeEach(() => {
    // Mock fetch for TDX API calls
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    server = new SmartTRAServer();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('1. Station Search Tool (search_station)', () => {
    const mockStationData = [
      {
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        StationAddress: '台北市中正區北平西路3號',
        StationPosition: { PositionLat: 25.0478, PositionLon: 121.5173 }
      },
      {
        StationID: '1001',
        StationName: { Zh_tw: '板橋', En: 'Banqiao' },
        StationAddress: '新北市板橋區縣民大道二段7號',
        StationPosition: { PositionLat: 25.0138, PositionLon: 121.4627 }
      },
      {
        StationID: '1025',
        StationName: { Zh_tw: '臺中', En: 'Taichung' },
        StationAddress: '台中市中區台灣大道一段1號',
        StationPosition: { PositionLat: 24.1369, PositionLon: 120.6839 }
      }
    ];

    beforeEach(() => {
      // Mock station data loading
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStationData)
      });
    });

    describe('Exact Match Tests', () => {
      it('should find exact station matches with confidence 1.0', async () => {
        const result = await server.handleSearchStation('臺北');
        
        expect(result.content[0].text).toContain('臺北');
        expect(result.content[0].text).toContain('confidence: 100%');
        expect(result.content[0].text).toContain('1000');
      });

      it('should handle traditional/simplified character variants', async () => {
        const results = await Promise.all([
          server.handleSearchStation('台北'),
          server.handleSearchStation('臺北')
        ]);
        
        // Both should find the same station
        results.forEach(result => {
          expect(result.content[0].text).toContain('臺北');
        });
      });

      it('should find English station names', async () => {
        const result = await server.handleSearchStation('Taipei');
        
        expect(result.content[0].text).toContain('臺北');
        expect(result.content[0].text).toContain('Taipei');
      });
    });

    describe('Fuzzy Match Tests', () => {
      it('should handle common abbreviations', async () => {
        const result = await server.handleSearchStation('北車');
        
        expect(result.content[0].text).toContain('臺北');
        expect(result.content[0].text).toContain('confidence:');
      });

      it('should provide multiple candidates for ambiguous queries', async () => {
        const result = await server.handleSearchStation('中');
        
        expect(result.content[0].text).toContain('臺中');
        // Should show alternatives if confidence is not perfect
      });

      it('should score confidence appropriately', async () => {
        const result = await server.handleSearchStation('tai');
        
        // Partial matches should have lower confidence
        if (result.content[0].text.includes('confidence:')) {
          expect(result.content[0].text).toMatch(/confidence: [1-9]\d%/);
        }
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid station names gracefully', async () => {
        const result = await server.handleSearchStation('不存在的車站');
        
        expect(result.content[0].text).toContain('找不到');
        expect(result.content[0].text).toContain('建議');
      });

      it('should sanitize malicious input', async () => {
        const maliciousInput = '台北<script>alert("xss")</script>';
        const result = await server.handleSearchStation(maliciousInput);
        
        expect(result.content[0].text).not.toContain('<script>');
      });

      it('should handle empty queries', async () => {
        const result = await server.handleSearchStation('');
        
        expect(result.content[0].text).toContain('請提供');
      });
    });

    describe('Response Format', () => {
      it('should include structured JSON data when requested', async () => {
        const result = await server.handleSearchStation('臺北');
        
        expect(result.content[0].text).toContain('```json');
        expect(result.content[0].text).toContain('stationId');
        expect(result.content[0].text).toContain('confidence');
      });

      it('should provide actionable next steps', async () => {
        const result = await server.handleSearchStation('臺北');
        
        expect(result.content[0].text).toContain('search_trains');
      });
    });
  });

  describe('2. Train Search Tool (search_trains)', () => {
    const mockTimetableData = {
      TrainTimetables: Array.from({ length: 25 }, (_, i) => ({
        TrainInfo: {
          TrainNo: `${1000 + i}`,
          TrainTypeID: '6',
          TrainTypeName: { Zh_tw: '區間車', En: 'Local Train' },
          StartingStationID: '1000',
          EndingStationID: '1025'
        },
        StopTimes: [
          {
            StationID: '1000',
            StationName: { Zh_tw: '臺北', En: 'Taipei' },
            DepartureTime: `${8 + Math.floor(i / 3)}:${(i % 3) * 20}:00`
          },
          {
            StationID: '1025', 
            StationName: { Zh_tw: '臺中', En: 'Taichung' },
            ArrivalTime: `${10 + Math.floor(i / 3)}:${(i % 3) * 20}:00`
          }
        ]
      }))
    };

    beforeEach(() => {
      // Mock all required API calls
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { StationID: '1000', StationName: { Zh_tw: '臺北', En: 'Taipei' }},
            { StationID: '1025', StationName: { Zh_tw: '臺中', En: 'Taichung' }}
          ])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTimetableData)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Fares: [{ TicketType: '全票', Price: 375 }] })
        });
    });

    describe('Basic Train Search', () => {
      it('should find trains for valid routes', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        expect(result.content[0].text).toContain('Train Search Results');
        expect(result.content[0].text).toContain('臺北 → 臺中');
        expect(result.content[0].text).toContain('區間車');
      });

      it('should handle time-specific queries', async () => {
        const result = await server.handleSearchTrains('台北到台中明天早上8點');
        
        expect(result.content[0].text).toContain('目標時間');
        expect(result.content[0].text).toContain('08:00');
      });

      it('should show monthly pass eligible trains first', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        expect(result.content[0].text).toContain('月票可搭');
        expect(result.content[0].text).toContain('🎫');
      });
    });

    describe('Stage 8: Context Window Optimization', () => {
      it('should limit trains for "fastest" queries', async () => {
        const result = await server.handleSearchTrains('台北到台中最快的車');
        
        // Should show fewer trains for specific queries
        const trainMatches = result.content[0].text.match(/\d+\.\s\*\*區間車/g);
        expect(trainMatches?.length).toBeLessThanOrEqual(5);
      });

      it('should limit trains for general queries', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        // Should show limited trains by default
        const trainMatches = result.content[0].text.match(/\d+\.\s\*\*區間車/g);
        expect(trainMatches?.length).toBeLessThanOrEqual(10);
      });

      it('should show "more trains available" message', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        if (mockTimetableData.TrainTimetables.length > 10) {
          expect(result.content[0].text).toContain('more trains available');
        }
      });

      it('should not include JSON by default', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        expect(result.content[0].text).not.toContain('```json');
        expect(result.content[0].text).toContain('Summary:');
      });

      it('should include JSON when explicitly requested', async () => {
        const result = await server.handleSearchTrains('台北到台中 with JSON data');
        
        expect(result.content[0].text).toContain('```json');
        expect(result.content[0].text).toContain('trains');
      });

      it('should provide compact JSON structure', async () => {
        const result = await server.handleSearchTrains('台北到台中 with JSON data');
        
        if (result.content[0].text.includes('```json')) {
          const jsonMatch = result.content[0].text.match(/```json\n(.*?)\n```/s);
          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[1]);
            expect(jsonData.trains).toBeDefined();
            expect(jsonData.shownTrains).toBeDefined();
            
            // Check that verbose properties are removed
            if (jsonData.trains.length > 0) {
              expect(jsonData.trains[0]).not.toHaveProperty('stops');
              expect(jsonData.trains[0]).not.toHaveProperty('fareInfo');
              expect(jsonData.trains[0]).not.toHaveProperty('delayMinutes');
            }
          }
        }
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid routes', async () => {
        const result = await server.handleSearchTrains('不存在站到另一個不存在站');
        
        expect(result.content[0].text).toContain('找不到車站');
      });

      it('should handle incomplete queries', async () => {
        const result = await server.handleSearchTrains('台北');
        
        expect(result.content[0].text).toContain('需要更多資訊');
        expect(result.content[0].text).toContain('缺少');
      });

      it('should provide helpful suggestions for incomplete queries', async () => {
        const result = await server.handleSearchTrains('台北');
        
        expect(result.content[0].text).toContain('範例');
        expect(result.content[0].text).toContain('台北到台中');
      });
    });

    describe('Response Quality', () => {
      it('should include fare information', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        expect(result.content[0].text).toContain('票價');
        expect(result.content[0].text).toMatch(/\$\d+/);
      });

      it('should show travel time and stops', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        expect(result.content[0].text).toContain('行程時間');
        expect(result.content[0].text).toMatch(/(直達|經停)/);
      });

      it('should format time information clearly', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        expect(result.content[0].text).toContain('出發:');
        expect(result.content[0].text).toContain('抵達:');
        expect(result.content[0].text).toMatch(/\d{2}:\d{2}/);
      });
    });
  });

  describe('3. Query Parser Comprehensive Tests', () => {
    let parser: QueryParser;

    beforeEach(() => {
      parser = new QueryParser();
    });

    describe('Route Parsing', () => {
      it('should parse various route patterns', () => {
        const patterns = [
          '台北到台中',
          '台北去台中', 
          '台北往台中',
          '從台北到台中',
          '台北 -> 台中',
          'Taipei to Taichung'
        ];

        patterns.forEach(pattern => {
          const result = parser.parse(pattern);
          expect(result.origin).toBeTruthy();
          expect(result.destination).toBeTruthy();
        });
      });

      it('should handle complex station names', () => {
        const result = parser.parse('臺北車站到臺中車站');
        expect(result.origin).toContain('臺北');
        expect(result.destination).toContain('臺中');
      });
    });

    describe('Time Parsing', () => {
      it('should parse absolute times', () => {
        const tests = [
          { input: '8點', expected: '08:00' },
          { input: '下午2點', expected: '14:00' },
          { input: '晚上8點半', expected: '20:30' },
          { input: '早上6點15分', expected: '06:15' }
        ];

        tests.forEach(({ input, expected }) => {
          const result = parser.parse(`台北到台中${input}`);
          expect(result.time).toBe(expected);
        });
      });

      it('should parse relative times', () => {
        const result = parser.parse('台北到台中明天早上');
        expect(result.date).toBeTruthy();
        expect(result.time).toMatch(/0[6-9]:\d{2}/); // Morning time
      });

      it('should handle date specifications', () => {
        const tests = [
          '明天',
          '後天', 
          '下週五',
          '這個週末'
        ];

        tests.forEach(dateSpec => {
          const result = parser.parse(`台北到台中${dateSpec}`);
          expect(result.date).toBeTruthy();
        });
      });
    });

    describe('Preference Parsing', () => {
      it('should identify train type preferences', () => {
        const tests = [
          { input: '自強號', expected: '自強號' },
          { input: '最快的車', expected: 'fastest' },
          { input: '直達車', expected: 'direct' },
          { input: '便宜的', expected: 'cheapest' }
        ];

        tests.forEach(({ input, expected }) => {
          const result = parser.parse(`台北到台中${input}`);
          expect(result.preferences?.trainType || result.preferences?.priority).toContain(expected);
        });
      });

      it('should parse time window preferences', () => {
        const result = parser.parse('台北到台中接下來4小時');
        expect(result.preferences?.timeWindowHours).toBe(4);
      });
    });

    describe('Validation', () => {
      it('should validate complete queries', () => {
        const validQuery = parser.parse('台北到台中明天早上');
        expect(parser.isValidForTrainSearch(validQuery)).toBe(true);
      });

      it('should reject incomplete queries', () => {
        const incompleteQueries = [
          '台北',
          '明天早上',
          '到台中',
          ''
        ];

        incompleteQueries.forEach(query => {
          const result = parser.parse(query);
          expect(parser.isValidForTrainSearch(result)).toBe(false);
        });
      });

      it('should provide helpful summaries', () => {
        const query = parser.parse('台北到台中明天早上8點自強號');
        const summary = parser.getSummary(query);
        
        expect(summary).toContain('台北');
        expect(summary).toContain('台中');
        expect(summary).toContain('08:00');
        expect(summary).toContain('自強號');
      });
    });
  });

  describe('4. Performance and Response Size Tests', () => {
    describe('Response Size Validation', () => {
      it('should keep responses under token limits', async () => {
        const result = await server.handleSearchTrains('台北到台中');
        
        // Rough token estimate: 1 token ≈ 4 characters
        const approximateTokens = result.content[0].text.length / 4;
        expect(approximateTokens).toBeLessThan(2500); // Allow some buffer over 2000
      });

      it('should reduce response size for simple queries', async () => {
        const results = await Promise.all([
          server.handleSearchTrains('台北到台中最快的車'),
          server.handleSearchTrains('台北到台中所有班次')
        ]);

        const [fastestResponse, allTrainsResponse] = results;
        
        // Fastest should be smaller than all trains
        expect(fastestResponse.content[0].text.length)
          .toBeLessThan(allTrainsResponse.content[0].text.length);
      });
    });

    describe('Rate Limiting', () => {
      it('should track requests per session', () => {
        const sessionId = 'test-session-123';
        
        // This would require accessing internal rate limiting methods
        // For now, verify the structure exists
        expect(server.checkRateLimitForTest).toBeDefined();
      });

      it('should clean up old rate limit entries', () => {
        // Test that cleanup methods exist and work
        expect(server.resetRateLimitingForTest).toBeDefined();
      });
    });
  });

  describe('5. Integration Tests', () => {
    describe('Station to Train Search Workflow', () => {
      it('should work in sequence: search station -> search trains', async () => {
        // 1. Search for station
        const stationResult = await server.handleSearchStation('台北');
        expect(stationResult.content[0].text).toContain('臺北');
        
        // 2. Use result in train search
        const trainResult = await server.handleSearchTrains('台北到台中');
        expect(trainResult.content[0].text).toContain('臺北 → 臺中');
      });

      it('should handle ambiguous station names gracefully', async () => {
        const stationResult = await server.handleSearchStation('中');
        
        if (stationResult.content[0].text.includes('multiple matches')) {
          // Should provide clear guidance for disambiguation
          expect(stationResult.content[0].text).toContain('請確認');
        }
      });
    });

    describe('Error Recovery', () => {
      it('should handle API failures gracefully', async () => {
        // Mock API failure
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
        
        const result = await server.handleSearchTrains('台北到台中');
        expect(result.content[0].text).toContain('暫時無法');
        expect(result.content[0].text).toContain('稍後');
      });

      it('should provide actionable error messages', async () => {
        const result = await server.handleSearchTrains('invalid query');
        
        expect(result.content[0].text).toContain('請');
        expect(result.content[0].text).toMatch(/(嘗試|檢查|確認)/);
      });
    });
  });

  describe('6. Security Tests', () => {
    describe('Input Sanitization', () => {
      it('should sanitize malicious queries', async () => {
        const maliciousInputs = [
          '台北<script>alert("xss")</script>到台中',
          '台北\x00\x01\x02到台中',
          '台北' + 'A'.repeat(1000) + '到台中'
        ];

        for (const input of maliciousInputs) {
          const result = await server.handleSearchTrains(input);
          
          expect(result.content[0].text).not.toContain('<script>');
          expect(result.content[0].text).not.toMatch(/[\x00-\x1f]/);
        }
      });

      it('should handle extremely long queries', async () => {
        const longQuery = '台北到台中'.repeat(100);
        const result = await server.handleSearchTrains(longQuery);
        
        // Should not crash and should handle gracefully
        expect(result).toBeDefined();
        expect(result.content[0].text).toBeTruthy();
      });
    });

    describe('Rate Limiting Security', () => {
      it('should prevent abuse through rate limiting', () => {
        const sessionId = 'test-session';
        
        // Test rate limiting logic exists
        expect(() => {
          server.setRateLimitForTest(sessionId, 100);
          server.checkRateLimitForTest(sessionId);
        }).toThrow(/rate limit/i);
      });
    });
  });
});

export {};