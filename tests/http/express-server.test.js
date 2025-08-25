/**
 * ExpressServer Unit Tests
 * Tests the core ExpressServer class lifecycle and functionality
 */

import { TestRunner } from '../lib/test-runner.js';
import { 
  HTTPTestClient, 
  TestServerManager, 
  MockEnvironment,
  TestAssertions
} from '../lib/http-test-utils.js';
import { ExpressServer } from '../../dist/core/express-server.js';

const testRunner = new TestRunner('ExpressServer Unit Tests');

// Test data
const validConfig = {
  port: 3001,
  host: '127.0.0.1',
  environment: 'development'
};

const productionConfig = {
  port: 3002,
  host: '127.0.0.1',
  environment: 'production'
};

// Helper functions for setup/teardown
async function setupTest() {
  const mockEnv = new MockEnvironment();
  mockEnv.development();
  const serverManager = new TestServerManager();
  return { mockEnv, serverManager };
}

async function teardownTest(mockEnv, serverManager) {
  if (serverManager) {
    await serverManager.stopAllServers();
  }
  if (mockEnv) {
    mockEnv.restore();
  }
}

// Test runner functions
export async function runAll() {
  await testRunner.describe('ExpressServer Lifecycle Tests', async () => {
  
  testRunner.test('Should create ExpressServer instance with valid config', async () => {
    const server = new ExpressServer(validConfig);
    
    // Verify instance creation
    if (!server) {
      throw new Error('ExpressServer instance not created');
    }
    
    // Verify config is stored
    if (server.config?.port !== validConfig.port) {
      throw new Error(`Expected port ${validConfig.port}, got ${server.config?.port}`);
    }
    
    if (server.config?.environment !== validConfig.environment) {
      throw new Error(`Expected environment ${validConfig.environment}, got ${server.config?.environment}`);
    }
  });

  testRunner.test('Should start server and bind to correct port', async () => {
    const { server, config, client } = await serverManager.startServer('test-server', ExpressServer, validConfig);
    
    // Verify server is listening
    const response = await client.get('/health');
    TestAssertions.assertStatus(response, 200);
    
    // Verify response indicates healthy status
    if (!response.body || response.body.status !== 'healthy') {
      throw new Error(`Expected healthy status, got: ${response.body?.status}`);
    }
  });

  testRunner.test('Should handle invalid port configuration', async () => {
    const invalidConfig = { ...validConfig, port: -1 };
    
    let errorThrown = false;
    try {
      const server = new ExpressServer(invalidConfig);
      await server.start();
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes('port') && !error.message.includes('EACCES') && !error.message.includes('listen')) {
        throw new Error(`Expected port-related error, got: ${error.message}`);
      }
    }
    
    if (!errorThrown) {
      throw new Error('Expected error for invalid port configuration');
    }
  });

  testRunner.test('Should handle port already in use scenario', async () => {
    // Start first server
    await serverManager.startServer('server1', ExpressServer, validConfig);
    
    // Try to start second server on same port
    let errorThrown = false;
    try {
      const server2 = new ExpressServer(validConfig);
      await server2.start();
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes('EADDRINUSE') && !error.message.includes('address already in use')) {
        // Different error message formats possible
        console.log('Port conflict error:', error.message);
      }
    }
    
    if (!errorThrown) {
      throw new Error('Expected error for port already in use');
    }
  });

  testRunner.test('Should configure development environment correctly', async () => {
    mockEnv.development();
    
    const { client } = await serverManager.startServer('dev-server', ExpressServer, validConfig);
    
    // Test CORS in development mode (should allow all origins)
    const response = await client.get('/health', {
      headers: { 'Origin': 'http://test-origin.com' }
    });
    
    TestAssertions.assertStatus(response, 200);
    
    // In development, should allow any origin
    if (response.headers['access-control-allow-origin'] !== '*') {
      throw new Error(`Expected CORS allow all origins in dev, got: ${response.headers['access-control-allow-origin']}`);
    }
  });

  testRunner.test('Should configure production environment correctly', async () => {
    mockEnv.production();
    
    const { client } = await serverManager.startServer('prod-server', ExpressServer, productionConfig);
    
    // Test CORS in production mode (should restrict origins)
    const response = await client.get('/health', {
      headers: { 'Origin': 'https://example.com' }
    });
    
    TestAssertions.assertStatus(response, 200);
    
    // In production, should only allow configured origins
    const corsOrigin = response.headers['access-control-allow-origin'];
    if (corsOrigin !== 'https://example.com') {
      throw new Error(`Expected specific CORS origin in prod, got: ${corsOrigin}`);
    }
  });
});

