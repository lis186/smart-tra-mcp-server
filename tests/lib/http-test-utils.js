/**
 * HTTP Test Utilities
 * Provides utilities for testing HTTP transport layer functionality
 */

import { setTimeout } from 'timers/promises';

/**
 * HTTP Test Client - Simplified HTTP request utility for tests
 */
export class HTTPTestClient {
  constructor(baseUrl = 'http://localhost') {
    this.baseUrl = baseUrl;
  }

  /**
   * Make HTTP GET request
   */
  async get(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        ...options
      });

      const responseData = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: null
      };

      // Try to parse as JSON, fall back to text
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseData.body = await response.json();
      } else {
        responseData.body = await response.text();
      }

      return responseData;
    } catch (error) {
      throw new Error(`HTTP GET failed: ${error.message}`);
    }
  }

  /**
   * Make HTTP POST request
   */
  async post(path, data, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: typeof data === 'string' ? data : JSON.stringify(data),
        ...options
      });

      const responseData = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: null
      };

      // Try to parse as JSON, fall back to text
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseData.body = await response.json();
      } else {
        responseData.body = await response.text();
      }

      return responseData;
    } catch (error) {
      throw new Error(`HTTP POST failed: ${error.message}`);
    }
  }

  /**
   * Make HTTP OPTIONS request (for CORS preflight testing)
   */
  async options(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        method: 'OPTIONS',
        headers,
        ...options
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      throw new Error(`HTTP OPTIONS failed: ${error.message}`);
    }
  }
}

// Global port counter to avoid conflicts across TestServerManager instances
let globalPortCounter = 3001;

/**
 * Test Server Manager - Manages test HTTP server lifecycle
 */
export class TestServerManager {
  constructor() {
    this.servers = new Map();
  }

  /**
   * Get next available port
   */
  getNextPort() {
    return globalPortCounter++;
  }

  /**
   * Start test server and register it
   */
  async startServer(serverName, ServerClass, config = {}) {
    const port = this.getNextPort();
    const serverConfig = {
      port,
      host: '127.0.0.1',
      environment: 'development',
      ...config
    };

    const server = new ServerClass(serverConfig);
    
    try {
      // Store original start method and wrap it to capture HTTP server instance
      const originalApp = server.app;
      let httpServer = null;
      
      if (originalApp) {
        const originalListen = originalApp.listen.bind(originalApp);
        originalApp.listen = function(port, host, callback) {
          httpServer = originalListen(port, host, callback);
          return httpServer;
        };
      }
      
      await server.start();
      
      // Wait for server to be ready
      await setTimeout(100);
      
      this.servers.set(serverName, {
        instance: server,
        httpServer: httpServer,
        config: serverConfig,
        baseUrl: `http://${serverConfig.host}:${serverConfig.port}`
      });

      return {
        server,
        config: serverConfig,
        baseUrl: `http://${serverConfig.host}:${serverConfig.port}`,
        client: new HTTPTestClient(`http://${serverConfig.host}:${serverConfig.port}`)
      };
    } catch (error) {
      throw new Error(`Failed to start test server ${serverName}: ${error.message}`);
    }
  }

  /**
   * Stop specific server
   */
  async stopServer(serverName) {
    const serverInfo = this.servers.get(serverName);
    if (serverInfo) {
      // Try to stop via instance stop method first
      if (serverInfo.instance.stop) {
        await serverInfo.instance.stop();
      }
      // If we have HTTP server instance, close it
      else if (serverInfo.httpServer) {
        await new Promise((resolve) => {
          serverInfo.httpServer.close(resolve);
        });
      }
      this.servers.delete(serverName);
      // Small delay to ensure port is fully released
      await setTimeout(50);
    }
  }

  /**
   * Stop all test servers
   */
  async stopAllServers() {
    const stopPromises = Array.from(this.servers.entries()).map(([name, serverInfo]) => {
      // Try to stop via instance stop method first
      if (serverInfo.instance.stop) {
        return serverInfo.instance.stop();
      }
      // If we have HTTP server instance, close it
      else if (serverInfo.httpServer) {
        return new Promise((resolve) => {
          serverInfo.httpServer.close(resolve);
        });
      }
      return Promise.resolve();
    });

    await Promise.all(stopPromises);
    this.servers.clear();
    
    // Small delay to ensure all ports are fully released
    await setTimeout(100);
  }

