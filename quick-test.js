#!/usr/bin/env node

import { QueryParser } from './dist/query-parser.js';

const parser = new QueryParser();

const testQueries = [
  "Taipei to Taichung tomorrow morning",
  "台北到台中明天早上",
  "Taipei Station to Kaohsiung",
  "高雄 to 台北 today",
  "fastest train from Taipei to Hualien"
];

console.log('Testing QueryParser with bilingual support:\n');

for (const query of testQueries) {
  const result = parser.parse(query);
  console.log(`Query: "${query}"`);
  console.log(`Result: ${JSON.stringify(result, null, 2)}`);
  console.log('-'.repeat(60));
}