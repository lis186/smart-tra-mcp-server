/**
 * Rule-based Query Parser for Taiwan Railway queries
 * Extracts origin, destination, time, and preferences from natural language
 * 
 * Stage 5: Focusing on 80% of common patterns using regex
 * Following: Pragmatism Over Perfection, Simple Solutions First
 */

export interface ParsedQuery {
  origin?: string;
  destination?: string;
  date?: string;
  time?: string;
  trainNumber?: string;
  isPartialTrainNumber?: boolean;
  trainNumberQuery?: boolean;
  preferences?: {
    fastest?: boolean;
    cheapest?: boolean;
    directOnly?: boolean;
    trainType?: string;
    timeWindowHours?: number;
    scenic?: boolean;
    allowTransfers?: boolean;
  };
  confidence: number;
  rawQuery: string;
  matchedPatterns: string[];
}

export class QueryParser {
  // English to Chinese station name mapping
  private readonly ENGLISH_TO_CHINESE_STATIONS = new Map([
    ['taipei', '台北'],
    ['taichung', '台中'],
    ['kaohsiung', '高雄'],
    ['taoyuan', '桃園'],
    ['hsinchu', '新竹'],
    ['keelung', '基隆'],
    ['chiayi', '嘉義'],
    ['hualien', '花蓮'],
    ['taitung', '台東'],
    ['yilan', '宜蘭'],
    ['banqiao', '板橋'],
    ['zhongli', '中壢'],
    ['zhunan', '竹南'],
    ['miaoli', '苗栗'],
    ['fengyuan', '豐原'],
    ['changhua', '彰化'],
    ['yuanlin', '員林'],
    ['douliu', '斗六'],
    ['huwei', '虎尾'],
    ['xinying', '新營'],
    ['yongkang', '永康'],
    ['gangshan', '岡山'],
    ['pingtung', '屏東']
  ]);

  // Confidence scoring weights
  private readonly CONFIDENCE_WEIGHTS = {
    LOCATION_PAIR: 0.4,      // Base confidence for finding origin/destination
    TIME_MATCH: 0.2,          // Additional confidence for time information
    DATE_MATCH: 0.2,          // Additional confidence for date information
    PREFERENCES: 0.1,         // Additional confidence for preferences
    COMPLETE_BONUS: 0.1       // Bonus for having complete information
  };

  // Validation thresholds
  private readonly VALIDATION_THRESHOLDS = {
    MIN_CONFIDENCE: 0.4,      // Minimum confidence for valid train search
    HIGH_CONFIDENCE: 0.7,     // Threshold for high confidence results
    STATION_MATCH: 0.7        // Minimum confidence for station name matching
  };

  private readonly LOCATION_SEPARATORS = [
    '到', '去', '往', '至', '→', '->', '→', '前往',
    'to', 'TO', 'To'
  ];

  // Pre-compiled regex patterns optimized for performance
  // Using non-capturing groups (?:) and more specific patterns to reduce backtracking
  private readonly COMPILED_PATTERNS = {
    // Time extraction patterns - optimized with specific ranges
    TIME_SPECIFIC: /(\d{1,2})[:：點](\d{2})?/,
    TIME_12HOUR: /(上午|下午|早上|晚上|中午|凌晨)(\d{1,2})[:：點]?(\d{2})?/,
    TIME_PERIOD: /(?:早上|上午|中午|下午|晚上|夜晚|深夜|凌晨)/,
    
    // Date extraction patterns - more specific to avoid excessive backtracking
    DATE_RELATIVE: /(?:今天|明天|後天|昨天|今日|明日)/,
    DATE_WEEKDAY: /(?:週[一二三四五六日]|周[一二三四五六日])/,
    DATE_WEEK_PREFIX: /(這週|下週|上週|本週)([一二三四五六日天])/,
    DATE_SPECIFIC: /(\d{1,2})月(\d{1,2})[日號]/,
    DATE_FULL: /(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})[日號]?/,
    
