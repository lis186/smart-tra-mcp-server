/**
 * Tests for Stage 6 search_trains tool functionality
 * Tests TDX API integration, train filtering, and response formatting
 */

import { SmartTRAServer } from '../src/server';

// Mock TRA train timetable data
const mockTrainData = [
  {
    TrainNo: '1234',
    RouteID: 'TRA-R001',
    Direction: 0,
    TrainClassificationID: '10',
    TrainTypeID: '10',
    TrainTypeName: { Zh_tw: '區間車', En: 'Local' },
    StartingStationID: '1000',
    StartingStationName: { Zh_tw: '臺北', En: 'Taipei' },
    EndingStationID: '3300',
    EndingStationName: { Zh_tw: '臺中', En: 'Taichung' },
    TripLine: 1,
    WheelChairFlag: 1,
    PackageServiceFlag: 0,
    DiningFlag: 0,
    BreastFeedFlag: 1,
    BikeFlag: 1,
    TrainDate: '2025-08-13',
    StopTimes: [
      {
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        ArrivalTime: '08:00:00',
        DepartureTime: '08:00:00',
        StopTime: 0
      },
      {
        StationID: '1100',
        StationName: { Zh_tw: '桃園', En: 'Taoyuan' },
        ArrivalTime: '08:30:00',
        DepartureTime: '08:32:00',
        StopTime: 2
      },
      {
        StationID: '3300',
        StationName: { Zh_tw: '臺中', En: 'Taichung' },
        ArrivalTime: '10:15:00',
        DepartureTime: '10:15:00',
        StopTime: 0
      }
    ]
  },
  {
    TrainNo: '5678',
    RouteID: 'TRA-R001',
    Direction: 0,
    TrainClassificationID: '100',
    TrainTypeID: '100',
    TrainTypeName: { Zh_tw: '自強號', En: 'Taroko Express' },
    StartingStationID: '1000',
    StartingStationName: { Zh_tw: '臺北', En: 'Taipei' },
    EndingStationID: '3300',
    EndingStationName: { Zh_tw: '臺中', En: 'Taichung' },
    TripLine: 1,
    WheelChairFlag: 1,
    PackageServiceFlag: 1,
    DiningFlag: 1,
    BreastFeedFlag: 1,
    BikeFlag: 0,
    TrainDate: '2025-08-13',
    StopTimes: [
      {
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        ArrivalTime: '09:00:00',
        DepartureTime: '09:00:00',
        StopTime: 0
      },
      {
        StationID: '3300',
        StationName: { Zh_tw: '臺中', En: 'Taichung' },
        ArrivalTime: '10:30:00',
        DepartureTime: '10:30:00',
        StopTime: 0
      }
    ]
  }
];

const mockStationData = [
  {
    StationID: '1000',
    StationName: { Zh_tw: '臺北', En: 'Taipei' },
    StationAddress: '100230臺北市中正區黎明里北平西路 3 號'
  },
  {
    StationID: '3300',
    StationName: { Zh_tw: '臺中', En: 'Taichung' },
    StationAddress: '400005臺中市中區綠川里臺灣大道一段 1 號'
  }
];

