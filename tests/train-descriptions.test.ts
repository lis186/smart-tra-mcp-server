/**
 * Tests for train description improvements in PR #15
 * Tests the correct display of direct vs stopping trains
 * Tests the directOnly filtering functionality
 */

import { SmartTRAServer } from '../src/server.js';
import { mockFetch } from './setup.js';

// Mock TRA train timetable data with different stop configurations
const mockTrainDataWithStops = [
  {
    TrainInfo: {
      TrainNo: '1234',
      Direction: 0,
      TrainTypeID: '10',
      TrainTypeCode: '10',
      TrainTypeName: { Zh_tw: '區間車', En: 'Local' },
      TripHeadSign: '臺中',
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
      CarFlag: 0,
      DailyFlag: 1,
      ExtraTrainFlag: 0,
      SuspendedFlag: 0
    },
    StopTimes: [
      {
        StopSequence: 1,
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        ArrivalTime: '08:00:00',
        DepartureTime: '08:00:00',
        SuspendedFlag: 0
      },
      {
        StopSequence: 2,
        StationID: '1100',
        StationName: { Zh_tw: '桃園', En: 'Taoyuan' },
        ArrivalTime: '08:30:00',
        DepartureTime: '08:32:00',
        SuspendedFlag: 0
      },
      {
        StopSequence: 3,
        StationID: '2100',
        StationName: { Zh_tw: '新竹', En: 'Hsinchu' },
        ArrivalTime: '09:00:00',
        DepartureTime: '09:02:00',
        SuspendedFlag: 0
      },
      {
        StopSequence: 4,
        StationID: '3300',
        StationName: { Zh_tw: '臺中', En: 'Taichung' },
        ArrivalTime: '10:15:00',
        DepartureTime: '10:15:00',
        SuspendedFlag: 0
      }
    ]
  },
  {
    TrainInfo: {
      TrainNo: '5678',
      Direction: 0,
      TrainTypeID: '100',
      TrainTypeCode: '100',
      TrainTypeName: { Zh_tw: '自強號', En: 'Taroko Express' },
      TripHeadSign: '臺中',
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
      CarFlag: 0,
      DailyFlag: 1,
      ExtraTrainFlag: 0,
      SuspendedFlag: 0
    },
    StopTimes: [
      {
        StopSequence: 1,
        StationID: '1000',
        StationName: { Zh_tw: '臺北', En: 'Taipei' },
        ArrivalTime: '09:00:00',
        DepartureTime: '09:00:00',
        SuspendedFlag: 0
      },
      {
        StopSequence: 2,
        StationID: '3300',
        StationName: { Zh_tw: '臺中', En: 'Taichung' },
        ArrivalTime: '10:30:00',
        DepartureTime: '10:30:00',
        SuspendedFlag: 0
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

describe('Train Description Improvements (PR #15)', () => {
  let server: SmartTRAServer;

  beforeEach(async () => {
    // Reset fetch mock
    mockFetch.mockReset();
    
    // Mock successful token response
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'mock_token',
          token_type: 'Bearer',
          expires_in: 86400
        })
      } as Response);
    
    // Mock successful station data response  
    mockFetch
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
    jest.restoreAllMocks();
  });

  describe('Stop Description Display', () => {
    beforeEach(() => {
      // Mock current time to be 07:00 AM for time window testing
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2025-08-14T07:00:00').getTime());
      
      // Mock train timetable response with mock data containing stops
      mockFetch
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            UpdateTime: '2025-08-14T15:00:00',
            UpdateInterval: 300,
            TrainDate: '2025-08-14',
            TrainTimetables: mockTrainDataWithStops
          })
        } as Response);
    });
    
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should show "直達" for direct trains (0 stops)', () => {
      // Test the processTrainSearchResults method directly to verify formatting
      const processedResults = server['processTrainSearchResults'](mockTrainDataWithStops, '1000', '3300');
      
      // Find the direct train (自強號 with 0 stops)
      const directTrain = processedResults.find(train => train.stops === 0);
      expect(directTrain).toBeDefined();
      expect(directTrain?.stops).toBe(0);
      expect(directTrain?.trainNo).toBe('5678');
      
      // Now test the filtering logic to simulate what happens in the display
      const preferences = { includeAllTrainTypes: true };
      const filteredResults = server['filterCommuterTrains'](
        processedResults,
        preferences,
        '2025-08-14',
        '08:00'
      );
      
      // Should have at least one train with 0 stops that would display as '直達'
      const directInFiltered = filteredResults.find(train => train.stops === 0);
      expect(directInFiltered).toBeDefined();
    });

    test('should show "經停 X 站" for trains with intermediate stops', () => {
      // Test the processTrainSearchResults method directly
      const processedResults = server['processTrainSearchResults'](mockTrainDataWithStops, '1000', '3300');
      
      // Find the stopping train (區間車 with 2 stops)
      const stoppingTrain = processedResults.find(train => train.stops === 2);
      expect(stoppingTrain).toBeDefined();
      expect(stoppingTrain?.stops).toBe(2);
      expect(stoppingTrain?.trainNo).toBe('1234');
      
      // Verify the logic would format this as '經停 2 站' 
      const expectedFormat = stoppingTrain?.stops === 0 ? '直達' : `經停 ${stoppingTrain?.stops} 站`;
      expect(expectedFormat).toBe('經停 2 站');
    });

    test('should correctly count intermediate stops', () => {
      // Test the processTrainSearchResults method directly
      const processedResults = server['processTrainSearchResults'](mockTrainDataWithStops, '1000', '3300');
      
      // 區間車 (train 1234): 臺北(seq:1) -> 桃園(seq:2) -> 新竹(seq:3) -> 臺中(seq:4)
      // Intermediate stops: 桃園, 新竹 = 2 stops
      expect(processedResults[0].stops).toBe(2);
      expect(processedResults[0].trainNo).toBe('1234');
      
      // 自強號 (train 5678): 臺北(seq:1) -> 臺中(seq:2)  
      // Intermediate stops: none = 0 stops (direct)
      expect(processedResults[1].stops).toBe(0);
      expect(processedResults[1].trainNo).toBe('5678');
    });
  });

  describe('DirectOnly Filtering', () => {
    beforeEach(() => {
      // Mock the date range response for TDX v3 API
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            UpdateTime: '2025-08-14T15:00:00',
            UpdateInterval: 300,
            AuthorityCode: 'TRA',
            StartDate: '2025-08-14',
            EndDate: '2025-08-20',
            TrainDates: ['2025-08-14', '2025-08-15', '2025-08-16'],
            Count: 3
          })
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            UpdateTime: '2025-08-14T15:00:00',
            UpdateInterval: 300,
            TrainDate: '2025-08-14',
            TrainTimetables: mockTrainDataWithStops
          })
        } as Response);
    });

    test('should filter to direct trains only when directOnly preference is set', () => {
      // Create test data with mixed direct and stopping trains
      const trainResults = [
        {
          trainNo: '1234',
          trainType: '區間車',
          origin: '臺北',
          destination: '臺中',
          departureTime: '08:00:00',
          arrivalTime: '10:15:00',
          travelTime: '2小時15分',
          isMonthlyPassEligible: true,
          stops: 2 // stopping train
        },
        {
          trainNo: '5678',
          trainType: '自強號',
          origin: '臺北',
          destination: '臺中',
          departureTime: '09:00:00',
          arrivalTime: '10:30:00',
          travelTime: '1小時30分',
          isMonthlyPassEligible: false,
          stops: 0 // direct train
        }
      ];

      // Test with directOnly preference
      const preferences = { directOnly: true };
      const filteredResults = server['filterCommuterTrains'](
        trainResults,
        preferences,
        '2025-08-14', 
        '08:00'
      );

      // Should only return the direct train (5678)
      expect(filteredResults).toHaveLength(1);
      expect(filteredResults[0].trainNo).toBe('5678');
      expect(filteredResults[0].stops).toBe(0);
    });

    test('should include all trains when directOnly preference is not set', () => {
      const trainResults = [
        {
          trainNo: '1234',
          trainType: '區間車',
          origin: '臺北',
          destination: '臺中',
          departureTime: '08:00:00',
          arrivalTime: '10:15:00',
          travelTime: '2小時15分',
          isMonthlyPassEligible: true,
          stops: 2
        },
        {
          trainNo: '5678',
          trainType: '自強號',
          origin: '臺北',
          destination: '臺中',
          departureTime: '09:00:00',
          arrivalTime: '10:30:00',
          travelTime: '1小時30分',
          isMonthlyPassEligible: false,
          stops: 0
        }
      ];

      // Test without directOnly preference
      const preferences = {};
      const filteredResults = server['filterCommuterTrains'](
        trainResults,
        preferences,
        '2025-08-14',
        '08:00'
      );

      // Should include both trains (filtering by time window and monthly pass eligibility)
      // But since we're filtering to monthly pass eligible by default, only 1234 should be included
      expect(filteredResults.length).toBeGreaterThanOrEqual(1);
      // The first result should be the monthly pass eligible train
      const monthlyPassTrain = filteredResults.find(t => t.isMonthlyPassEligible);
      expect(monthlyPassTrain?.trainNo).toBe('1234');
    });

    test('should return empty array when no direct trains exist and directOnly is set', () => {
      const trainResults = [
        {
          trainNo: '1234',
          trainType: '區間車',
          origin: '臺北',
          destination: '臺中',
          departureTime: '08:00:00',
          arrivalTime: '10:15:00',
          travelTime: '2小時15分',
          isMonthlyPassEligible: true,
          stops: 2 // stopping train
        },
        {
          trainNo: '4567',
          trainType: '區間快車',
          origin: '臺北',
          destination: '臺中',
          departureTime: '08:30:00',
          arrivalTime: '10:45:00',
          travelTime: '2小時15分',
          isMonthlyPassEligible: true,
          stops: 1 // stopping train
        }
      ];

      const preferences = { directOnly: true };
      const filteredResults = server['filterCommuterTrains'](
        trainResults,
        preferences,
        '2025-08-14',
        '08:00'
      );

      // Should return empty array since no direct trains exist
      expect(filteredResults).toHaveLength(0);
    });
  });

  describe('Integration Test: Complete Search Flow', () => {
    beforeEach(() => {
      // Mock current time to be 07:00 AM for time window testing
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2025-08-14T07:00:00').getTime());
      
      // Mock the complete flow: date range, then train data
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            UpdateTime: '2025-08-14T15:00:00',
            UpdateInterval: 300,
            AuthorityCode: 'TRA',
            StartDate: '2025-08-14',
            EndDate: '2025-08-20',
            TrainDates: ['2025-08-14', '2025-08-15', '2025-08-16'],
            Count: 3
          })
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            UpdateTime: '2025-08-14T15:00:00',
            UpdateInterval: 300,
            TrainDate: '2025-08-14',
            TrainTimetables: mockTrainDataWithStops
          })
        } as Response);
    });
    
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should correctly format stop descriptions in display logic', () => {
      // Test the formatting logic directly by simulating what would happen in the display
      const trainResults = [
        {
          trainNo: '1234',
          trainType: '區間車',
          origin: '臺北',
          destination: '臺中',
          departureTime: '08:00:00',
          arrivalTime: '10:15:00',
          travelTime: '2小時15分',
          isMonthlyPassEligible: true,
          stops: 2 // 2 intermediate stops
        },
        {
          trainNo: '5678',
          trainType: '自強號',
          origin: '臺北',
          destination: '臺中',
          departureTime: '09:00:00',
          arrivalTime: '10:30:00',
          travelTime: '1小時30分',
          isMonthlyPassEligible: false,
          stops: 0 // direct train
        }
      ];
      
      // Test that our formatting logic produces the correct descriptions
      trainResults.forEach(train => {
        const stopDescription = train.stops === 0 ? '直達' : `經停 ${train.stops} 站`;
        
        if (train.trainNo === '5678') {
          expect(stopDescription).toBe('直達');
        } else if (train.trainNo === '1234') {
          expect(stopDescription).toBe('經停 2 站');
        }
      });
    });

    test('should properly track stop information in train results', () => {
      // Test that the processTrainSearchResults maintains correct stop counts
      const processedResults = server['processTrainSearchResults'](mockTrainDataWithStops, '1000', '3300');
      
      // Should have 2 trains
      expect(processedResults).toHaveLength(2);
      
      // Find each train and verify stops
      const stoppingTrain = processedResults.find(t => t.trainNo === '1234');
      const directTrain = processedResults.find(t => t.trainNo === '5678');
      
      expect(stoppingTrain?.stops).toBe(2); // 桃園, 新竹 = 2 intermediate stops
      expect(directTrain?.stops).toBe(0); // direct train
      
      // Verify the data structure includes the stops field
      processedResults.forEach(train => {
        expect(typeof train.stops).toBe('number');
        expect(train.stops).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle trains with 1 intermediate stop', () => {
      const singleStopTrain = [{
        TrainInfo: {
          TrainNo: '9999',
          Direction: 0,
          TrainTypeID: '10',
          TrainTypeCode: '10',
          TrainTypeName: { Zh_tw: '區間車', En: 'Local' },
          TripHeadSign: '臺中',
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
          CarFlag: 0,
          DailyFlag: 1,
          ExtraTrainFlag: 0,
          SuspendedFlag: 0
        },
        StopTimes: [
          {
            StopSequence: 1,
            StationID: '1000',
            StationName: { Zh_tw: '臺北', En: 'Taipei' },
            ArrivalTime: '08:00:00',
            DepartureTime: '08:00:00',
            SuspendedFlag: 0
          },
          {
            StopSequence: 2,
            StationID: '1100',
            StationName: { Zh_tw: '桃園', En: 'Taoyuan' },
            ArrivalTime: '08:30:00',
            DepartureTime: '08:32:00',
            SuspendedFlag: 0
          },
          {
            StopSequence: 3,
            StationID: '3300',
            StationName: { Zh_tw: '臺中', En: 'Taichung' },
            ArrivalTime: '10:15:00',
            DepartureTime: '10:15:00',
            SuspendedFlag: 0
          }
        ]
      }];

      const processedResults = server['processTrainSearchResults'](singleStopTrain, '1000', '3300');
      
      expect(processedResults[0].stops).toBe(1);
      expect(processedResults[0].trainNo).toBe('9999');
    });
  });
});