/**
 * Jest test setup file
 * Configures global test environment and mocks
 */

// Mock environment variables for all tests
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_client_secret';
process.env.NODE_ENV = 'test';

// Global time control for consistent test results
// Set to 07:00 so trains departing at 08:30 and 09:00 are within 2-hour window
const FIXED_TEST_DATE = new Date('2025-08-14T07:00:00+08:00');

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

// Setup global time control 
beforeAll(() => {
  // Use fake timers and set system time for consistent test results
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_TEST_DATE);
});

afterAll(() => {
  jest.useRealTimers();
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});