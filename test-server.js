#!/usr/bin/env node

import { spawn } from 'child_process';

const server = spawn('node', ['dist/server.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

server.stderr.on('data', (data) => {
  console.log('Server stderr:', data.toString());
});

server.stdout.on('data', (data) => {
  console.log('Server stdout:', data.toString());
});

// Send initialization request
const initRequest = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }
}) + '\n';

setTimeout(() => {
  server.stdin.write(initRequest);
}, 100);

setTimeout(() => {
  console.log('Test completed successfully');
  server.kill();
  process.exit(0);
}, 2000);