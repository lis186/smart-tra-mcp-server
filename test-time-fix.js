#!/usr/bin/env node

/**
 * Test script to verify time parsing bug fix
 * Tests various time-based queries to ensure they filter correctly
 */

import { QueryParser } from './dist/query-parser.js';

const parser = new QueryParser();

// Test cases
const testCases = [
  "明天早上8點台北到高雄",
  "今天下午2點板橋到桃園",
  "後天晚上台中到台北",
  "明天早上6點台北到台中最快",
  "今天晚上7點高雄到台北直達車"
];

console.log('Testing Query Parser Time Extraction:\n');
console.log('=' .repeat(50));

testCases.forEach((query, index) => {
  console.log(`\nTest ${index + 1}: "${query}"`);
  const parsed = parser.parse(query);
  console.log(`  Origin: ${parsed.origin || 'N/A'}`);
  console.log(`  Destination: ${parsed.destination || 'N/A'}`);
  console.log(`  Date: ${parsed.date || 'N/A'}`);
  console.log(`  Time: ${parsed.time || 'N/A'}`);
  console.log(`  Preferences:`, parsed.preferences || {});
  console.log(`  Confidence: ${parsed.confidence}`);
});

console.log('\n' + '=' .repeat(50));
console.log('\nKey findings:');
console.log('1. Query parser should extract time from queries');
console.log('2. Time should be in HH:MM format');
console.log('3. Date should be in YYYY-MM-DD format');
console.log('4. Both values should be passed to filterCommuterTrains');