/**
 * TDX API Mock Helper
 * Provides standardized mock setups for TDX API sequences
 */

export interface MockTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MockStationData {
  StationID: string;
  StationName: { Zh_tw: string; En: string };
  StationAddress?: string;
  StationPosition?: { PositionLat: number; PositionLon: number };
}

export interface MockTrainData {
  TrainInfo: {
    TrainNo: string;
    Direction: number;
    TrainTypeID: string;
    TrainTypeCode: string;
    TrainTypeName: { Zh_tw: string; En: string };
    TripHeadSign: string;
    StartingStationID: string;
    StartingStationName: { Zh_tw: string; En: string };
    EndingStationID: string;
    EndingStationName: { Zh_tw: string; En: string };
    TripLine: number;
    WheelChairFlag: number;
    PackageServiceFlag: number;
    DiningFlag: number;
    BreastFeedFlag: number;
    BikeFlag: number;
    CarFlag: number;
    DailyFlag: number;
    ExtraTrainFlag: number;
    SuspendedFlag: number;
    Note: string;
  };
  StopTimes: Array<{
    StopSequence: number;
    StationID: string;
    StationName: { Zh_tw: string; En: string };
    ArrivalTime: string;
    DepartureTime: string;
    SuspendedFlag: number;
  }>;
}

export interface MockFareData {
  OriginStationID: string;
  OriginStationName: { Zh_tw: string; En: string };
  DestinationStationID: string;
  DestinationStationName: { Zh_tw: string; En: string };
  Direction: number;
  Fares: Array<{
    TicketType: string;
    FareClass: string;
    Price: number;
  }>;
}

export class TDXMockHelper {
  private static readonly DEFAULT_TOKEN: MockTokenResponse = {
    access_token: 'mock_token_12345',
    token_type: 'Bearer',
    expires_in: 86400
  };

  private static readonly DEFAULT_STATIONS: MockStationData[] = [
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

  private static readonly DEFAULT_TRAINS: MockTrainData[] = [
    {
      TrainInfo: {
        TrainNo: '408',  // 真實的自強號班次
        Direction: 0,
        TrainTypeID: '1108',
        TrainTypeCode: '3',
        TrainTypeName: { Zh_tw: '自強號', En: 'Tze-Chiang Limited Express' },
        TripHeadSign: '往臺中',
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
        SuspendedFlag: 0,
        Note: '每日行駛。'
      },
      StopTimes: [
        {
          StopSequence: 1,
          StationID: '1000',
          StationName: { Zh_tw: '臺北', En: 'Taipei' },
          ArrivalTime: '07:30:00',
          DepartureTime: '07:30:00',
          SuspendedFlag: 0
        },
        {
          StopSequence: 2,
          StationID: '3300',
          StationName: { Zh_tw: '臺中', En: 'Taichung' },
          ArrivalTime: '08:52:00',
          DepartureTime: '08:52:00',
          SuspendedFlag: 0
        }
      ]
    },
    {
      TrainInfo: {
        TrainNo: '3205',  // 真實的區間車班次
        Direction: 0,
        TrainTypeID: '1132',
        TrainTypeCode: '10',
        TrainTypeName: { Zh_tw: '區間車', En: 'Local' },
        TripHeadSign: '往臺中',
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
        SuspendedFlag: 0,
        Note: '每日行駛。'
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
          StationID: '1020',
          StationName: { Zh_tw: '板橋', En: 'Banqiao' },
          ArrivalTime: '08:12:00',
          DepartureTime: '08:13:00',
          SuspendedFlag: 0
        },
        {
          StopSequence: 3,
          StationID: '3300',
          StationName: { Zh_tw: '臺中', En: 'Taichung' },
          ArrivalTime: '10:43:00',
          DepartureTime: '10:43:00',
          SuspendedFlag: 0
        }
      ]
    }
  ];

