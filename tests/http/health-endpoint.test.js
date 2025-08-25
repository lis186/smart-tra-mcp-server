/**
 * Health Endpoint Comprehensive Tests
 * Tests the /health endpoint critical for Cloud Run deployment
 */

import { TestRunner } from '../lib/test-runner.js';
import { 
  HTTPTestClient, 
  TestServerManager, 
  MockEnvironment,
  TestAssertions,
  PerformanceTestUtils
} from '../lib/http-test-utils.js';
import { ExpressServer } from '../../dist/core/express-server.js';

const testRunner = new TestRunner();

// Test configurations
const validConfig = {
  port: 3010,
  host: '127.0.0.1', 
  environment: 'development'
};

const productionConfig = {
  port: 3011,
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

testRunner.suite('Health Endpoint Basic Tests', () => {

  testRunner.test('Should return 200 OK for healthy server', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('healthy-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    
    TestAssertions.assertStatus(response, 200);
    TestAssertions.assertHeaders(response, {
      'content-type': 'application/json; charset=utf-8'
    });
    
    // Verify basic response structure
    TestAssertions.assertBodyStructure(response.body, [
      'status', 'timestamp', 'version', 'checks', 'transport'
    ]);
  });

  testRunner.test('Should include all required health check components', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('components-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    // Verify top-level fields
    if (!body.status || !body.timestamp || !body.version) {
      throw new Error('Missing required top-level health check fields');
    }
    
    // Verify checks object structure
    TestAssertions.assertBodyStructure(body.checks, [
      'mcpTransport', 'system', 'tdxClient'
    ]);
    
    // Verify transport info
    TestAssertions.assertBodyStructure(body.transport, [
      'mode', 'endpoints'
    ]);
    
    if (body.transport.mode !== 'http') {
      throw new Error(`Expected transport mode 'http', got: ${body.transport.mode}`);
    }
  });

  testRunner.test('Should include correct endpoint information', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('endpoints-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    // Verify transport endpoints
    const endpoints = body.transport.endpoints;
    if (!endpoints || !endpoints.health || !endpoints.mcp) {
      throw new Error('Missing transport endpoints information');
    }
    
    if (endpoints.health !== '/health') {
      throw new Error(`Expected health endpoint '/health', got: ${endpoints.health}`);
    }
    
    if (endpoints.mcp !== '/mcp') {
      throw new Error(`Expected MCP endpoint '/mcp', got: ${endpoints.mcp}`);
    }
  });

  testRunner.test('Should include server version and description', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('version-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    if (!body.name || !body.version || !body.description) {
      throw new Error('Missing server identification fields');
    }
    
    if (body.name !== 'Smart TRA MCP Server') {
      throw new Error(`Expected server name 'Smart TRA MCP Server', got: ${body.name}`);
    }
    
    if (body.version !== '1.0.0') {
      throw new Error(`Expected version '1.0.0', got: ${body.version}`);
    }
  });
});

