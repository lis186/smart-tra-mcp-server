#!/usr/bin/env node

/**
 * End-to-End User Journey Tests
 * Tests realistic user workflows across multiple tools
 */

import { SmartTRAServer } from '../../dist/server.js';
import { TestRunner } from '../lib/test-runner.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

class UserJourneyTests {
  constructor() {
    this.server = new SmartTRAServer();
    this.testRunner = new TestRunner('User Journey E2E Tests');
  }

  async setup() {
    await this.server.loadStationDataForTest();
  }

  async runToolStep(tool, query, context = '') {
    const startTime = Date.now();
    let result;

    switch (tool) {
      case 'search_trains':
        result = await this.server.handleSearchTrainsForTest(query, context);
        break;
      case 'search_station':
        result = await this.server.handleSearchStationForTest(query, context);
        break;
      case 'plan_trip':
        result = await this.server.handlePlanTripForTest(query, context);
        break;
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }

    const responseTime = Date.now() - startTime;
    const responseText = result?.content?.[0]?.text || '';

    return {
      tool,
      query,
      responseTime,
      responseText,
      success: responseText.length > 0
    };
  }

  async runTests() {
    await this.setup();

    // Tourist journey: Unfamiliar user visiting Jiufen
    await this.testRunner.describe('Tourist planning Jiufen trip', async () => {
      await this.testRunner.test('Complete journey from confusion to actionable plan', async () => {
        // Step 1: User tries to find "九份" as a station (fails)
        const step1 = await this.runToolStep('search_station', '九份');
        this.testRunner.expect(step1.success).toBe(true);
        
        // Step 2: User uses plan_trip instead (succeeds with mapping)
        const step2 = await this.runToolStep('plan_trip', '台北到九份怎麼去');
        this.testRunner.expect(step2.responseText).toInclude(['九份', '不是火車站', '瑞芳']);
        
        // Step 3: User gets specific trains to Ruifang
        const step3 = await this.runToolStep('search_trains', '台北到瑞芳明天早上8點');
        this.testRunner.expect(step3.success).toBe(true);
        
        // Journey should guide user from confusion to actionable plan
        const journeySuccess = step2.responseText.includes('瑞芳') && step3.success;
        this.testRunner.expect(journeySuccess).toBe(true);
      });
    });

    // Local commuter journey: Experienced user
    await this.testRunner.describe('Local commuter quick check', async () => {
      await this.testRunner.test('Efficient access to specific information', async () => {
        // Step 1: Direct train query for commute route
        const step1 = await this.runToolStep('search_trains', '板橋到桃園明天7點到8點');
        this.testRunner.expect(step1.success).toBe(true);
        
        // Step 2: Specific train number lookup
        const step2 = await this.runToolStep('search_trains', '1234號列車');
        this.testRunner.expect(step2.success).toBe(true);
        
        // Both should provide quick, relevant information
        const efficientJourney = step1.success && step2.success;
        this.testRunner.expect(efficientJourney).toBe(true);
      });
    });

    // Family trip planning: Complex multi-destination
    await this.testRunner.describe('Family weekend trip planning', async () => {
      await this.testRunner.test('Multi-destination trip with scenic routes', async () => {
        // Step 1: Plan trip to Sun Moon Lake
        const step1 = await this.runToolStep('plan_trip', '台北到日月潭');
        this.testRunner.expect(step1.responseText).toInclude(['日月潭', '車埕']);
        
        // Step 2: Check specific connection trains
        const step2 = await this.runToolStep('search_trains', '台中到車埕');
        this.testRunner.expect(step2.success).toBe(true);
        
        // Step 3: Plan return journey
        const step3 = await this.runToolStep('plan_trip', '車埕回台北');
        this.testRunner.expect(step3.success).toBe(true);
        
        // Should support complex journey planning
        const complexJourneySupport = step1.responseText.includes('車埕') && step2.success;
        this.testRunner.expect(complexJourneySupport).toBe(true);
      });
    });

    // Business traveler: Time-critical planning
    await this.testRunner.describe('Business traveler efficiency', async () => {
      await this.testRunner.test('Fast route planning with clear scope', async () => {
        // Step 1: Find fastest trains
        const step1 = await this.runToolStep('search_trains', '台北到高雄最快的班次');
        this.testRunner.expect(step1.success).toBe(true);
        
        // Step 2: Handle out-of-scope comparison
        const step2 = await this.runToolStep('search_trains', '高鐵和台鐵比較');
        this.testRunner.expect(step2.success).toBe(true);
        
        // Should handle both valid queries and scope limitations
        const businessEfficiency = step1.success && step2.success;
        this.testRunner.expect(businessEfficiency).toBe(true);
      });
    });

    // Adventure traveler: Branch line exploration
    await this.testRunner.describe('Adventure traveler branch lines', async () => {
      await this.testRunner.test('Navigate complex branch line connections', async () => {
        // Step 1: Plan trip to Pingxi (branch line)
        const step1 = await this.runToolStep('plan_trip', '台北到平溪放天燈');
        this.testRunner.expect(step1.responseText).toInclude(['平溪']);
        
        // Step 2: Check branch line local trains
        const step2 = await this.runToolStep('search_trains', '瑞芳到十分');
        this.testRunner.expect(step2.success).toBe(true);
        
        // Step 3: Continue along branch line
        const step3 = await this.runToolStep('plan_trip', '十分到菁桐');
        this.testRunner.expect(step3.success).toBe(true);
        
        // Should handle branch line complexity
        const branchLineSupport = step1.success && step2.success && step3.success;
        this.testRunner.expect(branchLineSupport).toBe(true);
      });
    });

    // Error recovery journey: User making mistakes
    await this.testRunner.describe('Confused user recovery', async () => {
      await this.testRunner.test('Guide user from confusion to useful information', async () => {
        // Step 1: User makes common mistake (landmarks as stations)
        const step1 = await this.runToolStep('search_trains', '台北101到信義區');
        this.testRunner.expect(step1.success).toBe(true);
        
        // Step 2: User tries to find "信義區" as station
        const step2 = await this.runToolStep('search_station', '信義區');
        this.testRunner.expect(step2.success).toBe(true);
        
        // Step 3: User tries plan_trip approach
        const step3 = await this.runToolStep('plan_trip', '台北車站到信義區');
        this.testRunner.expect(step3.success).toBe(true);
        
        // All tools should provide helpful guidance
        const recoverySupport = step1.success && step2.success && step3.success;
        this.testRunner.expect(recoverySupport).toBe(true);
      });
    });

    return this.testRunner.getResults();
  }
}

export default UserJourneyTests;