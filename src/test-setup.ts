/**
 * Test setup for Smart TRA MCP Server
 * Configures environment and mocks for testing
 */

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

// Increase test timeout for integration tests
jest.setTimeout(10000);

// Mock console.error to reduce noise in test output
const originalConsoleError = console.error;
global.console.error = jest.fn((...args) => {
  // Only show errors in verbose mode
  if (process.env.JEST_VERBOSE) {
    originalConsoleError(...args);
  }
});

// Clean up after tests
afterAll(() => {
  global.console.error = originalConsoleError;
});

export {};