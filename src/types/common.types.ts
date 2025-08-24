/**
 * Common Type Definitions
 * Shared interfaces used across the application
 */

/**
 * Non-station destination mapping
 */
export interface NonStationDestination {
  destination: string;
  station: string;
  instructions: string;
  isNonStation: boolean;
}

/**
 * Train search result
 */
export interface TrainSearchResult {
  trainNo: string;
  trainType: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  travelTime: string;
  isMonthlyPassEligible: boolean;
  stops: number;
  minutesUntilDeparture?: number;
  isLate?: boolean;
  hasLeft?: boolean;
  lateWarning?: string;
  isBackupOption?: boolean;
  fareInfo?: FareInfo;
  // Real-time delay information
  delayMinutes?: number;
  actualDepartureTime?: string;
  actualArrivalTime?: string;
  trainStatus?: string;
}

/**
 * Fare information
 */
export interface FareInfo {
  adult: number;
  child: number;
  senior: number;
  disabled: number;
  currency?: string;
}

/**
 * Station search result
 */
export interface StationSearchResult {
  station: TRAStation;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'code';
  confidence: number;
}

/**
 * TRA Station information (internal format)
 */
export interface TRAStation {
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
 * Trip plan information
 */
export interface TripPlan {
  segments: TripSegment[];
  totalDuration: string;
  totalTransfers: number;
  recommendations: string[];
}

/**
 * Trip segment information
 */
export interface TripSegment {
  from: string;
  to: string;
  trains: TrainSearchResult[];
  transferTime?: number;
  isTransfer?: boolean;
}

/**
 * Cached token information
 */
export interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Cached live data
 */
export interface CachedLiveData {
  data: Map<string, unknown>;
  fetchedAt: number;
  expiresAt: number;
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeout?: number;
}