/**
 * Unicode and special character edge case tests for QueryParser
 * Tests handling of various Unicode ranges, emoji, and special characters
 */

import { QueryParser } from './query-parser';

describe('QueryParser Unicode and Special Character Tests', () => {
  let parser: QueryParser;

  beforeEach(() => {
    parser = new QueryParser();
  });

  describe('Unicode Character Handling', () => {
    test('should handle full-width characters', () => {
      const result = parser.parse('台北　到　台中'); // Full-width spaces
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle Japanese Kanji (similar to Chinese)', () => {
      const result = parser.parse('東京到大阪'); // Japanese city names
      expect(result.origin).toBeDefined();
      expect(result.destination).toBeDefined();
    });

    test('should handle Korean characters gracefully', () => {
      const result = parser.parse('서울到台北'); // Mixed Korean and Chinese
      expect(result.destination).toBe('台北');
    });

    test('should handle Arabic script', () => {
      const result = parser.parse('مرحبا台北到台中سلام');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle various Unicode arrows', () => {
      const arrows = ['→', '⇒', '➔', '➜', '➡', '⟶', '⟹'];
      
      arrows.forEach(arrow => {
        const result = parser.parse(`台北${arrow}台中`);
        expect(result.origin).toBe('台北');
        expect(result.destination).toBe('台中');
      });
    });

    test('should handle Unicode punctuation', () => {
      const result = parser.parse('台北、到。台中！');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle combining characters', () => {
      const result = parser.parse('台北̀到́台中̃'); // With combining accents
      expect(result.origin).toContain('台北');
      expect(result.destination).toContain('台中');
    });

    test('should handle zero-width characters', () => {
      const result = parser.parse('台北\u200B到\u200C台中\u200D'); // Zero-width spaces
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });
  });

  describe('Emoji Handling', () => {
    test('should handle transport emoji', () => {
      const result = parser.parse('🚂台北🚄到🚅台中🚆');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle flag emoji', () => {
      const result = parser.parse('🇹🇼台北到台中🇹🇼');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle mixed emoji and text', () => {
      const result = parser.parse('😊明天早上8點😊台北到台中🎉');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.time).toBe('08:00');
      expect(result.date).toBeDefined();
    });

    test('should handle emoji modifiers', () => {
      const result = parser.parse('台北👍🏻到台中👍🏿'); // Skin tone modifiers
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle emoji sequences', () => {
      const result = parser.parse('台北👨‍👩‍👧‍👦到台中'); // Family emoji sequence
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });
  });

  describe('Special Format Handling', () => {
    test('should handle HTML entities', () => {
      const result = parser.parse('台北&nbsp;到&nbsp;台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle URL encoded characters', () => {
      const result = parser.parse('台北%20到%20台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle mixed number systems', () => {
      const result = parser.parse('台北到台中明天８點'); // Full-width 8
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.time).toBeDefined();
    });

    test('should handle Roman numerals in text', () => {
      const result = parser.parse('台北Ⅲ到台中Ⅶ'); // Roman numerals
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle mathematical symbols', () => {
      const result = parser.parse('台北∈到∉台中∑∏');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });
  });

  describe('Bidirectional Text', () => {
    test('should handle RTL languages mixed with Chinese', () => {
      const result = parser.parse('עברית台北到台中العربية');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle bidirectional override characters', () => {
      const result = parser.parse('\u202E台北到台中\u202C'); // RTL override
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });
  });

  describe('Normalization', () => {
    test('should handle different Unicode normalization forms', () => {
      // é as single character vs e + combining accent
      const nfc = '台北到台中café'; // NFC form
      const nfd = '台北到台中café'; // NFD form
      
      const result1 = parser.parse(nfc);
      const result2 = parser.parse(nfd);
      
      expect(result1.origin).toBe('台北');
      expect(result2.origin).toBe('台北');
    });

    test('should handle ligatures', () => {
      const result = parser.parse('台北ﬁ到ﬂ台中'); // fi and fl ligatures
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle variant selectors', () => {
      const result = parser.parse('台北\uFE0F到台中\uFE0E'); // Variant selectors
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });
  });

  describe('Edge Cases with Special Characters', () => {
    test('should handle invisible characters', () => {
      const invisibles = [
        '\u2060', // Word joiner
        '\uFEFF', // Zero-width no-break space
        '\u180E', // Mongolian vowel separator
      ];
      
      invisibles.forEach(char => {
        const result = parser.parse(`台北${char}到${char}台中`);
        expect(result.origin).toBe('台北');
        expect(result.destination).toBe('台中');
      });
    });

    test('should handle surrogate pairs correctly', () => {
      const result = parser.parse('台北𝐀𝐁𝐂到台中𝕏𝕐𝕑'); // Mathematical bold letters
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle private use area characters', () => {
      const result = parser.parse('台北\uE000到台中\uF8FF'); // Private use area
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle various quotation marks', () => {
      const quotes = ['"', '"', "'", "'", '«', '»', '‹', '›', '「', '」'];
      
      quotes.forEach(quote => {
        const result = parser.parse(`${quote}台北${quote}到${quote}台中${quote}`);
        expect(result.origin).toBe('台北');
        expect(result.destination).toBe('台中');
      });
    });

    test('should handle various dash characters', () => {
      const dashes = ['—', '–', '―', '⸺', '⸻'];
      
      dashes.forEach(dash => {
        const result = parser.parse(`台北${dash}${dash}台中`);
        // Should not be recognized as arrow/separator
        expect(result.origin).toBeUndefined();
      });
    });
  });

  describe('Security-related Unicode Tests', () => {
    test('should handle homograph attacks', () => {
      // Using Cyrillic characters that look like Latin
      const result = parser.parse('Таіреі到Таісһսпց'); // Fake Taipei/Taichung
      // Should not match as valid stations
      expect(result.confidence).toBeLessThan(0.4);
    });

    test('should handle Unicode injection attempts', () => {
      const result = parser.parse("台北'; DROP TABLE stations; --到台中");
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      // SQL injection attempt should be sanitized
    });

    test('should handle format string attempts', () => {
      const result = parser.parse('台北%s%d%x到台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });

    test('should handle path traversal attempts', () => {
      const result = parser.parse('台北../../../到台中');
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });
  });

  describe('Performance with Unicode', () => {
    test('should handle strings with many Unicode characters efficiently', () => {
      const unicodeHeavy = '🚂' + '台北'.repeat(50) + '到' + '台中'.repeat(50) + '🚄';
      
      const start = Date.now();
      const result = parser.parse(unicodeHeavy);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(20);
      expect(result).toBeDefined();
    });

    test('should handle mixed scripts efficiently', () => {
      const mixedScript = 'العربية台北עברית到русский台中English';
      
      const start = Date.now();
      const result = parser.parse(mixedScript);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(10);
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
    });
  });
});