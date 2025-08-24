/**
 * Trip Planner Service
 * Handles complex trip planning, transfers, and routing logic
 */

import { DataManager, TRAStation } from '../core/data-manager.js';
import { TrainService, TrainSearchResult } from './train-service.js';
import { QueryParser, ParsedQuery } from '../query-parser.js';
import { TimeUtils } from '../utils/time-utils.js';

export interface NonStationDestination {
  destination: string;
  station: string;
  instructions: string;
  isNonStation: boolean;
}

export interface TripPlan {
  segments: TripSegment[];
  totalDuration: string;
  totalTransfers: number;
  recommendations: string[];
}

export interface TripSegment {
  from: string;
  to: string;
  trains: TrainSearchResult[];
  transferTime?: number;
  isTransfer?: boolean;
}

export class TripPlanner {
  // Station-to-branch line mapping for O(1) lookup performance
  private readonly stationToBranchLineMap: Record<string, string> = {
    // 平溪線
    '瑞芳': '平溪線', '十分': '平溪線', '平溪': '平溪線', '菁桐': '平溪線',
    // 內灣線  
    '竹東': '內灣線', '內灣': '內灣線', '六家': '內灣線',
    // 集集線
    '二水': '集集線', '集集': '集集線', '車埕': '集集線', '水里': '集集線',
    // 沙崙線
    '中洲': '沙崙線', '沙崙': '沙崙線', '長榮大學': '沙崙線',
    // 深澳線
    '海科館': '深澳線', '八斗子': '深澳線'
  };

  // Non-station destination mappings
  private readonly nonStationMappings: Record<string, NonStationDestination> = {
    '九份': {
      destination: '九份',
      station: '瑞芳',
      instructions: '搭乘火車至瑞芳站，再轉搭基隆客運788路或新北市公車1062路至九份老街',
      isNonStation: true
    },
    '墾丁': {
      destination: '墾丁',
      station: '枋寮',
      instructions: '搭乘火車至枋寮站，再轉搭國光客運或其他客運至墾丁',
      isNonStation: true
    },
    '太魯閣': {
      destination: '太魯閣',
      station: '花蓮',
      instructions: '搭乘火車至花蓮站，再轉搭太魯閣客運或其他交通工具至太魯閣國家公園',
      isNonStation: true
    },
    '日月潭': {
      destination: '日月潭',
      station: '台中',
      instructions: '搭乘火車至台中站，再轉搭南投客運6670路至日月潭',
      isNonStation: true
    },
    '阿里山': {
      destination: '阿里山',
      station: '嘉義',
      instructions: '搭乘火車至嘉義站，再轉搭阿里山森林鐵路或客運至阿里山',
      isNonStation: true
    }
  };

  constructor(
    private dataManager: DataManager,
    private trainService: TrainService,
    private queryParser: QueryParser
  ) {}

  /**
   * Parse enhanced trip query with planning-specific patterns
   */
  parseEnhancedTripQuery(query: string): ParsedQuery {
    // Start with base parser
    const baseParsed = this.queryParser.parse(query);
    
    // Trip planning specific patterns
    const tripPatterns = [
      // How to get there patterns
      /(.+?)(?:怎麼去|如何去|怎樣去|怎麼到)(.+)/,
      /(.+?)(?:到|去)(.+?)(?:怎麼去|怎麼走|怎樣走)/,
      
      // Journey planning patterns  
      /(?:規劃|安排|計劃)(.+?)(?:到|去)(.+?)(?:的)?(?:行程|路線|旅程)/,
      /(.+?)(?:到|去)(.+?)(?:的)?(?:行程|路線|旅程)(?:規劃|安排|計劃)/,
      
      // Transportation patterns
      /(?:搭|坐|搭乘)(?:火車|台鐵|列車)(?:從|由)?(.+?)(?:到|去)(.+)/,
      /(.+?)(?:搭|坐|搭乘)(?:火車|台鐵|列車)(?:到|去)(.+)/,
      
      // Travel patterns
      /(.+?)(?:到|去)(.+?)(?:旅行|旅遊|遊玩)/,
      /(?:去|到)(.+?)(?:旅行|旅遊|遊玩)/,
      
      // Generic enhanced patterns
      /(.+?)(?:到|去|→)(.+?)(?:的交通|交通方式)/,
      /(?:從|由)(.+?)(?:到|去|→)(.+)/
    ];
    
    // Try trip planning patterns if base parser didn't find origin/destination
    if (!baseParsed.origin || !baseParsed.destination) {
      for (const pattern of tripPatterns) {
        const match = query.match(pattern);
        if (match) {
          const [, origin, destination] = match;
          
          if (origin && destination) {
            baseParsed.origin = origin.trim();
            baseParsed.destination = destination.trim();
            baseParsed.confidence = Math.max(baseParsed.confidence, 0.8);
            baseParsed.matchedPatterns.push('enhanced_trip_planning');
            break;
          }
        }
      }
    }
    
    // Extract planning preferences from trip queries
    const preferences = baseParsed.preferences || {};
    
    // Planning-specific preferences
    if (query.includes('最快') || query.includes('快速') || query.includes('急')) {
      preferences.fastest = true;
    }
    if (query.includes('最便宜') || query.includes('便宜') || query.includes('省錢')) {
      preferences.cheapest = true;
    }
    if (query.includes('直達') || query.includes('不轉車') || query.includes('直接')) {
      preferences.directOnly = true;
    }
    if (query.includes('景觀') || query.includes('風景') || query.includes('觀光')) {
      preferences.scenic = true;
    }
    if (query.includes('轉車') || query.includes('換車')) {
      preferences.allowTransfers = true;
    }
    
    baseParsed.preferences = preferences;
    
    // Improve confidence for trip planning queries
    if (query.includes('規劃') || query.includes('怎麼去') || query.includes('路線') || query.includes('行程')) {
      baseParsed.confidence = Math.max(baseParsed.confidence, 0.85);
      baseParsed.matchedPatterns.push('trip_planning_keywords');
    }
    
    return baseParsed;
  }

