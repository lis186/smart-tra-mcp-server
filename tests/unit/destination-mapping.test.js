#!/usr/bin/env node

/**
 * Destination Mapping Unit Tests
 * Tests the destination mapping logic in isolation
 */

import { SmartTRAServer } from '../../dist/server.js';
import { TestRunner } from '../lib/test-runner.js';

// Setup test environment
process.env.NODE_ENV = 'test';
// Use real TDX credentials from .env file (loaded by server.js)

class DestinationMappingTests {
  constructor() {
    this.server = new SmartTRAServer();
    this.testRunner = new TestRunner('Destination Mapping Unit Tests');
  }

  async setup() {
    await this.server.loadStationDataForTest();
  }

  async runTests() {
    await this.setup();

    // Test three-criteria rule compliance
    await this.testRunner.describe('Three-criteria rule compliance', async () => {
      const testCases = [
        // Should be mapped (Famous + Non-obvious + TRA-reasonable)
        { destination: '九份', shouldMap: true, expectedStation: '瑞芳', reason: 'Famous tourist spot, non-obvious connection' },
        { destination: '墾丁', shouldMap: true, expectedStation: '枋寮', reason: 'Major beach destination, practical endpoint' },
        { destination: '太魯閣', shouldMap: true, expectedStation: '花蓮', reason: 'National park, Hualien is main hub' },
        { destination: '日月潭', shouldMap: true, expectedStation: '台中', reason: 'Famous lake, Taichung is practical hub' },
        { destination: '阿里山', shouldMap: true, expectedStation: '嘉義', reason: 'Mountain destination, AFR connection' },
        
        // MRT-only destinations - currently not mapped in system
        { destination: '淡水', shouldMap: false, reason: 'MRT-only, no current mapping in system' },
        { destination: '北投', shouldMap: false, reason: 'MRT-only, no current mapping in system' },
        
        // Should NOT be mapped (actual TRA stations)
        { destination: '平溪', shouldMap: false, reason: 'IS a TRA station on Pingxi Line' },
        { destination: '十分', shouldMap: false, reason: 'IS a TRA station on Pingxi Line' },
        { destination: '菁桐', shouldMap: false, reason: 'IS a TRA station on Pingxi Line' },
        { destination: '礁溪', shouldMap: false, reason: 'IS a TRA station' },
        { destination: '知本', shouldMap: false, reason: 'IS a TRA station' },
        
        // Should NOT be mapped (too specific/obvious)
        { destination: '台北101', shouldMap: false, reason: 'Obviously use Taipei station' },
        { destination: '花蓮市', shouldMap: false, reason: 'City name matches station name' },
      ];

      for (const testCase of testCases) {
        await this.testRunner.test(`${testCase.destination} mapping rule`, async () => {
          const result = await this.server.handlePlanTripForTest(`台北到${testCase.destination}`, '');
          const response = result?.content?.[0]?.text || '';
          
          if (testCase.shouldMap) {
            // Should show non-station mapping in new friendly format
            this.testRunner.expect(response).toInclude([`**${testCase.destination}交通指南**`]);
            this.testRunner.expect(response).toInclude([testCase.expectedStation]);
            this.testRunner.expect(response).toInclude(['最近的火車站']);
            
            // Should NOT show transfer planning
            this.testRunner.expect(response).toNotInclude(['轉車', '第一段', '第二段']);
            
          } else {
            // Should NOT show non-station mapping
            this.testRunner.expect(response).toNotInclude([`**${testCase.destination}交通指南**`]);
            
            // Should either show transfer planning OR delegate to search_trains
            const hasTransfer = response.includes('轉車') || response.includes('第一段');
            const hasDirectRoute = !response.includes('轉車') && !response.includes('交通指南');
            const isValidResponse = hasTransfer || hasDirectRoute;
            
            this.testRunner.expect(isValidResponse).toBe(true);
          }
        });
      }
    });

    // Test TRA-only scope compliance
    await this.testRunner.describe('TRA-only scope compliance', async () => {
      await this.testRunner.test('All mappings should point to TRA stations only', async () => {
        const traStations = [
          '瑞芳', '枋寮', '新城', '花蓮', '車埕', '集集', '嘉義', '台北', '基隆', '台中', '高雄'
        ];
        
        const nonTraDestinations = ['九份', '墾丁', '太魯閣', '日月潭', '阿里山', '淡水', '北投', '野柳'];
        
        for (const destination of nonTraDestinations) {
          const result = await this.server.handlePlanTripForTest(`台北到${destination}`, '');
          const response = result?.content?.[0]?.text || '';
          
          if (response.includes('交通指南')) {
            // Should map to a known TRA station
            const mappedToTRA = traStations.some(station => response.includes(station));
            this.testRunner.expect(mappedToTRA).toBe(true);
            
            // Should not mention MRT, HSR, or bus stations
            this.testRunner.expect(response).toNotInclude(['MRT', 'HSR', '高鐵', '捷運']);
          }
        }
      });
    });

    // Test mapping boundary cases
    await this.testRunner.describe('Mapping boundary cases', async () => {
      await this.testRunner.test('Ambiguous names should not be mapped', async () => {
        const ambiguousNames = ['老街', '溫泉', '夜市', '公園'];
        
        for (const name of ambiguousNames) {
          const result = await this.server.handlePlanTripForTest(`台北到${name}`, '');
          const response = result?.content?.[0]?.text || '';
          
          // Should not attempt mapping for ambiguous names
          this.testRunner.expect(response).toNotInclude(['交通指南', '最近的火車站']);
        }
      });

      await this.testRunner.test('Station name variations should not be mapped', async () => {
        const stationVariations = ['台北車站', '台中站', '高雄火車站'];
        
        for (const variation of stationVariations) {
          const result = await this.server.handlePlanTripForTest(`桃園到${variation}`, '');
          const response = result?.content?.[0]?.text || '';
          
          // Should not show mapping for obvious station names
          this.testRunner.expect(response).toNotInclude(['交通指南', '最近的火車站']);
        }
      });
    });

    // Test mapping consistency
    await this.testRunner.describe('Mapping consistency', async () => {
      await this.testRunner.test('Same destination should always map to same station', async () => {
        const destinations = ['九份', '墾丁', '太魯閣'];
        
        for (const destination of destinations) {
          const result1 = await this.server.handlePlanTripForTest(`台北到${destination}`, '');
          const result2 = await this.server.handlePlanTripForTest(`高雄到${destination}`, '');
          
          const response1 = result1?.content?.[0]?.text || '';
          const response2 = result2?.content?.[0]?.text || '';
          
          // Both should show same destination mapping
          if (response1.includes('交通指南') && response2.includes('交通指南')) {
            const station1Match = response1.match(/最近的火車站: \*\*(.+?)\*\*/);
            const station2Match = response2.match(/最近的火車站: \*\*(.+?)\*\*/);
            
            if (station1Match && station2Match) {
              this.testRunner.expect(station1Match[1]).toBe(station2Match[1]);
            }
          }
        }
      });

      await this.testRunner.test('Mapping should be case and suffix insensitive', async () => {
        const variations = [
          ['九份', '九份老街'],
          ['墾丁', '墾丁國家公園'],
          ['太魯閣', '太魯閣國家公園']
        ];
        
        for (const [base, variation] of variations) {
          const result1 = await this.server.handlePlanTripForTest(`台北到${base}`, '');
          const result2 = await this.server.handlePlanTripForTest(`台北到${variation}`, '');
          
          const response1 = result1?.content?.[0]?.text || '';
          const response2 = result2?.content?.[0]?.text || '';
          
          // Both should be handled (either both mapped or both not mapped)
          const bothMapped = response1.includes('交通指南') && response2.includes('交通指南');
          const neitherMapped = !response1.includes('交通指南') && !response2.includes('交通指南');
          
          this.testRunner.expect(bothMapped || neitherMapped).toBe(true);
        }
      });
    });

    return this.testRunner.getResults();
  }
}

export default DestinationMappingTests;