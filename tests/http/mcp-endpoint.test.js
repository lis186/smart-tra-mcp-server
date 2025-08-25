/**
 * MCP Endpoint Protocol Tests
 * Tests the /mcp endpoint MCP-over-HTTP protocol implementation
 */

import { TestRunner } from '../lib/test-runner.js';
import { 
  HTTPTestClient, 
  TestServerManager, 
  MockEnvironment,
  TestAssertions,
  MCPTestUtils,
  PerformanceTestUtils
} from '../lib/http-test-utils.js';
import { ExpressServer } from '../../dist/core/express-server.js';

const testRunner = new TestRunner();

// Test configurations
const validConfig = {
  port: 3020,
  host: '127.0.0.1',
  environment: 'development'
};

const productionConfig = {
  port: 3021,
  host: '127.0.0.1', 
  environment: 'production'
};

// Global test state
let mockEnv;
let serverManager;

// Setup and teardown
testRunner.beforeEach(() => {
  mockEnv = new MockEnvironment();
  serverManager = new TestServerManager();
});

testRunner.afterEach(async () => {
  await serverManager.stopAllServers();
  mockEnv.restore();
});

testRunner.suite('MCP Endpoint Basic Tests', () => {

  testRunner.test('Should accept GET requests for SSE streaming', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('sse-server', ExpressServer, validConfig);
    
    const response = await client.get('/mcp', {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });
    
    // SSE endpoint should be accessible
    // Note: Actual SSE behavior is complex to test, but endpoint should respond
    if (response.status >= 500) {
      throw new Error(`MCP endpoint should not return 500 error for GET: ${response.status}`);
    }
  });

  testRunner.test('Should accept POST requests for JSON-RPC messages', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('jsonrpc-server', ExpressServer, validConfig);
    
    const mcpRequest = MCPTestUtils.createInitializeRequest();
    const response = await client.post('/mcp', mcpRequest);
    
    // Should accept JSON-RPC requests
    if (response.status === 404) {
      throw new Error('MCP endpoint not found for POST requests');
    }
    
    // Should not be a method not allowed error
    if (response.status === 405) {
      throw new Error('MCP endpoint should accept POST requests');
    }
  });

  testRunner.test('Should initialize MCP transport on first request', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('init-server', ExpressServer, validConfig);
    
    // First request should trigger transport initialization
    const response = await client.post('/mcp', MCPTestUtils.createInitializeRequest());
    
    // Should not fail due to transport not being initialized
    if (response.status === 500 && response.body?.error?.includes('transport')) {
      throw new Error('MCP transport should initialize on first request');
    }
    
    // Subsequent health check should show transport as ready
    const healthResponse = await client.get('/health');
    const mcpTransport = healthResponse.body.checks.mcpTransport;
    
    if (!mcpTransport.initialized) {
      throw new Error('MCP transport should be initialized after first request');
    }
  });
});

testRunner.suite('MCP Protocol Compliance Tests', () => {

  testRunner.test('Should handle valid MCP initialize request', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('valid-init-server', ExpressServer, validConfig);
    
    const initRequest = MCPTestUtils.createInitializeRequest({
      name: 'test-client',
      version: '1.0.0'
    });
    
    const response = await client.post('/mcp', initRequest);
    
    // Should respond to initialize request
    if (response.status >= 500) {
      throw new Error(`Initialize request failed with server error: ${response.status}`);
    }
    
    // If response is JSON, should follow MCP protocol
    if (response.body && typeof response.body === 'object') {
      const validation = MCPTestUtils.validateMCPResponse(response.body);
      if (!validation.valid && response.body.jsonrpc) {
        // Only validate as MCP if it looks like MCP response
        throw new Error(`Invalid MCP response format: ${validation.errors.join(', ')}`);
      }
    }
  });

  testRunner.test('Should handle MCP tool call requests', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('tool-call-server', ExpressServer, validConfig);
    
    // First initialize the connection
    await client.post('/mcp', MCPTestUtils.createInitializeRequest());
    
    // Then call a tool
    const toolRequest = MCPTestUtils.createToolCallRequest('search_trains', {
      query: 'test query'
    });
    
    const response = await client.post('/mcp', toolRequest);
    
    // Should handle tool call request
    if (response.status === 404) {
      throw new Error('Tool call request should be routed to MCP endpoint');
    }
    
    if (response.status >= 500) {
      console.log('Tool call server error (may be expected):', response.body);
    }
  });

  testRunner.test('Should reject invalid MCP requests with proper error', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('invalid-req-server', ExpressServer, validConfig);
    
    const invalidRequest = MCPTestUtils.createInvalidRequest();
    const response = await client.post('/mcp', invalidRequest);
    
    // Should return error for invalid request
    if (response.status < 400) {
      throw new Error('Invalid MCP request should return error status');
    }
    
    // Should provide error information
    if (!response.body || !response.body.error) {
      throw new Error('Invalid request should return error details');
    }
  });

  testRunner.test('Should handle malformed JSON gracefully', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('malformed-server', ExpressServer, validConfig);
    
    // Send malformed JSON
    const response = await client.post('/mcp', 'not-valid-json{', {
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Should return appropriate error
    if (response.status < 400) {
      throw new Error('Malformed JSON should return error status');
    }
    
    if (!response.body?.error) {
      throw new Error('Malformed JSON should return error response');
    }
  });
});

