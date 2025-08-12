#!/usr/bin/env node

/**
 * Simple test for station search functionality
 * Tests the search_station tool through MCP interface
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testStationSearch() {
  console.log('🧪 Testing search_station tool...\n');
  
  // Start the MCP server
  const serverProcess = spawn('node', ['dist/server.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  
  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/server.js'],
  });
  
  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  try {
    // Connect to server
    await client.connect(transport);
    console.log('✅ Connected to MCP server');
    
    // List available tools
    const tools = await client.listTools();
    console.log(`📋 Available tools: ${tools.tools.map(t => t.name).join(', ')}`);
    
    // Test various station search queries
    const testQueries = [
      '台北',
      '北車',
      '台中',
      '高雄',
      'taipei',
      'unknown station',
    ];
    
    for (const query of testQueries) {
      console.log(`\n🔍 Testing query: "${query}"`);
      
      try {
        const result = await client.callTool({
          name: 'search_station',
          arguments: {
            query: query
          }
        });
        
        console.log('✅ Result received');
        if (result.content?.[0]?.text) {
          // Show first few lines of response
          const lines = result.content[0].text.split('\n');
          console.log(`📄 ${lines.slice(0, 3).join(' | ')}`);
        }
        
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Station search test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.close();
    serverProcess.kill();
  }
}

testStationSearch().catch(console.error);