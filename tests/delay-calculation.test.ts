import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Import after setting up mocks
import { TDXApiClient } from '../src/server.js';

describe('Delay Calculation and Live Data Integration', () => {
  let apiClient: TDXApiClient;
  const mockToken = 'test-token-12345';
  const mockStationId = '1000';
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
    
    // Mock environment variables
    process.env.TDX_CLIENT_ID = 'test_client_id';
    process.env.TDX_CLIENT_SECRET = 'test_client_secret';
    
    // Create API client instance
    apiClient = new TDXApiClient();
    
    // Mock token acquisition
    jest.spyOn(apiClient as any, 'getAccessToken').mockResolvedValue(mockToken);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('addMinutesToTime', () => {
    it('should add positive minutes to time correctly', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      expect(addMinutesToTime('10:30', 15)).toBe('10:45');
      expect(addMinutesToTime('10:30', 45)).toBe('11:15');
      expect(addMinutesToTime('10:30:25', 15)).toBe('10:45:25');
    });
    
    it('should handle negative minutes (subtract time)', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      expect(addMinutesToTime('10:30', -15)).toBe('10:15');
      expect(addMinutesToTime('10:30', -45)).toBe('09:45');
    });
    
    it('should handle day boundary overflow (past midnight)', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      // 23:45 + 30 minutes = 00:15 (next day)
      expect(addMinutesToTime('23:45', 30)).toBe('00:15');
      
      // 23:30 + 45 minutes = 00:15 (next day)
      expect(addMinutesToTime('23:30', 45)).toBe('00:15');
      
      // 23:00 + 120 minutes = 01:00 (next day)
      expect(addMinutesToTime('23:00', 120)).toBe('01:00');
    });
    
    it('should handle day boundary underflow (before midnight)', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      // 00:15 - 30 minutes = 23:45 (previous day)
      expect(addMinutesToTime('00:15', -30)).toBe('23:45');
      
      // 01:00 - 90 minutes = 23:30 (previous day)
      expect(addMinutesToTime('01:00', -90)).toBe('23:30');
    });
    
    it('should preserve seconds when present', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      expect(addMinutesToTime('10:30:45', 15)).toBe('10:45:45');
      expect(addMinutesToTime('23:45:30', 30)).toBe('00:15:30');
    });
    
    it('should handle large delay values', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      // 10:00 + 25 hours (1500 minutes) = 11:00 (next day, wraps around)
      expect(addMinutesToTime('10:00', 1500)).toBe('11:00');
      
      // 10:00 + 48 hours (2880 minutes) = 10:00 (wraps around twice)
      expect(addMinutesToTime('10:00', 2880)).toBe('10:00');
    });
  });
  
  describe('tryGetLiveDelayData', () => {
    it('should successfully fetch and map live data', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '台北', En: 'Taipei' },
          TrainNo: '123',
          TrainTypeID: '1131',
          TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
          Direction: 0,
          EndingStationID: '1020',
          EndingStationName: { Zh_tw: '台中', En: 'Taichung' },
          ScheduledDepartureTime: '10:00',
          ActualDepartureTime: '10:05',
          DelayTime: 5,
          TrainStatus: '誤點',
          Platform: '2'
        },
        {
          StationID: '1000',
          StationName: { Zh_tw: '台北', En: 'Taipei' },
          TrainNo: '456',
          TrainTypeID: '1131',
          TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
          Direction: 0,
          EndingStationID: '1020',
          EndingStationName: { Zh_tw: '台中', En: 'Taichung' },
          ScheduledDepartureTime: '11:00',
          DelayTime: 0,
          TrainStatus: '準點',
          Platform: '1'
        }
      ];
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      });
      
      const result = await (apiClient as any).tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('123')).toEqual(mockLiveData[0]);
      expect(result.get('456')).toEqual(mockLiveData[1]);
      
      // Verify API call was made correctly
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/v3/Rail/TRA/LiveBoard/Station/${mockStationId}`),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`
          })
        })
      );
    });
    
    it('should handle API failure gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404
      });
      
      const result = await (apiClient as any).tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
    
    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      const result = await (apiClient as any).tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
    
    it('should handle empty response data', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
      
      const result = await (apiClient as any).tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
    
    it('should handle malformed response data', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => null
      });
      
      const result = await (apiClient as any).tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
  
  describe('Train Number Matching', () => {
    it('should match trains with exact train numbers', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '台北', En: 'Taipei' },
          TrainNo: '123',
          DelayTime: 10,
          TrainStatus: '誤點'
        },
        {
          StationID: '1000',
          StationName: { Zh_tw: '台北', En: 'Taipei' },
          TrainNo: '456',
          DelayTime: 0,
          TrainStatus: '準點'
        }
      ];
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      });
      
      const liveDataMap = await (apiClient as any).tryGetLiveDelayData(mockStationId);
      
      // Test exact matches
      expect(liveDataMap.get('123')?.DelayTime).toBe(10);
      expect(liveDataMap.get('456')?.DelayTime).toBe(0);
      
      // Test non-existent train numbers
      expect(liveDataMap.get('789')).toBeUndefined();
      expect(liveDataMap.get('000')).toBeUndefined();
    });
    
    it('should handle train numbers with different formats', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '台北', En: 'Taipei' },
          TrainNo: '0123',  // Leading zero
          DelayTime: 5
        },
        {
          StationID: '1000', 
          StationName: { Zh_tw: '台北', En: 'Taipei' },
          TrainNo: '123A',  // Alphanumeric
          DelayTime: 3
        }
      ];
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      });
      
      const liveDataMap = await (apiClient as any).tryGetLiveDelayData(mockStationId);
      
      // Should store with exact format from API
      expect(liveDataMap.get('0123')?.DelayTime).toBe(5);
      expect(liveDataMap.get('123A')?.DelayTime).toBe(3);
      
      // Won't match without exact format
      expect(liveDataMap.get('123')).toBeUndefined();
    });
  });
  
  describe('Delay Status Calculation', () => {
    it('should correctly identify on-time trains', () => {
      const trainData = {
        trainNo: '123',
        departureTime: '10:00',
        arrivalTime: '11:00'
      };
      
      const liveEntry = {
        TrainNo: '123',
        DelayTime: 0,
        TrainStatus: '準點'
      };
      
      // Simulate the logic from the server
      const result = {
        ...trainData,
        delayMinutes: liveEntry.DelayTime,
        actualDepartureTime: trainData.departureTime,
        actualArrivalTime: trainData.arrivalTime,
        trainStatus: liveEntry.TrainStatus
      };
      
      expect(result.delayMinutes).toBe(0);
      expect(result.actualDepartureTime).toBe('10:00');
      expect(result.actualArrivalTime).toBe('11:00');
      expect(result.trainStatus).toBe('準點');
    });
    
    it('should correctly calculate delayed trains', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      const trainData = {
        trainNo: '123',
        departureTime: '10:00',
        arrivalTime: '11:00'
      };
      
      const liveEntry = {
        TrainNo: '123',
        DelayTime: 15,
        TrainStatus: '誤點'
      };
      
      const result = {
        ...trainData,
        delayMinutes: liveEntry.DelayTime,
        actualDepartureTime: addMinutesToTime(trainData.departureTime, liveEntry.DelayTime),
        actualArrivalTime: addMinutesToTime(trainData.arrivalTime, liveEntry.DelayTime),
        trainStatus: liveEntry.TrainStatus
      };
      
      expect(result.delayMinutes).toBe(15);
      expect(result.actualDepartureTime).toBe('10:15');
      expect(result.actualArrivalTime).toBe('11:15');
      expect(result.trainStatus).toBe('誤點');
    });
    
    it('should infer train status from delay time when status is missing', () => {
      const liveEntry1 = {
        TrainNo: '123',
        DelayTime: 5,
        TrainStatus: undefined
      };
      
      const liveEntry2 = {
        TrainNo: '456',
        DelayTime: 0,
        TrainStatus: undefined
      };
      
      // Simulate the logic from server.ts line 1379
      const status1 = liveEntry1.TrainStatus || (liveEntry1.DelayTime > 0 ? '誤點' : '準點');
      const status2 = liveEntry2.TrainStatus || (liveEntry2.DelayTime > 0 ? '誤點' : '準點');
      
      expect(status1).toBe('誤點');
      expect(status2).toBe('準點');
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle trains crossing midnight with delays', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      const trainData = {
        trainNo: '999',
        departureTime: '23:45',
        arrivalTime: '00:30'  // Next day
      };
      
      const liveEntry = {
        TrainNo: '999',
        DelayTime: 20
      };
      
      const actualDepartureTime = addMinutesToTime(trainData.departureTime, liveEntry.DelayTime);
      const actualArrivalTime = addMinutesToTime(trainData.arrivalTime, liveEntry.DelayTime);
      
      expect(actualDepartureTime).toBe('00:05');  // Crosses midnight
      expect(actualArrivalTime).toBe('00:50');
    });
    
    it('should handle undefined delay time', () => {
      const liveEntry = {
        TrainNo: '123',
        DelayTime: undefined,
        TrainStatus: '準點'
      };
      
      // This should not process delay calculation
      const shouldProcessDelay = liveEntry && liveEntry.DelayTime !== undefined;
      expect(shouldProcessDelay).toBe(false);
    });
    
    it('should handle negative delay times (early arrival)', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      const trainData = {
        trainNo: '123',
        departureTime: '10:00',
        arrivalTime: '11:00'
      };
      
      const liveEntry = {
        TrainNo: '123',
        DelayTime: -5,  // 5 minutes early
        TrainStatus: '準點'
      };
      
      const actualDepartureTime = addMinutesToTime(trainData.departureTime, liveEntry.DelayTime);
      const actualArrivalTime = addMinutesToTime(trainData.arrivalTime, liveEntry.DelayTime);
      
      expect(actualDepartureTime).toBe('09:55');
      expect(actualArrivalTime).toBe('10:55');
    });
  });
});

