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
  preferences?: {
    fastest?: boolean;
    cheapest?: boolean;
    directOnly?: boolean;
    trainType?: string;
  };
  confidence: number;
  rawQuery: string;
  matchedPatterns: string[];
}

export class QueryParser {
  private readonly LOCATION_SEPARATORS = [
    '到', '去', '往', '至', '→', '->', '→', '前往'
  ];

  private readonly TIME_PATTERNS = [
    // Time patterns (8點, 8:30, 20:00, etc.)
    /(\d{1,2})[：:點](\d{2})?/g,
    /(\d{1,2})[：:](\d{2})/g,
    // 12-hour format with 上午/下午
    /(上午|下午|早上|晚上|中午|凌晨)(\d{1,2})[：:點]?(\d{2})?/g,
    // Relative times
    /(早上|上午|中午|下午|晚上|夜晚|深夜|凌晨)/g
  ];

  private readonly DATE_PATTERNS = [
    // Relative dates
    /(今天|明天|後天|昨天|今日|明日)/g,
    /(這週|下週|上週|本週)(一|二|三|四|五|六|日|天)/g,
    /(週一|週二|週三|週四|週五|週六|週日|周一|周二|周三|周四|周五|周六|周日)/g,
    // Specific dates (月/日 format)
    /(\d{1,2})月(\d{1,2})[日號]/g,
    /(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})[日號]?/g
  ];

  private readonly PREFERENCE_PATTERNS = [
    { pattern: /(最快|快速|急行|特急|自強)/g, preference: 'fastest' },
    { pattern: /(最便宜|便宜|省錢|經濟)/g, preference: 'cheapest' },
    { pattern: /(直達|不換車|不轉車)/g, preference: 'directOnly' },
    { pattern: /(自強|莒光|復興|區間|區間快)/g, preference: 'trainType' }
  ];

  /**
   * Parse natural language query into structured components
   */
  parse(query: string): ParsedQuery {
    const normalizedQuery = query.trim();
    const matchedPatterns: string[] = [];
    let confidence = 0;

    // Initialize result
    const result: ParsedQuery = {
      confidence: 0,
      rawQuery: normalizedQuery,
      matchedPatterns: []
    };

    // 1. Extract origin and destination using separators
    const locationMatch = this.extractLocations(normalizedQuery);
    if (locationMatch) {
      result.origin = locationMatch.origin;
      result.destination = locationMatch.destination;
      confidence += 0.4; // High confidence for location pairs
      matchedPatterns.push('location_pair');
    }

    // 2. Extract time information
    const timeMatch = this.extractTime(normalizedQuery);
    if (timeMatch.time) {
      result.time = timeMatch.time;
      confidence += 0.2;
      matchedPatterns.push('time');
    }

    // 3. Extract date information
    const dateMatch = this.extractDate(normalizedQuery);
    if (dateMatch.date) {
      result.date = dateMatch.date;
      confidence += 0.2;
      matchedPatterns.push('date');
    }

    // 4. Extract preferences
    const preferencesMatch = this.extractPreferences(normalizedQuery);
    if (preferencesMatch.hasPreferences) {
      result.preferences = preferencesMatch.preferences;
      confidence += 0.1;
      matchedPatterns.push('preferences');
    }

    // 5. Boost confidence for common complete patterns
    if (result.origin && result.destination && (result.time || result.date)) {
      confidence += 0.1; // Bonus for complete information
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
    const reversePatterns = [
      /從(.+?)[到去往至](.+)/,
      /由(.+?)[到去往至](.+)/
    ];

    for (const pattern of reversePatterns) {
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
    // Common station names and patterns
    const stationPatterns = [
      // Major cities/stations (2-3 characters) - use word boundaries
      /(?:[台臺]北|[台臺]中|[台臺]南|高雄|桃園|新竹|基隆|嘉義|花蓮|台東|宜蘭)/g,
      // Other common stations
      /(?:板橋|中壢|竹南|苗栗|豐原|彰化|員林|斗六|虎尾|新營|永康|岡山|屏東)/g,
      // Pattern for other Chinese station names (2-4 characters)
      /[\u4e00-\u9fff]{2,4}/g
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
    return location
      .replace(/[\s\n\r\t]+/g, '') // Remove whitespace
      .replace(/(?:車站|火車站|台鐵站)$/g, '') // Remove station suffixes only at the end
      .replace(/[的]/g, '') // Remove possessive particles
      .trim();
  }

  /**
   * Extract time information from query
   */
  private extractTime(query: string): { time: string } {
    // Check for specific times first (8:30, 14:00, etc.)
    const timeRegex = /(\d{1,2})[：:點](\d{2})?/;
    const timeMatch = query.match(timeRegex);
    if (timeMatch) {
      const hours = timeMatch[1];
      const minutes = timeMatch[2] || '00';
      return { time: `${hours.padStart(2, '0')}:${minutes}` };
    }

    // Check for 12-hour format with period indicators
    const periodRegex = /(上午|下午|早上|晚上|中午|凌晨)(\d{1,2})[：:點]?(\d{2})?/;
    const periodMatch = query.match(periodRegex);
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
   * Extract date information from query
   */
  private extractDate(query: string): { date: string } {
    const today = new Date();
    
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
        return { date: targetDate.toISOString().split('T')[0] };
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
        return { date: targetDate.toISOString().split('T')[0] };
      }
    }

    // Handle specific dates (月/日 format)
    const specificDateRegex = /(\d{1,2})月(\d{1,2})[日號]/;
    const specificMatch = query.match(specificDateRegex);
    if (specificMatch) {
      const month = parseInt(specificMatch[1]);
      const day = parseInt(specificMatch[2]);
      const currentYear = today.getFullYear();
      
      const targetDate = new Date(currentYear, month - 1, day);
      return { date: targetDate.toISOString().split('T')[0] };
    }

    return { date: '' };
  }

  /**
   * Extract user preferences from query
   */
  private extractPreferences(query: string): { preferences: ParsedQuery['preferences']; hasPreferences: boolean } {
    const preferences: ParsedQuery['preferences'] = {};
    let hasPreferences = false;

    // Check each preference pattern
    for (const { pattern, preference } of this.PREFERENCE_PATTERNS) {
      const matches = query.match(pattern);
      if (matches) {
        hasPreferences = true;
        
        switch (preference) {
          case 'fastest':
            preferences.fastest = true;
            break;
          case 'cheapest':
            preferences.cheapest = true;
            break;
          case 'directOnly':
            preferences.directOnly = true;
            break;
          case 'trainType':
            // Extract specific train type
            if (matches[0].includes('自強')) preferences.trainType = '自強';
            else if (matches[0].includes('莒光')) preferences.trainType = '莒光';
            else if (matches[0].includes('復興')) preferences.trainType = '復興';
            else if (matches[0].includes('區間快')) preferences.trainType = '區間快';
            else if (matches[0].includes('區間')) preferences.trainType = '區間';
            break;
        }
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
   * Validate if parsed query has minimum required information
   */
  isValidForTrainSearch(parsed: ParsedQuery): boolean {
    return !!(parsed.origin && parsed.destination && parsed.confidence >= 0.4);
  }
}