    // Location patterns - using non-greedy quantifiers more efficiently
    LOCATION_FROM_TO: /從([^到去往至]+)[到去往至](.+)/,
    LOCATION_VIA_TO: /由([^到去往至]+)[到去往至](.+)/,
    
    // Station name patterns - optimized with possessive quantifiers where possible
    STATION_MAJOR: /(?:[台臺](?:北|中|南)|高雄|桃園|新竹|基隆|嘉義|花蓮|台東|宜蘭)/g,
    STATION_COMMON: /(?:板橋|中壢|竹南|苗栗|豐原|彰化|員林|斗六|虎尾|新營|永康|岡山|屏東)/g,
    STATION_GENERIC: /[\u4e00-\u9fff]{2,4}/g,
    STATION_ENGLISH: /(?:Taipei|Taichung|Kaohsiung|Taoyuan|Hsinchu|Keelung|Chiayi|Hualien|Taitung|Yilan|Banqiao|Zhongli|Zhunan|Miaoli|Fengyuan|Changhua|Yuanlin|Douliu|Huwei|Xinying|Yongkang|Gangshan|Pingtung)(?:\s+(?:Main\s+)?Station)?/gi,
    
    // Train number patterns - NEW
    TRAIN_NUMBER_PURE: /^(\d{1,4})$/,                           // 純數字: "2", "152", "1234"
    TRAIN_NUMBER_WITH_TYPE: /(自強|莒光|區間|普悠瑪|太魯閣)號?\s*(\d{1,4})/,  // 含車種: "自強152"
    TRAIN_NUMBER_WITH_SUFFIX: /(\d{1,4})號?列車/,               // 含後綴: "152號列車"
    TRAIN_NUMBER_STATUS: /(\d{1,4})號?(列車)?(準點|誤點|位置|狀況|時刻表|停靠站)/,  // 狀態查詢
    
