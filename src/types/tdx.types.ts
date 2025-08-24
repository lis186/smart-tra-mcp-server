/**
 * TDX (Transport Data eXchange) API Type Definitions
 * Type definitions for Taiwan Railway Administration API responses
 */

/**
 * TDX Station information
 */
export interface TDXStation {
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  StationAddress?: string;
  StationPosition?: {
    PositionLat: number;
    PositionLon: number;
  };
}

/**
 * TDX Train Timetable response
 */
export interface TDXTrainTimetable {
  TrainInfo: {
    TrainNo: string;
    TrainTypeName: { Zh_tw: string; En: string };
    TrainTypeCode: string;
  };
  StopTimes: Array<{
    StationID: string;
    StationName: { Zh_tw: string; En: string };
    ArrivalTime: string;
    DepartureTime: string;
    StopSequence: number;
  }>;
}

/**
 * TDX Date Range response for available train dates
 */
export interface TDXDateRangeResponse {
  TrainDates: string[];
  StartDate: string;
  EndDate: string;
}

/**
 * TDX Train Timetable wrapper response (v3 API)
 */
export interface TDXTrainTimetableResponse {
  TrainTimetables: TDXTrainTimetable[];
}

/**
 * TDX Fare response structure
 */
export interface TDXFareResponse {
  ODFares?: TDXFareInfo[];
  Fares?: TDXFareInfo[];
}

/**
 * TDX Fare information
 */
export interface TDXFareInfo {
  Price: number;
  TicketType?: string;
  FareClass?: string;
}

/**
 * TDX Live Board entry for real-time train information
 */
export interface TDXLiveBoardEntry {
  StationID: string;
  StationName: { Zh_tw: string; En: string };
  TrainNo: string;
  TrainTypeID: string;
  TrainTypeName: { Zh_tw: string; En: string };
  Direction: number;
  EndingStationID: string;
  EndingStationName: { Zh_tw: string; En: string };
  ScheduledDepartureTime: string;
  ActualDepartureTime?: string;
  DelayTime?: number;
  TrainStatus?: string;
  Platform?: string;
}

/**
 * TDX API error response
 */
export interface TDXErrorResponse {
  error?: string;
  error_description?: string;
  message?: string;
}