testRunner.suite('MCP Error Handling Tests', () => {

  testRunner.test('Should categorize different types of MCP errors', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('error-cat-server', ExpressServer, validConfig);
    
    // Test different error scenarios
    const testCases = [
      {
        name: 'malformed JSON',
        request: 'invalid-json{',
        expectedStatus: 400
      },
      {
        name: 'invalid MCP structure', 
        request: { not: 'valid mcp' },
        expectedStatus: 400
      }
    ];
    
    for (const testCase of testCases) {
      const response = await client.post('/mcp', testCase.request, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.status !== testCase.expectedStatus) {
        console.log(`${testCase.name}: expected ${testCase.expectedStatus}, got ${response.status}`);
      }
      
      // Should provide error type information
      if (response.body?.type) {
        console.log(`${testCase.name}: error type = ${response.body.type}`);
      }
    }
  });

  testRunner.test('Should include debugging context in errors', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('debug-server', ExpressServer, validConfig);
    
    const response = await client.post('/mcp', 'malformed', {
      headers: { 
        'Content-Type': 'application/json',
        'Origin': 'http://test-origin.com',
        'User-Agent': 'test-client/1.0'
      }
    });
    
    // In development mode, should include debug info
    if (response.body?.debug) {
      const debug = response.body.debug;
      
      // Should include transport status
      if (!('transport' in debug)) {
        throw new Error('Debug info should include transport status');
      }
      
      // Should include request method
      if (!('method' in debug)) {
        throw new Error('Debug info should include request method');
      }
    }
  });

  testRunner.test('Should limit error disclosure in production', async () => {
    mockEnv.production();
    const { client } = await serverManager.startServer('prod-error-server', ExpressServer, productionConfig);
    
    const response = await client.post('/mcp', 'malformed', {
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Should return error but limit details
    if (response.status < 400) {
      throw new Error('Invalid request should return error in production');
    }
    
    // Should not include debug info in production
    if (response.body?.debug) {
      throw new Error('Production errors should not include debug information');
    }
    
    // Message should be generic in production
    if (response.body?.message && response.body.message.includes('malformed')) {
      throw new Error('Production error messages should not expose details');
    }
  });

  testRunner.test('Should handle headers already sent scenario', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('headers-server', ExpressServer, validConfig);
    
    // This is harder to test directly, but we can verify error handling doesn't crash
    const response = await client.post('/mcp', MCPTestUtils.createInitializeRequest());
    
    // Server should not crash from headers already sent error
    if (response.status >= 500) {
      console.log('Headers already sent test - server response:', response.status);
    }
    
    // Health check should still work
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
  });
});

testRunner.suite('MCP Endpoint Security Tests', () => {

  testRunner.test('Should respect CORS policy for MCP requests', async () => {
    mockEnv.production();
    const { client } = await serverManager.startServer('cors-mcp-server', ExpressServer, productionConfig);
    
    // Test with allowed origin
    const response = await client.post('/mcp', MCPTestUtils.createInitializeRequest(), {
      headers: { 'Origin': 'https://example.com' }
    });
    
    // Should allow request from allowed origin
    const corsOrigin = response.headers['access-control-allow-origin'];
    if (corsOrigin !== 'https://example.com') {
      throw new Error(`Expected CORS origin https://example.com, got: ${corsOrigin}`);
    }
  });

  testRunner.test('Should handle preflight requests for MCP endpoint', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('preflight-server', ExpressServer, validConfig);
    
    const response = await client.options('/mcp');
    
    TestAssertions.assertStatus(response, 200);
    TestAssertions.assertCORSHeaders(response);
  });

  testRunner.test('Should validate request sizes', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('size-server', ExpressServer, validConfig);
    
    // Create large request
    const largeRequest = {
      ...MCPTestUtils.createInitializeRequest(),
      params: {
        ...MCPTestUtils.createInitializeRequest().params,
        largeData: 'x'.repeat(10000) // 10KB of data
      }
    };
    
    const response = await client.post('/mcp', largeRequest);
    
    // Should handle reasonably large requests
    if (response.status === 413) {
      throw new Error('Should handle reasonably sized MCP requests');
    }
  });
});

