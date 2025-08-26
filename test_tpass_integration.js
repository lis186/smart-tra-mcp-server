#!/usr/bin/env node

/**
 * TPASS Integration Test with MCP Server
 * Tests TPASS functionality through actual search_trains calls
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

const testQueries = [
  {
    name: "台北到桃園 (基北北桃區域)",
    query: "台北到桃園明天早上",
    expectedTPASS: "基北北桃"
  },
  {
    name: "台中到彰化 (中彰投苗區域)", 
    query: "台中到彰化下午",
    expectedTPASS: "中彰投苗"
  },
  {
    name: "台北到台中 (跨區域)",
    query: "台北到台中",
    expectedTPASS: "跨區購票"
  }
];

async function testMCPServer(query) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    server.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Send MCP initialization
    const initMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "tpass-test",
          version: "1.0.0"
        }
      }
    };

    server.stdin.write(JSON.stringify(initMessage) + '\n');

    // Wait a bit for initialization
    setTimeout(() => {
      // Send search_trains query
      const searchMessage = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "search_trains",
          arguments: {
            query: query
          }
        }
      };

      server.stdin.write(JSON.stringify(searchMessage) + '\n');

      // Wait for response and close
      setTimeout(() => {
        server.kill();
      }, 5000);
      
    }, 1000);

    server.on('close', (code) => {
      if (output.includes('TPASS')) {
        resolve(output);
      } else if (errorOutput) {
        reject(new Error(`Server error: ${errorOutput}`));
      } else {
        reject(new Error(`No TPASS info found in output: ${output}`));
      }
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

async function runIntegrationTests() {
  console.log('🔧 Testing TPASS Integration with MCP Server\n');
  
  let passCount = 0;

  for (const testCase of testQueries) {
    console.log(`📋 Testing: ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);
    
    try {
      const result = await testMCPServer(testCase.query);
      
      if (result.includes(testCase.expectedTPASS)) {
        console.log(`   ✅ PASS - Found expected TPASS info: ${testCase.expectedTPASS}`);
        passCount++;
      } else {
        console.log(`   ❌ FAIL - Expected: ${testCase.expectedTPASS}, Got: ${result.substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR - ${error.message}`);
    }
    
    console.log('');
  }

  console.log(`📊 Integration Test Results: ${passCount}/${testQueries.length} tests passed`);
  
  if (passCount === testQueries.length) {
    console.log('🎉 All TPASS integration tests passed!');
  } else {
    console.log('⚠️ Some integration tests failed - may be due to API or parsing issues');
  }
}

// Only run if executed directly
if (process.argv[1].endsWith('test_tpass_integration.js')) {
  runIntegrationTests().catch(error => {
    console.error('Integration test error:', error);
    process.exit(1);
  });
}