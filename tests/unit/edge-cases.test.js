#!/usr/bin/env node

/**
 * Edge Case Unit Tests
 * Tests boundary conditions, Unicode handling, and edge cases
 */

import { SmartTRAServer } from '../../dist/server.js';
import { TestRunner } from '../lib/test-runner.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

class EdgeCaseTests {
  constructor() {
    this.server = new SmartTRAServer();
    this.testRunner = new TestRunner('Edge Case Unit Tests');
  }

  async setup() {
    await this.server.loadStationDataForTest();
  }

  async runTests() {
    await this.setup();

    // Test Unicode and special character handling
    await this.testRunner.describe('Unicode and Special Character Handling', async () => {
      await this.testRunner.test('Should handle Unicode emojis gracefully', async () => {
        const result = await this.server.handlePlanTripForTest('台北🚂花蓮', '');
        const response = result?.content?.[0]?.text || '';
        
        // Should not crash and should provide meaningful response
        this.testRunner.expect(response.length).toBeGreaterThan(0);
        // In test environment, parsing may fail but should still provide helpful guidance
      });

      await this.testRunner.test('Should handle full-width characters', async () => {
        const result = await this.server.handleSearchStationForTest('台北　', ''); // Full-width space
        const response = result?.content?.[0]?.text || '';
        
        this.testRunner.expect(response).toInclude(['台北']);
      });

      await this.testRunner.test('Should handle mixed character encodings', async () => {
        const result = await this.server.handleSearchTrainsForTest('臺北到台中', ''); // Different "tai" characters
        const response = result?.content?.[0]?.text || '';
        
        this.testRunner.expect(response.length).toBeGreaterThan(0);
      });

      await this.testRunner.test('Should handle invalid Unicode sequences', async () => {
        const result = await this.server.handleSearchStationForTest('台\uFEFF北', ''); // Zero-width no-break space
        const response = result?.content?.[0]?.text || '';
        
        this.testRunner.expect(response).toInclude(['台北']);
      });
    });

    // Test boundary conditions
    await this.testRunner.describe('Boundary Condition Testing', async () => {
      await this.testRunner.test('Should handle maximum length queries', async () => {
        const maxQuery = 'A'.repeat(1000); // Very long query
        const result = await this.server.handleSearchTrainsForTest(maxQuery, '');
        const response = result?.content?.[0]?.text || '';
        
        // Should handle gracefully without crashing
        this.testRunner.expect(response.length).toBeGreaterThan(0);
      });

      await this.testRunner.test('Should handle empty and whitespace queries', async () => {
        const emptyResult = await this.server.handlePlanTripForTest('', '');
        const whitespaceResult = await this.server.handlePlanTripForTest('   \t\n   ', '');
        
        const emptyResponse = emptyResult?.content?.[0]?.text || '';
        const whitespaceResponse = whitespaceResult?.content?.[0]?.text || '';
        
        // Both should provide error guidance
        this.testRunner.expect(emptyResponse).toInclude(['查詢格式錯誤', '目的地不能為空']);
        this.testRunner.expect(whitespaceResponse).toInclude(['查詢格式錯誤']);
      });

      await this.testRunner.test('Should handle null and undefined inputs safely', async () => {
        // Test with undefined context
        const result1 = await this.server.handleSearchTrainsForTest('台北到花蓮', undefined);
        this.testRunner.expect(result1?.content?.[0]?.text?.length || 0).toBeGreaterThan(0);
        
        // Test with empty context
        const result2 = await this.server.handleSearchStationForTest('台北', '');
        this.testRunner.expect(result2?.content?.[0]?.text?.length || 0).toBeGreaterThan(0);
      });

      await this.testRunner.test('Should handle malformed station names', async () => {
        const testCases = [
          '台北台北台北', // Repeated station name
          '台北123', // Station with numbers
          '---台北---', // Station with special characters
          '台\n北', // Station with line breaks
        ];
        
        for (const testCase of testCases) {
          const result = await this.server.handleSearchStationForTest(testCase, '');
          const response = result?.content?.[0]?.text || '';
          
          // Should handle without crashing
          this.testRunner.expect(response.length).toBeGreaterThan(0);
        }
      });
    });

    // Test concurrent request handling
    await this.testRunner.describe('Concurrent Request Handling', async () => {
      await this.testRunner.test('Should handle multiple simultaneous requests', async () => {
        const queries = [
          '台北到花蓮',
          '高雄到台東', 
          '台中到嘉義',
          '桃園到新竹',
          '基隆到宜蘭'
        ];
        
        // Execute all queries simultaneously
        const promises = queries.map(query => 
          this.server.handleSearchTrainsForTest(query, '')
        );
        
        const results = await Promise.all(promises);
        
        // All requests should complete successfully
        for (let i = 0; i < results.length; i++) {
          const response = results[i]?.content?.[0]?.text || '';
          this.testRunner.expect(response.length).toBeGreaterThan(0);
        }
      });

      await this.testRunner.test('Should handle rapid sequential requests', async () => {
        const results = [];
        
        // Make 5 rapid sequential requests
        for (let i = 0; i < 5; i++) {
          const result = await this.server.handlePlanTripForTest(`台北到花蓮 ${i}`, '');
          results.push(result);
        }
        
        // All should succeed
        for (const result of results) {
          const response = result?.content?.[0]?.text || '';
          this.testRunner.expect(response.length).toBeGreaterThan(0);
        }
      });
    });

    // Test error resilience
    await this.testRunner.describe('Error Resilience Testing', async () => {
      await this.testRunner.test('Should handle unexpected input types gracefully', async () => {
        const weirdInputs = [
          '🚂🚃🚄🚅🚆', // Only train emojis
          '１２３４５', // Full-width numbers
          'ＡＢＣＤＥ', // Full-width letters
          '台北→花蓮', // Arrow character
          '台北∼花蓮', // Wave dash
        ];
        
        for (const input of weirdInputs) {
          const result = await this.server.handleSearchTrainsForTest(input, '');
          const response = result?.content?.[0]?.text || '';
          
          // Should not crash
          this.testRunner.expect(response.length).toBeGreaterThan(0);
        }
      });

      await this.testRunner.test('Should handle parsing edge cases', async () => {
        const edgeCases = [
          '從台北去花蓮怎麼去怎麼去', // Repeated phrases
          '台北花蓮台北花蓮', // Repeated origin-destination
          '台北到到花蓮', // Repeated "到"
          '台北  到   花蓮', // Multiple spaces
        ];
        
        for (const edgeCase of edgeCases) {
          const result = await this.server.handlePlanTripForTest(edgeCase, '');
          const response = result?.content?.[0]?.text || '';
          
          // Should extract meaningful information
          this.testRunner.expect(response.length).toBeGreaterThan(0);
          this.testRunner.expect(response).toInclude(['台北', '花蓮']);
        }
      });

      await this.testRunner.test('Should handle memory pressure scenarios', async () => {
        // Create a large context string
        const largeContext = 'context '.repeat(1000);
        
        const result = await this.server.handleSearchTrainsForTest('台北到花蓮', largeContext);
        const response = result?.content?.[0]?.text || '';
        
        // Should handle without memory issues
        this.testRunner.expect(response.length).toBeGreaterThan(0);
      });
    });

    return this.testRunner.getResults();
  }
}

export default EdgeCaseTests;