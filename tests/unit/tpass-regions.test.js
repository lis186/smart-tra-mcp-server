#!/usr/bin/env node

/**
 * TPASS Regional Monthly Pass Unit Tests  
 * Tests TPASS region checking logic and business rules
 */

import { SmartTRAServer } from '../../dist/server.js';
import { TestRunner } from '../lib/test-runner.js';

// Setup test environment
process.env.NODE_ENV = 'test';

class TPASSRegionsTests {
  constructor() {
    this.server = new SmartTRAServer();
    this.testRunner = new TestRunner('TPASS Regional Monthly Pass Tests');
  }

  async setup() {
    await this.server.loadStationDataForTest();
  }

  async runTests() {
    await this.setup();

    // Test Category 1: Metropolitan Commuter Routes
    await this.testRunner.describe('Metropolitan Commuter Routes - TPASS Eligible', async () => {
      const testCases = [
        // 基北北桃生活圈
        { origin: '1000', dest: '1010', expected: 'eligible', region: '基北北桃生活圈', desc: '台北 → 板橋' },
        { origin: '1000', dest: '1020', expected: 'eligible', region: '基北北桃生活圈', desc: '台北 → 桃園' },
        { origin: '0900', dest: '1000', expected: 'eligible', region: '基北北桃生活圈', desc: '基隆 → 台北' },
        
        // 中彰投苗生活圈
        { origin: '3300', dest: '3320', expected: 'eligible', region: '中彰投苗生活圈', desc: '台中 → 彰化' },
        { origin: '3210', dest: '3300', expected: 'eligible', region: '中彰投苗生活圈', desc: '豐原 → 台中' },
        
        // 南高屏生活圈
        { origin: '5000', dest: '5010', expected: 'eligible', region: '南高屏生活圈', desc: '高雄 → 鳳山' },
        { origin: '4300', dest: '5000', expected: 'eligible', region: '南高屏生活圈', desc: '台南 → 高雄' }
      ];

      for (const testCase of testCases) {
        await this.testRunner.test(testCase.desc, async () => {
          const result = this.server.trainService.getTPASSRegion(testCase.origin, testCase.dest);
          
          this.testRunner.expect(result.isEligible).toBe(true);
          this.testRunner.expect(result.regionName).toBe(testCase.region);
          this.testRunner.expect(result.message).toInclude('TPASS適用');
        });
      }
    });

    // Test Category 2: Regional Routes
    await this.testRunner.describe('Regional Routes - Smaller TPASS Zones', async () => {
      const testCases = [
        // 桃竹竹苗生活圈
        { origin: '1200', dest: '1300', expected: 'eligible', region: '桃竹竹苗生活圈', desc: '新竹 → 竹南' },
        { origin: '1100', dest: '1200', expected: 'eligible', region: '桃竹竹苗生活圈', desc: '楊梅 → 新竹' },
        
        // 東部區域
        { origin: '7000', dest: '7050', expected: 'eligible', region: '北宜生活圈', desc: '蘇澳 → 羅東' },
        { origin: '7300', dest: '7400', expected: 'eligible', region: '花蓮生活圈', desc: '花蓮 → 光復' },
        { origin: '8000', dest: '8100', expected: 'eligible', region: '臺東生活圈', desc: '台東 → 池上' },
        
        // 雲林與嘉義
        { origin: '4100', dest: '4150', expected: 'eligible', region: '雲林生活圈', desc: '斗六 → 石榴' },
        { origin: '4200', dest: '4250', expected: 'eligible', region: '嘉義生活圈', desc: '嘉義 → 民雄' }
      ];

      for (const testCase of testCases) {
        await this.testRunner.test(testCase.desc, async () => {
          const result = this.server.trainService.getTPASSRegion(testCase.origin, testCase.dest);
          
          this.testRunner.expect(result.isEligible).toBe(true);
          this.testRunner.expect(result.regionName).toBe(testCase.region);
        });
      }
    });

    // Test Category 3: Cross-Region Routes
    await this.testRunner.describe('Cross-Region Routes - NOT TPASS Eligible', async () => {
      const testCases = [
        { origin: '1000', dest: '3300', desc: '台北 → 台中 (基北北桃 → 中彰投苗)' },
        { origin: '1000', dest: '5000', desc: '台北 → 高雄 (基北北桃 → 南高屏)' },
        { origin: '3300', dest: '5000', desc: '台中 → 高雄 (中彰投苗 → 南高屏)' },
        { origin: '1000', dest: '7000', desc: '台北 → 宜蘭 (基北北桃 → 北宜)' },
        { origin: '7300', dest: '8000', desc: '花蓮 → 台東 (花蓮 → 臺東)' },
        { origin: '4200', dest: '4300', desc: '嘉義 → 台南 (嘉義 → 南高屏)' }
      ];

      for (const testCase of testCases) {
        await this.testRunner.test(testCase.desc, async () => {
          const result = this.server.trainService.getTPASSRegion(testCase.origin, testCase.dest);
          
          this.testRunner.assert(result.isEligible === false, 
            `${testCase.desc} should NOT be TPASS eligible`);
          this.testRunner.assert(result.message.includes('跨區購票'), 
            `${testCase.desc} should show 跨區購票 message`);
        });
      }
    });

    // Test Category 4: Edge Cases
    await this.testRunner.describe('Edge Cases and Error Handling', async () => {
      await this.testRunner.test('無效車站代碼', async () => {
        const testCases = [
          ['9999', '8888'],
          ['0000', '1111'], 
          ['1000', '9999'],
          ['9999', '3300']
        ];

        for (const [originId, destId] of testCases) {
          const result = this.server.trainService.getTPASSRegion(originId, destId);
          
          this.testRunner.assert(result.isEligible === false, 
            `${originId} → ${destId} should NOT be TPASS eligible`);
          this.testRunner.assert(result.message.includes('不適用此路線'), 
            `${originId} → ${destId} should show 不適用此路線 message`);
        }
      });

      await this.testRunner.test('區域邊界案例', async () => {
        // Test boundary cases that should work correctly
        let result = this.server.trainService.getTPASSRegion('1100', '1200'); // 楊梅 → 新竹
        this.testRunner.assert(result.isEligible === true, '楊梅 → 新竹 should be TPASS eligible');
        this.testRunner.assert(result.regionName === '桃竹竹苗生活圈', 
          '楊梅 → 新竹 should be in 桃竹竹苗生活圈');
        
        // Test overlapping coverage (苗栗 in multiple regions, should work)
        result = this.server.trainService.getTPASSRegion('2210', '3210'); // 苗栗 → 豐原  
        this.testRunner.assert(result.isEligible === true, '苗栗 → 豐原 should be TPASS eligible');
        this.testRunner.assert(result.regionName === '中彰投苗生活圈', 
          '苗栗 → 豐原 should be in 中彰投苗生活圈');
      });

      await this.testRunner.test('相同車站查詢', async () => {
        const result = this.server.trainService.getTPASSRegion('1000', '1000'); // 台北 → 台北
        this.testRunner.assert(result.isEligible === true, '相同車站應該顯示為 TPASS eligible');
        this.testRunner.assert(result.regionName === '基北北桃生活圈', 
          '台北 → 台北 should be in 基北北桃生活圈');
      });
    });

    // Test Category 5: Business Logic Validation
    await this.testRunner.describe('Business Logic and Data Validation', async () => {
      await this.testRunner.test('TPASS 區域價格資訊', async () => {
        const result = this.server.trainService.getTPASSRegion('1000', '1020'); // 台北 → 桃園
        this.testRunner.assert(result.price !== undefined, 'TPASS price should be included');
        this.testRunner.assert(typeof result.price === 'number', 'TPASS price should be a number');
        this.testRunner.assert(result.price > 0, 'TPASS price should be positive');
      });

      await this.testRunner.test('所有區域覆蓋驗證', async () => {
        const regionTestCases = [
          ['1000', '1020', '基北北桃生活圈'],
          ['1200', '1300', '桃竹竹苗生活圈'],
          ['3300', '3320', '中彰投苗生活圈'],
          ['4100', '4150', '雲林生活圈'],
          ['4200', '4250', '嘉義生活圈'],
          ['5000', '6000', '南高屏生活圈'],
          ['7000', '7050', '北宜生活圈'],
          ['7300', '7400', '花蓮生活圈'],
          ['8000', '8100', '臺東生活圈']
        ];
        
        for (const [originId, destId, expectedRegion] of regionTestCases) {
          const result = this.server.trainService.getTPASSRegion(originId, destId);
          this.testRunner.assert(result.isEligible === true, 
            `${expectedRegion} should be accessible`);
          this.testRunner.assert(result.regionName === expectedRegion, 
            `Region should match ${expectedRegion}`);
        }
      });

      await this.testRunner.test('訊息格式一致性', async () => {
        // Eligible messages should have consistent format
        const eligibleResult = this.server.trainService.getTPASSRegion('1000', '1020');
        this.testRunner.assert(eligibleResult.message.includes('TPASS適用'), 
          'Eligible messages should start with TPASS適用');
        this.testRunner.assert(eligibleResult.message.includes('✅'), 
          'Eligible messages should include success emoji');
        
        // Cross-region messages should have consistent format  
        const crossRegionResult = this.server.trainService.getTPASSRegion('1000', '3300');
        this.testRunner.assert(crossRegionResult.message.includes('TPASS:'), 
          'Cross-region messages should start with TPASS:');
        this.testRunner.assert(crossRegionResult.message.includes('❌'), 
          'Cross-region messages should include error emoji');
        
        // Not covered messages should have consistent format
        const notCoveredResult = this.server.trainService.getTPASSRegion('9999', '8888');
        this.testRunner.assert(notCoveredResult.message.includes('TPASS:'), 
          'Not covered messages should start with TPASS:');
        this.testRunner.assert(!notCoveredResult.message.includes('✅'), 
          'Not covered messages should not include success emoji');
      });
    });

    return this.testRunner.getResults();
  }
}

export default TPASSRegionsTests;