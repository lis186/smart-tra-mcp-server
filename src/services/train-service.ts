/**
 * Train Service
 * Handles all train-related business logic including timetables, fares, and real-time data
 */

import { AuthManager } from '../core/auth-manager.js';
import { ErrorHandler } from '../core/error-handler.js';
import { TimeUtils } from '../utils/time-utils.js';
import { TDXFareResponse } from '../types/tdx.types.js';
import { TrainSearchResult, FareInfo, TPASSRegion, TPASSEligibility } from '../types/common.types.js';
import * as fs from 'fs';
import * as path from 'path';

// TDX API interfaces
export interface TRATrainTimetable {
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

export interface TDXDateRangeResponse {
  TrainDates: string[];
  StartDate: string;
  EndDate: string;
}

export interface TDXTrainTimetableResponse {
  TrainTimetables: TRATrainTimetable[];
}

// Constants
const TPASS_RESTRICTED_TRAIN_TYPES = {
  TAROKO: '1',        // 太魯閣號
  PUYUMA: '2',        // 普悠瑪號
  EMU3000: '11'       // 自強號EMU3000型電車
};

const HTTP_CONSTANTS = {
  NOT_FOUND: 404,
  UNAUTHORIZED: 401
};

const TIME_CONSTANTS = {
  MAX_REASONABLE_TRAVEL_HOURS: 8,
  EPOCH_DATE_PREFIX: '1970-01-01T'
};

const MEMORY_CONSTANTS = {
  MAX_TRAINS_PER_RESULT: 50
};

export class TrainService {
  constructor(
    private authManager: AuthManager,
    private errorHandler: ErrorHandler
  ) {}

  /**
   * Get daily train timetable between two stations
   */
  async getDailyTrainTimetable(
    originStationId: string, 
    destinationStationId: string, 
    trainDate?: string
  ): Promise<TRATrainTimetable[]> {
    try {
      const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
      
      // First, check available date range from v3 API
      const dateRangeResponse = await this.authManager.apiRequest(
        '/v3/Rail/TRA/DailyTrainTimetable/TrainDates?%24format=JSON'
      );
      
      if (!dateRangeResponse.ok) {
        this.errorHandler.logError('Failed to fetch available dates from TDX API', undefined, { 
          status: dateRangeResponse.status, 
          statusText: dateRangeResponse.statusText 
        });
        throw new Error('Service temporarily unavailable. Please try again later.');
      }
      
      const dateRange = await dateRangeResponse.json() as TDXDateRangeResponse;
      const availableDates = dateRange.TrainDates || [];
      
      // Use today if no date specified, or validate requested date
      let date = trainDate || new Date().toISOString().split('T')[0];
      
      // Validate date is within available range
      if (trainDate && !availableDates.includes(trainDate)) {
        console.error(`Requested date ${trainDate} is not available in TDX data. Available dates: ${dateRange.StartDate} to ${dateRange.EndDate}`);
        date = new Date().toISOString().split('T')[0];
        
        // Double-check today is available, otherwise use first available date
        if (!availableDates.includes(date) && availableDates.length > 0) {
          date = availableDates[0];
          console.error(`Using first available date: ${date}`);
        }
      }
      
      // Use v3 API endpoints for better data availability  
      const endpoint = `/v3/Rail/TRA/DailyTrainTimetable/OD/${originStationId}/to/${destinationStationId}/${date}?%24format=JSON`;
      
      const response = await this.authManager.apiRequest(endpoint);
      
      if (!response.ok) {
        // Handle common API failure scenarios
        if (response.status === HTTP_CONSTANTS.NOT_FOUND) {
          console.error(`No timetable data found for route ${originStationId} → ${destinationStationId} on ${date}`);
          return []; // Return empty array for no data found
        }
        this.errorHandler.logError('Failed to fetch train timetable from TDX API', undefined, { 
          status: response.status, 
          statusText: response.statusText,
          originStationId,
          destinationStationId,
          date
        });
        throw new Error('Unable to retrieve train schedule. Please check your route and try again.');
      }

      const responseData = await response.json() as TDXTrainTimetableResponse;
      
      // v3 API returns wrapped data structure - limit results to prevent memory issues
      const data = (responseData.TrainTimetables || []).slice(0, MEMORY_CONSTANTS.MAX_TRAINS_PER_RESULT);
      
      // Handle data availability scenarios
      if (!data || data.length === 0) {
        console.error(`No trains available for route ${originStationId} → ${destinationStationId} on ${date}`);
        console.error('This could happen if:');
        console.error('- No trains run on this route on the specified date');
        console.error('- Trains are suspended due to maintenance or weather');
        console.error('- Route does not exist or station IDs are incorrect');
        return [];
      }
      
      console.error(`Retrieved ${data.length} trains for ${originStationId} → ${destinationStationId} on ${date}`);
      return data;
    } catch (error) {
      console.error('Error fetching train timetable:', error);
      throw error;
    }
  }

