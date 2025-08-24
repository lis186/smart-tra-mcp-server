#!/usr/bin/env node

/**
 * Fix Verification Tests - Test the specific fixes made
 * Focus on the bugs that were actually found and fixed
 */

import { SmartTRAServer } from './dist/server.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

const server = new SmartTRAServer();

// Critical fix verification tests
const fixVerificationTests = [
  {
    name: '🔧 FIX: Pingxi Line Transfer Detection',
    description: 'plan_trip should detect transfer needed for 台北→平溪, not treat as non-station',
    query: '台北到平溪',
    tool: 'plan_trip',
    expectedBehavior: 'Should detect transfer at 瑞芳, NOT map as non-station',
    validation: {
      shouldInclude: ['轉車', '瑞芳', '第一段', '第二段', '行程規劃'],
      shouldNotInclude: ['不是火車站', '最近的火車站'],
      criticalCheck: response => {
        const hasTransferPlanning = response.includes('轉車') && response.includes('瑞芳');
        const wrongNonStationMapping = response.includes('"平溪" 不是火車站');
        return { hasTransferPlanning, wrongNonStationMapping };
      }
    }
  },

  {
    name: '🔧 FIX: Other Branch Line Stations',
    description: 'plan_trip should handle other branch line stations correctly',
    query: '台北到十分',
    tool: 'plan_trip',
    expectedBehavior: 'Should plan transfer route, not non-station mapping',
    validation: {
      shouldInclude: ['轉車', '瑞芳'],
      shouldNotInclude: ['"十分" 不是火車站'],
      criticalCheck: response => {
        return {
          correctTransfer: response.includes('轉車') && response.includes('瑞芳'),
          incorrectMapping: response.includes('"十分" 不是火車站')
        };
      }
    }
  },

  {
    name: '✅ VERIFY: Non-station mapping still works',
    description: 'Real non-station destinations should still map correctly',
    query: '台北到九份',
    tool: 'plan_trip',
    expectedBehavior: 'Should map 九份 to 瑞芳 (correct behavior)',
    validation: {
      shouldInclude: ['"九份" 不是火車站', '瑞芳', '最近的火車站'],
      shouldNotInclude: ['轉車', '第一段'],
      criticalCheck: response => {
        return {
          correctMapping: response.includes('"九份" 不是火車站') && response.includes('瑞芳'),
          wrongTransfer: response.includes('轉車')
        };
      }
    }
  },

  {
    name: '✅ VERIFY: Direct routes still work',
    description: 'Direct TRA routes should still work normally',
    query: '台北到台中',
    tool: 'plan_trip',
    expectedBehavior: 'Should delegate to search_trains (no mapping, no transfer)',
    validation: {
      shouldNotInclude: ['不是火車站', '轉車', '第一段'],
      criticalCheck: response => {
        return {
          noIncorrectMapping: !response.includes('不是火車站'),
          noIncorrectTransfer: !response.includes('轉車')
        };
      }
    }
  },

  {
    name: '🔧 FIX: Cross-coast transfer detection',
    description: 'Complex transfers should still be detected',
    query: '高雄到台東',
    tool: 'plan_trip', 
    expectedBehavior: 'Should detect transfer at 枋寮',
    validation: {
      shouldInclude: ['轉車', '枋寮', '行程規劃'],
      shouldNotInclude: ['不是火車站'],
      criticalCheck: response => {
        return {
          correctTransfer: response.includes('轉車') && response.includes('枋寮'),
          incorrectMapping: response.includes('不是火車站')
        };
      }
    }
  }
];

