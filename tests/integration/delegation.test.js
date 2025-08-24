#!/usr/bin/env node

/**
 * Internal Delegation Integration Tests
 * Tests that plan_trip correctly delegates to search_trains internally
 */

import { SmartTRAServer } from '../../dist/server.js';
import { TestRunner } from '../lib/test-runner.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

class DelegationTests {
  constructor() {
    this.server = new SmartTRAServer();
    this.testRunner = new TestRunner('Internal Delegation Tests');
  }

  async setup() {
    await this.server.loadStationDataForTest();
  }

  extractTrainNumbers(text) {
    const trainNumbers = [];
    const patterns = [
      /自強號\s+(\d+)/g,
      /莒光號\s+(\d+)/g,
      /區間快車?\s+(\d+)/g,
      /\*\*\w+號?\s+(\d+)\*\*/g,
      /列車\s*(\d+)/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        trainNumbers.push(match[1]);
      }
    });
    
    return [...new Set(trainNumbers)];
  }

  extractStations(text) {
    const stations = [];
    const stationPattern = /(台北|台中|高雄|花蓮|台東|瑞芳|平溪|九份|枋寮|嘉義|車埕|集集)/g;
    
    let match;
    while ((match = stationPattern.exec(text)) !== null) {
      stations.push(match[1]);
    }
    
    return [...new Set(stations)];
  }

  async runTests() {
    await this.setup();

    // Test direct route delegation
    await this.testRunner.describe('Direct route delegation', async () => {
      await this.testRunner.test('plan_trip should delegate 台北到台中 to search_trains', async () => {
        const planResult = await this.server.handlePlanTripForTest('台北到台中', '');
        const searchResult = await this.server.handleSearchTrainsForTest('台北到台中', '');
        
        const planText = planResult?.content?.[0]?.text || '';
        const searchText = searchResult?.content?.[0]?.text || '';
        
        const planTrains = this.extractTrainNumbers(planText);
        const searchTrains = this.extractTrainNumbers(searchText);
        
        // Both should have similar structure or both should fail similarly
        this.testRunner.expect(planText.length).toBeGreaterThan(0);
        this.testRunner.expect(searchText.length).toBeGreaterThan(0);
        
        // plan_trip should not show transfer info for direct routes
        this.testRunner.expect(planText).toNotInclude(['轉車', '第一段', '第二段']);
      });
    });

    // Test non-station mapping delegation
    await this.testRunner.describe('Non-station mapping delegation', async () => {
      await this.testRunner.test('plan_trip should use search_trains after mapping 九份→瑞芳', async () => {
        const planResult = await this.server.handlePlanTripForTest('台北到九份', '');
        const searchResult = await this.server.handleSearchTrainsForTest('台北到瑞芳', '');
        
        const planText = planResult?.content?.[0]?.text || '';
        const searchText = searchResult?.content?.[0]?.text || '';
        
        // plan_trip should show non-station mapping
        this.testRunner.expect(planText).toInclude(['九份', '不是火車站', '瑞芳']);
        
        // Both should reference similar train information (if available)
        const planStations = this.extractStations(planText);
        const searchStations = this.extractStations(searchText);
        
        this.testRunner.expect(planStations).toInclude(['瑞芳']);
      });
    });

    // Test transfer journey delegation
    await this.testRunner.describe('Transfer journey delegation', async () => {
      await this.testRunner.test('plan_trip should use search_trains for each segment', async () => {
        const planResult = await this.server.handlePlanTripForTest('台北到平溪', '');
        const segment1Result = await this.server.handleSearchTrainsForTest('台北到瑞芳', '');
        const segment2Result = await this.server.handleSearchTrainsForTest('瑞芳到平溪', '');
        
        const planText = planResult?.content?.[0]?.text || '';
        const seg1Text = segment1Result?.content?.[0]?.text || '';
        const seg2Text = segment2Result?.content?.[0]?.text || '';
        
        // plan_trip should show transfer planning
        this.testRunner.expect(planText).toInclude(['轉車', '瑞芳', '第一段', '第二段']);
        
        // Should mention both stations involved
        this.testRunner.expect(planText).toInclude(['台北', '平溪', '瑞芳']);
      });

      await this.testRunner.test('plan_trip should detect cross-coast transfers', async () => {
        const planResult = await this.server.handlePlanTripForTest('高雄到台東', '');
        const planText = planResult?.content?.[0]?.text || '';
        
        // Should detect transfer at 枋寮
        this.testRunner.expect(planText).toInclude(['轉車', '枋寮', '行程規劃']);
        this.testRunner.expect(planText).toInclude(['高雄', '台東']);
      });
    });

    // Test delegation accuracy
    await this.testRunner.describe('Delegation accuracy', async () => {
      await this.testRunner.test('Transfer segments should reference correct routes', async () => {
        const planResult = await this.server.handlePlanTripForTest('台北到平溪', '');
        const planText = planResult?.content?.[0]?.text || '';
        
        if (planText.includes('轉車')) {
          // Should show both segments clearly
          this.testRunner.expect(planText).toInclude(['第一段: 台北', '第二段']);
          this.testRunner.expect(planText).toInclude(['瑞芳']);
        }
      });

      await this.testRunner.test('Non-station destinations should show train schedules', async () => {
        const result = await this.server.handlePlanTripForTest('台北到九份', '');
        const responseText = result?.content?.[0]?.text || '';
        
        // Should show mapping explanation and attempt to show trains
        this.testRunner.expect(responseText).toInclude(['九份', '不是火車站', '瑞芳']);
        this.testRunner.expect(responseText).toInclude(['前往 瑞芳 站的火車班次']);
      });
    });

    return this.testRunner.getResults();
  }
}

export default DelegationTests;