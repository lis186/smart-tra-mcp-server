/**
 * CORS Security Tests
 * Tests Cross-Origin Resource Sharing policy implementation
 */

import { TestRunner } from '../lib/test-runner.js';
import { 
  HTTPTestClient, 
  TestServerManager, 
  MockEnvironment,
  TestAssertions
} from '../lib/http-test-utils.js';
import { ExpressServer } from '../../dist/core/express-server.js';

const testRunner = new TestRunner('CORS Security Tests');

// Test configurations
const developmentConfig = {
  port: 3030,
  host: '127.0.0.1',
  environment: 'development'
};

const productionConfig = {
  port: 3031,
  host: '127.0.0.1',
  environment: 'production'
};

// Helper functions for setup/teardown
async function setupTest() {
  const mockEnv = new MockEnvironment();
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

testRunner.suite('CORS Development Environment Tests', () => {

  testRunner.test('Should allow all origins in development mode', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('dev-cors-server', ExpressServer, developmentConfig);
    
    const testOrigins = [
      'http://localhost:3000',
      'https://test-domain.com',
      'http://example.org',
      'https://malicious-site.evil'
    ];
    
    for (const origin of testOrigins) {
      const response = await client.get('/health', {
        headers: { 'Origin': origin }
      });
      
      TestAssertions.assertStatus(response, 200);
      
      // In development, should allow any origin
      const corsOrigin = response.headers['access-control-allow-origin'];
      if (corsOrigin !== '*') {
        throw new Error(`Development should allow all origins, got: ${corsOrigin} for origin: ${origin}`);
      }
    }
  });

  testRunner.test('Should include required CORS headers in development', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('dev-headers-server', ExpressServer, developmentConfig);
    
    const response = await client.get('/health', {
      headers: { 'Origin': 'http://test-origin.com' }
    });
    
    TestAssertions.assertStatus(response, 200);
    TestAssertions.assertCORSHeaders(response, '*');
    
    // Check specific required headers
    const requiredHeaders = [
      'access-control-allow-headers',
      'access-control-allow-methods'
    ];
    
    for (const header of requiredHeaders) {
      if (!response.headers[header]) {
        throw new Error(`Missing required CORS header: ${header}`);
      }
    }
  });

  testRunner.test('Should handle preflight requests in development', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('dev-preflight-server', ExpressServer, developmentConfig);
    
    const response = await client.options('/mcp', {
      headers: {
        'Origin': 'http://test-origin.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    
    TestAssertions.assertStatus(response, 200);
    
    // Should allow any origin in development
    if (response.headers['access-control-allow-origin'] !== '*') {
      throw new Error('Development preflight should allow any origin');
    }
    
    // Should allow requested methods
    const allowedMethods = response.headers['access-control-allow-methods'];
    if (!allowedMethods || !allowedMethods.includes('POST')) {
      throw new Error('Should allow POST method in preflight response');
    }
  });
});

testRunner.suite('CORS Production Environment Tests', () => {

  testRunner.test('Should restrict origins in production mode', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://trusted-domain.com,https://another-trusted.com'
    });
    
    const { client } = await serverManager.startServer('prod-cors-server', ExpressServer, productionConfig);
    
    // Test allowed origin
    const allowedResponse = await client.get('/health', {
      headers: { 'Origin': 'https://trusted-domain.com' }
    });
    
    TestAssertions.assertStatus(allowedResponse, 200);
    
    const corsOrigin = allowedResponse.headers['access-control-allow-origin'];
    if (corsOrigin !== 'https://trusted-domain.com') {
      throw new Error(`Expected specific origin, got: ${corsOrigin}`);
    }
  });

  testRunner.test('Should block unauthorized origins in production', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://trusted-domain.com'
    });
    
    const { client } = await serverManager.startServer('prod-block-server', ExpressServer, productionConfig);
    
    // Test blocked origin
    const blockedResponse = await client.get('/health', {
      headers: { 'Origin': 'https://malicious-site.evil' }
    });
    
    TestAssertions.assertStatus(blockedResponse, 200);
    
    // Should not include CORS header for unauthorized origin
    const corsOrigin = blockedResponse.headers['access-control-allow-origin'];
    if (corsOrigin === 'https://malicious-site.evil' || corsOrigin === '*') {
      throw new Error(`Should not allow unauthorized origin: ${corsOrigin}`);
    }
  });

  testRunner.test('Should handle multiple allowed origins', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://domain1.com,https://domain2.com,https://domain3.com'
    });
    
    const { client } = await serverManager.startServer('multi-origin-server', ExpressServer, productionConfig);
    
    const allowedOrigins = ['https://domain1.com', 'https://domain2.com', 'https://domain3.com'];
    
    for (const origin of allowedOrigins) {
      const response = await client.get('/health', {
        headers: { 'Origin': origin }
      });
      
      TestAssertions.assertStatus(response, 200);
      
      const corsOrigin = response.headers['access-control-allow-origin'];
      if (corsOrigin !== origin) {
        throw new Error(`Expected ${origin}, got: ${corsOrigin}`);
      }
    }
  });

  testRunner.test('Should handle whitespace in ALLOWED_ORIGINS', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id', 
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: ' https://domain1.com , https://domain2.com , https://domain3.com '
    });
    
    const { client } = await serverManager.startServer('whitespace-server', ExpressServer, productionConfig);
    
    // Should trim whitespace and work correctly
    const response = await client.get('/health', {
      headers: { 'Origin': 'https://domain2.com' }
    });
    
    TestAssertions.assertStatus(response, 200);
    
    const corsOrigin = response.headers['access-control-allow-origin'];
    if (corsOrigin !== 'https://domain2.com') {
      throw new Error('Should handle whitespace in ALLOWED_ORIGINS');
    }
  });

  testRunner.test('Should reject CORS requests when ALLOWED_ORIGINS not configured (SECURITY FIX)', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      // ALLOWED_ORIGINS not set - this tests the security fix
    });
    
    const { client } = await serverManager.startServer('no-origins-server', ExpressServer, productionConfig);
    
    // Same-origin requests (no Origin header) should work
    const sameOriginResponse = await client.get('/health');
    TestAssertions.assertStatus(sameOriginResponse, 200);
    
    // Cross-origin requests should be rejected with 403
    const corsResponse = await client.get('/health', {
      headers: { 'Origin': 'https://any-domain.com' }
    });
    
    // This is the security fix - should return 403 instead of 200
    TestAssertions.assertStatus(corsResponse, 403);
    
    // Should include security error message
    if (!corsResponse.body.error || !corsResponse.body.error.includes('CORS policy')) {
      throw new Error('Should return CORS policy violation error');
    }
    
    // Should include the rejected origin for debugging
    if (!corsResponse.body.origin || corsResponse.body.origin !== 'https://any-domain.com') {
      throw new Error('Should include rejected origin in response');
    }
    
    console.log('✅ SECURITY FIX VALIDATED: Production rejects CORS when ALLOWED_ORIGINS not configured');
  });
});

