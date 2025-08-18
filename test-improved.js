#!/usr/bin/env node

import { spawn } from 'child_process';

class MCPTester {
  constructor() {
    this.messageId = 1;
    this.responses = [];
  }

  async test() {
    const server = spawn('node', ['dist/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let buffer = '';
    
    server.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.responses.push(message);
          } catch (err) {
            // Ignore parse errors
          }
        }
      }
    });

    server.stderr.on('data', (data) => {
      // Server logs to stderr
    });

    // Initialize
    const initRequest = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '0.1.0',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };
    
    server.stdin.write(JSON.stringify(initRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test cases
    const tests = [
      {
        name: 'English query - Taipei to Taichung',
        method: 'tools/call',
        params: {
          name: 'search_trains',
          arguments: {
            query: 'Taipei to Taichung tomorrow morning'
          }
        }
      },
      {
        name: 'Mixed query - Taipei Station to 高雄',
        method: 'tools/call',
        params: {
          name: 'search_trains',
          arguments: {
            query: 'Taipei Station to 高雄 today'
          }
        }
      },
      {
        name: 'Chinese query - 台北到花蓮',
        method: 'tools/call',
        params: {
          name: 'search_trains',
          arguments: {
            query: '台北到花蓮明天下午2點'
          }
        }
      }
    ];

    console.log('🧪 Testing MCP Server with bilingual support:\n');
    
    for (const test of tests) {
      console.log(`\n📝 Test: ${test.name}`);
      console.log(`   Query: "${test.params.arguments.query}"`);
      
      const request = {
        jsonrpc: '2.0',
        id: this.messageId++,
        method: test.method,
        params: test.params
      };
      
      server.stdin.write(JSON.stringify(request) + '\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Find the response
      const response = this.responses.find(r => r.id === request.id);
      if (response && response.result) {
        const content = response.result.content?.[0]?.text;
        if (content) {
          // Extract key info
          if (content.includes('🚆')) {
            console.log('   ✅ Success: Found trains');
            const trainCount = (content.match(/Train #/g) || []).length;
            console.log(`   Found ${trainCount} trains`);
          } else if (content.includes('⚠️')) {
            console.log('   ⚠️ Warning: Parsing failed');
            const match = content.match(/What I understood:\*\*\n(.+?)\n/);
            if (match) {
              console.log(`   Parser output: ${match[1]}`);
            }
          } else if (content.includes('❌')) {
            console.log('   ❌ Error occurred');
          }
        }
      }
    }

    console.log('\n✅ Tests completed');
    server.kill();
    process.exit(0);
  }
}

const tester = new MCPTester();
tester.test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});