describe('Stage 6: search_trains Tool', () => {
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

  describe('TDX API Integration', () => {
    test('should call TDX Daily Train Timetable API', async () => {
      // Mock train timetable response
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTrainData
        } as Response);

      const result = await server['handleSearchTrains']('台北到台中');
      
      // Check that TDX API was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock_token'
          })
        })
      );
    });

    test('should handle TDX API errors gracefully', async () => {
      // Mock API error
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        } as Response);

      const result = await server['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('❌ Error searching trains');
      expect(result.content[0].text).toContain('Network connectivity issues');
    });
  });

  describe('Train Data Processing', () => {
    beforeEach(() => {
      // Mock train timetable response for all tests
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValue({
          ok: true,
          json: async () => mockTrainData
        } as Response);
    });

    test('should process train timetable data correctly', async () => {
      const result = await server['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('🚄 **Train Search Results**');
      expect(result.content[0].text).toContain('Route:** 臺北 → 臺中');
      expect(result.content[0].text).toContain('Found:** 1 trains (2 total)');
    });

    test('should calculate travel time correctly', () => {
      const travelTime = server['calculateTravelTime']('08:00:00', '10:15:00');
      expect(travelTime).toBe('2小時15分');
    });

    test('should handle overnight travel times', () => {
      const travelTime = server['calculateTravelTime']('23:30:00', '01:15:00');
      expect(travelTime).toBe('1小時45分');
    });

    test('should count intermediate stops correctly', () => {
      const processedResults = server['processTrainSearchResults'](mockTrainData, '1000', '3300');
      
      expect(processedResults[0].stops).toBe(1); // 區間車 has 1 intermediate stop (桃園)
      expect(processedResults[1].stops).toBe(0); // 自強號 is direct
    });
  });

  describe('Monthly Pass Filtering', () => {
    beforeEach(() => {
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValue({
          ok: true,
          json: async () => mockTrainData
        } as Response);
    });

    test('should filter to monthly pass eligible trains by default', async () => {
      const result = await server['handleSearchTrains']('台北到台中');
      
      // Should only show 區間車 (monthly pass eligible), not 自強號
      expect(result.content[0].text).toContain('Found:** 1 trains (2 total)');
      expect(result.content[0].text).toContain('區間車 1234');
      expect(result.content[0].text).not.toContain('自強號 5678');
    });

    test('should identify monthly pass eligible trains correctly', () => {
      const processedResults = server['processTrainSearchResults'](mockTrainData, '1000', '3300');
      
      expect(processedResults[0].isMonthlyPassEligible).toBe(true);  // 區間車
      expect(processedResults[1].isMonthlyPassEligible).toBe(false); // 自強號
    });

    test('should display correct icons for train types', async () => {
      const result = await server['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('🎫 = 月票可搭');
      expect(result.content[0].text).toContain('💰 = 需另購票');
    });
  });

  describe('Query Processing Integration', () => {
    beforeEach(() => {
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValue({
          ok: true,
          json: async () => mockTrainData
        } as Response);
    });

    test('should handle natural language queries', async () => {
      const result = await server['handleSearchTrains']('台北到台中今天早上');
      
      expect(result.content[0].text).toContain('Route:** 臺北 → 臺中');
      expect(result.content[0].text).toContain('Date:** 2025-08-13');
    });

    test('should provide helpful error for incomplete queries', async () => {
      const result = await server['handleSearchTrains']('台北');
      
      expect(result.content[0].text).toContain('⚠️ Need more information to search trains');
      expect(result.content[0].text).toContain('Missing information:');
    });

    test('should validate station names', async () => {
      const result = await server['handleSearchTrains']('不存在站到另一個不存在站');
      
      expect(result.content[0].text).toContain('❌ Station validation failed');
    });
  });

  describe('Response Format', () => {
    beforeEach(() => {
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValue({
          ok: true,
          json: async () => mockTrainData
        } as Response);
    });

    test('should include machine-readable JSON data', async () => {
      const result = await server['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('Machine-readable data:');
      expect(result.content[0].text).toContain('```json');
      expect(result.content[0].text).toContain('"trainNo": "1234"');
      expect(result.content[0].text).toContain('"monthlyPassEligible": true');
    });

    test('should format train information clearly', async () => {
      const result = await server['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('1. **區間車 1234** 🎫');
      expect(result.content[0].text).toContain('出發: 08:00:00 → 抵達: 10:15:00');
      expect(result.content[0].text).toContain('行程時間: 2小時15分 (1 個中間站)');
    });

    test('should handle no trains found scenario', async () => {
      // Mock empty response
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        } as Response);

      const result = await server['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('❌ No trains found for this route');
      expect(result.content[0].text).toContain('This might happen if:');
    });
  });

  describe('Error Handling', () => {
    test('should handle station data not loaded', async () => {
      const serverWithNoData = new SmartTRAServer();
      serverWithNoData['stationDataLoaded'] = false;
      
      const result = await serverWithNoData['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('⚠️ Station data is not available');
    });

    test('should handle network errors gracefully', async () => {
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await server['handleSearchTrains']('台北到台中');
      
      expect(result.content[0].text).toContain('❌ Error searching trains');
    });
  });

  describe('Performance', () => {
    test('should handle multiple rapid requests', async () => {
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValue({
          ok: true,
          json: async () => mockTrainData
        } as Response);

      const promises = Array.from({ length: 5 }, () => 
        server['handleSearchTrains']('台北到台中')
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.content[0].text).toContain('🚄 **Train Search Results**');
      });
    });
  });
});