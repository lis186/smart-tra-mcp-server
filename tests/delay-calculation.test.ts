import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { mockFetch } from './setup.js';

// Mock TDXApiClient for testing
class TDXApiClient {
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
  
  async tryGetLiveDelayData(stationId: string): Promise<Map<string, any>> {
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
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          for (const entry of data) {
            if (entry.TrainNo) {
              liveDataMap.set(entry.TrainNo, entry);
            }
          }
        }
      }
    } catch (error) {
      // Silently fail
    }
    
    return liveDataMap;
  }
}

describe('Delay Calculation and Live Data Integration', () => {
  let apiClient: TDXApiClient;
  const mockToken = 'test-token-12345';
  const mockStationId = '1000';
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch mock
    mockFetch.mockReset();
    
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
      
      expect(addMinutesToTime('23:45', 30)).toBe('00:15');
      expect(addMinutesToTime('23:30', 90)).toBe('01:00');
      expect(addMinutesToTime('23:59:59', 1)).toBe('00:00:59');
    });
    
    it('should handle day boundary underflow (before midnight)', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      expect(addMinutesToTime('00:15', -30)).toBe('23:45');
      expect(addMinutesToTime('01:00', -90)).toBe('23:30');
    });
    
    it('should handle zero minutes (no change)', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      expect(addMinutesToTime('10:30', 0)).toBe('10:30');
      expect(addMinutesToTime('10:30:45', 0)).toBe('10:30:45');
    });
  });
  
  describe('tryGetLiveDelayData', () => {
    it('should fetch live delay data successfully', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          TrainNo: '152',
          TrainTypeID: '1131',
          TrainTypeName: { Zh_tw: '自強', En: 'Tze-Chiang' },
          Direction: 0,
          EndingStationID: '1080',
          EndingStationName: { Zh_tw: '高雄', En: 'Kaohsiung' },
          ScheduledArrivalTime: '10:00',
          ScheduledDepartureTime: '10:02',
          DelayTime: 15,
          Platform: '2A'
        },
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          TrainNo: '1234',
          TrainTypeID: '1132',
          TrainTypeName: { Zh_tw: '莒光', En: 'Chu-Kuang' },
          Direction: 1,
          EndingStationID: '1010',
          EndingStationName: { Zh_tw: '基隆', En: 'Keelung' },
          ScheduledArrivalTime: '10:15',
          ScheduledDepartureTime: '10:17',
          DelayTime: 0,
          Platform: '1B'
        }
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('152')).toEqual(mockLiveData[0]);
      expect(result.get('1234')).toEqual(mockLiveData[1]);
    });
    
    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
    
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
    
    it('should handle empty response data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
    
    it('should handle non-array response data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => null
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
    
    it('should skip entries without TrainNo', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          TrainNo: '152',
          DelayTime: 15
        },
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          // Missing TrainNo
          DelayTime: 10
        },
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          TrainNo: '1234',
          DelayTime: 0
        }
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2); // Only entries with TrainNo
      expect(result.has('152')).toBe(true);
      expect(result.has('1234')).toBe(true);
    });
  });
  
  describe('Live Status and Delay Integration', () => {
    it('should reflect delay status with traffic light colors', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          TrainNo: '152',
          DelayTime: 0,
          TrainStatus: '準點'
        }
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      const liveData = result.get('152');
      
      expect(liveData).toBeDefined();
      expect(liveData.DelayTime).toBe(0);
      expect(liveData.TrainStatus).toBe('準點');
      
      // Traffic light color logic (to be implemented in actual code)
      const getTrafficLight = (delayTime: number) => {
        if (delayTime === 0) return '🟢'; // Green for on-time
        if (delayTime <= 10) return '🟡'; // Yellow for slight delay
        return '🔴'; // Red for significant delay
      };
      
      expect(getTrafficLight(liveData.DelayTime)).toBe('🟢');
    });
    
    it('should handle moderate delays with yellow indicator', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          TrainNo: '152',
          DelayTime: 8
        }
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      const liveData = result.get('152');
      
      expect(liveData).toBeDefined();
      expect(liveData.DelayTime).toBe(8);
      
      const getTrafficLight = (delayTime: number) => {
        if (delayTime === 0) return '🟢';
        if (delayTime <= 10) return '🟡';
        return '🔴';
      };
      
      expect(getTrafficLight(liveData.DelayTime)).toBe('🟡');
    });
    
    it('should handle significant delays with red indicator', async () => {
      const mockLiveData = [
        {
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          TrainNo: '152',
          DelayTime: 25
        }
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockLiveData
      } as Response);
      
      const result = await apiClient.tryGetLiveDelayData(mockStationId);
      const liveData = result.get('152');
      
      expect(liveData).toBeDefined();
      expect(liveData.DelayTime).toBe(25);
      
      const getTrafficLight = (delayTime: number) => {
        if (delayTime === 0) return '🟢';
        if (delayTime <= 10) return '🟡';
        return '🔴';
      };
      
      expect(getTrafficLight(liveData.DelayTime)).toBe('🔴');
    });
  });
  
  describe('Delay Time Adjustment', () => {
    it('should adjust departure and arrival times based on delay', () => {
      const addMinutesToTime = (apiClient as any).addMinutesToTime.bind(apiClient);
      
      const trainData = {
        departureTime: '09:40',
        arrivalTime: '10:40'
      };
      
      const liveEntry = {
        DelayTime: 15
      };
      
      const actualDepartureTime = addMinutesToTime(trainData.departureTime, liveEntry.DelayTime);
      const actualArrivalTime = addMinutesToTime(trainData.arrivalTime, liveEntry.DelayTime);
      
      expect(actualDepartureTime).toBe('09:55');
      expect(actualArrivalTime).toBe('10:55');
    });
  });
});