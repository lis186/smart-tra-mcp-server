#!/usr/bin/env node

/**
 * Tool Boundary Integration Tests
 * Tests the differences and boundaries between search_trains and plan_trip tools
 */

import { SmartTRAServer } from '../../dist/server.js';
import { TestRunner } from '../lib/test-runner.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

class ToolBoundaryTests {
  constructor() {
    this.server = new SmartTRAServer();
    this.testRunner = new TestRunner('Tool Boundary Tests');
  }

  async setup() {
    await this.server.loadStationDataForTest();
  }

  async runTests() {
    await this.setup();

    // Test boundary between tools for non-station destinations
    await this.testRunner.describe('Non-station destination handling', async () => {
      await this.testRunner.test('search_trains should fail gracefully for 九份', async () => {
        const result = await this.server.handleSearchTrainsForTest('台北到九份', '');
        const response = result?.content?.[0]?.text || '';
        
        // Should show error or station not available (not mapping)
        this.testRunner.expect(response).toInclude(['Station data', 'not available']);
        this.testRunner.expect(response).toNotInclude(['瑞芳', '不是火車站']);
      });

      await this.testRunner.test('plan_trip should map 九份 to 瑞芳', async () => {
        const result = await this.server.handlePlanTripForTest('台北到九份', '');
        const response = result?.content?.[0]?.text || '';
        
        this.testRunner.expect(response).toInclude(['九份', '不是火車站', '瑞芳', '最近的火車站']);
        this.testRunner.expect(response).toNotInclude(['Station data not available']);
      });
    });

    // Test branch line station transfer detection
    await this.testRunner.describe('Branch line transfer detection', async () => {
      await this.testRunner.test('plan_trip should detect transfer for 台北到平溪', async () => {
        const result = await this.server.handlePlanTripForTest('台北到平溪', '');
        const response = result?.content?.[0]?.text || '';
        
        this.testRunner.expect(response).toInclude(['轉車', '瑞芳', '第一段', '第二段']);
        this.testRunner.expect(response).toNotInclude(['"平溪" 不是火車站']);
      });

      await this.testRunner.test('search_trains should fail for 台北到平溪 (no direct route)', async () => {
        const result = await this.server.handleSearchTrainsForTest('台北到平溪', '');
        const response = result?.content?.[0]?.text || '';
        
        // Should show error or unavailable, not transfer planning
        this.testRunner.expect(response).toInclude(['Station data', 'not available']);
        this.testRunner.expect(response).toNotInclude(['轉車', '瑞芳', '第一段']);
      });
    });

    // Test MRT destination mapping
    await this.testRunner.describe('MRT destination mapping', async () => {
      await this.testRunner.test('plan_trip should map 淡水 to 台北', async () => {
        const result = await this.server.handlePlanTripForTest('台中到淡水', '');
        const response = result?.content?.[0]?.text || '';
        
        this.testRunner.expect(response).toInclude(['淡水', '不是火車站', '台北', '最近的火車站']);
      });

      await this.testRunner.test('search_trains should fail for MRT destinations', async () => {
        const result = await this.server.handleSearchTrainsForTest('台中到淡水', '');
        const response = result?.content?.[0]?.text || '';
        
        this.testRunner.expect(response).toInclude(['Station data', 'not available']);
        this.testRunner.expect(response).toNotInclude(['淡水', '不是火車站']);
      });
    });

    // Test direct routes (should work similarly in both tools)
    await this.testRunner.describe('Direct route handling', async () => {
      await this.testRunner.test('Both tools should handle 台北到台中 similarly', async () => {
        const searchResult = await this.server.handleSearchTrainsForTest('台北到台中', '');
        const planResult = await this.server.handlePlanTripForTest('台北到台中', '');
        
        const searchResponse = searchResult?.content?.[0]?.text || '';
        const planResponse = planResult?.content?.[0]?.text || '';
        
        // Both should either show trains or same error
        this.testRunner.expect(searchResponse.length).toBeGreaterThan(0);
        this.testRunner.expect(planResponse.length).toBeGreaterThan(0);
        
        // Neither should show transfer or mapping for direct route
        this.testRunner.expect(searchResponse).toNotInclude(['轉車', '不是火車站']);
        this.testRunner.expect(planResponse).toNotInclude(['轉車', '不是火車站']);
      });
    });

    // Test train number queries
    await this.testRunner.describe('Train number query handling', async () => {
      await this.testRunner.test('search_trains should handle train number queries', async () => {
        const result = await this.server.handleSearchTrainsForTest('152號列車', '');
        const response = result?.content?.[0]?.text || '';
        
        // Should show train-specific response or graceful error
        this.testRunner.expect(response.length).toBeGreaterThan(0);
        this.testRunner.expect(response).toNotInclude(['轉車', '不是火車站']);
      });

      await this.testRunner.test('plan_trip should handle train numbers gracefully', async () => {
        const result = await this.server.handlePlanTripForTest('152號列車', '');
        const response = result?.content?.[0]?.text || '';
        
        // Should not try to plan trips for train numbers
        this.testRunner.expect(response.length).toBeGreaterThan(0);
        this.testRunner.expect(response).toNotInclude(['轉車', '第一段', '第二段']);
      });
    });

    return this.testRunner.getResults();
  }
}

export default ToolBoundaryTests;