testRunner.suite('CORS Headers and Methods Tests', () => {

  testRunner.test('Should include all required CORS headers', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('headers-server', ExpressServer, developmentConfig);
    
    const response = await client.get('/health', {
      headers: { 'Origin': 'http://test-origin.com' }
    });
    
    TestAssertions.assertStatus(response, 200);
    
    const requiredHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };
    
    for (const [header, expectedValue] of Object.entries(requiredHeaders)) {
      const actualValue = response.headers[header];
      if (!actualValue) {
        throw new Error(`Missing CORS header: ${header}`);
      }
      
      if (header === 'access-control-allow-headers' || header === 'access-control-allow-methods') {
        // For these headers, check that expected values are included
        for (const part of expectedValue.split(',').map(s => s.trim())) {
          if (!actualValue.includes(part)) {
            throw new Error(`CORS header ${header} missing: ${part}`);
          }
        }
      }
    }
  });

  testRunner.test('Should handle all HTTP methods correctly', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('methods-server', ExpressServer, developmentConfig);
    
    const methods = ['GET', 'POST', 'OPTIONS'];
    
    for (const method of methods) {
      let response;
      
      if (method === 'GET') {
        response = await client.get('/health', {
          headers: { 'Origin': 'http://test-origin.com' }
        });
      } else if (method === 'POST') {
        response = await client.post('/mcp', {}, {
          headers: { 'Origin': 'http://test-origin.com' }
        });
      } else if (method === 'OPTIONS') {
        response = await client.options('/health', {
          headers: { 'Origin': 'http://test-origin.com' }
        });
      }
      
      // Should include CORS headers for all methods
      if (!response.headers['access-control-allow-origin']) {
        throw new Error(`Missing CORS header for ${method} request`);
      }
    }
  });

  testRunner.test('Should handle requests without Origin header', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('no-origin-server', ExpressServer, developmentConfig);
    
    // Request without Origin header (like direct API calls)
    const response = await client.get('/health');
    
    TestAssertions.assertStatus(response, 200);
    
    // Should still work but may not need CORS headers
    // This is valid behavior - CORS is for browser requests
  });
});