  /**
   * Get nearest station mapping for non-station destination
   */
  getNearestStationForDestination(destination: string): NonStationDestination | null {
    const cleanDest = destination.toLowerCase().trim();
    
    for (const [key, mapping] of Object.entries(this.nonStationMappings)) {
      if (cleanDest.includes(key.toLowerCase()) || key.toLowerCase().includes(cleanDest)) {
        return mapping;
      }
    }
    
    return null;
  }

  /**
   * Check if transfer is required between two stations
   */
  async checkIfTransferRequired(origin: string, destination: string): Promise<boolean> {
    if (!origin || !destination) return false;
    
    // O(1) lookup for branch line detection
    const originBranch = this.findStationBranchLine(origin);
    const destBranch = this.findStationBranchLine(destination);
    
    // If one is on branch line and other is not, or they're on different branch lines
    if ((originBranch && !destBranch) || (!originBranch && destBranch) || 
        (originBranch && destBranch && originBranch !== destBranch)) {
      return true;
    }
    
    // Check for cross-coast routes (e.g., from west coast to east coast)
    const westCoastStations = ['基隆', '台北', '桃園', '新竹', '苗栗', '台中', '彰化', '雲林', '嘉義', '台南', '高雄', '屏東'];
    const eastCoastStations = ['宜蘭', '羅東', '蘇澳', '花蓮', '玉里', '池上', '關山', '台東'];
    
    const isOriginWest = westCoastStations.some(s => origin.includes(s));
    const isOriginEast = eastCoastStations.some(s => origin.includes(s));
    const isDestWest = westCoastStations.some(s => destination.includes(s));
    const isDestEast = eastCoastStations.some(s => destination.includes(s));
    
    // Some west-east routes require transfer (e.g., 高雄 to 台東)
    if ((isOriginWest && isDestEast) || (isOriginEast && isDestWest)) {
      // Special case: Some routes have direct trains
      const directRoutes = [
        ['台北', '花蓮'], ['台北', '台東'], ['樹林', '台東'],
        ['桃園', '花蓮'], ['台中', '花蓮']
      ];
      
      for (const [routeOrigin, routeDest] of directRoutes) {
        if ((origin.includes(routeOrigin) && destination.includes(routeDest)) ||
            (origin.includes(routeDest) && destination.includes(routeOrigin))) {
          return false; // Direct route available
        }
      }
      
      return true; // Transfer likely required for most cross-coast routes
    }
    
    return false;
  }

  /**
   * Find which branch line a station belongs to (O(1) lookup)
   */
  private findStationBranchLine(stationName: string): string | null {
    for (const [station, branchLine] of Object.entries(this.stationToBranchLineMap)) {
      if (stationName.includes(station)) {
        return branchLine;
      }
    }
    return null;
  }

