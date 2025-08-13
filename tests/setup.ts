/**
 * Jest test setup file
 * Configures global test environment and mocks
 */

// Mock environment variables for all tests
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_client_secret';
process.env.NODE_ENV = 'test';

// Mock fetch globally
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
const originalError = console.error;
console.error = (...args: any[]) => {
  if (
    typeof args[0] === 'string' && 
    args[0].includes('TDX') && 
    args[0].includes('test')
  ) {
    // Suppress expected TDX test errors
    return;
  }
  originalError.apply(console, args);
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});