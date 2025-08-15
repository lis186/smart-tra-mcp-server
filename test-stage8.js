#!/usr/bin/env node

// Quick test script for Stage 8 optimizations
// Test the response size improvements

import { SmartTRAServer } from './dist/server.js';

async function testResponseSizes() {
  console.log('🧪 Testing Stage 8 Response Size Optimizations...\n');
  
  const server = new SmartTRAServer();
  
  // Test different query types
  const testQueries = [
    '台北到台中最快的車',           // Should show ~5 trains
    '台北到台中明天早上',           // Should show ~10 trains  
    '台北到台中所有班次',           // Should show more trains
    '台北到台中 with JSON data'     // Should include JSON
  ];
  
  for (const query of testQueries) {
    console.log(`📝 Testing query: "${query}"`);
    
    try {
      // Test the search_trains tool directly
      const result = await server.handleSearchTrains(query);
      const response = result.content[0].text;
      
      // Count approximate tokens (rough estimate: 1 token ≈ 4 characters)
      const approximateTokens = Math.round(response.length / 4);
      
      console.log(`   Response length: ${response.length} chars (~${approximateTokens} tokens)`);
      console.log(`   Contains JSON: ${response.includes('```json')}`);
      console.log(`   Contains "more available": ${response.includes('more trains available')}`);
      console.log('');
      
      // Show first 200 characters of response
      console.log(`   Preview: ${response.substring(0, 200)}...`);
      console.log('   ' + '-'.repeat(50));
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
}

// For quick testing without full MCP server setup
async function mockTest() {
  console.log('🧪 Mock Test for Stage 8 Optimizations...\n');
  
  // Simulate the optimization logic
  const testData = {
    filteredResults: Array.from({length: 25}, (_, i) => ({
      trainNo: `${1000 + i}`,
      trainType: '區間車',
      departureTime: '08:00',
      arrivalTime: '09:30',
      travelTime: '1h 30m',
      isMonthlyPassEligible: true
    }))
  };
  
  const RESPONSE_CONSTANTS = {
    MAX_TRAINS_FOR_SIMPLE_QUERY: 5,
    MAX_TRAINS_IN_JSON: 10,
    COMPACT_JSON: true,
    INCLUDE_FULL_JSON: false
  };
  
  function getOptimalTrainCount(query, totalResults) {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('最快') || lowerQuery.includes('fastest')) {
      return Math.min(RESPONSE_CONSTANTS.MAX_TRAINS_FOR_SIMPLE_QUERY, totalResults);
    }
    
    return Math.min(RESPONSE_CONSTANTS.MAX_TRAINS_IN_JSON, totalResults);
  }
  
  const queries = [
    '台北到台中最快的車',
    '台北到台中明天早上',
    '台北到台中所有班次'
  ];
  
  queries.forEach(query => {
    const count = getOptimalTrainCount(query, testData.filteredResults.length);
    console.log(`Query: "${query}"`);
    console.log(`  Would show: ${count} out of ${testData.filteredResults.length} trains`);
    console.log(`  Reduction: ${Math.round((1 - count/testData.filteredResults.length) * 100)}%\n`);
  });
}

// Run mock test (safer for CI/testing)
mockTest().catch(console.error);