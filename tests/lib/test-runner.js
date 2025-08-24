#!/usr/bin/env node

/**
 * Simple Test Runner for MCP Server Tests
 * Provides basic testing utilities without external dependencies
 */

export class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.results = {
      suiteName,
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: [],
      details: [],
      startTime: Date.now()
    };
    this.currentDescribe = null;
  }

  async describe(description, testFn) {
    console.log(`\n📋 ${description}`);
    console.log('─'.repeat(60));
    
    this.currentDescribe = description;
    
    try {
      await testFn();
    } catch (error) {
      console.log(`❌ ERROR in describe block: ${error.message}`);
      this.results.errors.push({
        describe: description,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async test(testName, testFn) {
    console.log(`\n🧪 ${testName}`);
    this.results.totalTests++;
    
    const testStart = Date.now();
    let passed = false;
    let error = null;
    
    try {
      await testFn();
      passed = true;
      this.results.passed++;
      console.log(`   ✅ PASS (${Date.now() - testStart}ms)`);
    } catch (err) {
      error = err;
      this.results.failed++;
      console.log(`   ❌ FAIL (${Date.now() - testStart}ms)`);
      console.log(`   Error: ${err.message}`);
    }
    
    this.results.details.push({
      describe: this.currentDescribe,
      testName,
      passed,
      error: error ? error.message : null,
      duration: Date.now() - testStart
    });
  }

  expect(actual) {
    return new Expectation(actual);
  }

  getResults() {
    this.results.duration = Date.now() - this.results.startTime;
    this.results.successRate = this.results.totalTests > 0 
      ? ((this.results.passed / this.results.totalTests) * 100).toFixed(1)
      : '0.0';
    
    return this.results;
  }

  printSummary() {
    const results = this.getResults();
    
    console.log('\n' + '='.repeat(80));
    console.log(`${results.suiteName.toUpperCase()} - TEST SUMMARY`);
    console.log('='.repeat(80));
    console.log(`Total tests: ${results.totalTests}`);
    console.log(`Passed: ${results.passed} ✅`);
    console.log(`Failed: ${results.failed} ❌`);
    console.log(`Success rate: ${results.successRate}%`);
    console.log(`Duration: ${results.duration}ms`);
    
    if (results.failed > 0) {
      console.log('\n🔍 FAILURES:');
      results.details.filter(d => !d.passed).forEach(detail => {
        console.log(`   • ${detail.describe} - ${detail.testName}`);
        if (detail.error) {
          console.log(`     ${detail.error}`);
        }
      });
    }
    
    if (results.errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      results.errors.forEach(error => {
        console.log(`   • ${error.describe}: ${error.error}`);
      });
    }
    
    return results;
  }
}

class Expectation {
  constructor(actual) {
    this.actual = actual;
  }

  toBe(expected) {
    if (this.actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(this.actual)}`);
    }
    return this;
  }

  toEqual(expected) {
    if (JSON.stringify(this.actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(this.actual)}`);
    }
    return this;
  }

  toInclude(expectedItems) {
    if (!Array.isArray(expectedItems)) {
      expectedItems = [expectedItems];
    }
    
    const missing = expectedItems.filter(item => !this.actual.includes(item));
    if (missing.length > 0) {
      throw new Error(`Expected to include [${missing.join(', ')}], but they were missing from: "${this.actual.substring(0, 200)}..."`);
    }
    return this;
  }

  toNotInclude(unexpectedItems) {
    if (!Array.isArray(unexpectedItems)) {
      unexpectedItems = [unexpectedItems];
    }
    
    const found = unexpectedItems.filter(item => this.actual.includes(item));
    if (found.length > 0) {
      throw new Error(`Expected NOT to include [${found.join(', ')}], but found them in: "${this.actual.substring(0, 200)}..."`);
    }
    return this;
  }

  toBeGreaterThan(expected) {
    if (this.actual <= expected) {
      throw new Error(`Expected ${this.actual} to be greater than ${expected}`);
    }
    return this;
  }

  toBeLessThan(expected) {
    if (this.actual >= expected) {
      throw new Error(`Expected ${this.actual} to be less than ${expected}`);
    }
    return this;
  }

  toBeGreaterThanOrEqual(expected) {
    if (this.actual < expected) {
      throw new Error(`Expected ${this.actual} to be greater than or equal to ${expected}`);
    }
    return this;
  }

  toBeTruthy() {
    if (!this.actual) {
      throw new Error(`Expected ${JSON.stringify(this.actual)} to be truthy`);
    }
    return this;
  }

  toBeFalsy() {
    if (this.actual) {
      throw new Error(`Expected ${JSON.stringify(this.actual)} to be falsy`);
    }
    return this;
  }

  toThrow(expectedMessage) {
    let thrown = false;
    let actualMessage = '';
    
    try {
      if (typeof this.actual === 'function') {
        this.actual();
      }
    } catch (error) {
      thrown = true;
      actualMessage = error.message;
    }
    
    if (!thrown) {
      throw new Error('Expected function to throw an error, but it did not');
    }
    
    if (expectedMessage && !actualMessage.includes(expectedMessage)) {
      throw new Error(`Expected error message to include "${expectedMessage}", but got "${actualMessage}"`);
    }
    
    return this;
  }
}

export default TestRunner;