  /**
   * Get server info
   */
  getServer(serverName) {
    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found`);
    }
    return serverInfo;
  }
}

/**
 * Mock Environment Manager - Manages environment variables for tests
 */
export class MockEnvironment {
  constructor() {
    this.originalEnv = { ...process.env };
  }

  /**
   * Set environment variables for test
   */
  setEnv(envVars) {
    Object.assign(process.env, envVars);
  }

  /**
   * Restore original environment
   */
  restore() {
    process.env = { ...this.originalEnv };
  }

  /**
   * Create development environment
   */
  development() {
    this.setEnv({
      NODE_ENV: 'development',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      USE_MOCK_DATA: 'true'
    });
  }

  /**
   * Create production environment
   */
  production() {
    this.setEnv({
      NODE_ENV: 'production',
      TDX_CLIENT_ID: 'test_client_id',
      TDX_CLIENT_SECRET: 'test_secret',
      USE_MOCK_DATA: 'true',
      ALLOWED_ORIGINS: 'https://example.com,https://test.com'
    });
  }
}

/**
 * MCP Protocol Test Utilities
 */
export class MCPTestUtils {
  /**
   * Create valid MCP initialize request
   */
  static createInitializeRequest(clientInfo = {}) {
    return {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: true
          }
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
          ...clientInfo
        }
      }
    };
  }

  /**
   * Create MCP tool call request
   */
  static createToolCallRequest(toolName, args = {}, id = 2) {
    return {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };
  }

  /**
   * Create invalid MCP request
   */
  static createInvalidRequest() {
    return {
      // Missing jsonrpc and required fields
      id: 1,
      method: 'invalid'
    };
  }

  /**
   * Validate MCP response format
   */
  static validateMCPResponse(response) {
    const errors = [];
    
    if (!response.jsonrpc) {
      errors.push('Missing jsonrpc field');
    } else if (response.jsonrpc !== '2.0') {
      errors.push(`Invalid jsonrpc version: ${response.jsonrpc}`);
    }

    if (response.id === undefined) {
      errors.push('Missing id field');
    }

    if (response.error && response.result) {
      errors.push('Response cannot have both error and result');
    }

    if (!response.error && !response.result) {
      errors.push('Response must have either error or result');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Performance Test Utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure request response time
   */
  static async measureResponseTime(requestFn) {
    const start = process.hrtime.bigint();
    const result = await requestFn();
    const end = process.hrtime.bigint();
    
    return {
      result,
      responseTimeMs: Number(end - start) / 1_000_000
    };
  }

  /**
   * Run concurrent requests test
   */
  static async runConcurrentTest(requestFn, concurrency = 10, iterations = 100) {
    const results = {
      totalRequests: concurrency * iterations,
      successCount: 0,
      errorCount: 0,
      responseTimes: [],
      errors: []
    };

    const batches = [];
    for (let i = 0; i < iterations; i++) {
      const batch = [];
      for (let j = 0; j < concurrency; j++) {
        batch.push(
          this.measureResponseTime(requestFn).then(result => {
            results.successCount++;
            results.responseTimes.push(result.responseTimeMs);
            return result;
          }).catch(error => {
            results.errorCount++;
            results.errors.push(error.message);
            throw error;
          })
        );
      }
      batches.push(Promise.allSettled(batch));
    }

    await Promise.all(batches);

    // Calculate statistics
    results.avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
    results.minResponseTime = Math.min(...results.responseTimes);
    results.maxResponseTime = Math.max(...results.responseTimes);
    results.successRate = (results.successCount / results.totalRequests) * 100;

    return results;
  }
}

/**
 * Test Assertion Utilities
 */
export class TestAssertions {
  /**
   * Assert HTTP status code
   */
  static assertStatus(response, expectedStatus) {
    if (response.status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
    }
  }

  /**
   * Assert response contains headers
   */
  static assertHeaders(response, expectedHeaders) {
    for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
      const actualValue = response.headers[key.toLowerCase()];
      if (actualValue !== expectedValue) {
        throw new Error(`Expected header ${key}: ${expectedValue}, got: ${actualValue}`);
      }
    }
  }

  /**
   * Assert response body structure
   */
  static assertBodyStructure(body, requiredFields) {
    const errors = [];
    
    for (const field of requiredFields) {
      if (!(field in body)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Body validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Assert CORS headers
   */
  static assertCORSHeaders(response, expectedOrigin = null) {
    const headers = response.headers;
    
    if (expectedOrigin) {
      if (headers['access-control-allow-origin'] !== expectedOrigin) {
        throw new Error(`Expected CORS origin ${expectedOrigin}, got ${headers['access-control-allow-origin']}`);
      }
    }

    // Check required CORS headers exist
    const requiredHeaders = [
      'access-control-allow-headers',
      'access-control-allow-methods'
    ];

    for (const header of requiredHeaders) {
      if (!headers[header]) {
        throw new Error(`Missing CORS header: ${header}`);
      }
    }
  }
}

// Export global test server manager instance
export const testServerManager = new TestServerManager();

// Cleanup helper for tests
export function setupTestCleanup() {
  // Clean up test servers after each test
  if (global.afterEach) {
    global.afterEach(async () => {
      await testServerManager.stopAllServers();
    });
  }

  // Final cleanup
  if (global.after) {
    global.after(async () => {
      await testServerManager.stopAllServers();
    });
  }
}