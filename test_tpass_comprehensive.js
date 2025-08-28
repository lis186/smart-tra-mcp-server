#!/usr/bin/env node

/**
 * Comprehensive TPASS functionality test
 * Tests real-world scenarios and edge cases
 */

import { TrainService } from './dist/services/train-service.js';
import { ErrorHandler } from './dist/core/error-handler.js';

// Mock AuthManager for testing
class MockAuthManager {
  async apiRequest() {
    return { ok: false, status: 404 }; // Not needed for TPASS test
  }
}

async function testTPASS() {
  console.log('🧪 Comprehensive TPASS Monthly Pass Testing\n');

  const errorHandler = new ErrorHandler();
  const mockAuth = new MockAuthManager();
  const trainService = new TrainService(mockAuth, errorHandler);

  const testCategories = [
    {
      name: "🏢 Common Commuter Routes (Same Region)",
      tests: [
        // 基北北桃 commuter routes
        ['1000', '1010', 'eligible', '台北 → 板橋 (基北北桃)'],
        ['1000', '1020', 'eligible', '台北 → 桃園 (基北北桃)'], 
        ['0900', '1000', 'eligible', '基隆 → 台北 (基北北桃)'],
        ['1010', '1030', 'eligible', '板橋 → 中壢 (基北北桃)'],
        
        // 中彰投苗 commuter routes  
        ['3300', '3320', 'eligible', '台中 → 彰化 (中彰投苗)'],
        ['3210', '3300', 'eligible', '豐原 → 台中 (中彰投苗)'],
        ['2210', '3210', 'eligible', '苗栗 → 豐原 (中彰投苗)'],
        
        // 南高屏 commuter routes
        ['4300', '5000', 'eligible', '台南 → 高雄 (南高屏)'],
        ['5000', '6000', 'eligible', '高雄 → 屏東 (南高屏)'],
        ['5000', '5010', 'eligible', '高雄 → 鳳山 (南高屏)']
      ]
    },
    
    {
      name: "🌍 Popular Cross-Region Routes (Not TPASS Eligible)",
      tests: [
        // North-Central Taiwan
        ['1000', '3300', 'cross-region', '台北 → 台中 (基北北桃 → 中彰投苗)'],
        ['1020', '3300', 'cross-region', '桃園 → 台中 (基北北桃 → 中彰投苗)'],
        
        // Central-South Taiwan  
        ['3300', '5000', 'cross-region', '台中 → 高雄 (中彰投苗 → 南高屏)'],
        ['3300', '4300', 'cross-region', '台中 → 台南 (中彰投苗 → 南高屏)'],
        
        // North-South long distance
        ['1000', '5000', 'cross-region', '台北 → 高雄 (基北北桃 → 南高屏)'],
        ['1000', '6000', 'cross-region', '台北 → 屏東 (基北北桃 → 南高屏)'],
        
        // East-West cross regions
        ['1000', '7000', 'cross-region', '台北 → 宜蘭 (基北北桃 → 北宜)'],
        ['3300', '7300', 'cross-region', '台中 → 花蓮 (中彰投苗 → 花蓮)'],
      ]
    },
    
    {
      name: "🏝️ East Coast & Regional Routes",
      tests: [
        // 北宜 (Taiwan-Yilan) routes
        ['7000', '7010', 'eligible', '蘇澳 → 新城 (北宜)'],
        ['7050', '7100', 'eligible', '羅東 → 冬山 (北宜)'],
        
        // 花蓮 routes  
        ['7300', '7400', 'eligible', '花蓮 → 光復 (花蓮)'],
        ['7300', '7320', 'eligible', '花蓮 → 壽豐 (花蓮)'],
        
        // 臺東 routes
        ['8000', '8050', 'eligible', '台東 → 關山 (臺東)'],
        ['8100', '8150', 'eligible', '池上 → 鹿野 (臺東)'],
        
        // East coast cross-region
        ['7300', '8000', 'cross-region', '花蓮 → 台東 (花蓮 → 臺東)'],
      ]
    },
    
    {
      name: "🚫 Edge Cases & Error Handling", 
      tests: [
        // Invalid station IDs
        ['9999', '8888', 'not-covered', '不存在的車站'],
        ['0000', '1111', 'not-covered', '無效車站代碼'],
        
        // Partial invalid (one valid, one invalid)
        ['1000', '9999', 'not-covered', '台北 → 無效車站'],
        ['9999', '3300', 'not-covered', '無效車站 → 台中'],
        
        // Empty/null cases would be handled by the calling function
      ]
    },
    
    {
      name: "🔄 Region Boundary Cases",
      tests: [
        // Stations that might be near region boundaries
        ['1100', '1110', 'eligible', '楊梅 → 富岡 (桃竹竹苗邊界)'],
        ['2210', '3210', 'eligible', '苗栗 → 豐原 (桃竹竹苗 → 中彰投苗重疊)'],
        
        // Check regions with overlapping coverage
        ['1100', '1200', 'eligible', '楊梅 → 新竹 (桃竹竹苗)'],
        ['4200', '4300', 'cross-region', '嘉義 → 台南 (嘉義 → 南高屏)'],
      ]
    }
  ];

  let totalTests = 0;
  let totalPassed = 0;

  for (const category of testCategories) {
    console.log(`\n${category.name}`);
    console.log('='.repeat(50));
    
    let categoryPassed = 0;
    
    for (const [originId, destId, expected, description] of category.tests) {
      totalTests++;
      
      try {
        const result = trainService.getTPASSRegion(originId, destId);
        
        let testPassed = false;
        if (expected === 'eligible' && result.isEligible) {
          testPassed = true;
        } else if (expected === 'cross-region' && !result.isEligible && result.message.includes('跨區')) {
          testPassed = true;  
        } else if (expected === 'not-covered' && !result.isEligible && !result.message.includes('跨區')) {
          testPassed = true;
        }
        
        const statusIcon = testPassed ? '✅' : '❌';
        const truncatedMessage = result.message.length > 30 ? 
          result.message.substring(0, 27) + '...' : result.message;
        
        console.log(`  ${statusIcon} ${description}`);
        console.log(`     ${truncatedMessage}`);
        
        if (testPassed) {
          categoryPassed++;
          totalPassed++;
        } else {
          console.log(`     Expected: ${expected}, Got: ${result.isEligible ? 'eligible' : 'not-eligible'}`);
        }
        
      } catch (error) {
        console.log(`  ❌ ${description}`);
        console.log(`     ERROR: ${error.message}`);
      }
    }
    
    console.log(`\n  📊 Category Results: ${categoryPassed}/${category.tests.length} passed\n`);
  }

  // Final summary
  console.log('='.repeat(60));
  console.log(`📈 COMPREHENSIVE TEST RESULTS`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalTests - totalPassed}`);
  console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  
  if (totalPassed === totalTests) {
    console.log('\n🎉 ALL COMPREHENSIVE TESTS PASSED!');
    console.log('✨ TPASS functionality is production-ready');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed - review implementation');
    process.exit(1);
  }
}

// Run tests
testTPASS().catch(error => {
  console.error('Comprehensive test runner error:', error);
  process.exit(1);
});