testRunner.suite('Health Check Components Tests', () => {

  testRunner.test('Should check MCP transport health status', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('transport-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    const mcpTransport = body.checks.mcpTransport;
    if (!mcpTransport) {
      throw new Error('Missing MCP transport health check');
    }
    
    // Should indicate transport initialization status
    if (typeof mcpTransport.initialized !== 'boolean') {
      throw new Error('MCP transport initialized field should be boolean');
    }
    
    if (typeof mcpTransport.serverReady !== 'boolean') {
      throw new Error('MCP transport serverReady field should be boolean');
    }
    
    // Status should be a valid string
    const validStatuses = ['ready', 'not_initialized', 'initialized_on_demand', 'error'];
    if (!validStatuses.includes(mcpTransport.status)) {
      throw new Error(`Invalid MCP transport status: ${mcpTransport.status}`);
    }
  });

  testRunner.test('Should include system health metrics', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('system-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    const system = body.checks.system;
    if (!system) {
      throw new Error('Missing system health check');
    }
    
    // Verify system metrics
    TestAssertions.assertBodyStructure(system, [
      'uptime', 'memoryUsage', 'nodeVersion'
    ]);
    
    if (typeof system.uptime !== 'number' || system.uptime < 0) {
      throw new Error('Invalid system uptime metric');
    }
    
    if (!system.memoryUsage || typeof system.memoryUsage.rss !== 'number') {
      throw new Error('Invalid memory usage metrics');
    }
    
    if (!system.nodeVersion || !system.nodeVersion.startsWith('v')) {
      throw new Error('Invalid Node.js version information');
    }
  });

  testRunner.test('Should check TDX client configuration', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('tdx-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    const tdxClient = body.checks.tdxClient;
    if (!tdxClient) {
      throw new Error('Missing TDX client health check');
    }
    
    // Should have status field
    if (!tdxClient.status) {
      throw new Error('Missing TDX client status');
    }
    
    const validStatuses = ['configured', 'not_configured', 'error'];
    if (!validStatuses.includes(tdxClient.status)) {
      throw new Error(`Invalid TDX client status: ${tdxClient.status}`);
    }
    
    // Should indicate mock mode
    if (typeof tdxClient.mockMode !== 'boolean') {
      throw new Error('TDX client mockMode should be boolean');
    }
  });

  testRunner.test('Should detect mock mode correctly', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'development',
      TDX_CLIENT_ID: 'test_client_id',  // Mock credentials
      TDX_CLIENT_SECRET: 'test_secret',
      USE_MOCK_DATA: 'true'
    });
    
    const { client } = await serverManager.startServer('mock-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    const tdxClient = body.checks.tdxClient;
    if (!tdxClient.mockMode) {
      throw new Error('Should detect mock mode when test credentials are used');
    }
    
    if (tdxClient.status !== 'configured') {
      throw new Error(`Expected TDX status 'configured' in mock mode, got: ${tdxClient.status}`);
    }
  });

  testRunner.test('Should detect missing TDX configuration', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'development',
      // Don't set TDX credentials
      TDX_CLIENT_ID: undefined,
      TDX_CLIENT_SECRET: undefined
    });
    
    const { client } = await serverManager.startServer('no-tdx-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    const tdxClient = body.checks.tdxClient;
    if (tdxClient.status !== 'not_configured') {
      throw new Error(`Expected TDX status 'not_configured', got: ${tdxClient.status}`);
    }
  });
});

testRunner.suite('Health Check Status Logic Tests', () => {

  testRunner.test('Should return healthy status when all components OK', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('all-ok-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    
    TestAssertions.assertStatus(response, 200);
    
    if (response.body.status !== 'healthy') {
      throw new Error(`Expected status 'healthy', got: ${response.body.status}`);
    }
  });

  testRunner.test('Should handle MCP transport initialization on demand', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('on-demand-server', ExpressServer, validConfig);
    
    // First health check might trigger on-demand initialization
    const response = await client.get('/health');
    
    // Should still be healthy even if initialized on demand
    TestAssertions.assertStatus(response, 200);
    
    const mcpTransport = response.body.checks.mcpTransport;
    
    // Status should be either 'ready' or 'initialized_on_demand'
    if (!['ready', 'initialized_on_demand'].includes(mcpTransport.status)) {
      throw new Error(`Expected MCP transport ready or initialized_on_demand, got: ${mcpTransport.status}`);
    }
  });

  testRunner.test('Should handle degraded state gracefully', async () => {
    // This is harder to test without mocking internals, but we can test error recovery
    mockEnv.development();
    const { client } = await serverManager.startServer('degraded-server', ExpressServer, validConfig);
    
    // Multiple rapid requests to potentially trigger race conditions
    const responses = await Promise.all([
      client.get('/health'),
      client.get('/health'),
      client.get('/health')
    ]);
    
    // All should succeed (might be degraded but shouldn't fail)
    for (const response of responses) {
      if (response.status !== 200 && response.status !== 503) {
        throw new Error(`Expected 200 or 503 status, got: ${response.status}`);
      }
      
      if (!['healthy', 'degraded'].includes(response.body.status)) {
        throw new Error(`Invalid health status: ${response.body.status}`);
      }
    }
  });
});