    // Preference patterns - using word boundaries for better performance
    PREF_FASTEST: /(?:最快|快速|急行|特急|自強)/,
    PREF_CHEAPEST: /(?:最便宜|便宜|省錢|經濟)/,
    PREF_DIRECT: /(?:直達|不換車|不轉車)/,
    PREF_TRAIN_TYPE: /(?:自強|莒光|復興|區間快|區間)/,
    PREF_TIME_WINDOW: /(接下來|未來|之後)(\d{1,2})(?:小時|個小時)/
  };

  /**
   * Parse natural language query into structured components
   */
  parse(query: string): ParsedQuery {
    // Input validation and sanitization
    if (!query || typeof query !== 'string') {
      return {
        confidence: 0,
        rawQuery: '',
        matchedPatterns: []
      };
    }

    // Remove potentially problematic characters while preserving Chinese
    const sanitized = query
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Limit query length to prevent DoS
    const MAX_QUERY_LENGTH = 500;
    const normalizedQuery = sanitized.length > MAX_QUERY_LENGTH 
      ? sanitized.substring(0, MAX_QUERY_LENGTH) 
      : sanitized;

    const matchedPatterns: string[] = [];
    let confidence = 0;

    // Initialize result
    const result: ParsedQuery = {
      confidence: 0,
      rawQuery: normalizedQuery,
      matchedPatterns: []
    };

    // 0. Check for train number queries FIRST (before location parsing)
    const trainNumberMatch = this.extractTrainNumber(normalizedQuery);
    if (trainNumberMatch.trainNumber) {
      result.trainNumber = trainNumberMatch.trainNumber;
      result.trainNumberQuery = true;
      result.isPartialTrainNumber = trainNumberMatch.isPartial;
      confidence += trainNumberMatch.confidence;
      matchedPatterns.push('train_number');
      
      // If it's a pure train number query, return early with high confidence
      if (trainNumberMatch.isPure) {
        result.confidence = Math.min(confidence, 1.0);
        result.matchedPatterns = matchedPatterns;
        return result;
      }
    }

    // 1. Extract origin and destination using separators
    const locationMatch = this.extractLocations(normalizedQuery);
    if (locationMatch) {
      result.origin = locationMatch.origin;
      result.destination = locationMatch.destination;
      confidence += this.CONFIDENCE_WEIGHTS.LOCATION_PAIR;
      matchedPatterns.push('location_pair');
    }

    // 2. Extract time information
    const timeMatch = this.extractTime(normalizedQuery);
    if (timeMatch.time) {
      result.time = timeMatch.time;
      confidence += this.CONFIDENCE_WEIGHTS.TIME_MATCH;
      matchedPatterns.push('time');
    }

    // 3. Extract date information
    const dateMatch = this.extractDate(normalizedQuery);
    if (dateMatch.date) {
      result.date = dateMatch.date;
      confidence += this.CONFIDENCE_WEIGHTS.DATE_MATCH;
      matchedPatterns.push('date');
    }

    // 4. Extract preferences
    const preferencesMatch = this.extractPreferences(normalizedQuery);
    if (preferencesMatch.hasPreferences) {
      result.preferences = preferencesMatch.preferences;
      confidence += this.CONFIDENCE_WEIGHTS.PREFERENCES;
      matchedPatterns.push('preferences');
    }

    // 5. Boost confidence for common complete patterns
    if (result.origin && result.destination && (result.time || result.date)) {
      confidence += this.CONFIDENCE_WEIGHTS.COMPLETE_BONUS;
      matchedPatterns.push('complete_query');
    }

    // Cap confidence at 1.0
    result.confidence = Math.min(confidence, 1.0);
    result.matchedPatterns = matchedPatterns;

    return result;
  }

  /**
   * Extract origin and destination stations from query
   */
  private extractLocations(query: string): { origin: string; destination: string } | null {
    // Method 1: Try separator-based splitting, but preserve station name integrity
    for (const separator of this.LOCATION_SEPARATORS) {
      const separatorIndex = query.indexOf(separator);
      if (separatorIndex > 0) {
        const beforeSeparator = query.substring(0, separatorIndex);
        const afterSeparator = query.substring(separatorIndex + separator.length);
        
        // Extract potential station names before and after separator
        const origin = this.extractStationName(beforeSeparator, 'end');
        const destination = this.extractStationName(afterSeparator, 'start');
        
        if (origin && destination) {
          return { origin, destination };
        }
      }
    }

    // Method 2: Try regex patterns for "從A到B" structure
    const patterns = [
      this.COMPILED_PATTERNS.LOCATION_FROM_TO,
      this.COMPILED_PATTERNS.LOCATION_VIA_TO
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        const origin = this.cleanLocationName(match[1]);
        const destination = this.cleanLocationName(match[2]);
        if (origin && destination) {
          return { origin, destination };
        }
      }
    }

    return null;
  }

  /**
   * Extract station name from a text segment
   * @param text The text segment to extract from
   * @param position Whether to extract from 'start' or 'end' of the segment
   */
  private extractStationName(text: string, position: 'start' | 'end'): string {
    // Use pre-compiled station patterns
    const stationPatterns = [
      this.COMPILED_PATTERNS.STATION_MAJOR,
      this.COMPILED_PATTERNS.STATION_COMMON,
      this.COMPILED_PATTERNS.STATION_ENGLISH,
      this.COMPILED_PATTERNS.STATION_GENERIC
    ];

    let cleanedText = text.trim();
    
    // Remove time and date words first
    cleanedText = cleanedText.replace(/(明天|今天|後天|昨天|早上|上午|中午|下午|晚上|夜晚|深夜|凌晨|週[一二三四五六日]|[0-9]+[點:])/g, '');
    cleanedText = cleanedText.replace(/[\s\n\r\t]+/g, ''); // Remove whitespace
    
    if (position === 'end') {
      // Extract from the end (for origin before separator)
      for (const pattern of stationPatterns) {
        const matches = Array.from(cleanedText.matchAll(pattern));
        if (matches.length > 0) {
          // Take the rightmost (last) match
          const lastMatch = matches[matches.length - 1];
          return this.cleanLocationName(lastMatch[0]);
        }
      }
    } else {
      // Extract from the start (for destination after separator)
      for (const pattern of stationPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(cleanedText);
        if (match) {
          return this.cleanLocationName(match[0]);
        }
      }
    }
    
    // Fallback: return cleaned text if no pattern matches
    const fallback = this.cleanLocationName(cleanedText);
    return fallback.length <= 4 && fallback.length >= 2 ? fallback : '';
  }

  /**
   * Clean and normalize location names
   */
  private cleanLocationName(location: string): string {
    let cleaned = location
      .replace(/[\s\n\r\t]+/g, ' ') // Normalize whitespace (keep spaces for English)
      .replace(/(?:車站|火車站|台鐵站|Station|Main\s+Station)$/gi, '') // Remove station suffixes
      .replace(/[的]/g, '') // Remove possessive particles
      .trim();

    // Convert English station names to Chinese
    const englishMatch = cleaned.toLowerCase().replace(/\s+/g, '');
    if (this.ENGLISH_TO_CHINESE_STATIONS.has(englishMatch)) {
      return this.ENGLISH_TO_CHINESE_STATIONS.get(englishMatch)!;
    }

    // Remove remaining whitespace for Chinese names
    if (/[\u4e00-\u9fff]/.test(cleaned)) {
      cleaned = cleaned.replace(/\s+/g, '');
    }

    return cleaned;
  }

  /**
   * Extract time information from query
   */
  private extractTime(query: string): { time: string } {
    // Check for 12-hour format with period indicators FIRST
    // This needs to be checked before TIME_SPECIFIC to handle "下午2點" correctly
    const periodMatch = query.match(this.COMPILED_PATTERNS.TIME_12HOUR);
    if (periodMatch) {
      const period = periodMatch[1];
      let hours = parseInt(periodMatch[2]);
      const minutes = periodMatch[3] || '00';

      // Convert to 24-hour format
      if (period === '下午' || period === '晚上') {
        if (hours !== 12) hours += 12;
      } else if (period === '凌晨' && hours === 12) {
        hours = 0;
      } else if (period === '中午') {
        hours = 12;
      }

      return { time: `${hours.toString().padStart(2, '0')}:${minutes}` };
    }

    // Check for specific times without period indicators (8:30, 14:00, etc.)
    const timeMatch = query.match(this.COMPILED_PATTERNS.TIME_SPECIFIC);
    if (timeMatch) {
      const hours = timeMatch[1];
      const minutes = timeMatch[2] || '00';
      return { time: `${hours.padStart(2, '0')}:${minutes}` };
    }

    // Check for general time periods
    const generalTimeMap = new Map([
      ['早上', '08:00'],
      ['上午', '10:00'],
      ['中午', '12:00'],
      ['下午', '14:00'],
      ['晚上', '18:00'],
      ['夜晚', '20:00'],
      ['深夜', '22:00'],
      ['凌晨', '04:00']
    ]);

    for (const [period, defaultTime] of generalTimeMap) {
      if (query.includes(period)) {
        return { time: defaultTime };
      }
    }

    return { time: '' };
  }

  /**
   * Get current date in Taipei timezone
   */
  private getTaipeiDate(): Date {
    // Create date in Taipei timezone (UTC+8)
    const now = new Date();
    const taipeiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    return taipeiTime;
  }

  /**
   * Format date to YYYY-MM-DD in Taipei timezone
   */
  private formatDateToTaipei(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Extract date information from query
   */
  private extractDate(query: string): { date: string } {
    const today = this.getTaipeiDate();
    
    // Handle relative dates
    const relativeDateMap = new Map([
      ['今天', 0],
      ['今日', 0],
      ['明天', 1],
      ['明日', 1],
      ['後天', 2],
      ['昨天', -1]
    ]);

    for (const [relative, dayOffset] of relativeDateMap) {
      if (query.includes(relative)) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + dayOffset);
        return { date: this.formatDateToTaipei(targetDate) };
      }
    }

    // Handle weekday patterns
    const weekdayMap = new Map([
      ['週一', 1], ['週二', 2], ['週三', 3], ['週四', 4], ['週五', 5], ['週六', 6], ['週日', 0],
      ['周一', 1], ['周二', 2], ['周三', 3], ['周四', 4], ['周五', 5], ['周六', 6], ['周日', 0]
    ]);

    for (const [weekday, targetDay] of weekdayMap) {
      if (query.includes(weekday)) {
        const currentDay = today.getDay();
        let daysToAdd = targetDay - currentDay;
        
        // Handle "下週" prefix
        if (query.includes('下週') || query.includes('下周')) {
          daysToAdd += 7;
        } else if (daysToAdd <= 0) {
          daysToAdd += 7; // Next occurrence of this weekday
        }
        
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + daysToAdd);
        return { date: this.formatDateToTaipei(targetDate) };
      }
    }

    // Handle specific dates (月/日 format)
    const specificDateRegex = /(\d{1,2})月(\d{1,2})[日號]/;
    const specificMatch = query.match(specificDateRegex);
    if (specificMatch) {
      const month = parseInt(specificMatch[1]);
      const day = parseInt(specificMatch[2]);
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      
      // Handle year boundary: if the specified month has passed, assume next year
      let targetYear = currentYear;
      if (month < currentMonth || (month === currentMonth && day < today.getDate())) {
        targetYear = currentYear + 1;
      }
      
      const targetDate = new Date(targetYear, month - 1, day);
      return { date: this.formatDateToTaipei(targetDate) };
    }

    return { date: '' };
  }

  /**
   * Extract user preferences from query
   */
  private extractPreferences(query: string): { preferences: ParsedQuery['preferences']; hasPreferences: boolean } {
    const preferences: ParsedQuery['preferences'] = {};
    let hasPreferences = false;

    // Check for speed preferences (mutually exclusive)
    if (this.COMPILED_PATTERNS.PREF_FASTEST.test(query)) {
      preferences.fastest = true;
      hasPreferences = true;
    } else if (this.COMPILED_PATTERNS.PREF_CHEAPEST.test(query)) {
      preferences.cheapest = true;
      hasPreferences = true;
    }

    // Check for direct train preference
    if (this.COMPILED_PATTERNS.PREF_DIRECT.test(query)) {
      preferences.directOnly = true;
      hasPreferences = true;
    }

    // Extract specific train type (handle multiple mentions)
    const trainTypeMatch = query.match(this.COMPILED_PATTERNS.PREF_TRAIN_TYPE);
    if (trainTypeMatch) {
      // Priority order for multiple train types: 自強 > 莒光 > 復興 > 區間快 > 區間
      if (query.includes('自強')) {
        preferences.trainType = '自強';
        preferences.fastest = true; // 自強 is fastest
      } else if (query.includes('莒光')) {
        preferences.trainType = '莒光';
      } else if (query.includes('復興')) {
        preferences.trainType = '復興';
      } else if (query.includes('區間快')) {
        preferences.trainType = '區間快';
      } else if (query.includes('區間')) {
        preferences.trainType = '區間';
      }
      hasPreferences = true;
    }

    // Extract time window (e.g., "接下來6小時", "未來4小時")
    const timeWindowMatch = query.match(this.COMPILED_PATTERNS.PREF_TIME_WINDOW);
    if (timeWindowMatch) {
      const hours = parseInt(timeWindowMatch[2], 10);
      if (hours > 0 && hours <= 24) { // Reasonable bounds
        preferences.timeWindowHours = hours;
        hasPreferences = true;
      }
    }

    return { preferences, hasPreferences };
  }

  /**
   * Get human-readable summary of parsed query
   */
  getSummary(parsed: ParsedQuery): string {
    const parts: string[] = [];
    
    if (parsed.origin && parsed.destination) {
      parts.push(`從 ${parsed.origin} 到 ${parsed.destination}`);
    }
    
    if (parsed.date) {
      parts.push(`日期: ${parsed.date}`);
    }
    
    if (parsed.time) {
      parts.push(`時間: ${parsed.time}`);
    }
    
    if (parsed.preferences?.trainType) {
      parts.push(`車種: ${parsed.preferences.trainType}`);
    }
    
    if (parsed.preferences?.fastest) {
      parts.push(`需求: 最快路線`);
    } else if (parsed.preferences?.cheapest) {
      parts.push(`需求: 最便宜路線`);
    }
    
    if (parsed.preferences?.directOnly) {
      parts.push(`條件: 直達車`);
    }
    
    const summary = parts.join(' | ');
    return summary || '無法解析查詢內容';
  }

  /**
   * Extract train number from query
   */
  private extractTrainNumber(query: string): {
    trainNumber?: string;
    isPartial: boolean;
    isPure: boolean;
    confidence: number;
  } {
    // 1. Check for pure number (highest priority)
    const pureNumberMatch = query.match(this.COMPILED_PATTERNS.TRAIN_NUMBER_PURE);
    if (pureNumberMatch) {
      const trainNumber = pureNumberMatch[1];
      return {
        trainNumber,
        isPartial: trainNumber.length <= 2, // 1-2 digits considered partial
        isPure: true,
        confidence: trainNumber.length >= 3 ? 0.9 : 0.7 // Lower confidence for very short numbers
      };
    }

    // 2. Check for train number with type (e.g., "自強152")
    const withTypeMatch = query.match(this.COMPILED_PATTERNS.TRAIN_NUMBER_WITH_TYPE);
    if (withTypeMatch) {
      const trainType = withTypeMatch[1];
      const trainNumber = withTypeMatch[2];
      return {
        trainNumber,
        isPartial: false,
        isPure: false,
        confidence: 0.8
      };
    }

    // 3. Check for train number with suffix (e.g., "152號列車")
    const withSuffixMatch = query.match(this.COMPILED_PATTERNS.TRAIN_NUMBER_WITH_SUFFIX);
    if (withSuffixMatch) {
      const trainNumber = withSuffixMatch[1];
      return {
        trainNumber,
        isPartial: false,
        isPure: false,
        confidence: 0.8
      };
    }

    // 4. Check for status queries (e.g., "152準點嗎")
    const statusMatch = query.match(this.COMPILED_PATTERNS.TRAIN_NUMBER_STATUS);
    if (statusMatch) {
      const trainNumber = statusMatch[1];
      return {
        trainNumber,
        isPartial: false,
        isPure: false,
        confidence: 0.7
      };
    }

    return {
      isPartial: false,
      isPure: false,
      confidence: 0
    };
  }

  /**
   * Validate if parsed query has minimum required information
   */
  isValidForTrainSearch(parsed: ParsedQuery): boolean {
    // Train number queries are always valid if we have a train number
    if (parsed.trainNumberQuery && parsed.trainNumber) {
      return true;
    }
    
    // Traditional route queries need origin and destination
    return !!(parsed.origin && parsed.destination && parsed.confidence >= this.VALIDATION_THRESHOLDS.MIN_CONFIDENCE);
  }

  /**
   * Check if this is a train number only query
   */
  isTrainNumberQuery(parsed: ParsedQuery): boolean {
    return !!(parsed.trainNumberQuery && parsed.trainNumber && !parsed.origin && !parsed.destination);
  }
}