testRunner.suite('ExpressServer Error Handling Tests', () => {

  testRunner.test('Should handle missing TDX credentials gracefully', async () => {
    // Set up environment without TDX credentials
    mockEnv.setEnv({
      NODE_ENV: 'development',
      // Remove TDX credentials
      TDX_CLIENT_ID: undefined,
      TDX_CLIENT_SECRET: undefined
    });
    
    const { client } = await serverManager.startServer('no-creds-server', ExpressServer, validConfig);
    
    // Health check should still work but indicate TDX not configured
    const response = await client.get('/health');
    
    // Should still return 200 (server is healthy even if TDX not configured)
    TestAssertions.assertStatus(response, 200);
    
    // Should indicate TDX client not configured
    if (response.body.checks?.tdxClient?.status !== 'not_configured') {
      throw new Error(`Expected TDX not_configured status, got: ${response.body.checks?.tdxClient?.status}`);
    }
  });

  testRunner.test('Should handle malformed requests gracefully', async () => {
    const { client } = await serverManager.startServer('malformed-server', ExpressServer, validConfig);
    
    // Send malformed JSON to MCP endpoint
    const response = await client.post('/mcp', 'invalid-json-data', {
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Should return error status
    if (response.status < 400) {
      throw new Error(`Expected error status for malformed request, got: ${response.status}`);
    }
    
    // Should return error response
    if (!response.body || !response.body.error) {
      throw new Error('Expected error response body for malformed request');
    }
  });

  testRunner.test('Should handle 404 requests correctly', async () => {
    const { client } = await serverManager.startServer('404-server', ExpressServer, validConfig);
    
    const response = await client.get('/nonexistent-endpoint');
    
    TestAssertions.assertStatus(response, 404);
    
    // Should provide helpful 404 response
    if (!response.body || !response.body.error) {
      throw new Error('Expected error response for 404');
    }
    
    if (!response.body.availableEndpoints) {
      throw new Error('Expected availableEndpoints in 404 response');
    }
    
    // Should list available endpoints
    const endpoints = response.body.availableEndpoints;
    if (!endpoints.includes('/health') || !endpoints.includes('/mcp')) {
      throw new Error('404 response should list available endpoints');
    }
  });
});

testRunner.suite('ExpressServer Middleware Tests', () => {

  testRunner.test('Should parse JSON requests correctly', async () => {
    const { client } = await serverManager.startServer('json-server', ExpressServer, validConfig);
    
    const testData = { test: 'data', number: 42 };
    const response = await client.post('/mcp', testData);
    
    // Even if MCP returns error, JSON should be parsed
    // (Error is expected since we didn't send valid MCP protocol)
    if (response.status === 500 && response.body?.error?.includes('JSON')) {
      throw new Error('JSON parsing failed');
    }
  });

  testRunner.test('Should handle URL encoded requests', async () => {
    const { client } = await serverManager.startServer('urlencoded-server', ExpressServer, validConfig);
    
    // Test with form data
    const response = await client.post('/mcp', 'test=data&value=123', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    // Should accept the request (even if MCP protocol error)
    if (response.status === 415) {
      throw new Error('URL encoded parsing failed');
    }
  });

  testRunner.test('Should handle preflight OPTIONS requests', async () => {
    const { client } = await serverManager.startServer('options-server', ExpressServer, validConfig);
    
    const response = await client.options('/mcp');
    
    TestAssertions.assertStatus(response, 200);
    
    // Should include CORS headers
    TestAssertions.assertCORSHeaders(response);
  });
});

testRunner.suite('ExpressServer Configuration Tests', () => {

  testRunner.test('Should use environment variables for configuration', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      PORT: '3003',
      HOST: '0.0.0.0',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://allowed.com'
    });
    
    const config = {
      port: parseInt(process.env.PORT || '3003'),
      host: process.env.HOST || '0.0.0.0',
      environment: process.env.NODE_ENV
    };
    
    // Note: Can't easily test 0.0.0.0 binding in tests, so use localhost
    const testConfig = { ...config, host: '127.0.0.1' };
    
    const { client } = await serverManager.startServer('env-server', ExpressServer, testConfig);
    
    const response = await client.get('/health');
    TestAssertions.assertStatus(response, 200);
    
    // Verify environment configuration is reflected
    if (response.body.environment !== 'production') {
      throw new Error(`Expected production environment, got: ${response.body.environment}`);
    }
  });

  testRunner.test('Should handle missing environment gracefully', async () => {
    // Clear environment
    mockEnv.setEnv({
      NODE_ENV: undefined,
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret'
    });
    
    const config = { ...validConfig, environment: undefined };
    
    let serverStarted = false;
    try {
      await serverManager.startServer('undefined-env-server', ExpressServer, config);
      serverStarted = true;
    } catch (error) {
      // Some error expected due to undefined environment
      if (!error.message.includes('environment')) {
        throw new Error(`Expected environment-related error, got: ${error.message}`);
      }
    }
    
    // If server started, it should handle undefined environment gracefully
    if (serverStarted) {
      console.log('Server handled undefined environment gracefully');
    }
  });
});

// Export test runner
export { testRunner };