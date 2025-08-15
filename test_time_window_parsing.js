import { QueryParser } from './dist/query-parser.js';

const parser = new QueryParser();

console.log('=== Testing Time Window Parsing ===\n');

const testQueries = [
  '台北到台中接下來6小時',
  '明天早上台北去高雄未來4小時',
  '接下來8小時板橋到桃園',
  '台北到台中接下來2小時',
  '台北到台中',  // No time window
  '接下來12個小時台南到高雄'
];

for (const query of testQueries) {
  console.log(`Query: "${query}"`);
  const result = parser.parse(query);
  
  console.log(`  Origin: ${result.origin || 'not found'}`);
  console.log(`  Destination: ${result.destination || 'not found'}`);
  console.log(`  Time Window: ${result.preferences?.timeWindowHours || 'default (2)'} hours`);
  console.log(`  Confidence: ${result.confidence}`);
  console.log(`  Matched Patterns: ${result.matchedPatterns.join(', ')}`);
  console.log('');
}

console.log('=== Summary ===');
console.log('✅ Parser should extract timeWindowHours from queries like "接下來6小時"');
console.log('✅ Server should use this value instead of default 2 hours');
console.log('✅ Response should show "接下來6小時" instead of "接下來2小時"');