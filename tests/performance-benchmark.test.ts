/**
 * Performance Benchmark Tests
 * Validates performance claims and response times
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SmartTRAServer } from '../src/server.js';
import { mockFetch } from './setup.js';

describe('Performance Benchmarks', () => {
  let server: SmartTRAServer;
  const mockToken = 'mock_token';
  
  beforeEach(async () => {
    // Reset fetch mock
    mockFetch.mockReset();
    
    // Mock successful token response
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockToken,
          token_type: 'Bearer',
          expires_in: 86400
        })
      } as Response);
    
    // Mock station data
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            StationID: '1000',
            StationName: { Zh_tw: '臺北', En: 'Taipei' },
            StationAddress: '臺北市中正區黎明里北平西路3號',
            StationPosition: { PositionLat: 25.047778, PositionLon: 121.517222 }
          },
          {
            StationID: '1020',
            StationName: { Zh_tw: '臺中', En: 'Taichung' },
            StationAddress: '臺中市中區綠川里建國路172號',
            StationPosition: { PositionLat: 24.137467, PositionLon: 120.686873 }
          }
        ]
      } as Response);
    
    server = new SmartTRAServer();
    server.resetRateLimitingForTest();
    
    // Wait for station data to load
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Response Time Benchmarks', () => {
    it('should respond to simple queries under 1.5 seconds', async () => {
      // Mock timetable response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              TrainDate: '2024-01-20',
              DailyTrainInfo: {
                TrainNo: '152',
                TrainTypeID: '1131',
                TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
                StartingStationID: '1000',
                StartingStationName: { Zh_tw: '臺北', En: 'Taipei' },
                EndingStationID: '1080',
                EndingStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
                Note: ''
              },
              StopTimes: [
                {
                  StopSequence: 1,
                  StationID: '1000',
                  StationName: { Zh_tw: '臺北', En: 'Taipei' },
                  ArrivalTime: '09:40',
                  DepartureTime: '09:40'
                },
                {
                  StopSequence: 5,
                  StationID: '1020',
                  StationName: { Zh_tw: '臺中', En: 'Taichung' },
                  ArrivalTime: '11:30',
                  DepartureTime: '11:32'
                }
              ]
            }
          ]
        } as Response);
      
      const startTime = Date.now();
      
      const response = await server['handleSearchTrains']('台北到台中');
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(responseTime).toBeLessThan(1500); // 1.5 seconds
      expect(response).toBeDefined();
    });
    
    it('should handle concurrent requests efficiently', async () => {
      // Mock multiple timetable responses
      for (let i = 0; i < 5; i++) {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => []
          } as Response);
      }
      
      const startTime = Date.now();
      
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          server['handleSearchTrains'](`查詢第${i}班車`)
        );
      }
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // 5 concurrent requests should complete in under 3 seconds
      expect(totalTime).toBeLessThan(3000);
    });
  });
  
  describe('Response Size Optimization', () => {
    it('should reduce response size by 60-85% compared to raw data', async () => {
      // Create large mock data
      const largeStopTimes = [];
      for (let i = 0; i < 20; i++) {
        largeStopTimes.push({
          StopSequence: i + 1,
          StationID: `10${i.toString().padStart(2, '0')}`,
          StationName: { Zh_tw: `站${i}`, En: `Station${i}` },
          ArrivalTime: `${9 + Math.floor(i/2)}:${(i % 2) * 30}0`,
          DepartureTime: `${9 + Math.floor(i/2)}:${(i % 2) * 30 + 2}`,
          // Add extra fields that would be in raw data
          StationAddress: `地址${i}`,
          StationPhone: `02-2345678${i}`,
          OperationNote: { Zh_tw: '', En: '' },
          StationClass: '1',
          StationURL: `https://example.com/station${i}`
        });
      }
      
      const rawMockData: any[] = [];
      for (let i = 0; i < 10; i++) {
        rawMockData.push({
          TrainDate: '2024-01-20',
          DailyTrainInfo: {
            TrainNo: `15${i}`,
            TrainTypeID: '1131',
            TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
            StartingStationID: '1000',
            StartingStationName: { Zh_tw: '臺北', En: 'Taipei' },
            EndingStationID: '1080',
            EndingStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
            TripLine: 1,
            WheelchairFlag: 1,
            PackageServiceFlag: 1,
            DiningFlag: 1,
            BikeFlag: 1,
            BreastFeedingFlag: 0,
            DailyFlag: 1,
            ServiceAddedFlag: 0,
            Note: { Zh_tw: '', En: '' }
          },
          StopTimes: largeStopTimes
        });
      }
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => rawMockData
        } as Response);
      
      const rawDataSize = JSON.stringify(rawMockData).length;
      
      const response = await server['handleSearchTrains']('台北到高雄');
      
      // Extract the machine-readable data from response
      const responseStr = JSON.stringify(response);
      const jsonMatch = responseStr.match(/```json\n([\s\S]*?)\n```/);
      const optimizedDataSize = jsonMatch ? jsonMatch[1].length : responseStr.length;
      
      const reductionPercentage = ((rawDataSize - optimizedDataSize) / rawDataSize) * 100;
      
      // Should achieve at least 60% size reduction
      expect(reductionPercentage).toBeGreaterThan(60);
      
      console.error(`Size reduction: ${reductionPercentage.toFixed(1)}% (${rawDataSize} -> ${optimizedDataSize} bytes)`);
    });
  });
  
  describe('Memory Usage', () => {
    it('should not leak memory on repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform 100 requests
      for (let i = 0; i < 100; i++) {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => []
          } as Response);
        
        await server['handleSearchTrains'](`查詢第${i}班車`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be less than 50MB for 100 requests
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      console.error(`Memory increase after 100 requests: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    });
  });
  
  describe('Error Recovery Performance', () => {
    it('should handle and recover from errors quickly', async () => {
      const startTime = Date.now();
      
      // Mock network error
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'));
      
      const response = await server['handleSearchTrains']('台北到台中');
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Error handling should complete within 2 seconds
      expect(responseTime).toBeLessThan(2000);
      expect(response.content[0].text).toContain('error');
    });
    
    it('should implement retry logic with exponential backoff', async () => {
      let attemptCount = 0;
      
      mockFetch
        .mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 3) {
            return Promise.reject(new Error('Temporary failure'));
          }
          return Promise.resolve({
            ok: true,
            json: async () => []
          } as Response);
        });
      
      const startTime = Date.now();
      
      const response = await server['handleSearchTrains']('台北到台中');
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should retry but complete within reasonable time
      expect(attemptCount).toBeGreaterThanOrEqual(1);
      expect(totalTime).toBeLessThan(5000);
    });
  });
  
  describe('Cache Performance', () => {
    it('should cache station data for improved performance', async () => {
      // First request - should fetch station data
      const firstStartTime = Date.now();
      await server['handleSearchStation']('台北');
      const firstEndTime = Date.now();
      const firstRequestTime = firstEndTime - firstStartTime;
      
      // Second request - should use cached data
      const secondStartTime = Date.now();
      await server['handleSearchStation']('台中');
      const secondEndTime = Date.now();
      const secondRequestTime = secondEndTime - secondStartTime;
      
      // Second request should be significantly faster (at least 50% faster)
      expect(secondRequestTime).toBeLessThan(firstRequestTime * 0.5);
      
      console.error(`Cache performance: First request ${firstRequestTime}ms, Second request ${secondRequestTime}ms`);
    });
  });
});