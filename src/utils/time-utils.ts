/**
 * Time Utilities
 * Functions for time calculations, formatting, and manipulation
 */

export class TimeUtils {
  /**
   * Calculate travel time between two time strings (HH:mm format)
   */
  static calculateTravelTime(departureTime: string, arrivalTime: string): string {
    try {
      const [depHour, depMin] = departureTime.split(':').map(Number);
      const [arrHour, arrMin] = arrivalTime.split(':').map(Number);
      
      let totalMinutes = (arrHour * 60 + arrMin) - (depHour * 60 + depMin);
      
      // Handle overnight journeys
      if (totalMinutes < 0) {
        totalMinutes += 24 * 60;
      }
      
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      
      if (hours === 0) {
        return `${minutes}分鐘`;
      } else if (minutes === 0) {
        return `${hours}小時`;
      } else {
        return `${hours}小時${minutes}分鐘`;
      }
    } catch {
      return '計算錯誤';
    }
  }

  /**
   * Get travel time in decimal hours for comparison
   */
  static getTravelTimeInHours(departureTime: string, arrivalTime: string): number {
    try {
      const [depHour, depMin] = departureTime.split(':').map(Number);
      const [arrHour, arrMin] = arrivalTime.split(':').map(Number);
      
      let totalMinutes = (arrHour * 60 + arrMin) - (depHour * 60 + depMin);
      
      // Handle overnight journeys
      if (totalMinutes < 0) {
        totalMinutes += 24 * 60;
      }
      
      return totalMinutes / 60;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate stop duration between arrival and departure at a station
   */
  static calculateStopDuration(arrivalTime: string, departureTime: string): string {
    try {
      const arrTime = new Date(`1970-01-01T${arrivalTime}:00`);
      const depTime = new Date(`1970-01-01T${departureTime}:00`);
      
      const diffMs = depTime.getTime() - arrTime.getTime();
      const minutes = Math.round(diffMs / (1000 * 60));
      
      return `${minutes}分`;
    } catch {
      return '停車';
    }
  }

  /**
   * Add minutes to a time string and return formatted result
   */
  static addMinutesToTime(timeStr: string, minutes: number): string {
    try {
      const [hours, mins] = timeStr.split(':').map(Number);
      const totalMinutes = hours * 60 + mins + minutes;
      
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMins = totalMinutes % 60;
      
      return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
    } catch {
      return timeStr;
    }
  }

  /**
   * Format time with delay information
   */
  static formatTimeWithDelay(
    originalTime?: string, 
    adjustedTime?: string, 
    isArrival: boolean = false
  ): string {
    if (!originalTime) return '---';
    
    if (!adjustedTime || adjustedTime === originalTime) {
      return originalTime;
    }
    
    const delayMinutes = this.calculateDelayMinutes(originalTime, adjustedTime);
    const delayText = delayMinutes > 0 ? ` (+${delayMinutes}分)` : '';
    
    return `${adjustedTime}${delayText}`;
  }

  /**
   * Calculate delay in minutes between original and adjusted times
   */
  static calculateDelayMinutes(originalTime: string, adjustedTime: string): number {
    try {
      const [origHour, origMin] = originalTime.split(':').map(Number);
      const [adjHour, adjMin] = adjustedTime.split(':').map(Number);
      
      const origMinutes = origHour * 60 + origMin;
      const adjMinutes = adjHour * 60 + adjMin;
      
      return adjMinutes - origMinutes;
    } catch {
      return 0;
    }
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  static getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get tomorrow's date in YYYY-MM-DD format
   */
  static getTomorrowDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  /**
   * Validate time format (HH:mm)
   */
  static isValidTime(timeStr: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeStr);
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  static isValidDate(dateStr: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) return false;
    
    const date = new Date(dateStr);
    return date.toISOString().startsWith(dateStr);
  }

  /**
   * Get time range description for user-friendly display
   */
  static getTimeRangeDescription(hour: number): string {
    if (hour >= 5 && hour < 9) return '早上';
    if (hour >= 9 && hour < 12) return '上午';
    if (hour >= 12 && hour < 14) return '中午';
    if (hour >= 14 && hour < 18) return '下午';
    if (hour >= 18 && hour < 22) return '晚上';
    return '深夜';
  }

  /**
   * Format duration in minutes to human-readable format
   */
  static formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) {
      return `${mins}分鐘`;
    } else if (mins === 0) {
      return `${hours}小時`;
    } else {
      return `${hours}小時${mins}分鐘`;
    }
  }

  /**
   * Parse relative time expressions (e.g., "明天", "下午")
   */
  static parseRelativeTime(query: string): { date?: string; timeHint?: string } {
    const result: { date?: string; timeHint?: string } = {};
    
    // Date parsing
    if (query.includes('明天') || query.includes('tomorrow')) {
      result.date = this.getTomorrowDate();
    } else if (query.includes('今天') || query.includes('today')) {
      result.date = this.getCurrentDate();
    }
    
    // Time hints
    if (query.includes('早上') || query.includes('morning')) {
      result.timeHint = '06:00-09:00';
    } else if (query.includes('上午')) {
      result.timeHint = '09:00-12:00';
    } else if (query.includes('中午') || query.includes('noon')) {
      result.timeHint = '11:00-14:00';
    } else if (query.includes('下午') || query.includes('afternoon')) {
      result.timeHint = '14:00-18:00';
    } else if (query.includes('晚上') || query.includes('evening')) {
      result.timeHint = '18:00-22:00';
    } else if (query.includes('深夜') || query.includes('night')) {
      result.timeHint = '22:00-05:00';
    }
    
    return result;
  }
}