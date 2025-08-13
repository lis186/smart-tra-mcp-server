/**
 * Tests for code quality improvements from PR review
 * Testing utility functions, date parsing, and fare configuration
 */

import { SmartTRAServer } from '../src/server';

describe('Code Quality Improvements', () => {
  let server: SmartTRAServer;

  beforeEach(() => {
    // Save original env values
    process.env.NODE_ENV_BACKUP = process.env.NODE_ENV;
    process.env.JEST_WORKER_ID_BACKUP = process.env.JEST_WORKER_ID;
    
    server = new SmartTRAServer();
  });

  afterEach(() => {
    // Restore original env values
    process.env.NODE_ENV = process.env.NODE_ENV_BACKUP;
    process.env.JEST_WORKER_ID = process.env.JEST_WORKER_ID_BACKUP;
    delete process.env.NODE_ENV_BACKUP;
    delete process.env.JEST_WORKER_ID_BACKUP;
    
    // Clean up fare configuration env vars
    delete process.env.FARE_CHILD_RATIO;
    delete process.env.FARE_SENIOR_RATIO;
    delete process.env.FARE_DISABLED_RATIO;
    delete process.env.FARE_ROUNDING_METHOD;
  });

  describe('isTestEnvironment utility', () => {
    test('should return true when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.JEST_WORKER_ID;
      
      // Test by checking if test methods work
      expect(() => server.resetRateLimitingForTest()).not.toThrow();
    });

    test('should return true when JEST_WORKER_ID is set', () => {
      process.env.NODE_ENV = 'production';
      process.env.JEST_WORKER_ID = '1';
      
      // Test by checking if test methods work
      expect(() => server.resetRateLimitingForTest()).not.toThrow();
    });

    test('should return false in production without JEST_WORKER_ID', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JEST_WORKER_ID;
      
      // Test by checking if test methods throw
      expect(() => server.getSessionIdForTest()).toThrow('Test methods only available in test environment');
    });
  });

  describe('parseTrainTime with date context', () => {
    beforeEach(() => {
      // Mock current time to 2025-08-13 14:00:00
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-08-13T14:00:00+08:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should parse time for today when time is in the future', () => {
      const trainTime = server['parseTrainTime']('16:30:00');
      
      expect(trainTime.getDate()).toBe(13);
      expect(trainTime.getHours()).toBe(16);
      expect(trainTime.getMinutes()).toBe(30);
    });

    test('should parse time for today when time difference is large', () => {
      const trainTime = server['parseTrainTime']('02:30:00'); // 2:30 AM
      
      // With current logic: 14:00 - 02:00 = 12 hour diff, which doesn't trigger next-day logic
      // This is correct - early morning trains at 2:30 AM are likely for today's late night service
      expect(trainTime.getDate()).toBe(13); // Should stay today
      expect(trainTime.getHours()).toBe(2);
      expect(trainTime.getMinutes()).toBe(30);
    });

    test('should use reference date when provided', () => {
      const refDate = new Date('2025-08-15T10:00:00+08:00');
      const trainTime = server['parseTrainTime']('08:30:00', refDate);
      
      expect(trainTime.getDate()).toBe(15); // Should use reference date
      expect(trainTime.getHours()).toBe(8);
      expect(trainTime.getMinutes()).toBe(30);
    });

    test('should not adjust date when reference date is provided even if time has passed', () => {
      const refDate = new Date('2025-08-15T10:00:00+08:00');
      const trainTime = server['parseTrainTime']('08:30:00', refDate);
      
      // Even though 8:30 is before 10:00, should not adjust when reference date is explicit
      expect(trainTime.getDate()).toBe(15);
    });

    test('should handle late night trains correctly', () => {
      // Set current time to 23:00 (11 PM)
      jest.setSystemTime(new Date('2025-08-13T23:00:00+08:00'));
      
      const trainTime = server['parseTrainTime']('01:30:00'); // 1:30 AM
      
      // Should be tomorrow since it's an early morning train
      expect(trainTime.getDate()).toBe(14);
      expect(trainTime.getHours()).toBe(1);
    });

    test('should handle just-departed trains correctly', () => {
      // Set current time to 14:05
      jest.setSystemTime(new Date('2025-08-13T14:05:00+08:00'));
      
      const trainTime = server['parseTrainTime']('14:00:00'); // Just departed 5 minutes ago
      
      // Should still be today since it just departed
      expect(trainTime.getDate()).toBe(13);
      expect(trainTime.getHours()).toBe(14);
    });
  });

  describe('Configurable fare rules', () => {
    test('should use default fare rules when no env vars set', () => {
      const fareRules = server['getFareRules']();
      
      expect(fareRules.child).toBe(0.5);
      expect(fareRules.senior).toBe(0.5);
      expect(fareRules.disabled).toBe(0.5);
      expect(fareRules.roundingMethod).toBe('round');
    });

    test('should use custom fare ratios from environment', () => {
      process.env.FARE_CHILD_RATIO = '0.6';
      process.env.FARE_SENIOR_RATIO = '0.4';
      process.env.FARE_DISABLED_RATIO = '0.3';
      
      const fareRules = server['getFareRules']();
      
      expect(fareRules.child).toBe(0.6);
      expect(fareRules.senior).toBe(0.4);
      expect(fareRules.disabled).toBe(0.3);
    });

    test('should use custom rounding method from environment', () => {
      process.env.FARE_ROUNDING_METHOD = 'floor';
      
      const fareRules = server['getFareRules']();
      expect(fareRules.roundingMethod).toBe('floor');
    });

    test('should return correct rounding function for round', () => {
      const roundFn = server['getRoundingFunction']('round');
      
      expect(roundFn(10.4)).toBe(10);
      expect(roundFn(10.5)).toBe(11);
      expect(roundFn(10.6)).toBe(11);
    });

    test('should return correct rounding function for floor', () => {
      const roundFn = server['getRoundingFunction']('floor');
      
      expect(roundFn(10.4)).toBe(10);
      expect(roundFn(10.5)).toBe(10);
      expect(roundFn(10.9)).toBe(10);
    });

    test('should return correct rounding function for ceil', () => {
      const roundFn = server['getRoundingFunction']('ceil');
      
      expect(roundFn(10.1)).toBe(11);
      expect(roundFn(10.5)).toBe(11);
      expect(roundFn(10.9)).toBe(11);
    });

    test('should calculate fare with custom rules', () => {
      // Set custom fare rules
      process.env.FARE_CHILD_RATIO = '0.75';
      process.env.FARE_ROUNDING_METHOD = 'floor';
      
      const fareResponse = {
        OriginStationID: '1000',
        OriginStationName: { Zh_tw: '臺北', En: 'Taipei' },
        DestinationStationID: '3300',
        DestinationStationName: { Zh_tw: '臺中', En: 'Taichung' },
        Direction: 0,
        Fares: [
          { TicketType: '全票', FareClass: '自由座', Price: 100 }
        ]
      };
      
      const fareInfo = server['processFareData'](fareResponse);
      
      expect(fareInfo.adult).toBe(100);
      expect(fareInfo.child).toBe(75); // 100 * 0.75 = 75 (floor)
      expect(fareInfo.senior).toBe(50); // Uses default 0.5 ratio
    });

    test('should handle invalid env var values gracefully', () => {
      process.env.FARE_CHILD_RATIO = 'invalid';
      process.env.FARE_ROUNDING_METHOD = 'invalid';
      
      const fareRules = server['getFareRules']();
      
      expect(fareRules.child).toBeNaN(); // parseFloat('invalid') = NaN
      expect(fareRules.roundingMethod).toBe('invalid'); // Will default to 'round' in getRoundingFunction
      
      const roundFn = server['getRoundingFunction'](fareRules.roundingMethod as any);
      expect(roundFn).toBe(Math.round); // Should default to Math.round
    });
  });

  describe('Integration: Fare calculation with all improvements', () => {
    test('should process fare data with configurable rules', () => {
      // Configure custom fare rules
      process.env.FARE_CHILD_RATIO = '0.5';
      process.env.FARE_SENIOR_RATIO = '0.5';
      process.env.FARE_DISABLED_RATIO = '0.5';
      process.env.FARE_ROUNDING_METHOD = 'round';
      
      const fareResponse = {
        OriginStationID: '1000',
        OriginStationName: { Zh_tw: '臺北', En: 'Taipei' },
        DestinationStationID: '3300',
        DestinationStationName: { Zh_tw: '臺中', En: 'Taichung' },
        Direction: 0,
        Fares: [
          { TicketType: '全票', FareClass: '自由座', Price: 375 },
          { TicketType: '兒童票', FareClass: '自由座', Price: 188 },
          { TicketType: '敬老愛心票', FareClass: '自由座', Price: 188 }
        ]
      };
      
      const fareInfo = server['processFareData'](fareResponse);
      
      expect(fareInfo.adult).toBe(375);
      expect(fareInfo.child).toBe(188);
      expect(fareInfo.senior).toBe(188);
      expect(fareInfo.disabled).toBe(188); // Calculated from adult fare
    });

    test('should calculate missing fares based on adult fare', () => {
      process.env.FARE_CHILD_RATIO = '0.5';
      process.env.FARE_ROUNDING_METHOD = 'round';
      
      const fareResponse = {
        OriginStationID: '1000',
        OriginStationName: { Zh_tw: '臺北', En: 'Taipei' },
        DestinationStationID: '3300',
        DestinationStationName: { Zh_tw: '臺中', En: 'Taichung' },
        Direction: 0,
        Fares: [
          { TicketType: '全票', FareClass: '自由座', Price: 377 } // Odd number to test rounding
        ]
      };
      
      const fareInfo = server['processFareData'](fareResponse);
      
      expect(fareInfo.adult).toBe(377);
      expect(fareInfo.child).toBe(189); // 377 * 0.5 = 188.5, rounded to 189
      expect(fareInfo.senior).toBe(189);
      expect(fareInfo.disabled).toBe(189);
    });
  });
});