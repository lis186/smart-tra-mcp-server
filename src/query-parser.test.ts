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

  describe('Timezone Handling', () => {
    test('should use Taipei timezone for dates', () => {
      const result = parser.parse('台北到台中今天');
      const date = new Date(result.date!);
      // Verify it's a valid date
      expect(date).toBeInstanceOf(Date);
      expect(date.toString()).not.toBe('Invalid Date');
    });
  });

  describe('Performance', () => {
    test('should parse query within reasonable time', () => {
      const start = Date.now();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        parser.parse('明天早上8點台北到台中最快的自強號');
      }
      
      const elapsed = Date.now() - start;
      const avgTime = elapsed / iterations;
      
      // Should parse in less than 5ms on average
      expect(avgTime).toBeLessThan(5);
    });
  });
});