testRunner.suite('CORS Security Edge Cases', () => {

  testRunner.test('Should prevent null origin bypass in production', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://trusted-domain.com'
    });
    
    const { client } = await serverManager.startServer('null-origin-server', ExpressServer, productionConfig);
    
    // Test null origin (can be set by attackers)
    const response = await client.get('/health', {
      headers: { 'Origin': 'null' }
    });
    
    TestAssertions.assertStatus(response, 200);
    
    const corsOrigin = response.headers['access-control-allow-origin'];
    if (corsOrigin === 'null') {
      throw new Error('Should not allow null origin in production');
    }
  });

  testRunner.test('Should handle case-sensitive origin matching', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://TrustedDomain.com'
    });
    
    const { client } = await serverManager.startServer('case-server', ExpressServer, productionConfig);
    
    // Test case variations
    const testCases = [
      { origin: 'https://TrustedDomain.com', shouldAllow: true },
      { origin: 'https://trusteddomain.com', shouldAllow: false },
      { origin: 'https://TRUSTEDDOMAIN.COM', shouldAllow: false }
    ];
    
    for (const testCase of testCases) {
      const response = await client.get('/health', {
        headers: { 'Origin': testCase.origin }
      });
      
      TestAssertions.assertStatus(response, 200);
      
      const corsOrigin = response.headers['access-control-allow-origin'];
      
      if (testCase.shouldAllow) {
        if (corsOrigin !== testCase.origin) {
          throw new Error(`Should allow exact case match: ${testCase.origin}`);
        }
      } else {
        if (corsOrigin === testCase.origin) {
          throw new Error(`Should not allow case mismatch: ${testCase.origin}`);
        }
      }
    }
  });

  testRunner.test('Should prevent subdomain bypass attempts', async () => {
    mockEnv.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      ALLOWED_ORIGINS: 'https://trusted-domain.com'
    });
    
    const { client } = await serverManager.startServer('subdomain-server', ExpressServer, productionConfig);
    
    const bypassAttempts = [
      'https://evil.trusted-domain.com',
      'https://trusted-domain.com.evil.com',
      'https://trusted-domain.com-evil.com',
      'http://trusted-domain.com', // Wrong protocol
      'https://trusted-domain.com:8080' // With port
    ];
    
    for (const maliciousOrigin of bypassAttempts) {
      const response = await client.get('/health', {
        headers: { 'Origin': maliciousOrigin }
      });
      
      TestAssertions.assertStatus(response, 200);
      
      const corsOrigin = response.headers['access-control-allow-origin'];
      if (corsOrigin === maliciousOrigin) {
        throw new Error(`Should not allow bypass attempt: ${maliciousOrigin}`);
      }
    }
  });

  testRunner.test('Should handle malformed origin headers', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('malformed-server', ExpressServer, developmentConfig);
    
    const malformedOrigins = [
      'not-a-url',
      'ftp://invalid-protocol.com',
      '//no-protocol.com',
      'https://',
      'javascript:alert(1)',
      '<script>alert(1)</script>'
    ];
    
    for (const malformedOrigin of malformedOrigins) {
      try {
        const response = await client.get('/health', {
          headers: { 'Origin': malformedOrigin }
        });
        
        // Should not crash server
        if (response.status >= 500) {
          throw new Error(`Malformed origin crashed server: ${malformedOrigin}`);
        }
        
        // In development, might still allow (return *), but shouldn't crash
        console.log(`Handled malformed origin: ${malformedOrigin} -> ${response.status}`);
        
      } catch (error) {
        if (error.message.includes('crashed server')) {
          throw error;
        }
        // Network errors are acceptable for malformed origins
        console.log(`Network error for malformed origin: ${malformedOrigin}`);
      }
    }
  });
});

testRunner.suite('CORS Integration Tests', () => {

  testRunner.test('Should apply CORS consistently across endpoints', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('consistent-server', ExpressServer, developmentConfig);
    
    const endpoints = ['/health', '/mcp', '/'];
    const origin = 'http://test-origin.com';
    
    for (const endpoint of endpoints) {
      let response;
      
      if (endpoint === '/mcp') {
        response = await client.post(endpoint, {}, {
          headers: { 'Origin': origin }
        });
      } else {
        response = await client.get(endpoint, {
          headers: { 'Origin': origin }
        });
      }
      
      // All endpoints should have consistent CORS policy
      const corsOrigin = response.headers['access-control-allow-origin'];
      if (!corsOrigin) {
        throw new Error(`Missing CORS header on endpoint: ${endpoint}`);
      }
      
      // In development, should be '*'
      if (corsOrigin !== '*') {
        throw new Error(`Inconsistent CORS on ${endpoint}: ${corsOrigin}`);
      }
    }
  });

  testRunner.test('Should work with real browser-like requests', async () => {
    mockEnv.development();
    const { client } = await serverManager.startServer('browser-server', ExpressServer, developmentConfig);
    
    // Simulate browser preflight + actual request
    const preflightResponse = await client.options('/mcp', {
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    
    TestAssertions.assertStatus(preflightResponse, 200);
    TestAssertions.assertCORSHeaders(preflightResponse);
    
    // Actual request
    const actualResponse = await client.post('/mcp', {}, {
      headers: {
        'Origin': 'http://localhost:3000',
        'Content-Type': 'application/json'
      }
    });
    
    // Should have CORS headers
    if (!actualResponse.headers['access-control-allow-origin']) {
      throw new Error('Actual request missing CORS headers');
    }
  });
});

// Export test runner
export { testRunner };