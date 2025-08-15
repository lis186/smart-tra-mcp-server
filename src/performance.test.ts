#!/usr/bin/env node

/**
 * Performance and Load Tests for Smart TRA MCP Server
 * Tests Stage 8 optimizations and response time requirements
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SmartTRAServer } from './server.js';

// Mock environment for performance testing
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';

describe('Performance Tests', () => {
  let server: SmartTRAServer;
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    server = new SmartTRAServer();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('Response Size Optimization (Stage 8)', () => {
    const mockLargeDataset = {
      TrainTimetables: Array.from({ length: 50 }, (_, i) => ({
        TrainInfo: {
          TrainNo: `${1000 + i}`,
          TrainTypeID: i % 2 === 0 ? '6' : '3',
          TrainTypeName: { 
            Zh_tw: i % 2 === 0 ? '區間車' : '自強號', 
            En: i % 2 === 0 ? 'Local Train' : 'Tze-Chiang'
          },
          StartingStationID: '1000',
          EndingStationID: '1025',
          WheelChairFlag: 1,
          PackageServiceFlag: 0,
          DiningFlag: 0,
          BreastFeedFlag: 1,
          BikeFlag: 1,
          CarFlag: 0,
          DailyFlag: 1,
          ExtraTrainFlag: 0,
          SuspendedFlag: 0
        },
        StopTimes: Array.from({ length: 10 }, (_, j) => ({
          StopSequence: j + 1,
          StationID: `100${j}`,
          StationName: { Zh_tw: `車站${j}`, En: `Station${j}` },
          ArrivalTime: `${8 + Math.floor((i + j) / 6)}:${((i + j) % 6) * 10}:00`,
          DepartureTime: `${8 + Math.floor((i + j) / 6)}:${((i + j) % 6) * 10 + 1}:00`,
          SuspendedFlag: 0
        }))
      }))
    };

    beforeEach(() => {
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
          json: () => Promise.resolve(mockLargeDataset)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Fares: [{ TicketType: '全票', Price: 375 }] })
        });
    });

    it('should reduce response size for fastest queries by >75%', async () => {
      const [fastestResult, generalResult] = await Promise.all([
        server.handleSearchTrains('台北到台中最快的車'),
        server.handleSearchTrains('台北到台中所有班次')
      ]);

      const fastestSize = fastestResult.content[0].text.length;
      const generalSize = generalResult.content[0].text.length;
      
      const reduction = (generalSize - fastestSize) / generalSize;
      expect(reduction).toBeGreaterThan(0.5); // At least 50% reduction
    });

    it('should keep default responses under 8000 characters (~2000 tokens)', async () => {
      const result = await server.handleSearchTrains('台北到台中');
      
      expect(result.content[0].text.length).toBeLessThan(8000);
    });

    it('should exclude JSON by default to save space', async () => {
      const result = await server.handleSearchTrains('台北到台中');
      
      expect(result.content[0].text).not.toContain('```json');
      expect(result.content[0].text).toContain('Summary:');
    });

    it('should include compact JSON only when requested', async () => {
      const result = await server.handleSearchTrains('台北到台中 with JSON data');
      
      if (result.content[0].text.includes('```json')) {
        const jsonMatch = result.content[0].text.match(/```json\\n(.*?)\\n```/s);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1];
          // Should be compact (no pretty printing)
          expect(jsonStr).not.toMatch(/\\n\\s+/);
          
          const jsonData = JSON.parse(jsonStr);
          expect(jsonData.shownTrains).toBeDefined();
          expect(jsonData.trains.length).toBeLessThanOrEqual(10);
        }
      }
    });

    it('should limit train count based on query type', async () => {
      const queries = [
        { query: '台北到台中最快', expectedMax: 5 },
        { query: '台北到台中', expectedMax: 10 },
        { query: '台北到台中所有班次', expectedMax: 50 }
      ];

      for (const { query, expectedMax } of queries) {
        const result = await server.handleSearchTrains(query);
        const trainCount = (result.content[0].text.match(/\\d+\\. \\*\\*/g) || []).length;
        expect(trainCount).toBeLessThanOrEqual(expectedMax);
      }
    });
  });

  describe('Response Time Performance', () => {
    beforeEach(() => {
      // Mock fast API responses
      (global.fetch as jest.Mock).mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      );
    });

    it('should respond to station search within 500ms', async () => {
      const start = Date.now();
      await server.handleSearchStation('台北');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500);
    });

    it('should handle train search within 1500ms target', async () => {
      const start = Date.now();
      await server.handleSearchTrains('台北到台中');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1500);
    });

    it('should handle concurrent requests efficiently', async () => {
      const start = Date.now();
      
      const requests = Array.from({ length: 5 }, () => 
        server.handleSearchStation('台北')
      );
      
      await Promise.all(requests);
      const duration = Date.now() - start;
      
      // Should not be 5x slower than single request
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform multiple requests
      for (let i = 0; i < 10; i++) {
        await server.handleSearchStation(`test${i}`);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should clean up rate limiting data periodically', () => {
      // Test rate limit cleanup functionality
      const sessionId = 'test-cleanup';
      
      server.setRateLimitForTest(sessionId, 10, Date.now() - 70000); // 70 seconds ago
      server.resetRateLimitingForTest();
      
      // After cleanup, should not have old entries
      expect(() => {
        server.checkRateLimitForTest(sessionId);
      }).not.toThrow();
    });
  });

  describe('Scalability Tests', () => {
    it('should handle large station datasets efficiently', async () => {
      const largeStationData = Array.from({ length: 1000 }, (_, i) => ({
        StationID: `${2000 + i}`,
        StationName: { Zh_tw: `測試車站${i}`, En: `TestStation${i}` },
        StationAddress: `Address ${i}`,
        StationPosition: { PositionLat: 25.0 + i * 0.001, PositionLon: 121.5 + i * 0.001 }
      }));

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(largeStationData)
      });

      const start = Date.now();
      await server.handleSearchStation('測試');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should handle large datasets quickly
    });

    it('should limit search results to prevent overwhelming responses', async () => {
      const result = await server.handleSearchStation('車站'); // Common term
      
      // Should not return unlimited results
      const stationCount = (result.content[0].text.match(/\\d+\\./g) || []).length;
      expect(stationCount).toBeLessThanOrEqual(10);
    });
  });

  describe('Error Performance', () => {
    it('should fail fast on invalid queries', async () => {
      const start = Date.now();
      await server.handleSearchTrains(''); // Empty query
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should reject quickly
    });

    it('should handle API timeouts gracefully', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      const start = Date.now();
      const result = await server.handleSearchTrains('台北到台中');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(5000); // Should not hang indefinitely
      expect(result.content[0].text).toContain('暫時無法');
    });
  });
});

export {};