/**
 * Chinese Character Encoding Integration Tests
 * Ensures proper handling of Chinese characters across the system
 */

import { describe, it, expect } from '@jest/globals';
import { QueryParser } from '../../src/query-parser.js';

describe('Chinese Character Encoding', () => {
  let parser: QueryParser;

  beforeEach(() => {
    parser = new QueryParser();
  });

  describe('Traditional Chinese Support', () => {
    it('should handle standard traditional Chinese station names', () => {
      const result = parser.parse('台北到台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle character variants (台/臺)', () => {
      const result1 = parser.parse('台北到台中');
      const result2 = parser.parse('台北到臺中');
      
      expect(result1.origin).toBe('台北');
      expect(result2.origin).toBe('台北');
      expect(result1.destination).toBe('台中');
      expect(result2.destination).toBe('臺中');
    });

    it('should handle complex Chinese time expressions', () => {
      const result = parser.parse('明天早上八點台北到台中的自強號');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.time).toBe('08:00');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.preferences?.trainType).toBe('自強');
    });
  });

  describe('Unicode and Mixed Content', () => {
    it('should handle Unicode emojis with Chinese text', () => {
      const result = parser.parse('🚄 台北 → 台中 🕐');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    it('should handle simplified/traditional Chinese mixing', () => {
      const result = parser.parse('台北到台中、经停桃园');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    it('should handle mixed punctuation marks', () => {
      const testCases = [
        '台北→台中',
        '台北->台中',
        '台北 到 台中',
        '台北，台中'
      ];

      testCases.forEach(query => {
        const result = parser.parse(query);
        expect(result.origin).toBeTruthy();
        expect(result.destination).toBeTruthy();
      });
    });
  });

  describe('String Processing', () => {
    it('should correctly calculate Chinese string lengths', () => {
      const chineseText = '台北到台中明天早上八點';
      expect(chineseText.length).toBe(11); // Character count
      expect(Buffer.byteLength(chineseText, 'utf8')).toBe(33); // UTF-8 byte length
    });

    it('should handle JSON serialization of Chinese text', () => {
      const testObj = {
        origin: '台北',
        destination: '台中',
        note: '測試中文 JSON 序列化'
      };

      const jsonString = JSON.stringify(testObj);
      expect(jsonString).toContain('台北');
      expect(jsonString).toContain('台中');

      const parsed = JSON.parse(jsonString);
      expect(parsed.origin).toBe('台北');
      expect(parsed.destination).toBe('台中');
      expect(parsed.note).toBe('測試中文 JSON 序列化');
    });

    it('should sanitize control characters while preserving Chinese', () => {
      const maliciousInput = '台北到台中\x00\x01\x02';
      const result = parser.parse(maliciousInput);
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.rawQuery).not.toContain('\x00');
    });
  });

  describe('Time Expression Parsing', () => {
    it('should parse Chinese time expressions correctly', () => {
      const testCases = [
        { input: '台北到台中早上八點', expectedTime: '08:00' },
        { input: '台北到台中下午二點', expectedTime: '14:00' },
        { input: '台北到台中晚上十點', expectedTime: '22:00' },
        { input: '台北到台中中午十二點', expectedTime: '12:00' }
      ];

      testCases.forEach(({ input, expectedTime }) => {
        const result = parser.parse(input);
        expect(result.time).toBe(expectedTime);
      });
    });

    it('should parse Chinese date expressions', () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expectedTomorrow = tomorrow.toISOString().split('T')[0];

      const result = parser.parse('台北到台中明天');
      expect(result.date).toBe(expectedTomorrow);
    });
  });
});