  /**
   * Plan multi-segment journey with transfers
   */
  async planMultiSegmentJourney(
    parsed: ParsedQuery, 
    query: string, 
    context?: string
  ): Promise<TripPlan> {
    const origin = parsed.origin || '';
    const destination = parsed.destination || '';
    
    // Find optimal transfer point
    const transferPoint = this.findOptimalTransferPoint(origin, destination);
    
    if (!transferPoint) {
      throw new Error('Unable to find suitable transfer point for this journey');
    }

    const segments: TripSegment[] = [];
    
    // Get first segment trains
    const originResults = this.dataManager.searchStations(origin);
    const transferResults = this.dataManager.searchStations(transferPoint);
    
    if (originResults.length > 0 && transferResults.length > 0) {
      const trains1 = await this.trainService.getDailyTrainTimetable(
        originResults[0].station.StationID,
        transferResults[0].station.StationID,
        parsed.date
      );
      
      segments.push({
        from: origin,
        to: transferPoint,
        trains: this.trainService.processTrainSearchResults(
          trains1, 
          originResults[0].station.StationID, 
          transferResults[0].station.StationID
        ).slice(0, 3) // Limit to 3 options per segment
      });
    }

    // Get second segment trains
    const destResults = this.dataManager.searchStations(destination);
    
    if (transferResults.length > 0 && destResults.length > 0) {
      const trains2 = await this.trainService.getDailyTrainTimetable(
        transferResults[0].station.StationID,
        destResults[0].station.StationID,
        parsed.date
      );
      
      segments.push({
        from: transferPoint,
        to: destination,
        trains: this.trainService.processTrainSearchResults(
          trains2,
          transferResults[0].station.StationID,
          destResults[0].station.StationID
        ).slice(0, 3),
        transferTime: 15 // Standard 15-minute transfer buffer
      });
    }

    return {
      segments,
      totalDuration: this.calculateTotalDuration(segments),
      totalTransfers: segments.length - 1,
      recommendations: this.generateTripRecommendations(segments, transferPoint)
    };
  }

  /**
   * Find optimal transfer point for journey
   */
  private findOptimalTransferPoint(origin: string, destination: string): string | null {
    // Major transfer hubs
    const transferHubs = {
      // Northern Taiwan
      '台北': ['基隆', '桃園', '新竹', '宜蘭'],
      '樹林': ['台北', '桃園', '花蓮', '台東'],
      
      // Central Taiwan  
      '台中': ['苗栗', '彰化', '南投', '日月潭'],
      '彰化': ['台中', '雲林', '嘉義'],
      
      // Southern Taiwan
      '台南': ['嘉義', '高雄', '屏東'],
      '高雄': ['台南', '屏東', '台東'],
      
      // Eastern Taiwan
      '花蓮': ['台北', '宜蘭', '台東'],
      '台東': ['花蓮', '屏東', '高雄']
    };

    // Simple heuristic: find hub that connects to both origin and destination regions
    for (const [hub, connections] of Object.entries(transferHubs)) {
      const connectsToOrigin = connections.some(station => 
        origin.includes(station) || station.includes(origin)
      );
      const connectsToDestination = connections.some(station => 
        destination.includes(station) || station.includes(destination)
      );
      
      if (connectsToOrigin && connectsToDestination) {
        return hub;
      }
    }

    // Fallback to major stations
    const fallbackHubs = ['台北', '台中', '高雄', '花蓮'];
    return fallbackHubs[0]; // Default to Taipei
  }

  /**
   * Calculate total journey duration
   */
  private calculateTotalDuration(segments: TripSegment[]): string {
    let totalMinutes = 0;
    
    for (const segment of segments) {
      if (segment.trains.length > 0) {
        const fastestTrain = segment.trains[0]; // Assuming first train is fastest
        const travelTime = TimeUtils.getTravelTimeInHours(
          fastestTrain.departureTime,
          fastestTrain.arrivalTime
        );
        totalMinutes += travelTime * 60;
        
        if (segment.transferTime) {
          totalMinutes += segment.transferTime;
        }
      }
    }
    
    return TimeUtils.formatDuration(totalMinutes);
  }

  /**
   * Generate trip recommendations
   */
  private generateTripRecommendations(segments: TripSegment[], transferPoint: string): string[] {
    const recommendations = [
      `• 請預留至少 10-15 分鐘轉車時間`,
      `• 建議確認各段車票是否需分開購買`,
      `• 可使用 search_trains 查詢各段詳細時刻表`
    ];

    if (transferPoint === '台北') {
      recommendations.push('• 台北車站轉車請注意月台位置');
    }

    return recommendations;
  }

  /**
   * Format trip plan for display
   */
  formatTripPlan(tripPlan: TripPlan, origin: string, destination: string): string {
    let result = `🚂 **行程規劃: ${origin} → ${destination}**\n\n`;
    
    if (tripPlan.totalTransfers > 0) {
      result += `需要 ${tripPlan.totalTransfers} 次轉車\n`;
      result += `總行程時間: ${tripPlan.totalDuration}\n\n`;
      result += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    tripPlan.segments.forEach((segment, index) => {
      const segmentNumber = index + 1;
      result += `**第${segmentNumber}段: ${segment.from} → ${segment.to}**\n`;
      
      if (segment.trains.length > 0) {
        segment.trains.slice(0, 2).forEach(train => {
          result += `• ${train.trainType} ${train.trainNo}\n`;
          result += `  出發: ${train.departureTime} → 抵達: ${train.arrivalTime} (${train.travelTime})\n`;
        });
      } else {
        result += `• 無直達班次資料\n`;
      }
      
      result += '\n';
    });

    result += `💡 **建議事項:**\n`;
    tripPlan.recommendations.forEach(rec => {
      result += `${rec}\n`;
    });

    return result;
  }
}