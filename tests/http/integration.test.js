/**
 * HTTP Transport Integration Tests
 * Tests full stack integration: ExpressServer + SmartTRAServer + HTTP Transport
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
  port: 3040,
  host: '127.0.0.1',
  environment: 'development'
};

const productionConfig = {
  port: 3041,
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

testRunner.suite('Full Stack Integration Tests', () => {

  testRunner.test('Should integrate ExpressServer with SmartTRAServer', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('integration-server', ExpressServer, validConfig);
    
    // Health check should show all components integrated
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
    
    // Should show MCP transport status
    const mcpTransport = healthResponse.body.checks.mcpTransport;
    if (!mcpTransport) {
      throw new Error('Health check should include MCP transport status');
    }
    
    // Should show TDX client integration
    const tdxClient = healthResponse.body.checks.tdxClient;
    if (!tdxClient) {
      throw new Error('Health check should include TDX client status');
    }
    
    // Should list available MCP tools
    const tools = healthResponse.body.tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      throw new Error('Health check should list available MCP tools');
    }
    
    const expectedTools = ['search_trains', 'search_station', 'plan_trip'];
    for (const tool of expectedTools) {
      if (!tools.includes(tool)) {
        throw new Error(`Missing expected tool in integration: ${tool}`);
      }
    }
  });

  testRunner.test('Should handle complete MCP workflow via HTTP', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('workflow-server', ExpressServer, validConfig);
    
    // Step 1: Initialize MCP connection
    const initResponse = await client.post('/mcp', MCPTestUtils.createInitializeRequest({
      name: 'integration-test-client',
      version: '1.0.0'
    }));
    
    // Should handle initialization (may return error but shouldn't crash)
    if (initResponse.status >= 500) {
      console.log('MCP initialization response:', initResponse.status, initResponse.body);
    }
    
    // Step 2: Verify transport is initialized
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
    
    const mcpTransport = healthResponse.body.checks.mcpTransport;
    if (!mcpTransport.initialized) {
      throw new Error('MCP transport should be initialized after first request');
    }
    
    // Step 3: Make tool call request
    const toolResponse = await client.post('/mcp', MCPTestUtils.createToolCallRequest('search_trains', {
      query: 'integration test query'
    }));
    
    // Should route to MCP server (may return error but shouldn't crash)
    if (toolResponse.status >= 500) {
      console.log('Tool call response:', toolResponse.status, toolResponse.body);
    }
    
    // Step 4: Verify server is still healthy
    const finalHealthResponse = await client.get('/health');
    TestAssertions.assertStatus(finalHealthResponse, 200);
  });

  testRunner.test('Should maintain session state across requests', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('session-server', ExpressServer, validConfig);
    
    // Multiple requests should use same transport instance
    const responses = await Promise.all([
      client.post('/mcp', MCPTestUtils.createInitializeRequest()),
      client.get('/health'),
      client.post('/mcp', MCPTestUtils.createToolCallRequest('search_station', { query: 'test' })),
      client.get('/health')
    ]);
    
    // All requests should succeed (health checks at minimum)
    const healthResponses = responses.filter((_, i) => i % 2 === 1); // Get health responses
    for (const healthResponse of healthResponses) {
      TestAssertions.assertStatus(healthResponse, 200);
      
      // Transport should remain initialized
      const mcpTransport = healthResponse.body.checks.mcpTransport;
      if (!mcpTransport.initialized) {
        throw new Error('Transport should remain initialized across requests');
      }
    }
  });
});

testRunner.suite('Error Propagation Integration Tests', () => {

  testRunner.test('Should propagate MCP errors correctly through HTTP', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('error-prop-server', ExpressServer, validConfig);
    
    // Send invalid MCP request
    const invalidResponse = await client.post('/mcp', {
      invalid: 'request structure'
    });
    
    // Should return HTTP error with proper status
    if (invalidResponse.status < 400) {
      throw new Error('Invalid MCP request should return HTTP error status');
    }
    
    // Should include error details
    if (!invalidResponse.body || !invalidResponse.body.error) {
      throw new Error('HTTP error response should include error details');
    }
    
    // Should categorize error type
    if (!invalidResponse.body.type) {
      throw new Error('HTTP error should include error type categorization');
    }
    
    // Should include timestamp
    if (!invalidResponse.body.timestamp) {
      throw new Error('HTTP error should include timestamp');
    }
  });

  testRunner.test('Should handle SmartTRAServer errors gracefully', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('tra-error-server', ExpressServer, validConfig);
    
    // Make request that might cause TRA server error
    const toolResponse = await client.post('/mcp', MCPTestUtils.createToolCallRequest('search_trains', {
      query: 'this might cause an error in mock mode'
    }));
    
    // Should handle errors gracefully (not crash)
    if (toolResponse.status >= 500) {
      // Error is acceptable, but should provide useful information
      if (!toolResponse.body?.error) {
        throw new Error('Server error should provide error information');
      }
    }
    
    // Server should remain healthy after error
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
  });

  testRunner.test('Should handle transport errors correctly', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('transport-error-server', ExpressServer, validConfig);
    
    // Send requests that might cause transport issues
    const testRequests = [
      client.post('/mcp', 'malformed json{'),
      client.post('/mcp', { incomplete: 'mcp request' }),
      client.get('/mcp'),
      client.post('/mcp', '')
    ];
    
    const responses = await Promise.allSettled(testRequests);
    
    // No request should crash the server
    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      if (response.status === 'fulfilled') {
        console.log(`Request ${i}: ${response.value.status}`);
      } else {
        console.log(`Request ${i}: Network error (acceptable)`);
      }
    }
    
    // Server should still be responsive
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
  });
});

testRunner.suite('Middleware Chain Integration Tests', () => {

  testRunner.test('Should execute middleware chain correctly', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('middleware-server', ExpressServer, validConfig);
    
    // Test request that goes through full middleware chain
    const response = await client.post('/mcp', MCPTestUtils.createInitializeRequest(), {
      headers: {
        'Origin': 'http://test-origin.com',
        'Content-Type': 'application/json',
        'User-Agent': 'integration-test-client/1.0'
      }
    });
    
    // Should have gone through CORS middleware
    TestAssertions.assertCORSHeaders(response, '*');
    
    // Should have gone through JSON parsing middleware (no 400 parse errors)
    if (response.status === 400 && response.body?.error?.includes('JSON')) {
      throw new Error('JSON parsing middleware failed');
    }
    
    // Should have gone through MCP handler
    if (response.status === 404) {
      throw new Error('Request should have reached MCP handler');
    }
  });

  testRunner.test('Should handle middleware errors gracefully', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('middleware-error-server', ExpressServer, validConfig);
    
    // Test scenarios that might cause middleware errors
    const testCases = [
      {
        name: 'oversized request',
        data: 'x'.repeat(100000), // 100KB
        headers: { 'Content-Type': 'application/json' }
      },
      {
        name: 'malformed content-type',
        data: '{}',
        headers: { 'Content-Type': 'invalid/content-type' }
      },
      {
        name: 'missing content-type',
        data: '{}',
        headers: {}
      }
    ];
    
    for (const testCase of testCases) {
      try {
        const response = await client.post('/mcp', testCase.data, {
          headers: testCase.headers
        });
        
        console.log(`${testCase.name}: ${response.status}`);
        
        // Should not crash server
        if (response.status >= 500) {
          console.log(`Server error for ${testCase.name} (may be expected):`, response.body);
        }
        
      } catch (error) {
        console.log(`Network error for ${testCase.name}:`, error.message);
      }
    }
    
    // Server should remain operational
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
  });
});

testRunner.suite('Environment Integration Tests', () => {

  testRunner.test('Should integrate correctly in production environment', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://trusted-domain.com',
      USE_MOCK_DATA: 'true'
    });
    
    const { client } = await serverManager.startServer('prod-integration-server', ExpressServer, productionConfig);
    
    // Health check should work in production
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
    
    // Should show production environment
    if (healthResponse.body.environment !== 'production') {
      throw new Error('Should detect production environment');
    }
    
    // Should show mock mode (test environment)
    const tdxClient = healthResponse.body.checks.tdxClient;
    if (!tdxClient.mockMode) {
      throw new Error('Should detect mock mode in test production environment');
    }
    
    // CORS should be restricted
    const corsResponse = await client.get('/health', {
      headers: { 'Origin': 'https://trusted-domain.com' }
    });
    
    const corsOrigin = corsResponse.headers['access-control-allow-origin'];
    if (corsOrigin !== 'https://trusted-domain.com') {
      throw new Error('Production CORS should be restricted to allowed origins');
    }
  });

  testRunner.test('Should handle environment transition gracefully', async () => {
    // This test simulates environment changes (harder to test directly)
    mockEnv.development();
    const { client } = await serverManager.startServer('env-transition-server', ExpressServer, validConfig);
    
    // Verify development behavior
    const devResponse = await client.get('/health', {
      headers: { 'Origin': 'http://any-origin.com' }
    });
    
    TestAssertions.assertStatus(devResponse, 200);
    
    if (devResponse.headers['access-control-allow-origin'] !== '*') {
      throw new Error('Development should allow all origins');
    }
    
    // Verify error messages include debug info
    const errorResponse = await client.post('/mcp', 'malformed');
    if (errorResponse.body?.debug) {
      console.log('Development includes debug info:', !!errorResponse.body.debug);
    }
  });
});

testRunner.suite('Performance Integration Tests', () => {

  testRunner.test('Should handle concurrent requests efficiently', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('perf-integration-server', ExpressServer, validConfig);
    
    // Mix of different request types
    const requestTypes = [
      () => client.get('/health'),
      () => client.post('/mcp', MCPTestUtils.createInitializeRequest()),
      () => client.post('/mcp', MCPTestUtils.createToolCallRequest('search_station', { query: 'test' }))
    ];
    
    const results = await PerformanceTestUtils.runConcurrentTest(
      () => {
        const randomRequest = requestTypes[Math.floor(Math.random() * requestTypes.length)];
        return randomRequest();
      },
      5, // 5 concurrent requests
      10 // 10 iterations
    );
    
    console.log(`Integration performance test:`);
    console.log(`- Success rate: ${results.successRate}%`);
    console.log(`- Average response time: ${results.avgResponseTime}ms`);
    console.log(`- Max response time: ${results.maxResponseTime}ms`);
    
    // Should handle concurrent load reasonably well
    if (results.successRate < 80) {
      throw new Error(`Low success rate under concurrent load: ${results.successRate}%`);
    }
    
    if (results.avgResponseTime > 2000) {
      throw new Error(`Average response time too slow: ${results.avgResponseTime}ms`);
    }
  });

  testRunner.test('Should maintain performance across request types', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('perf-types-server', ExpressServer, validConfig);
    
    const requestTypes = [
      { name: 'health check', fn: () => client.get('/health') },
      { name: 'MCP initialize', fn: () => client.post('/mcp', MCPTestUtils.createInitializeRequest()) },
      { name: 'OPTIONS preflight', fn: () => client.options('/mcp') }
    ];
    
    for (const requestType of requestTypes) {
      const { result, responseTimeMs } = await PerformanceTestUtils.measureResponseTime(requestType.fn);
      
      console.log(`${requestType.name}: ${responseTimeMs}ms`);
      
      // No request type should be extremely slow
      if (responseTimeMs > 3000) {
        throw new Error(`${requestType.name} too slow: ${responseTimeMs}ms`);
      }
    }
  });
});

testRunner.suite('Resource Management Integration Tests', () => {

  testRunner.test('Should manage resources correctly across requests', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('resource-server', ExpressServer, validConfig);
    
    // Initial memory usage
    const initialHealth = await client.get('/health');
    const initialMemory = initialHealth.body.checks.system.memoryUsage.rss;
    
    // Make many requests to test resource usage
    const requestPromises = [];
    for (let i = 0; i < 50; i++) {
      if (i % 3 === 0) {
        requestPromises.push(client.get('/health'));
      } else if (i % 3 === 1) {
        requestPromises.push(client.post('/mcp', MCPTestUtils.createInitializeRequest()));
      } else {
        requestPromises.push(client.options('/mcp'));
      }
    }
    
    await Promise.all(requestPromises);
    
    // Check final memory usage
    const finalHealth = await client.get('/health');
    const finalMemory = finalHealth.body.checks.system.memoryUsage.rss;
    
    const memoryIncrease = finalMemory - initialMemory;
    const increasePercent = (memoryIncrease / initialMemory) * 100;
    
    console.log(`Memory usage change: +${increasePercent.toFixed(2)}%`);
    
    // Memory usage shouldn't increase dramatically
    if (increasePercent > 50) {
      console.warn(`Significant memory increase: ${increasePercent}%`);
    }
    
    // Server should still be responsive
    TestAssertions.assertStatus(finalHealth, 200);
  });

  testRunner.test('Should clean up properly after errors', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('cleanup-server', ExpressServer, validConfig);
    
    // Generate various error conditions
    const errorRequests = [
      client.post('/mcp', 'malformed{'),
      client.post('/mcp', { invalid: 'structure' }),
      client.post('/nonexistent', {}),
      client.get('/mcp')
    ];
    
    // Process error requests
    await Promise.allSettled(errorRequests);
    
    // Server should recover and be healthy
    const healthResponse = await client.get('/health');
    TestAssertions.assertStatus(healthResponse, 200);
    
    // Transport should still be functional
    const mcpResponse = await client.post('/mcp', MCPTestUtils.createInitializeRequest());
    if (mcpResponse.status >= 500) {
      console.log('Post-error MCP response:', mcpResponse.status);
    }
    
    // Final health check
    const finalHealth = await client.get('/health');
    TestAssertions.assertStatus(finalHealth, 200);
  });
});

// Export test runner
export { testRunner };