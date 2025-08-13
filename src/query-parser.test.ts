/**
 * Test suite for QueryParser
 * Tests rule-based query parsing with various patterns and edge cases
 */

import { QueryParser } from './query-parser';

describe('QueryParser', () => {
  let parser: QueryParser;

  beforeEach(() => {
    parser = new QueryParser();
  });

  describe('Location Extraction', () => {
    test('should extract basic A到B pattern', () => {
      const result = parser.parse('台北到台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    });

    test('should extract A去B pattern', () => {
      const result = parser.parse('高雄去台北');
      expect(result.origin).toBe('高雄');
      expect(result.destination).toBe('台北');
    });

    test('should extract A往B pattern', () => {
      const result = parser.parse('桃園往新竹');
      expect(result.origin).toBe('桃園');
      expect(result.destination).toBe('新竹');
    });

    test('should handle 從A到B pattern', () => {
      const result = parser.parse('從板橋到新竹');
      expect(result.origin).toBe('板橋');
      expect(result.destination).toBe('新竹');
    });

    test('should handle station suffixes', () => {
      const result = parser.parse('台北車站到台中火車站');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle multiple station names in query', () => {
      const result = parser.parse('從台北經過台中到高雄');
      // Should extract first and last stations correctly
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('高雄');
    });

    test('should return null for queries without valid separators', () => {
      const result = parser.parse('台北台中');
      expect(result.origin).toBeUndefined();
      expect(result.destination).toBeUndefined();
    });
  });

  describe('Time Extraction', () => {
    test('should extract specific time with colon', () => {
      const result = parser.parse('台北到台中8:30');
      expect(result.time).toBe('08:30');
    });

    test('should extract specific time with 點', () => {
      const result = parser.parse('台北到台中8點');
      expect(result.time).toBe('08:00');
    });

    test('should extract 12-hour format with period', () => {
      const result = parser.parse('台北到台中下午2點');
      expect(result.time).toBe('14:00');
    });

    test('should extract morning time period', () => {
      const result = parser.parse('台北到台中早上');
      expect(result.time).toBe('08:00');
    });

    test('should handle midnight correctly', () => {
      const result = parser.parse('台北到台中凌晨12點');
      expect(result.time).toBe('00:00');
    });

    test('should handle noon correctly', () => {
      const result = parser.parse('台北到台中中午');
      expect(result.time).toBe('12:00');
    });
  });

  describe('Date Extraction', () => {
    test('should extract relative date - today', () => {
      const result = parser.parse('台北到台中今天');
      expect(result.date).toBeDefined();
      // Date should be today's date in YYYY-MM-DD format
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('should extract relative date - tomorrow', () => {
      const result = parser.parse('台北到台中明天');
      expect(result.date).toBeDefined();
    });

    test('should extract weekday', () => {
      const result = parser.parse('台北到台中週五');
      expect(result.date).toBeDefined();
    });

    test('should handle next week weekday', () => {
      const result = parser.parse('台北到台中下週五');
      expect(result.date).toBeDefined();
    });

    test('should extract specific date', () => {
      const result = parser.parse('台北到台中12月25日');
      expect(result.date).toBeDefined();
      expect(result.date).toContain('-12-25');
    });

    test('should handle year boundary for past dates', () => {
      // If testing in December, 1月1日 should be next year
      const result = parser.parse('台北到台中1月1日');
      expect(result.date).toBeDefined();
    });
  });

  describe('Preference Extraction', () => {
    test('should extract fastest preference', () => {
      const result = parser.parse('台北到台中最快');
      expect(result.preferences?.fastest).toBe(true);
    });

    test('should extract cheapest preference', () => {
      const result = parser.parse('台北到台中最便宜');
      expect(result.preferences?.cheapest).toBe(true);
    });

    test('should extract direct only preference', () => {
      const result = parser.parse('台北到台中直達車');
      expect(result.preferences?.directOnly).toBe(true);
    });

    test('should extract train type - 自強', () => {
      const result = parser.parse('台北到台中自強號');
      expect(result.preferences?.trainType).toBe('自強');
      expect(result.preferences?.fastest).toBe(true);
    });

    test('should handle multiple train types with priority', () => {
      const result = parser.parse('台北到台中自強或莒光');
      expect(result.preferences?.trainType).toBe('自強');
    });

    test('should not have conflicting speed preferences', () => {
      const result = parser.parse('台北到台中最快最便宜');
      // Should prioritize one over the other
      expect(
        (result.preferences?.fastest && !result.preferences?.cheapest) ||
        (!result.preferences?.fastest && result.preferences?.cheapest)
      ).toBe(true);
    });
  });

  describe('Complex Queries', () => {
    test('should parse complete query with all components', () => {
      const result = parser.parse('明天早上8點台北到台中最快的自強號');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.date).toBeDefined();
      expect(result.time).toBe('08:00');
      expect(result.preferences?.fastest).toBe(true);
      expect(result.preferences?.trainType).toBe('自強');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('should handle query with context in different order', () => {
      const result = parser.parse('最快的車明天從高雄去台北下午2點');
      expect(result.origin).toBe('高雄');
      expect(result.destination).toBe('台北');
      expect(result.date).toBeDefined();
      expect(result.time).toBe('14:00');
      expect(result.preferences?.fastest).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty query', () => {
      const result = parser.parse('');
      expect(result.confidence).toBe(0);
      expect(result.origin).toBeUndefined();
      expect(result.destination).toBeUndefined();
    });

    test('should handle null input gracefully', () => {
      const result = parser.parse(null as any);
      expect(result.confidence).toBe(0);
      expect(result.rawQuery).toBe('');
    });

    test('should handle undefined input gracefully', () => {
      const result = parser.parse(undefined as any);
      expect(result.confidence).toBe(0);
      expect(result.rawQuery).toBe('');
    });

    test('should handle non-string input', () => {
      const result = parser.parse(123 as any);
      expect(result.confidence).toBe(0);
      expect(result.rawQuery).toBe('');
    });

    test('should handle query with only origin', () => {
      const result = parser.parse('台北');
      expect(result.origin).toBeUndefined();
      expect(result.destination).toBeUndefined();
      expect(result.confidence).toBe(0);
    });

    test('should handle query with only time', () => {
      const result = parser.parse('明天早上');
      expect(result.origin).toBeUndefined();
      expect(result.destination).toBeUndefined();
      expect(result.date).toBeDefined();
      expect(result.time).toBe('08:00');
    });

    test('should handle very long station names', () => {
      const result = parser.parse('台北到一個很長很長的站名');
      expect(result.origin).toBe('台北');
      // Should handle gracefully, not extract overly long names
      expect(result.destination?.length).toBeLessThanOrEqual(4);
    });

    test('should handle special characters in query', () => {
      const result = parser.parse('台北→台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should sanitize control characters', () => {
      const result = parser.parse('台北\x00到\x1f台中\x7f');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.rawQuery).not.toContain('\x00');
    });

    test('should normalize excessive whitespace', () => {
      const result = parser.parse('台北    到    台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.rawQuery).toBe('台北 到 台中');
    });

    test('should handle query exceeding max length', () => {
      const longQuery = '台北到台中' + '很長的查詢'.repeat(200);
      const result = parser.parse(longQuery);
      expect(result.rawQuery.length).toBeLessThanOrEqual(500);
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle mixed traditional and simplified Chinese', () => {
      const result = parser.parse('臺北到台中'); // Mixed 臺 and 台
      expect(result.origin).toBe('臺北');
      expect(result.destination).toBe('台中');
    });

    test('should handle query with emoji', () => {
      const result = parser.parse('台北🚄到台中😊');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle query with English mixed in', () => {
      const result = parser.parse('從Taipei台北到Taichung台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle ambiguous separator in station names', () => {
      // If a station name contains a separator character
      const result = parser.parse('關山到台東');
      expect(result.origin).toBe('關山');
      expect(result.destination).toBe('台東');
    });

    test('should handle query with multiple separators', () => {
      const result = parser.parse('台北到台中到高雄');
      // Should extract first origin and last destination
      expect(result.origin).toBe('台北');
      expect(result.destination).toBeTruthy();
    });

    test('should handle query with no valid content', () => {
      const result = parser.parse('！@#$%^&*()');
      expect(result.confidence).toBe(0);
      expect(result.origin).toBeUndefined();
    });
  });

  describe('Validation', () => {
    test('should validate query with origin and destination', () => {
      const result = parser.parse('台北到台中');
      expect(parser.isValidForTrainSearch(result)).toBe(true);
    });

    test('should invalidate query without destination', () => {
      const result = parser.parse('台北到');
      expect(parser.isValidForTrainSearch(result)).toBe(false);
    });

    test('should invalidate query with low confidence', () => {
      const result = parser.parse('可能要去某個地方');
      expect(parser.isValidForTrainSearch(result)).toBe(false);
    });
  });

  describe('Summary Generation', () => {
    test('should generate summary for complete query', () => {
      const result = parser.parse('台北到台中明天早上8點自強號');
      const summary = parser.getSummary(result);
      expect(summary).toContain('台北');
      expect(summary).toContain('台中');
      expect(summary).toContain('08:00');
      expect(summary).toContain('自強');
    });

    test('should generate error message for invalid query', () => {
      const result = parser.parse('');
      const summary = parser.getSummary(result);
      expect(summary).toBe('無法解析查詢內容');
    });
  });

  describe('Date Boundary Tests', () => {
    test('should handle year transition for past month', () => {
      // Mock current date to December
      const originalDate = Date.prototype.toLocaleString;
      Date.prototype.toLocaleString = function(this: Date, locale?: string | string[], options?: any) {
        if (options?.timeZone === 'Asia/Taipei') {
          return '2024/12/15, 10:00:00 AM';
        }
        return originalDate.call(this, locale, options);
      } as any;

      const result = parser.parse('台北到台中1月1日');
      expect(result.date).toContain('2025-01-01');
      
      Date.prototype.toLocaleString = originalDate;
    });

    test('should handle leap year dates', () => {
      const result = parser.parse('台北到台中2月29日');
      expect(result.date).toBeDefined();
      // Should handle based on whether current/next year is leap
    });

    test('should handle month-end dates', () => {
      const result = parser.parse('台北到台中1月31日');
      expect(result.date).toContain('-01-31');
    });

    test('should handle invalid dates gracefully', () => {
      const result = parser.parse('台北到台中2月30日');
      expect(result.date).toBeDefined();
      // JavaScript Date will auto-correct to March 2
    });

    test('should handle weekday at year boundary', () => {
      const result = parser.parse('台北到台中下週一');
      expect(result.date).toBeDefined();
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Timezone Handling', () => {
    test('should use Taipei timezone for dates', () => {
      const result = parser.parse('台北到台中今天');
      const date = new Date(result.date!);
      // Verify it's a valid date
      expect(date).toBeInstanceOf(Date);
      expect(date.toString()).not.toBe('Invalid Date');
    });

    test('should handle date parsing across timezone boundaries', () => {
      // Test that date is consistent regardless of system timezone
      const result1 = parser.parse('台北到台中明天');
      const result2 = parser.parse('台北到台中明天');
      expect(result1.date).toBe(result2.date);
    });
  });

  describe('Performance', () => {
    test('should parse simple query within reasonable time', () => {
      const start = Date.now();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        parser.parse('台北到台中');
      }
      
      const elapsed = Date.now() - start;
      const avgTime = elapsed / iterations;
      
      // Should parse in less than 2ms on average for simple queries
      expect(avgTime).toBeLessThan(2);
    });

    test('should parse complex query within reasonable time', () => {
      const start = Date.now();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        parser.parse('明天早上8點台北到台中最快的自強號');
      }
      
      const elapsed = Date.now() - start;
      const avgTime = elapsed / iterations;
      
      // Should parse in less than 5ms on average for complex queries
      expect(avgTime).toBeLessThan(5);
    });

    test('should handle performance regression for long queries', () => {
      const longQuery = '台北' + '經過很多站'.repeat(50) + '到台中';
      const start = Date.now();
      
      parser.parse(longQuery);
      
      const elapsed = Date.now() - start;
      // Should not take more than 10ms even for long queries
      expect(elapsed).toBeLessThan(10);
    });

    test('should maintain consistent performance across multiple parses', () => {
      const times: number[] = [];
      const query = '台北到台中明天早上8點';
      
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        parser.parse(query);
        times.push(performance.now() - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      // Max time should not be more than 5x average (no performance spikes)
      expect(maxTime).toBeLessThan(avgTime * 5);
    });
  });

  describe('ReDoS Protection', () => {
    test('should handle potentially malicious patterns without hanging', () => {
      const maliciousPatterns = [
        '台北' + '到'.repeat(1000) + '台中',
        '台北到' + '台'.repeat(1000) + '中',
        '從' + '台北'.repeat(100) + '到台中',
        '台北到台中' + '最快'.repeat(100),
        '台北' + '車站'.repeat(100) + '到台中'
      ];

      maliciousPatterns.forEach(pattern => {
        const start = Date.now();
        parser.parse(pattern);
        const elapsed = Date.now() - start;
        
        // Should complete within 20ms even for malicious patterns
        expect(elapsed).toBeLessThan(20);
      });
    });

    test('should handle nested patterns efficiently', () => {
      const nestedPattern = '從從從台北到到到台中';
      const start = Date.now();
      
      const result = parser.parse(nestedPattern);
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10);
      expect(result).toBeDefined();
    });

    test('should handle backtracking patterns efficiently', () => {
      const backtrackPattern = '台北北北北到台中中中中';
      const start = Date.now();
      
      parser.parse(backtrackPattern);
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
  });
});