#!/usr/bin/env node

/**
 * Test script for verifying MRT destinations now map to TRA stations
 */

import { SmartTRAServer } from './dist/server.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

const server = new SmartTRAServer();

// Test cases for MRT-area destinations
const testCases = [
  {
    name: 'Danshui (MRT) → TRA Taipei',
    query: '桃園到淡水',
    expectedStation: '台北',
    description: 'Should map 淡水 (MRT) to TRA 台北 station'
  },
  {
    name: 'Beitou (MRT) → TRA Taipei',
    query: '新竹到北投',
    expectedStation: '台北',
    description: 'Should map 北投 (MRT) to TRA 台北 station'
  },
  {
    name: 'Yangmingshan → TRA Taipei',
    query: '台中到陽明山',
    expectedStation: '台北',
    description: 'Should map 陽明山 to TRA 台北 station'
  },
  {
    name: 'Verify TRA branch line still works',
    query: '台北到平溪',
    expectedStation: '平溪',
    description: 'Should still correctly map to TRA 平溪 station'
  }
];

async function runTests() {
  console.log('='.repeat(60));
  console.log('Testing MRT → TRA Station Mappings');
  console.log('='.repeat(60));
  console.log();

  // Initialize server
  await server.loadStationDataForTest();

  for (const test of testCases) {
    console.log(`\nTest: ${test.name}`);
    console.log(`Query: "${test.query}"`);
    console.log(`Expected: Maps to TRA ${test.expectedStation} station`);
    console.log('-'.repeat(40));

    try {
      const result = await server.handlePlanTripForTest(test.query, '');
      
      if (result && result.content && result.content[0]) {
        const responseText = result.content[0].text;
        
        // Check if the expected TRA station is mentioned
        const hasExpectedStation = responseText.includes(test.expectedStation);
        const hasNonStationWarning = responseText.includes('不是火車站');
        const mentionedStation = responseText.match(/最近的火車站: \*\*(.+?)\*\*/)?.[1];
        
        console.log(`✓ Non-station warning shown: ${hasNonStationWarning ? 'Yes' : 'No'}`);
        console.log(`✓ Mapped to station: ${mentionedStation || 'N/A'}`);
        console.log(`✓ Correct mapping: ${hasExpectedStation ? '✅ PASS' : '❌ FAIL'}`);
        
        if (!hasExpectedStation) {
          console.log('\nFirst 3 lines of response:');
          responseText.split('\n').slice(0, 3).forEach(line => 
            console.log(`  ${line}`)
          );
        }
      } else {
        console.log('❌ No response received');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary: MRT destinations should now map to TRA Taipei');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});