  private static readonly DEFAULT_FARES: MockFareData[] = [
    {
      OriginStationID: '1000',
      OriginStationName: { Zh_tw: '臺北', En: 'Taipei' },
      DestinationStationID: '3300',
      DestinationStationName: { Zh_tw: '臺中', En: 'Taichung' },
      Direction: 0,
      Fares: [
        { TicketType: '全票', FareClass: '自由座', Price: 375 },
        { TicketType: '兒童票', FareClass: '自由座', Price: 188 },
        { TicketType: '敬老愛心票', FareClass: '自由座', Price: 188 },
        { TicketType: '愛心票', FareClass: '自由座', Price: 188 }
      ]
    }
  ];

  /**
   * Setup complete API sequence: Token → Station → Train → Fare
   * IMPORTANT: This must be called RIGHT BEFORE the API call, not during setup
   */
  static setupFullApiSequence(options: {
    token?: MockTokenResponse;
    stations?: MockStationData[];
    trains?: MockTrainData[];
    fares?: MockFareData[];
    includeEmptyResponses?: boolean;
  } = {}): jest.MockedFunction<typeof fetch> {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    
    const token = options.token || this.DEFAULT_TOKEN;
    const stations = options.stations || this.DEFAULT_STATIONS;
    const trains = options.trains || this.DEFAULT_TRAINS;
    const fares = options.fares || this.DEFAULT_FARES;

    // CRITICAL: Reset all previous mocks to ensure clean state
    fetchMock.mockReset();
    fetchMock.mockClear();

    // Setup token response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => token
    } as Response);

    // Setup train timetable response (v3 API format) - This is the main data call
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ TrainTimetables: trains })
    } as Response);

    // Setup fare data response (if not empty response test)
    if (!options.includeEmptyResponses) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => fares
      } as Response);
    }

    return fetchMock;
  }

  /**
   * Setup API sequence with no trains found
   */
  static setupNoTrainsSequence(): jest.MockedFunction<typeof fetch> {
    return this.setupFullApiSequence({
      trains: [], // Empty trains array
      includeEmptyResponses: true
    });
  }

  /**
   * Setup API sequence with API errors
   * IMPORTANT: This must be called RIGHT BEFORE the API call, not during setup
   */
  static setupApiErrorSequence(errorAtStep: 'token' | 'station' | 'train' | 'fare'): jest.MockedFunction<typeof fetch> {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockReset();
    fetchMock.mockClear();

    if (errorAtStep === 'token') {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      } as Response);
      return fetchMock;
    }

    // Setup successful token response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => this.DEFAULT_TOKEN
    } as Response);

    if (errorAtStep === 'station') {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);
      return fetchMock;
    }

    // Setup successful station response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => this.DEFAULT_STATIONS
    } as Response);

    if (errorAtStep === 'train') {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      return fetchMock;
    }

    if (errorAtStep === 'fare') {
      // Setup successful train response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ TrainTimetables: this.DEFAULT_TRAINS })
      } as Response);
      
      // Then fail on fare request  
      fetchMock.mockRejectedValueOnce(new Error('Fare API unavailable'));
      return fetchMock;
    }

    // Setup successful train response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ TrainTimetables: this.DEFAULT_TRAINS })
    } as Response);

    return fetchMock;
  }

  /**
   * Setup minimal sequence for basic tests (Token + Station only)
   */
  static setupMinimalSequence(): jest.MockedFunction<typeof fetch> {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockReset();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => this.DEFAULT_TOKEN
    } as Response);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => this.DEFAULT_STATIONS
    } as Response);

    return fetchMock;
  }

  /**
   * Wait for server initialization to complete
   */
  static async waitForServerInitialization(timeoutMs: number = 500): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeoutMs));
  }

  /**
   * Get default test data for custom mock setups
   */
  static get defaultToken(): MockTokenResponse {
    return this.DEFAULT_TOKEN;
  }

  static get defaultStations(): MockStationData[] {
    return this.DEFAULT_STATIONS;
  }

  static get defaultTrains(): MockTrainData[] {
    return this.DEFAULT_TRAINS;
  }

  static get defaultFares(): MockFareData[] {
    return this.DEFAULT_FARES;
  }
}