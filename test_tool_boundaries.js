#!/usr/bin/env node

/**
 * Test Tool Boundaries - Critical Tests
 * Tests the key differences between search_trains and plan_trip
 * Ensures each tool handles queries appropriately
 */

import { SmartTRAServer } from './dist/server.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

const server = new SmartTRAServer();

// Critical boundary test cases
const boundaryTests = [
  {
    name: 'Tool Boundary: Non-station destination (九份)',
    tests: [
      {
        tool: 'search_trains',
        query: '台北到九份',
        expected: 'Should fail or show error - cannot find station',
        shouldInclude: ['Station data', 'not available', '找不到', 'search_station'],
        shouldNotInclude: ['瑞芳', '不是火車站', '最近的火車站']
      },
      {
        tool: 'plan_trip',
        query: '台北到九份',
        expected: 'Should map to 瑞芳 with explanation',
        shouldInclude: ['瑞芳', '不是火車站', '最近的火車站'],
        shouldNotInclude: ['Station data not available']
      }
    ]
  },

  {
    name: 'Tool Boundary: Direct route (台北到台中)',
    tests: [
      {
        tool: 'search_trains',
        query: '台北到台中',
        expected: 'Shows direct trains with details',
        shouldInclude: ['自強號', '莒光號', '出發', '抵達', '票價'],
        shouldNotInclude: ['轉車', '第一段', '第二段', '不是火車站']
      },
      {
        tool: 'plan_trip', 
        query: '台北到台中',
        expected: 'Detects direct route, delegates to search_trains',
        shouldInclude: ['自強號', '莒光號', '出發', '抵達'],
        shouldNotInclude: ['轉車', '第一段', '第二段', '不是火車站']
      }
    ]
  },

  {
    name: 'Tool Boundary: Transfer required (台北到平溪)',
    tests: [
      {
        tool: 'search_trains',
        query: '台北到平溪',
        expected: 'Should fail or show error - no direct route',
        shouldInclude: ['Station data', 'not available', 'search_station'],
        shouldNotInclude: ['轉車', '瑞芳', '第一段']
      },
      {
        tool: 'plan_trip',
        query: '台北到平溪',
        expected: 'Should detect transfer needed at 瑞芳',
        shouldInclude: ['轉車', '瑞芳', '第一段', '第二段', '行程規劃'],
        shouldNotInclude: ['Station data not available']
      }
    ]
  },

  {
    name: 'Tool Boundary: Train number query (152號列車)',
    tests: [
      {
        tool: 'search_trains',
        query: '152號列車',
        expected: 'Should show specific train timetable',
        shouldInclude: ['152', '時刻表', '車站', '到達', '出發'],
        shouldNotInclude: ['轉車', '不是火車站', '行程規劃']
      },
      {
        tool: 'plan_trip',
        query: '152號列車',
        expected: 'Should handle gracefully or redirect to search_trains',
        // plan_trip might not be designed for train number queries
        validation: 'custom'
      }
    ]
  },

  {
    name: 'Tool Boundary: MRT destination (淡水)',
    tests: [
      {
        tool: 'search_trains',
        query: '台中到淡水',
        expected: 'Should fail - 淡水 not a TRA station',
        shouldInclude: ['Station data', 'not available', 'search_station'],
        shouldNotInclude: ['台北', '不是火車站', '最近的火車站']
      },
      {
        tool: 'plan_trip',
        query: '台中到淡水', 
        expected: 'Should map 淡水 to 台北 station',
        shouldInclude: ['淡水', '不是火車站', '台北', '最近的火車站'],
        shouldNotInclude: ['Station data not available']
      }
    ]
  }
];

// Performance comparison tests
const performanceTests = [
  {
    name: 'Performance: Direct route comparison',
    query: '台北到台中',
    tools: ['search_trains', 'plan_trip'],
    expectedMaxTime: 5000 // 5 seconds max for test environment
  }
];

