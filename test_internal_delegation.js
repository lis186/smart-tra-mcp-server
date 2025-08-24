#!/usr/bin/env node

/**
 * Internal Delegation Tests - Critical Functionality
 * Tests that plan_trip correctly uses search_trains internally
 * Verifies accuracy of multi-segment journey planning
 */

import { SmartTRAServer } from './dist/server.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

const server = new SmartTRAServer();

// Internal delegation test cases
const delegationTests = [
  {
    name: 'Direct Route Delegation',
    description: 'plan_trip should delegate to search_trains for direct routes',
    planTripQuery: '台北到台中',
    searchTrainsQuery: '台北到台中',
    expectedBehavior: 'Both should show similar train information',
    comparisonType: 'direct_route'
  },

  {
    name: 'Non-station Mapping Delegation',
    description: 'plan_trip should use search_trains after mapping destination',
    planTripQuery: '台北到九份',
    searchTrainsQuery: '台北到瑞芳',
    expectedBehavior: 'plan_trip should show trains to 瑞芳 (mapped destination)',
    comparisonType: 'mapped_destination'
  },

  {
    name: 'Transfer Journey - First Segment',
    description: 'plan_trip first segment should match direct search_trains',
    planTripQuery: '台北到平溪',
    searchTrainsQuery: '台北到瑞芳', // First segment
    expectedBehavior: 'First segment trains should match direct search',
    comparisonType: 'transfer_segment_1'
  },

  {
    name: 'Transfer Journey - Second Segment', 
    description: 'plan_trip second segment should use search_trains',
    planTripQuery: '台北到平溪',
    searchTrainsQuery: '瑞芳到平溪', // Second segment
    expectedBehavior: 'Second segment should show Pingxi Line trains',
    comparisonType: 'transfer_segment_2'
  },

  {
    name: 'Cross-Coast Transfer',
    description: 'plan_trip should handle complex transfers via search_trains',
    planTripQuery: '高雄到台東',
    searchTrainsQuery: '高雄到枋寮', // Expected first segment
    expectedBehavior: 'Should plan transfer at 枋寮',
    comparisonType: 'cross_coast_transfer'
  }
];

// Accuracy validation tests
const accuracyTests = [
  {
    name: 'Train Number Consistency',
    test: async () => {
      const planResult = await server.handlePlanTripForTest('台北到台中', '');
      const searchResult = await server.handleSearchTrainsForTest('台北到台中', '');
      
      return {
        planResult: planResult?.content?.[0]?.text || '',
        searchResult: searchResult?.content?.[0]?.text || '',
        comparison: 'train_numbers'
      };
    }
  },

  {
    name: 'Transfer Segment Accuracy',
    test: async () => {
      const planResult = await server.handlePlanTripForTest('台北到平溪', '');
      const segment1 = await server.handleSearchTrainsForTest('台北到瑞芳', '');
      const segment2 = await server.handleSearchTrainsForTest('瑞芳到平溪', '');
      
      return {
        planResult: planResult?.content?.[0]?.text || '',
        segment1: segment1?.content?.[0]?.text || '',
        segment2: segment2?.content?.[0]?.text || '',
        comparison: 'transfer_segments'
      };
    }
  }
];

function extractTrainNumbers(text) {
  // Extract train numbers like "152", "1234", "區間車 3456"
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
  
  return [...new Set(trainNumbers)]; // Remove duplicates
}

function extractStations(text) {
  // Extract station names mentioned in the response
  const stations = [];
  const stationPattern = /(台北|台中|高雄|花蓮|台東|瑞芳|平溪|九份|枋寮|嘉義|車埕|集集)/g;
  
  let match;
  while ((match = stationPattern.exec(text)) !== null) {
    stations.push(match[1]);
  }
  
  return [...new Set(stations)];
}

function extractDepartureArrivalTimes(text) {
  // Extract departure and arrival times
  const times = [];
  const timePattern = /(\d{2}:\d{2})/g;
  
  let match;
  while ((match = timePattern.exec(text)) !== null) {
    times.push(match[1]);
  }
  
  return times;
}

