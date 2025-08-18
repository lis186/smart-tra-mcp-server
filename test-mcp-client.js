#!/usr/bin/env node

import { spawn } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let messageId = 1;

class MCPClient {
  constructor() {
    this.server = spawn('node', ['dist/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    this.buffer = '';
    this.server.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });
    
    this.server.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });
    
    this.server.on('close', (code) => {
      console.error(`Server closed with code ${code}`);
      process.exit(code);
    });
  }
  
  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (err) {
          console.error('Failed to parse message:', line);
        }
      }
    }
  }
  
  handleMessage(message) {
    console.log('\n📨 Response:', JSON.stringify(message, null, 2));
    
    if (message.result?.tools) {
      console.log('\n✅ Available tools:', message.result.tools.map(t => t.name).join(', '));
    }
    
    if (message.result?.content) {
      if (Array.isArray(message.result.content)) {
        message.result.content.forEach(item => {
          if (item.type === 'text') {
            console.log('\n📝 Result:', item.text);
          }
        });
      }
    }
  }
  
  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: messageId++,
      method,
      params
    };
    
    console.log('\n📤 Sending:', JSON.stringify(request, null, 2));
    this.server.stdin.write(JSON.stringify(request) + '\n');
    
    // Wait a bit for response
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  async initialize() {
    await this.sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });
  }
  
  async listTools() {
    await this.sendRequest('tools/list');
  }
  
  async callTool(name, args) {
    await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }
  
  close() {
    this.server.kill();
  }
}

async function runTests() {
  const client = new MCPClient();
  
  console.log('🚀 Starting MCP Server tests...\n');
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Initialize
  await client.initialize();
  
  // List tools
  await client.listTools();
  
  // Test scenarios
  const testCases = [
    // Station search tests
    {
      tool: 'search_station',
      name: '🚉 Station Search - Ambiguous name',
      args: { query: '台北' }
    },
    {
      tool: 'search_station',
      name: '🚉 Station Search - English name',
      args: { query: 'Taipei Station' }
    },
    {
      tool: 'search_station',
      name: '🚉 Station Search - Partial match',
      args: { query: '高雄' }
    },
    
    // Train search tests
    {
      tool: 'search_trains',
      name: '🚂 Train Search - Morning trains',
      args: { query: 'Tomorrow morning 8am trains from Taipei to Taichung' }
    },
    {
      tool: 'search_trains',
      name: '🚂 Train Search - Fastest train',
      args: { query: 'Fastest train from 台北 to 高雄 today' }
    },
    {
      tool: 'search_trains',
      name: '🚂 Train Search - With fare',
      args: { query: 'Taipei to Hualien trains with ticket price' }
    },
    
    // Trip planning tests
    {
      tool: 'plan_trip',
      name: '🗺️ Trip Planning - Business trip',
      args: { 
        query: 'I need to go from Taipei to Kaohsiung for a 2pm meeting tomorrow',
        context: 'Prefer express trains, willing to pay more for speed'
      }
    },
    {
      tool: 'plan_trip',
      name: '🗺️ Trip Planning - Tourist journey',
      args: { 
        query: 'Plan a scenic trip from Taipei to Taitung this weekend',
        context: 'Tourist, want to see beautiful scenery'
      }
    }
  ];
  
  for (const test of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${test.name}`);
    console.log(`${'='.repeat(60)}`);
    
    await client.callTool(test.tool, test.args);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n✅ All tests completed!');
  client.close();
}

// Run tests
runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});