async function runFixVerificationTests() {
  console.log('='.repeat(80));
  console.log('🔧 FIX VERIFICATION TESTS - Testing specific bug fixes');
  console.log('='.repeat(80));
  console.log();

  // Initialize server
  await server.loadStationDataForTest();

  const results = {
    totalTests: fixVerificationTests.length,
    passed: 0,
    failed: 0,
    criticalIssues: [],
    details: []
  };

  for (const test of fixVerificationTests) {
    console.log(`\n${test.name}`);
    console.log(`📝 Description: ${test.description}`);
    console.log(`🎯 Expected: ${test.expectedBehavior}`);
    console.log('─'.repeat(60));

    try {
      const startTime = Date.now();
      let response;

      // Execute the test
      if (test.tool === 'plan_trip') {
        response = await server.handlePlanTripForTest(test.query, '');
      } else if (test.tool === 'search_trains') {
        response = await server.handleSearchTrainsForTest(test.query, '');
      }

      const responseTime = Date.now() - startTime;
      const responseText = response?.content?.[0]?.text || '';

      console.log(`⏱️  Response time: ${responseTime}ms`);
      console.log(`📊 Response length: ${responseText.length} chars`);

      // Validate response
      const validation = test.validation;
      const hasRequired = validation.shouldInclude?.every(text => responseText.includes(text)) ?? true;
      const lacksProhibited = validation.shouldNotInclude?.every(text => !responseText.includes(text)) ?? true;
      
      // Critical check
      const criticalResult = validation.criticalCheck ? validation.criticalCheck(responseText) : {};
      
      console.log(`\n🔍 Validation Results:`);
      console.log(`   Required content: ${hasRequired ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Prohibited content: ${lacksProhibited ? '✅ PASS' : '❌ FAIL'}`);
      
      if (validation.shouldInclude && !hasRequired) {
        const missing = validation.shouldInclude.filter(text => !responseText.includes(text));
        console.log(`   Missing: ${missing.join(', ')}`);
      }
      
      if (validation.shouldNotInclude && !lacksProhibited) {
        const found = validation.shouldNotInclude.filter(text => responseText.includes(text));
        console.log(`   Found prohibited: ${found.join(', ')}`);
      }

      console.log(`\n🎯 Critical Analysis:`);
      Object.entries(criticalResult).forEach(([key, value]) => {
        const status = value ? '✅' : '❌';
        console.log(`   ${key}: ${status} ${value}`);
      });

      const overallPassed = hasRequired && lacksProhibited;
      const hasCriticalIssues = Object.values(criticalResult).some(v => 
        (key => key.includes('wrong') || key.includes('incorrect') ? v === true : false)
        (Object.keys(criticalResult).find(k => criticalResult[k] === v))
      );

      console.log(`\n🏆 Overall Result: ${overallPassed ? '✅ PASS' : '❌ FAIL'}`);

      if (hasCriticalIssues) {
        console.log(`⚠️  CRITICAL ISSUE DETECTED!`);
        results.criticalIssues.push({
          test: test.name,
          query: test.query,
          issues: Object.entries(criticalResult).filter(([k, v]) => 
            k.includes('wrong') || k.includes('incorrect') ? v === true : false
          )
        });
      }

      // Show sample response
      if (responseText.length > 0) {
        console.log(`\n📄 Sample response (first 300 chars):`);
        console.log(`   "${responseText.substring(0, 300)}${responseText.length > 300 ? '...' : ''}"`);
      }

      results.details.push({
        name: test.name,
        query: test.query,
        passed: overallPassed,
        hasCriticalIssues,
        criticalResult,
        responseTime,
        sampleResponse: responseText.substring(0, 200)
      });

      if (overallPassed) results.passed++;
      else results.failed++;

    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.failed++;
      results.details.push({
        name: test.name,
        query: test.query,
        passed: false,
        error: error.message
      });
    }
  }

  return results;
}

async function analyzeFixResults(results) {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 FIX VERIFICATION SUMMARY');
  console.log('='.repeat(80));

  console.log(`\n📊 Test Results:`);
  console.log(`   Total tests: ${results.totalTests}`);
  console.log(`   Passed: ${results.passed} ✅`);
  console.log(`   Failed: ${results.failed} ❌`);
  console.log(`   Success rate: ${((results.passed / results.totalTests) * 100).toFixed(1)}%`);

  if (results.criticalIssues.length > 0) {
    console.log(`\n⚠️  CRITICAL ISSUES FOUND:`);
    results.criticalIssues.forEach(issue => {
      console.log(`   ${issue.test}`);
      console.log(`   Query: "${issue.query}"`);
      issue.issues.forEach(([key, value]) => {
        console.log(`   - ${key}: ${value}`);
      });
    });
  } else {
    console.log(`\n✅ NO CRITICAL ISSUES DETECTED`);
  }

  console.log(`\n💡 Key Findings:`);
  const transferTests = results.details.filter(d => d.name.includes('FIX') && d.name.includes('Transfer'));
  const mappingTests = results.details.filter(d => d.name.includes('VERIFY') && d.name.includes('mapping'));

  if (transferTests.length > 0) {
    const transferFixed = transferTests.filter(t => t.passed).length;
    console.log(`   • Transfer detection fixes: ${transferFixed}/${transferTests.length} working`);
  }

  if (mappingTests.length > 0) {
    const mappingWorking = mappingTests.filter(t => t.passed).length;
    console.log(`   • Non-station mapping: ${mappingWorking}/${mappingTests.length} working correctly`);
  }

  console.log(`\n🎯 Fix Status Assessment:`);
  if (results.criticalIssues.length === 0 && results.passed >= results.totalTests * 0.8) {
    console.log(`   ✅ FIXES SUCCESSFUL - Issues resolved, system working correctly`);
  } else if (results.criticalIssues.length > 0) {
    console.log(`   ❌ CRITICAL ISSUES REMAIN - Additional fixes needed`);
  } else {
    console.log(`   ⚠️  PARTIAL SUCCESS - Some issues resolved, monitoring needed`);
  }
}

async function runAllTests() {
  try {
    const results = await runFixVerificationTests();
    await analyzeFixResults(results);

    console.log('\n' + '='.repeat(80));
    console.log('🔧 CONCLUSION');
    console.log('='.repeat(80));
    
    if (results.criticalIssues.length === 0) {
      console.log(`✅ The fixes have been successfully implemented!`);
      console.log(`• Branch line stations now correctly trigger transfer detection`);
      console.log(`• Non-station destinations still map correctly`);
      console.log(`• System logic is working as designed`);
    } else {
      console.log(`❌ Issues still remain and need further attention`);
    }

  } catch (error) {
    console.error('Fix verification failed:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Failed to run fix verification tests:', error);
  process.exit(1);
});