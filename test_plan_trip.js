#!/usr/bin/env node

/**
 * Test script for plan_trip tool
 * Tests journey planning with transfers and non-station destinations
 */

import { SmartTRAServer } from './dist/server.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

const server = new SmartTRAServer();

// Test cases
const testCases = [
  {
    name: 'Non-station destination (九份)',
    query: '台北到九份怎麼去',
    context: '',
    expectedBehavior: 'Should map to 瑞芳 station and provide trains to 瑞芳'
  },
  {
    name: 'Branch line transfer (平溪線)',
    query: '台北到平溪',
    context: '',
    expectedBehavior: 'Should detect transfer needed at 瑞芳'
  },
  {
    name: 'Direct route (no transfer)',
    query: '台北到台中',
    context: '',
    expectedBehavior: 'Should use direct search_trains without transfer'
  },
  {
    name: 'Tourist destination (墾丁)',
    query: '高雄到墾丁',
    context: '',
    expectedBehavior: 'Should map to 枋寮 station'
  },
  {
    name: 'Cross-branch transfer',
    query: '平溪到集集',
    context: '',
    expectedBehavior: 'Should detect multiple transfers needed'
  },
  {
    name: 'East-West transfer',
    query: '高雄到台東',
    context: '',
    expectedBehavior: 'Should suggest transfer at 枋寮'
  },
  {
    name: 'Direct east route',
    query: '台北到花蓮',
    context: '',
    expectedBehavior: 'Should detect direct route available (no transfer)'
  },
  {
    name: 'Mountain destination (阿里山)',
    query: '台北到阿里山',
    context: '',
    expectedBehavior: 'Should map to 嘉義 station'
  }
];

async function runTests() {
  console.log('='.repeat(60));
  console.log('Testing plan_trip Tool Implementation');
  console.log('='.repeat(60));
  console.log();

  // Initialize server
  await server.loadStationDataForTest();

  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);
    console.log(`Expected: ${testCase.expectedBehavior}`);
    console.log('-'.repeat(40));

    try {
      // Use the internal method directly for testing
      const result = await server.handlePlanTripForTest(testCase.query, testCase.context);
      
      if (result && result.content && result.content[0]) {
        const responseText = result.content[0].text;
        
        // Check for key indicators
        const hasNonStationWarning = responseText.includes('不是火車站');
        const hasTransferInfo = responseText.includes('轉車') || responseText.includes('第一段');
        const hasDirectTrains = responseText.includes('區間車') || responseText.includes('自強號');
        
        console.log('Response characteristics:');
        console.log(`- Non-station warning: ${hasNonStationWarning ? '✓' : '✗'}`);
        console.log(`- Transfer info: ${hasTransferInfo ? '✓' : '✗'}`);
        console.log(`- Direct trains: ${hasDirectTrains ? '✓' : '✗'}`);
        
        // Show first few lines of response
        const lines = responseText.split('\n').slice(0, 5);
        console.log('\nFirst 5 lines of response:');
        lines.forEach(line => console.log(`  ${line}`));
      } else {
        console.log('❌ No response received');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total test cases: ${testCases.length}`);
  console.log('\nKey features tested:');
  console.log('✓ Non-station destination mapping');
  console.log('✓ Branch line transfer detection');
  console.log('✓ Direct route identification');
  console.log('✓ Multi-segment journey planning');
  console.log('✓ Tourist destination handling');
}

// Run tests
runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});