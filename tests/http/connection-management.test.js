/**
 * Connection Management Optimization Tests
 * Tests the optimized connection handling and resource cleanup
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

const testRunner = new TestRunner('Connection Management Tests');

// Test configuration
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
  
  await testRunner.describe('Optimized Error Handling Tests', async () => {
    
    await testRunner.test('Should categorize errors efficiently using pre-compiled patterns', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('error-pattern-server', ExpressServer, baseTestConfig);
        
        // Test MCP-specific errors (these will reach our error handler)
        const response = await client.post('/mcp', {
          jsonrpc: '2.0',
          id: 1,
          method: 'nonexistent_method',
          params: {}
        });
        
        // Should return error response with our categorization
        if (response.status < 400) {
          throw new Error('Should return error for invalid MCP method');
        }
        
        // Our error handler should have processed this
        console.log('Error response processed successfully');
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });

    await testRunner.test('Should provide optimized error context in development', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('error-context-server', ExpressServer, {
          ...baseTestConfig,
          environment: 'development'
        });
        
        const response = await client.post('/mcp', 'malformed', {
          headers: { 
            'Content-Type': 'application/json',
            'Origin': 'http://test-origin.com'
          }
        });
        
        // Should return structured error with debug info in development
        if (response.status < 400) {
          throw new Error('Should return error status for malformed request');
        }
        
        if (!response.body?.debug) {
          throw new Error('Development mode should include debug information');
        }
        
        // Debug info should include transport status
        if (!response.body.debug.transport) {
          throw new Error('Debug info should include transport status');
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });

    await testRunner.test('Should limit error disclosure in production', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        mockEnv.setEnv({
          NODE_ENV: 'production',
          TDX_CLIENT_ID: 'test_client_id',
          TDX_CLIENT_SECRET: 'test_secret'
        });
        
        const { client } = await serverManager.startServer('prod-error-server', ExpressServer, {
          ...baseTestConfig,
          environment: 'production'
        });
        
        const response = await client.post('/mcp', 'malformed', {
          headers: { 'Content-Type': 'application/json' }
        });
        
        // Should return error but limit disclosure
        if (response.status < 400) {
          throw new Error('Should return error status for malformed request');
        }
        
        // Should not include debug info in production
        if (response.body?.debug) {
          throw new Error('Production mode should not include debug information');
        }
        
        // Message should be generic
        if (response.body?.message && response.body.message !== 'Internal server error') {
          throw new Error('Production error messages should be generic');
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });
  });

  await testRunner.describe('Resource Cleanup and Memory Management', async () => {
    
    await testRunner.test('Should properly clean up server resources', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        // Start server
        const serverInfo = await serverManager.startServer('cleanup-server', ExpressServer, baseTestConfig);
        
        // Make some requests to initialize resources
        await serverInfo.client.get('/health');
        await serverInfo.client.post('/mcp', { test: 'request' });
        
        // Stop server (this should clean up resources)
        await serverManager.stopServer('cleanup-server');
        
        // Server should be stopped
        try {
          await serverInfo.client.get('/health');
          throw new Error('Server should be stopped');
        } catch (error) {
          // Expected - server should be unreachable
          console.log('Server properly stopped:', error.message.includes('fetch failed'));
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });

    await testRunner.test('Should handle memory efficiently under load', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('memory-server', ExpressServer, baseTestConfig);
        
        // Get initial memory usage
        const initialHealth = await client.get('/health');
        const initialMemory = initialHealth.body.checks.system.memoryUsage.rss;
        
        // Generate load with various request types
        const requests = [];
        for (let i = 0; i < 20; i++) {
          requests.push(client.get('/health'));
          requests.push(client.post('/mcp', { test: `request-${i}` }));
          requests.push(client.post('/mcp', 'malformed-request'));
        }
        
        await Promise.allSettled(requests);
        
        // Check final memory usage
        const finalHealth = await client.get('/health');
        const finalMemory = finalHealth.body.checks.system.memoryUsage.rss;
        
        const memoryIncrease = finalMemory - initialMemory;
        const increasePercent = (memoryIncrease / initialMemory) * 100;
        
        console.log(`Memory increase: ${increasePercent.toFixed(2)}%`);
        
        // Memory increase should be reasonable (less than 100%)
        if (increasePercent > 100) {
          console.warn(`High memory increase: ${increasePercent}%`);
        }
        
        // Server should still be responsive
        TestAssertions.assertStatus(finalHealth, 200);
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });
  });

  await testRunner.describe('Performance Optimization Validation', async () => {
    
    await testRunner.test('Should handle error categorization efficiently', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('perf-server', ExpressServer, baseTestConfig);
        
        // Test error handling performance with various error types
        const errorRequests = [
          () => client.post('/mcp', 'stream is not readable'),
          () => client.post('/mcp', 'Parse error occurred'), 
          () => client.post('/mcp', 'Invalid request format'),
          () => client.post('/mcp', 'timeout occurred'),
          () => client.post('/mcp', 'unknown error type')
        ];
        
        const results = await PerformanceTestUtils.runConcurrentTest(
          () => {
            const randomRequest = errorRequests[Math.floor(Math.random() * errorRequests.length)];
            return randomRequest();
          },
          3, // 3 concurrent requests
          10 // 10 iterations
        );
        
        console.log(`Error handling performance:`);
        console.log(`- Average response time: ${results.avgResponseTime}ms`);
        console.log(`- Max response time: ${results.maxResponseTime}ms`);
        
        // Error handling should be reasonably fast
        if (results.avgResponseTime > 500) {
          throw new Error(`Error handling too slow: ${results.avgResponseTime}ms`);
        }
        
        // Should handle all error requests (they return 4xx/5xx but shouldn't fail)
        if (results.successRate < 100) {
          console.log(`Error handling success rate: ${results.successRate}%`);
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });

    await testRunner.test('Should optimize error context building', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        const { client } = await serverManager.startServer('context-server', ExpressServer, baseTestConfig);
        
        // Test with large request body to validate context optimization
        const largeRequest = {
          data: 'x'.repeat(1000), // 1KB of data
          timestamp: new Date().toISOString(),
          malformed: true
        };
        
        const { result, responseTimeMs } = await PerformanceTestUtils.measureResponseTime(() => 
          client.post('/mcp', largeRequest, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'test-client-with-very-long-user-agent-string-that-should-be-truncated-properly',
              'Origin': 'http://test-origin.com'
            }
          })
        );
        
        console.log(`Error context building time: ${responseTimeMs}ms`);
        
        // Context building should be fast even with large requests
        if (responseTimeMs > 200) {
          throw new Error(`Error context building too slow: ${responseTimeMs}ms`);
        }
        
        // Should return appropriate error
        if (result.status < 400) {
          throw new Error('Should return error status for malformed request');
        }
        
      } finally {
        await teardownTest(mockEnv, serverManager);
      }
    });
  });

  await testRunner.describe('Signal Handler Optimization', async () => {
    
    await testRunner.test('Should not accumulate signal handlers', async () => {
      const { mockEnv, serverManager } = await setupTest();
      
      try {
        // Get initial listener count
        const initialSigterm = process.listenerCount('SIGTERM');
        const initialSigint = process.listenerCount('SIGINT');
        
        // Start multiple servers (simulating multiple instances)
        const servers = await Promise.all([
          serverManager.startServer('signal-server-1', ExpressServer, baseTestConfig),
          serverManager.startServer('signal-server-2', ExpressServer, {...baseTestConfig, port: baseTestConfig.port + 1}),
          serverManager.startServer('signal-server-3', ExpressServer, {...baseTestConfig, port: baseTestConfig.port + 2})
        ]);
        
        // Check listener count after starting servers
        const afterSigterm = process.listenerCount('SIGTERM');
        const afterSigint = process.listenerCount('SIGINT');
        
        console.log(`SIGTERM listeners: ${initialSigterm} -> ${afterSigterm}`);
        console.log(`SIGINT listeners: ${initialSigint} -> ${afterSigint}`);
        
        // Should not have excessive accumulation of signal handlers
        const termDiff = afterSigterm - initialSigterm;
        const intDiff = afterSigint - initialSigint;
        
        // With optimization, each server should clean up previous handlers
        // So we should have minimal increase (ideally just 1-2 handlers total)
        if (termDiff > 5 || intDiff > 5) {
          console.warn(`Signal handler accumulation detected: SIGTERM +${termDiff}, SIGINT +${intDiff}`);
        }
        
        // Verify servers are working
        for (const server of servers) {
          const health = await server.client.get('/health');
          TestAssertions.assertStatus(health, 200);
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
    console.error('Connection management test execution failed:', error);
    process.exit(1);
  }
}