  /**
   * Process train timetable data for search results
   */
  processTrainSearchResults(
    trains: TRATrainTimetable[], 
    originStationId: string, 
    destinationStationId: string
  ): TrainSearchResult[] {
    const results: TrainSearchResult[] = [];
    
    for (const train of trains) {
      // Find origin and destination stops
      const originStop = train.StopTimes.find(stop => stop.StationID === originStationId);
      const destinationStop = train.StopTimes.find(stop => stop.StationID === destinationStationId);
      
      if (!originStop || !destinationStop) {
        continue; // Skip trains that don't stop at both stations
      }
      
      // Calculate travel time
      const departureTime = originStop.DepartureTime || originStop.ArrivalTime;
      const arrivalTime = destinationStop.ArrivalTime || destinationStop.DepartureTime;
      const travelTime = TimeUtils.calculateTravelTime(departureTime, arrivalTime);
      
      // Data quality check: Skip trains with abnormally long travel times
      const travelTimeHours = TimeUtils.getTravelTimeInHours(departureTime, arrivalTime);
      if (travelTimeHours > TIME_CONSTANTS.MAX_REASONABLE_TRAVEL_HOURS) {
        this.errorHandler.logError(`Skipping train due to abnormal travel time`, undefined, {
          trainNo: train.TrainInfo.TrainNo,
          travelTimeHours,
          threshold: TIME_CONSTANTS.MAX_REASONABLE_TRAVEL_HOURS
        });
        continue;
      }
      
      // Count intermediate stops
      const originSequence = originStop.StopSequence;
      const destinationSequence = destinationStop.StopSequence;
      const stops = Math.abs(destinationSequence - originSequence) - 1; // Exclude origin and destination
      
      // Check TPASS monthly pass eligibility (both train type AND regional restrictions)
      const restrictedTrainTypes: string[] = Object.values(TPASS_RESTRICTED_TRAIN_TYPES);
      const isTrainTypeEligible = !restrictedTrainTypes.includes(train.TrainInfo.TrainTypeCode);
      
      // Check TPASS regional eligibility if station IDs are available
      let isRegionEligible = true;
      if (originStationId && destinationStationId) {
        const tpassEligibility = this.getTPASSRegion(originStationId, destinationStationId);
        isRegionEligible = tpassEligibility.isEligible;
      }
      
      const isMonthlyPassEligible = isTrainTypeEligible && isRegionEligible;
      
      results.push({
        trainNo: train.TrainInfo.TrainNo,
        trainType: train.TrainInfo.TrainTypeName.Zh_tw,
        origin: originStop.StationName.Zh_tw,
        destination: destinationStop.StationName.Zh_tw,
        departureTime,
        arrivalTime,
        travelTime,
        isMonthlyPassEligible,
        stops
      });
    }
    
    return results;
  }

  /**
   * Get fare information between two stations
   */
  async getODFare(originStationId: string, destinationStationId: string): Promise<FareInfo | null> {
    try {
      const endpoint = `/v3/Rail/TRA/ODFare/${originStationId}/to/${destinationStationId}?%24format=JSON`;
      
      const response = await this.authManager.apiRequest(endpoint);
      
      if (!response.ok) {
        if (response.status === HTTP_CONSTANTS.NOT_FOUND) {
          console.error(`No fare data found for route ${originStationId} → ${destinationStationId}`);
          return null;
        }
        throw new Error(`Fare API request failed: ${response.status} ${response.statusText}`);
      }

      const fareData = await response.json() as TDXFareResponse;
      return this.processFareData(fareData);
    } catch (error) {
      this.errorHandler.logError('Error fetching fare data', error, {
        originStationId,
        destinationStationId
      });
      return null;
    }
  }