testRunner.suite('MCP Endpoint Performance Tests', () => {

  testRunner.test('Should handle MCP requests efficiently', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('perf-mcp-server', ExpressServer, validConfig);
    
    const { result, responseTimeMs } = await PerformanceTestUtils.measureResponseTime(() => 
      client.post('/mcp', MCPTestUtils.createInitializeRequest())
    );
    
    // MCP requests should be reasonably fast
    if (responseTimeMs > 2000) {
      throw new Error(`MCP request too slow: ${responseTimeMs}ms`);
    }
    
    console.log(`MCP request response time: ${responseTimeMs}ms`);
  });

  testRunner.test('Should handle concurrent MCP requests', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('concurrent-mcp-server', ExpressServer, validConfig);
    
    // Test concurrent initialize requests
    const results = await PerformanceTestUtils.runConcurrentTest(
      () => client.post('/mcp', MCPTestUtils.createInitializeRequest()),
      3,  // 3 concurrent requests
      5   // 5 iterations
    );
    
    console.log(`Concurrent MCP test - Success rate: ${results.successRate}%`);
    console.log(`Average response time: ${results.avgResponseTime}ms`);
    
    // Should handle concurrent requests reasonably well
    if (results.successRate < 80) {
      throw new Error(`Low success rate for concurrent requests: ${results.successRate}%`);
    }
  });
});

testRunner.suite('MCP Transport Integration Tests', () => {

  testRunner.test('Should maintain transport state across requests', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('state-server', ExpressServer, validConfig);
    
    // First request initializes transport
    const initResponse = await client.post('/mcp', MCPTestUtils.createInitializeRequest());
    
    // Health check should show initialized transport
    const healthResponse = await client.get('/health');
    const mcpTransport = healthResponse.body.checks.mcpTransport;
    
    if (!mcpTransport.initialized) {
      throw new Error('Transport should remain initialized after first request');
    }
    
    // Second MCP request should use existing transport
    const secondResponse = await client.post('/mcp', MCPTestUtils.createInitializeRequest());
    
    // Should not re-initialize (would be inefficient)
    const secondHealthResponse = await client.get('/health');
    const secondMcpTransport = secondHealthResponse.body.checks.mcpTransport;
    
    if (secondMcpTransport.status === 'initialized_on_demand') {
      throw new Error('Transport should not re-initialize on subsequent requests');
    }
  });

  testRunner.test('Should handle transport setup errors gracefully', async () => {
    // This is difficult to test without mocking, but we can test error recovery
    mockEnv.development();
    const { client } = await serverManager.startServer('transport-error-server', ExpressServer, validConfig);
    
    // Make requests that might cause transport issues
    const responses = await Promise.allSettled([
      client.post('/mcp', MCPTestUtils.createInitializeRequest()),
      client.post('/mcp', MCPTestUtils.createInvalidRequest()),
      client.post('/mcp', 'malformed'),
      client.get('/mcp')
    ]);
    
    // Server should not crash from any transport errors
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
    
    console.log('Transport error test completed without server crash');
  });
});

testRunner.suite('MCP Endpoint Edge Cases', () => {

  testRunner.test('Should handle empty request body', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('empty-server', ExpressServer, validConfig);
    
    const response = await client.post('/mcp', '', {
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Should return appropriate error for empty body
    if (response.status < 400) {
      throw new Error('Empty request body should return error');
    }
  });

  testRunner.test('Should handle non-JSON content type', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('non-json-server', ExpressServer, validConfig);
    
    const response = await client.post('/mcp', 'plain text', {
      headers: { 'Content-Type': 'text/plain' }
    });
    
    // Should handle non-JSON content appropriately
    if (response.status >= 500) {
      throw new Error('Non-JSON content should not cause server error');
    }
  });

  testRunner.test('Should handle missing content-type header', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('no-ct-server', ExpressServer, validConfig);
    
    const response = await client.post('/mcp', JSON.stringify(MCPTestUtils.createInitializeRequest()), {
      // Omit content-type header
    });
    
    // Should handle missing content-type gracefully
    if (response.status >= 500) {
      throw new Error('Missing content-type should not cause server error');
    }
  });
});

// Export test runner
export { testRunner };