async function runDelegationTests() {
  console.log('='.repeat(80));
  console.log('INTERNAL DELEGATION TESTS - Testing plan_trip → search_trains');
  console.log('='.repeat(80));
  console.log();

  // Initialize server
  await server.loadStationDataForTest();

  const results = {
    passed: 0,
    failed: 0,
    details: []
  };

  for (const test of delegationTests) {
    console.log(`\n📋 ${test.name}`);
    console.log(`📝 Description: ${test.description}`);
    console.log('─'.repeat(60));

    try {
      console.log(`🔄 Running plan_trip: "${test.planTripQuery}"`);
      const planResult = await server.handlePlanTripForTest(test.planTripQuery, '');
      
      console.log(`🔄 Running search_trains: "${test.searchTrainsQuery}"`);
      const searchResult = await server.handleSearchTrainsForTest(test.searchTrainsQuery, '');

      const planText = planResult?.content?.[0]?.text || '';
      const searchText = searchResult?.content?.[0]?.text || '';

      // Analyze both responses
      const planAnalysis = {
        trainNumbers: extractTrainNumbers(planText),
        stations: extractStations(planText),
        times: extractDepartureArrivalTimes(planText),
        hasTransferInfo: planText.includes('轉車') || planText.includes('第一段'),
        hasNonStationWarning: planText.includes('不是火車站'),
        length: planText.length
      };

      const searchAnalysis = {
        trainNumbers: extractTrainNumbers(searchText),
        stations: extractStations(searchText),
        times: extractDepartureArrivalTimes(searchText),
        hasTrainInfo: searchText.includes('出發') || searchText.includes('抵達'),
        length: searchText.length
      };

      // Validate delegation based on test type
      let validationResults = {};
      
      switch (test.comparisonType) {
        case 'direct_route':
          validationResults = {
            trainsMatch: planAnalysis.trainNumbers.some(num => 
              searchAnalysis.trainNumbers.includes(num)),
            bothShowTrains: planAnalysis.trainNumbers.length > 0 && 
                           searchAnalysis.trainNumbers.length > 0,
            planNotShowingTransfer: !planAnalysis.hasTransferInfo
          };
          break;
          
        case 'mapped_destination':
          validationResults = {
            planShowsMapping: planAnalysis.hasNonStationWarning,
            planShowsTrains: planAnalysis.trainNumbers.length > 0,
            searchShowsTrains: searchAnalysis.trainNumbers.length > 0
          };
          break;
          
        case 'transfer_segment_1':
        case 'transfer_segment_2':
          validationResults = {
            planShowsTransfer: planAnalysis.hasTransferInfo,
            hasCommonTrains: planAnalysis.trainNumbers.some(num => 
              searchAnalysis.trainNumbers.includes(num)),
            bothHaveTrains: planAnalysis.trainNumbers.length > 0 && 
                          searchAnalysis.trainNumbers.length > 0
          };
          break;
          
        case 'cross_coast_transfer':
          validationResults = {
            planShowsTransfer: planAnalysis.hasTransferInfo,
            planMentionsTransferStation: planText.includes('枋寮'),
            searchShowsTrains: searchAnalysis.trainNumbers.length > 0
          };
          break;
      }

      const passed = Object.values(validationResults).every(result => result === true);

      console.log(`\n📊 Analysis Results:`);
      console.log(`   plan_trip trains: [${planAnalysis.trainNumbers.join(', ')}]`);
      console.log(`   search_trains trains: [${searchAnalysis.trainNumbers.join(', ')}]`);
      console.log(`   plan_trip stations: [${planAnalysis.stations.join(', ')}]`);
      console.log(`   search_trains stations: [${searchAnalysis.stations.join(', ')}]`);
      
      console.log(`\n✅ Validation Results:`);
      Object.entries(validationResults).forEach(([key, value]) => {
        console.log(`   ${key}: ${value ? '✅ PASS' : '❌ FAIL'}`);
      });
      
      console.log(`\n🏆 Overall Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);

      // Show sample responses
      if (planText.length > 0) {
        console.log(`\n📄 plan_trip sample (first 200 chars):`);
        console.log(`   "${planText.substring(0, 200)}..."`);
      }
      
      if (searchText.length > 0) {
        console.log(`\n📄 search_trains sample (first 200 chars):`);
        console.log(`   "${searchText.substring(0, 200)}..."`);
      }

      results.details.push({
        testName: test.name,
        passed,
        planAnalysis,
        searchAnalysis,
        validationResults,
        comparisonType: test.comparisonType
      });

      if (passed) results.passed++;
      else results.failed++;

    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.failed++;
      results.details.push({
        testName: test.name,
        passed: false,
        error: error.message
      });
    }
  }

  return results;
}

async function runAccuracyTests() {
  console.log('\n' + '='.repeat(80));
  console.log('ACCURACY VALIDATION TESTS');
  console.log('='.repeat(80));

  for (const test of accuracyTests) {
    console.log(`\n🎯 ${test.name}`);
    console.log('─'.repeat(40));

    try {
      const results = await test.test();
      
      if (results.comparison === 'train_numbers') {
        const planTrains = extractTrainNumbers(results.planResult);
        const searchTrains = extractTrainNumbers(results.searchResult);
        
        const commonTrains = planTrains.filter(num => searchTrains.includes(num));
        const overlap = commonTrains.length / Math.max(planTrains.length, searchTrains.length, 1);
        
        console.log(`plan_trip trains: [${planTrains.join(', ')}]`);
        console.log(`search_trains trains: [${searchTrains.join(', ')}]`);
        console.log(`Common trains: [${commonTrains.join(', ')}]`);
        console.log(`Overlap percentage: ${(overlap * 100).toFixed(1)}%`);
        console.log(`Result: ${overlap > 0.5 ? '✅ Good consistency' : '⚠️ Low consistency'}`);
      }
      
      if (results.comparison === 'transfer_segments') {
        const planTrains = extractTrainNumbers(results.planResult);
        const seg1Trains = extractTrainNumbers(results.segment1);
        const seg2Trains = extractTrainNumbers(results.segment2);
        
        console.log(`plan_trip total trains: [${planTrains.join(', ')}]`);
        console.log(`segment 1 trains: [${seg1Trains.join(', ')}]`);
        console.log(`segment 2 trains: [${seg2Trains.join(', ')}]`);
        
        const seg1Match = planTrains.some(num => seg1Trains.includes(num));
        const seg2Match = planTrains.some(num => seg2Trains.includes(num));
        
        console.log(`Segment 1 match: ${seg1Match ? '✅' : '❌'}`);
        console.log(`Segment 2 match: ${seg2Match ? '✅' : '❌'}`);
        console.log(`Overall: ${seg1Match && seg2Match ? '✅ Both segments match' : '⚠️ Some segments missing'}`);
      }

    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
  }
}

async function runAllTests() {
  try {
    const delegationResults = await runDelegationTests();
    await runAccuracyTests();

    console.log('\n' + '='.repeat(80));
    console.log('DELEGATION TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total tests: ${delegationResults.passed + delegationResults.failed}`);
    console.log(`Passed: ${delegationResults.passed} ✅`);
    console.log(`Failed: ${delegationResults.failed} ❌`);
    console.log(`Success rate: ${((delegationResults.passed / (delegationResults.passed + delegationResults.failed)) * 100).toFixed(1)}%`);

    // Analysis by comparison type
    const byType = {};
    delegationResults.details.forEach(detail => {
      if (!detail.error) {
        const type = detail.comparisonType;
        if (!byType[type]) byType[type] = { passed: 0, failed: 0 };
        if (detail.passed) byType[type].passed++;
        else byType[type].failed++;
      }
    });

    console.log(`\n📊 Results by Test Type:`);
    Object.entries(byType).forEach(([type, results]) => {
      const rate = (results.passed / (results.passed + results.failed) * 100).toFixed(1);
      console.log(`   ${type}: ${results.passed}/${results.passed + results.failed} (${rate}%)`);
    });

    console.log(`\n💡 KEY FINDINGS:`);
    console.log(`• plan_trip internal delegation to search_trains functionality`);
    console.log(`• Transfer detection and segment planning accuracy`);
    console.log(`• Destination mapping and train lookup consistency`);
    console.log(`• Multi-segment journey coordination effectiveness`);

  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch(error => {
  console.error('Failed to run delegation tests:', error);
  process.exit(1);
});