  /**
   * Process fare data from TDX API response
   */
  private processFareData(fareResponse: TDXFareResponse): FareInfo {
    // TDX v3 API fare response processing
    const fares = fareResponse.ODFares || fareResponse.Fares || [];
    
    if (fares.length === 0) {
      throw new Error('No fare information available');
    }

    // Use the first fare entry (standard fare)
    const fareInfo = fares[0];
    
    return {
      adult: fareInfo.Price || 0,
      child: Math.round((fareInfo.Price || 0) * 0.5), // Children 50% discount
      disabled: Math.round((fareInfo.Price || 0) * 0.5), // Disabled 50% discount  
      senior: Math.round((fareInfo.Price || 0) * 0.5) // Senior 50% discount
    };
  }

  /**
   * Format train results for user display
   */
  formatTrainResults(
    trains: TrainSearchResult[], 
    originName: string, 
    destName: string,
    originStationId?: string,
    destinationStationId?: string,
    includeDetails: boolean = true
  ): string {
    if (trains.length === 0) {
      return `😔 No trains found between ${originName} and ${destName}`;
    }

    // Check TPASS eligibility if station IDs provided
    let tpassInfo = '';
    if (originStationId && destinationStationId) {
      const tpassEligibility = this.getTPASSRegion(originStationId, destinationStationId);
      tpassInfo = `\n🎫 ${tpassEligibility.message}\n`;
    }

    let result = `🚄 **${originName} → ${destName}** (${trains.length} 班次)${tpassInfo}\n`;

    trains.forEach((train, index) => {
      const monthlyPass = train.isMonthlyPassEligible ? '💳' : '💰';
      result += `${index + 1}. **${train.trainType} ${train.trainNo}** ${monthlyPass}\n`;
      result += `   出發: ${train.departureTime} → 抵達: ${train.arrivalTime}\n`;
      result += `   行程時間: ${train.travelTime}`;
      
      if (includeDetails) {
        result += ` (${train.stops} 站)`;
      }
      
      result += '\n\n';
    });

    if (includeDetails) {
      result += `💡 **圖示說明**\n`;
      result += `💳 = 可使用月票 | 💰 = 需購買車票\n`;
    }

    return result.trim();
  }

  /**
   * Get TPASS region for a station pair
   */
  getTPASSRegion(originStationId: string, destinationStationId: string): TPASSEligibility {
    try {
      // Load TPASS region data
      const tpassDataPath = path.join(process.cwd(), 'src', 'data', 'tpass-regions.json');
      const tpassData: Record<string, TPASSRegion> = JSON.parse(fs.readFileSync(tpassDataPath, 'utf8'));

      // Find which regions contain both stations
      for (const [regionKey, region] of Object.entries(tpassData)) {
        if (region.stations.includes(originStationId) && region.stations.includes(destinationStationId)) {
          return {
            isEligible: true,
            region: regionKey,
            regionName: region.name,
            price: region.price,
            message: `TPASS適用: ${region.name} ✅`
          };
        }
      }

      // Check if stations are in different regions
      const originRegions = Object.entries(tpassData).filter(([_, region]) => 
        region.stations.includes(originStationId)
      );
      const destRegions = Object.entries(tpassData).filter(([_, region]) => 
        region.stations.includes(destinationStationId)
      );

      if (originRegions.length > 0 && destRegions.length > 0) {
        return {
          isEligible: false,
          message: 'TPASS: 需跨區購票 ❌'
        };
      }

      // Stations not in TPASS coverage
      return {
        isEligible: false,
        message: 'TPASS: 不適用此路線'
      };

    } catch (error) {
      this.errorHandler.logError('Error checking TPASS eligibility', error, {
        originStationId,
        destinationStationId
      });
      return {
        isEligible: false,
        message: 'TPASS: 資料載入錯誤'
      };
    }
  }
}