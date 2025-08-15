import { QueryParser } from './dist/query-parser.js';

const parser = new QueryParser();

console.log('=== Testing Realistic User Query Cases ===\n');

const testQueries = [
  '台北到台中接下來6小時',
  '明天早上8點板橋到桃園最快', 
  '今天下午高雄到台南月票可搭',
  '接下來4小時台中到台北自強號',
  '板橋去桃園直達車',
  '明天台北到高雄最便宜的',
  '後天晚上台南到台中',
  '現在松山到板橋',
  '接下來8小時台東到花蓮',
  '明天中午嘉義到台北莒光號'
];

console.log('📊 **Query Parsing Results:**\n');

testQueries.forEach((query, index) => {
  console.log(`${index + 1}. "${query}"`);
  const result = parser.parse(query);
  
  console.log(`   📍 Route: ${result.origin || '❌'} → ${result.destination || '❌'}`);
  console.log(`   📅 Date: ${result.date || 'today'}`);
  console.log(`   ⏰ Time: ${result.time || 'current'}`);
  
  if (result.preferences) {
    const prefs = [];
    if (result.preferences.timeWindowHours) prefs.push(`${result.preferences.timeWindowHours}小時窗口`);
    if (result.preferences.fastest) prefs.push('最快');
    if (result.preferences.cheapest) prefs.push('最便宜');
    if (result.preferences.directOnly) prefs.push('直達');
    if (result.preferences.trainType) prefs.push(`${result.preferences.trainType}號`);
    
    console.log(`   🎯 Preferences: ${prefs.length > 0 ? prefs.join(', ') : 'none'}`);
  }
  
  console.log(`   🎲 Confidence: ${result.confidence.toFixed(2)}`);
  console.log(`   ✅ Valid Query: ${result.confidence >= 0.4 ? 'YES' : 'NO'}`);
  console.log('');
});

// Analysis
console.log('📈 **Analysis:**\n');

const validQueries = testQueries.filter(q => parser.parse(q).confidence >= 0.4);
const timeWindowQueries = testQueries.filter(q => parser.parse(q).preferences?.timeWindowHours);
const trainTypeQueries = testQueries.filter(q => parser.parse(q).preferences?.trainType);
const timeSpecificQueries = testQueries.filter(q => parser.parse(q).time);
const dateSpecificQueries = testQueries.filter(q => parser.parse(q).date);

console.log(`✅ Valid queries: ${validQueries.length}/${testQueries.length} (${(validQueries.length/testQueries.length*100).toFixed(1)}%)`);
console.log(`⏰ Time window queries: ${timeWindowQueries.length}/${testQueries.length}`);
console.log(`🚂 Train type queries: ${trainTypeQueries.length}/${testQueries.length}`);
console.log(`🕐 Time-specific queries: ${timeSpecificQueries.length}/${testQueries.length}`);
console.log(`📅 Date-specific queries: ${dateSpecificQueries.length}/${testQueries.length}`);

console.log('\n🔍 **Key Features Test:**\n');

// Test specific features
const featureTests = [
  { feature: 'Time Window Parsing', query: '台北到台中接下來6小時', expect: 'timeWindowHours = 6' },
  { feature: 'Train Type Recognition', query: '台中到台北自強號', expect: 'trainType = 自強' },
  { feature: 'Speed Preference', query: '板橋到桃園最快', expect: 'fastest = true' },
  { feature: 'Direct Train', query: '板橋去桃園直達車', expect: 'directOnly = true' },
  { feature: 'Time Parsing', query: '明天早上8點台北到台中', expect: 'time = 08:00' },
  { feature: 'Date Parsing', query: '明天台北到高雄', expect: 'date detected' }
];

featureTests.forEach(test => {
  const result = parser.parse(test.query);
  let status = '❌';
  
  if (test.expect.includes('timeWindowHours')) {
    status = result.preferences?.timeWindowHours ? '✅' : '❌';
  } else if (test.expect.includes('trainType')) {
    status = result.preferences?.trainType ? '✅' : '❌';
  } else if (test.expect.includes('fastest')) {
    status = result.preferences?.fastest ? '✅' : '❌';
  } else if (test.expect.includes('directOnly')) {
    status = result.preferences?.directOnly ? '✅' : '❌';
  } else if (test.expect.includes('time')) {
    status = result.time ? '✅' : '❌';
  } else if (test.expect.includes('date')) {
    status = result.date ? '✅' : '❌';
  }
  
  console.log(`${status} ${test.feature}: "${test.query}"`);
  console.log(`    Expected: ${test.expect}`);
  console.log(`    Got: ${JSON.stringify(result.preferences || {})} ${result.time ? `time=${result.time}` : ''} ${result.date ? `date=${result.date}` : ''}`);
  console.log('');
});

console.log('🎯 **Expected MCP Server Behavior:**\n');
console.log('1. "台北到台中接下來6小時" → Should show 6 hours of trains');
console.log('2. "明天早上8點..." → Should show trains around 08:00 tomorrow'); 
console.log('3. "...自強號" → Should filter to 自強 trains only');
console.log('4. "...最快" → Should prioritize fastest trains');
console.log('5. "...直達車" → Should show only direct trains');
console.log('6. All queries should show correct TPASS eligibility');