testRunner.suite('Health Check Performance Tests', () => {

  testRunner.test('Should respond quickly to health checks', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('perf-server', ExpressServer, validConfig);
    
    const { result, responseTimeMs } = await PerformanceTestUtils.measureResponseTime(() => 
      client.get('/health')
    );
    
    TestAssertions.assertStatus(result, 200);
    
    // Health check should be fast (under 500ms for local testing)
    if (responseTimeMs > 500) {
      throw new Error(`Health check too slow: ${responseTimeMs}ms`);
    }
  });

  testRunner.test('Should handle concurrent health checks', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('concurrent-server', ExpressServer, validConfig);
    
    // Run multiple concurrent health checks
    const results = await PerformanceTestUtils.runConcurrentTest(
      () => client.get('/health'),
      5,  // 5 concurrent requests
      10  // 10 iterations
    );
    
    // All requests should succeed
    if (results.successRate < 100) {
      throw new Error(`Expected 100% success rate, got: ${results.successRate}%`);
    }
    
    // Average response time should be reasonable
    if (results.avgResponseTime > 1000) {
      throw new Error(`Average response time too slow: ${results.avgResponseTime}ms`);
    }
  });
});

testRunner.suite('Health Check Environment Tests', () => {

  testRunner.test('Should work in production environment', async () => {
    mockEnv.production();
    const { client } = await serverManager.startServer('prod-health-server', ExpressServer, productionConfig);
    
    const response = await client.get('/health');
    
    TestAssertions.assertStatus(response, 200);
    
    // Verify production environment is detected
    if (response.body.environment !== 'production') {
      throw new Error(`Expected production environment, got: ${response.body.environment}`);
    }
  });

  testRunner.test('Should include proper tools list', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('tools-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    if (!body.tools || !Array.isArray(body.tools)) {
      throw new Error('Missing tools list in health response');
    }
    
    const expectedTools = ['search_trains', 'search_station', 'plan_trip'];
    for (const tool of expectedTools) {
      if (!body.tools.includes(tool)) {
        throw new Error(`Missing expected tool: ${tool}`);
      }
    }
    
    if (body.tools.length !== expectedTools.length) {
      throw new Error(`Expected ${expectedTools.length} tools, got: ${body.tools.length}`);
    }
  });

  testRunner.test('Should include timestamp in ISO format', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('timestamp-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    const { body } = response;
    
    if (!body.timestamp) {
      throw new Error('Missing timestamp in health response');
    }
    
    // Verify timestamp is valid ISO string
    const timestamp = new Date(body.timestamp);
    if (isNaN(timestamp.getTime())) {
      throw new Error(`Invalid timestamp format: ${body.timestamp}`);
    }
    
    // Timestamp should be recent (within last 10 seconds)
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - timestamp.getTime());
    if (timeDiff > 10000) {
      throw new Error(`Timestamp too old: ${timeDiff}ms ago`);
    }
  });
});

testRunner.suite('Health Check Error Scenarios', () => {

  testRunner.test('Should handle errors in TDX client check gracefully', async () => {
    // Create environment that might cause TDX client errors
    mockEnv.setEnv({
      NODE_ENV: 'development',
      TDX_CLIENT_ID: 'invalid-client-id',
      TDX_CLIENT_SECRET: 'invalid-secret'
    });
    
    const { client } = await serverManager.startServer('tdx-error-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    
    // Should still return 200 (health check itself works)
    TestAssertions.assertStatus(response, 200);
    
    // But TDX client might show error status
    const tdxClient = response.body.checks.tdxClient;
    if (tdxClient.status === 'error') {
      // This is acceptable - error is handled gracefully
      if (!tdxClient.error) {
        throw new Error('Expected error message when TDX client status is error');
      }
    }
  });

  testRunner.test('Should maintain response schema even with errors', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('schema-server', ExpressServer, validConfig);
    
    const response = await client.get('/health');
    
    // Response should always maintain consistent schema
    TestAssertions.assertBodyStructure(response.body, [
      'status', 'timestamp', 'version', 'name', 'description',
      'environment', 'checks', 'transport', 'tools'
    ]);
    
    // Checks should always have required structure
    TestAssertions.assertBodyStructure(response.body.checks, [
      'mcpTransport', 'system', 'tdxClient'
    ]);
  });
});

// Export test runner
export { testRunner };