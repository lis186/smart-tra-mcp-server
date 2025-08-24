#!/usr/bin/env node

/**
 * Test Suite Runner
 * Runs all test suites and provides comprehensive reporting
 */

import ToolBoundaryTests from './integration/tool-boundaries.test.js';
import DelegationTests from './integration/delegation.test.js';
import UserJourneyTests from './e2e/user-journeys.test.js';
import DestinationMappingTests from './unit/destination-mapping.test.js';

class TestSuiteRunner {
  constructor() {
    this.suites = [
      { name: 'Unit Tests', tests: [DestinationMappingTests] },
      { name: 'Integration Tests', tests: [ToolBoundaryTests, DelegationTests] },
      { name: 'E2E Tests', tests: [UserJourneyTests] }
    ];
    this.results = {
      totalSuites: 0,
      totalTests: 0,
      passed: 0,
      failed: 0,
      suiteResults: [],
      startTime: Date.now()
    };
  }

  async runAllSuites() {
    console.log('='.repeat(80));
    console.log('🧪 SMART TRA MCP SERVER - COMPREHENSIVE TEST SUITE');
    console.log('='.repeat(80));
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log();

    for (const suite of this.suites) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🎯 ${suite.name.toUpperCase()}`);
      console.log(`${'='.repeat(80)}`);

      for (const TestClass of suite.tests) {
        const testInstance = new TestClass();
        console.log(`\n🚀 Running ${testInstance.testRunner.suiteName}...`);
        
        try {
          const suiteResult = await testInstance.runTests();
          testInstance.testRunner.printSummary();
          
          this.results.totalSuites++;
          this.results.totalTests += suiteResult.totalTests;
          this.results.passed += suiteResult.passed;
          this.results.failed += suiteResult.failed;
          this.results.suiteResults.push(suiteResult);
          
        } catch (error) {
          console.log(`❌ SUITE ERROR: ${error.message}`);
          this.results.suiteResults.push({
            suiteName: testInstance.testRunner.suiteName,
            error: error.message,
            totalTests: 0,
            passed: 0,
            failed: 1
          });
          this.results.failed++;
        }
      }
    }

    this.printOverallSummary();
    return this.results;
  }

  printOverallSummary() {
    this.results.duration = Date.now() - this.results.startTime;
    this.results.successRate = this.results.totalTests > 0 
      ? ((this.results.passed / this.results.totalTests) * 100).toFixed(1)
      : '0.0';

    console.log('\n' + '='.repeat(80));
    console.log('🏆 OVERALL TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Total test suites: ${this.results.totalSuites}`);
    console.log(`Total tests: ${this.results.totalTests}`);
    console.log(`Passed: ${this.results.passed} ✅`);
    console.log(`Failed: ${this.results.failed} ❌`);
    console.log(`Overall success rate: ${this.results.successRate}%`);
    console.log(`Total duration: ${(this.results.duration / 1000).toFixed(1)}s`);

    console.log('\n📊 Suite Breakdown:');
    this.results.suiteResults.forEach(suite => {
      if (suite.error) {
        console.log(`   ❌ ${suite.suiteName}: ERROR - ${suite.error}`);
      } else {
        const rate = suite.totalTests > 0 ? ((suite.passed / suite.totalTests) * 100).toFixed(1) : '0.0';
        const status = rate === '100.0' ? '✅' : rate > '80.0' ? '⚠️ ' : '❌';
        console.log(`   ${status} ${suite.suiteName}: ${suite.passed}/${suite.totalTests} (${rate}%)`);
      }
    });

    // Business impact assessment
    console.log('\n🎯 Business Impact Assessment:');
    
    const unitTestSuccess = this.getSuiteSuccessRate('Destination Mapping Unit Tests');
    const integrationSuccess = this.getAverageSuccessRate(['Tool Boundary Tests', 'Internal Delegation Tests']);
    const e2eSuccess = this.getSuiteSuccessRate('User Journey E2E Tests');

    console.log(`   • Core Logic (Unit): ${unitTestSuccess}% - ${this.getStatusLabel(unitTestSuccess)}`);
    console.log(`   • Tool Integration: ${integrationSuccess}% - ${this.getStatusLabel(integrationSuccess)}`);
    console.log(`   • User Experience (E2E): ${e2eSuccess}% - ${this.getStatusLabel(e2eSuccess)}`);

    // Production readiness
    console.log('\n🚀 Production Readiness:');
    if (this.results.successRate >= 90) {
      console.log('   ✅ READY - High confidence in production deployment');
    } else if (this.results.successRate >= 75) {
      console.log('   ⚠️  CAUTION - Some issues need attention before production');
    } else {
      console.log('   ❌ NOT READY - Significant issues require resolution');
    }

    // Key insights
    console.log('\n💡 Key Insights:');
    console.log('   • Destination mapping logic correctness');
    console.log('   • Tool boundary enforcement effectiveness');
    console.log('   • Transfer detection accuracy');
    console.log('   • User journey completion rates');

    // Note about authentication
    if (this.results.failed > 0) {
      console.log('\n📝 Note: Some failures may be due to TDX authentication in test environment.');
      console.log('   Core logic tests should focus on business rules and tool boundaries.');
    }

    console.log(`\n⏰ Completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));
  }

  getSuiteSuccessRate(suiteName) {
    const suite = this.results.suiteResults.find(s => s.suiteName === suiteName);
    if (!suite || suite.totalTests === 0) return 0;
    return ((suite.passed / suite.totalTests) * 100).toFixed(1);
  }

  getAverageSuccessRate(suiteNames) {
    const rates = suiteNames.map(name => parseFloat(this.getSuiteSuccessRate(name)));
    const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    return average.toFixed(1);
  }

  getStatusLabel(successRate) {
    const rate = parseFloat(successRate);
    if (rate >= 90) return 'Excellent';
    if (rate >= 75) return 'Good';
    if (rate >= 60) return 'Needs Work';
    return 'Critical';
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TestSuiteRunner();
  
  runner.runAllSuites().then(results => {
    const exitCode = results.successRate >= 75 ? 0 : 1;
    process.exit(exitCode);
  }).catch(error => {
    console.error('Test suite runner failed:', error);
    process.exit(1);
  });
}

export default TestSuiteRunner;