async function runBoundaryTests() {
  console.log('='.repeat(80));
  console.log('TOOL BOUNDARY TESTS - Testing search_trains vs plan_trip');
  console.log('='.repeat(80));
  console.log();

  // Initialize server
  await server.loadStationDataForTest();

  const results = {
    passed: 0,
    failed: 0,
    details: []
  };

  for (const testGroup of boundaryTests) {
    console.log(`\n📋 ${testGroup.name}`);
    console.log('─'.repeat(60));

    for (const test of testGroup.tests) {
      console.log(`\n🔧 Tool: ${test.tool}`);
      console.log(`📝 Query: "${test.query}"`);
      console.log(`🎯 Expected: ${test.expected}`);

      try {
        const startTime = Date.now();
        let result;

        if (test.tool === 'search_trains') {
          result = await server.handleSearchTrainsForTest(test.query, '');
        } else if (test.tool === 'plan_trip') {
          result = await server.handlePlanTripForTest(test.query, '');
        }

        const responseTime = Date.now() - startTime;
        const responseText = result?.content?.[0]?.text || 'No response';

        // Analyze response
        const analysis = {
          hasRequiredContent: test.shouldInclude?.every(text => 
            responseText.includes(text)
          ) ?? true,
          lacksProhibitedContent: test.shouldNotInclude?.every(text => 
            !responseText.includes(text)
          ) ?? true,
          responseTime,
          responseLength: responseText.length
        };

        const passed = analysis.hasRequiredContent && analysis.lacksProhibitedContent;

        console.log(`⏱️  Response time: ${responseTime}ms`);
        console.log(`📊 Response length: ${responseText.length} chars`);
        console.log(`✅ Required content: ${analysis.hasRequiredContent ? 'PASS' : 'FAIL'}`);
        console.log(`❌ Prohibited content: ${analysis.lacksProhibitedContent ? 'PASS' : 'FAIL'}`);
        console.log(`🏆 Overall: ${passed ? '✅ PASS' : '❌ FAIL'}`);

        if (!analysis.hasRequiredContent) {
          console.log(`   Missing: ${test.shouldInclude?.filter(text => 
            !responseText.includes(text)
          ).join(', ')}`);
        }

        if (!analysis.lacksProhibitedContent) {
          console.log(`   Found prohibited: ${test.shouldNotInclude?.filter(text => 
            responseText.includes(text)
          ).join(', ')}`);
        }

        // Show sample response
        if (responseText.length > 0) {
          console.log(`\n📄 Sample response (first 200 chars):`);
          console.log(`   "${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}"`);
        }

        results.details.push({
          testGroup: testGroup.name,
          tool: test.tool,
          query: test.query,
          passed,
          analysis,
          responseText: responseText.substring(0, 500) // Store sample for analysis
        });

        if (passed) results.passed++;
        else results.failed++;

      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        results.failed++;
        results.details.push({
          testGroup: testGroup.name,
          tool: test.tool,
          query: test.query,
          passed: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

async function runPerformanceTests() {
  console.log('\n' + '='.repeat(80));
  console.log('PERFORMANCE COMPARISON TESTS');
  console.log('='.repeat(80));

  for (const test of performanceTests) {
    console.log(`\n📊 ${test.name}`);
    console.log(`Query: "${test.query}"`);
    console.log('─'.repeat(40));

    const results = {};

    for (const tool of test.tools) {
      try {
        const startTime = Date.now();
        
        let result;
        if (tool === 'search_trains') {
          result = await server.handleSearchTrainsForTest(test.query, '');
        } else if (tool === 'plan_trip') {
          result = await server.handlePlanTripForTest(test.query, '');
        }
        
        const responseTime = Date.now() - startTime;
        const responseText = result?.content?.[0]?.text || '';

        results[tool] = {
          responseTime,
          responseLength: responseText.length,
          success: responseText.length > 0
        };

        console.log(`${tool.padEnd(15)}: ${responseTime}ms, ${responseText.length} chars`);

      } catch (error) {
        results[tool] = {
          responseTime: -1,
          error: error.message
        };
        console.log(`${tool.padEnd(15)}: ERROR - ${error.message}`);
      }
    }

    // Compare results
    if (results.search_trains && results.plan_trip) {
      const timeDiff = results.plan_trip.responseTime - results.search_trains.responseTime;
      console.log(`\n📈 Analysis:`);
      console.log(`   plan_trip is ${timeDiff}ms ${timeDiff > 0 ? 'slower' : 'faster'} than search_trains`);
      console.log(`   Overhead: ${((timeDiff / results.search_trains.responseTime) * 100).toFixed(1)}%`);
    }
  }
}

async function runAllTests() {
  try {
    const boundaryResults = await runBoundaryTests();
    await runPerformanceTests();

    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total tests: ${boundaryResults.passed + boundaryResults.failed}`);
    console.log(`Passed: ${boundaryResults.passed} ✅`);
    console.log(`Failed: ${boundaryResults.failed} ❌`);
    console.log(`Success rate: ${((boundaryResults.passed / (boundaryResults.passed + boundaryResults.failed)) * 100).toFixed(1)}%`);

    // Show detailed failure analysis
    const failures = boundaryResults.details.filter(d => !d.passed);
    if (failures.length > 0) {
      console.log(`\n🔍 FAILURE ANALYSIS:`);
      failures.forEach(failure => {
        console.log(`\n❌ ${failure.testGroup} - ${failure.tool}`);
        console.log(`   Query: "${failure.query}"`);
        if (failure.error) {
          console.log(`   Error: ${failure.error}`);
        } else {
          console.log(`   Issue: Missing required content or found prohibited content`);
        }
      });
    }

    // Key insights
    console.log(`\n💡 KEY INSIGHTS:`);
    console.log(`• search_trains handles TRA station queries directly`);
    console.log(`• plan_trip maps non-station destinations and handles transfers`);
    console.log(`• Both tools should give consistent results for direct TRA routes`);
    console.log(`• Tool selection depends on user's knowledge of TRA network`);

  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch(error => {
  console.error('Failed to run boundary tests:', error);
  process.exit(1);
});