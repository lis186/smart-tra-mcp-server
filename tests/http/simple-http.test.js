/**
 * Simple HTTP Transport Test
 * Basic test to verify HTTP transport functionality
 */

import { TestRunner } from '../lib/test-runner.js';
import { 
  HTTPTestClient, 
  TestServerManager, 
  MockEnvironment,
  TestAssertions
} from '../lib/http-test-utils.js';
import { ExpressServer } from '../../dist/core/express-server.js';

const testRunner = new TestRunner('Simple HTTP Transport Tests');

// Base test configuration (port will be dynamically assigned)
const baseTestConfig = {
  host: '127.0.0.1',
  environment: 'development'
};

// Helper functions
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
  
  await testRunner.describe('Basic HTTP Server Tests', async () => {
    
    await testRunner.test('Should start HTTP server and respond to health checks', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('basic-server', ExpressServer, baseTestConfig);
        
        const response = await client.get('/health');
        TestAssertions.assertStatus(response, 200);
        
        if (!response.body || !response.body.status) {
          throw new Error('Health response should have status field');
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });

    await testRunner.test('Should handle MCP endpoint requests', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('mcp-server', ExpressServer, baseTestConfig);
        
        const response = await client.post('/mcp', {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
          }
        });
        
        // Should accept MCP requests (may return error but shouldn't 404)
        if (response.status === 404) {
          throw new Error('MCP endpoint should be accessible');
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });

    await testRunner.test('Should handle CORS correctly in development', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('cors-server', ExpressServer, baseTestConfig);
        
        const response = await client.get('/health', {
          headers: { 'Origin': 'http://test-origin.com' }
        });
        
        TestAssertions.assertStatus(response, 200);
        
        // In development, should allow any origin
        const corsOrigin = response.headers['access-control-allow-origin'];
        if (corsOrigin !== '*') {
          throw new Error(`Expected CORS allow all in dev, got: ${corsOrigin}`);
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });

    await testRunner.test('Should handle 404 requests gracefully', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('404-server', ExpressServer, baseTestConfig);
        
        const response = await client.get('/nonexistent-endpoint');
        
        TestAssertions.assertStatus(response, 404);
        
        if (!response.body || !response.body.error) {
          throw new Error('404 response should include error information');
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });
  });

  await testRunner.describe('HTTP Transport Integration', async () => {
    
    await testRunner.test('Should integrate with MCP server successfully', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('integration-server', ExpressServer, baseTestConfig);
        
        // Health check should show MCP transport integration
        const healthResponse = await client.get('/health');
        TestAssertions.assertStatus(healthResponse, 200);
        
        const checks = healthResponse.body.checks;
        if (!checks || !checks.mcpTransport || !checks.system || !checks.tdxClient) {
          throw new Error('Health check should include all component checks');
        }
        
        // Test root endpoint for tools list
        const rootResponse = await client.get('/');
        if (!rootResponse.body || !rootResponse.body.tools) {
          throw new Error('Root endpoint should include tools list');
        }
        
        const tools = rootResponse.body.tools;
        const expectedTools = ['search_trains', 'search_station', 'plan_trip'];
        for (const tool of expectedTools) {
          if (!tools.includes(tool)) {
            throw new Error(`Missing expected tool: ${tool}`);
          }
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });
  });

  return testRunner.getResults();
}

// Export test runner for integration
export { testRunner };

// If run directly, execute tests
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const results = await runAll();
    testRunner.printSummary();
    
    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}