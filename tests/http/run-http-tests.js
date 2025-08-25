/**
 * HTTP Transport Test Runner
 * Executes all HTTP transport layer tests
 */

import { testRunner as expressServerTests } from './express-server.test.js';
import { testRunner as healthEndpointTests } from './health-endpoint.test.js';
import { testRunner as mcpEndpointTests } from './mcp-endpoint.test.js';
import { testRunner as corsSecurityTests } from './cors-security.test.js';
import { testRunner as integrationTests } from './integration.test.js';

/**
 * Main HTTP test runner
 */
class HTTPTestRunner {
  constructor() {
    this.testRunners = [
      { name: 'ExpressServer Unit Tests', runner: expressServerTests },
      { name: 'Health Endpoint Tests', runner: healthEndpointTests },
      { name: 'MCP Endpoint Tests', runner: mcpEndpointTests },
      { name: 'CORS Security Tests', runner: corsSecurityTests },
      { name: 'HTTP Integration Tests', runner: integrationTests }
    ];
  }

  async runAllTests() {
    console.log('================================================================================');
    console.log('🌐 HTTP TRANSPORT TEST SUITE - COMPREHENSIVE TESTING');
    console.log('================================================================================');
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('');

    const overallResults = {
      totalSuites: this.testRunners.length,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      errors: [],
      startTime: Date.now()
    };

    for (const { name, runner } of this.testRunners) {
      console.log('================================================================================');
      console.log(`🧪 ${name.toUpperCase()}`);
      console.log('================================================================================');
      console.log('');

      try {
        const results = await runner.runAll();
        
        overallResults.totalTests += results.totalTests;
        overallResults.passedTests += results.passedTests;
        overallResults.failedTests += results.failedTests;
        
        if (results.errors && results.errors.length > 0) {
          overallResults.errors.push(...results.errors);
        }

        // Print summary for this test suite
        console.log('');
        console.log(`================================================================================`);
        console.log(`${name.toUpperCase()} - TEST SUMMARY`);
        console.log(`================================================================================`);
        console.log(`Total tests: ${results.totalTests}`);
        console.log(`Passed: ${results.passedTests} ✅`);
        console.log(`Failed: ${results.failedTests} ❌`);
        console.log(`Success rate: ${((results.passedTests / results.totalTests) * 100).toFixed(1)}%`);
        console.log(`Duration: ${results.duration || 'N/A'}ms`);
        console.log('');

        if (results.failedTests > 0 && results.errors) {
          console.log('🔍 FAILURES:');
          for (const error of results.errors) {
            console.log(`   • ${error}`);
          }
          console.log('');
        }

      } catch (error) {
        console.error(`❌ Failed to run ${name}:`, error.message);
        overallResults.errors.push(`${name}: ${error.message}`);
        overallResults.failedTests++;
      }
    }

    // Overall summary
    const totalDuration = Date.now() - overallResults.startTime;
    const successRate = overallResults.totalTests > 0 
      ? ((overallResults.passedTests / overallResults.totalTests) * 100).toFixed(1)
      : 0;

    console.log('================================================================================');
    console.log('🏆 HTTP TRANSPORT TEST RESULTS - OVERALL SUMMARY');
    console.log('================================================================================');
    console.log(`Total test suites: ${overallResults.totalSuites}`);
    console.log(`Total tests: ${overallResults.totalTests}`);
    console.log(`Passed: ${overallResults.passedTests} ✅`);
    console.log(`Failed: ${overallResults.failedTests} ❌`);
    console.log(`Overall success rate: ${successRate}%`);
    console.log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log('');

    // Suite breakdown
    console.log('📊 Suite Breakdown:');
    let suiteIndex = 0;
    for (const { name, runner } of this.testRunners) {
      try {
        const results = await runner.getLastResults();
        const suiteSuccessRate = results?.totalTests > 0 
          ? ((results.passedTests / results.totalTests) * 100).toFixed(1)
          : 0;
        
        const status = results?.failedTests === 0 ? '✅' : '❌';
        console.log(`   ${status} ${name}: ${results?.passedTests || 0}/${results?.totalTests || 0} (${suiteSuccessRate}%)`);
      } catch (error) {
        console.log(`   ❌ ${name}: Error running tests`);
      }
      suiteIndex++;
    }

    console.log('');

    // Production readiness assessment
    console.log('🎯 Production Readiness Assessment:');
    
    if (successRate >= 95) {
      console.log('   • HTTP Transport: ✅ EXCELLENT - Production ready');
    } else if (successRate >= 90) {
      console.log('   • HTTP Transport: 🟡 GOOD - Minor issues to address');  
    } else if (successRate >= 80) {
      console.log('   • HTTP Transport: 🟠 FAIR - Several issues need fixing');
    } else {
      console.log('   • HTTP Transport: 🔴 POOR - Major issues blocking production');
    }

    // Key insights
    console.log('');
    console.log('💡 Key Insights:');
    console.log('   • ExpressServer lifecycle and configuration testing');
    console.log('   • Health endpoint reliability for Cloud Run deployment');
    console.log('   • MCP protocol compliance over HTTP transport');
    console.log('   • CORS security policy enforcement');
    console.log('   • Full stack integration validation');

    if (overallResults.failedTests > 0) {
      console.log('');
      console.log('🔍 OVERALL FAILURES:');
      for (const error of overallResults.errors) {
        console.log(`   • ${error}`);
      }
    }

    console.log('');
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    console.log('================================================================================');

    return overallResults;
  }
}

// Export for integration with main test runner
export { HTTPTestRunner };

// If run directly, execute all tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new HTTPTestRunner();
  
  try {
    const results = await runner.runAllTests();
    
    // Exit with error code if tests failed
    if (results.failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ HTTP test runner failed:', error);
    process.exit(1);
  }
}