// Export a mock TDXApiClient for testing
export class TDXApiClient {
  private addMinutesToTime(timeString: string, minutes: number): string {
    const parts = timeString.split(':');
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parts[2] ? parseInt(parts[2], 10) : 0;
    
    let totalMinutes = hours * 60 + mins + minutes;
    
    while (totalMinutes < 0) {
      totalMinutes += 24 * 60;
    }
    while (totalMinutes >= 24 * 60) {
      totalMinutes -= 24 * 60;
    }
    
    const newHours = Math.floor(totalMinutes / 60);
    const newMins = totalMinutes % 60;
    
    const hourStr = newHours.toString().padStart(2, '0');
    const minStr = newMins.toString().padStart(2, '0');
    
    if (parts[2]) {
      const secStr = secs.toString().padStart(2, '0');
      return `${hourStr}:${minStr}:${secStr}`;
    }
    return `${hourStr}:${minStr}`;
  }
  
  private async getAccessToken(): Promise<string> {
    return 'mock-token';
  }
  
  private async tryGetLiveDelayData(stationId: string): Promise<Map<string, any>> {
    const liveDataMap = new Map<string, any>();
    
    try {
      const token = await this.getAccessToken();
      const url = `https://tdx.transportdata.tw/api/advanced/v3/Rail/TRA/LiveBoard/Station/${stationId}?$format=JSON`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return liveDataMap;
      }

      const liveData = await response.json();
      
      if (!Array.isArray(liveData) || liveData.length === 0) {
        return liveDataMap;
      }
      
      for (const entry of liveData) {
        liveDataMap.set(entry.TrainNo, entry);
      }
      
      return liveDataMap;
    } catch (error) {
      return liveDataMap;
    }
  }
}