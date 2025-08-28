#!/usr/bin/env node

/**
 * Simple TPASS functionality test
 * Tests basic region checking for key routes
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
  console.log('🧪 Testing TPASS Monthly Pass Functionality\n');

  const errorHandler = new ErrorHandler();
  const mockAuth = new MockAuthManager();
  const trainService = new TrainService(mockAuth, errorHandler);

  // Test cases: [originId, destId, expected]
  const testCases = [
    // Same region (should be eligible)
    ['1000', '1020', 'eligible'], // 台北 → 桃園 (基北北桃)
    ['3300', '3320', 'eligible'], // 台中 → 彰化 (中彰投苗)
    ['5000', '6000', 'eligible'], // 高雄 → 屏東 (南高屏)
    
    // Cross region (should not be eligible)
    ['1000', '3300', 'cross-region'], // 台北 → 台中 (基北北桃 → 中彰投苗)
    ['3300', '5000', 'cross-region'], // 台中 → 高雄 (中彰投苗 → 南高屏)
    
    // Not in TPASS coverage
    ['9999', '8888', 'not-covered'] // Invalid station IDs
  ];

  let passCount = 0;
  const totalTests = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const [originId, destId, expected] = testCases[i];
    
    try {
      const result = trainService.getTPASSRegion(originId, destId);
      
      console.log(`Test ${i + 1}: ${originId} → ${destId}`);
      console.log(`  Result: ${result.message}`);
      console.log(`  Eligible: ${result.isEligible}`);
      
      let testPassed = false;
      if (expected === 'eligible' && result.isEligible) {
        testPassed = true;
      } else if (expected === 'cross-region' && !result.isEligible && result.message.includes('跨區')) {
        testPassed = true;
      } else if (expected === 'not-covered' && !result.isEligible && !result.message.includes('跨區')) {
        testPassed = true;
      }
      
      console.log(`  Status: ${testPassed ? '✅ PASS' : '❌ FAIL'}`);
      
      if (testPassed) passCount++;
      
    } catch (error) {
      console.log(`  Status: ❌ ERROR - ${error.message}`);
    }
    
    console.log('');
  }

  console.log(`\n📊 Test Results: ${passCount}/${totalTests} tests passed`);
  
  if (passCount === totalTests) {
    console.log('🎉 All TPASS tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some TPASS tests failed');
    process.exit(1);
  }
}

// Run tests
testTPASS().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});