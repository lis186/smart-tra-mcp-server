# Test Suite for Smart TRA MCP Server

This directory contains comprehensive tests for the Smart TRA MCP Server, organized by test type and functionality.

## Test Structure

```
tests/
├── api/                    # API integration tests
│   └── tdx-api.test.ts    # TDX API connectivity and v3 endpoint tests
├── integration/           # Integration tests
│   └── chinese-encoding.test.ts  # Chinese character encoding tests
├── unit-server.test.ts    # Unit tests for QueryParser
├── setup.ts              # Jest test setup and configuration
└── README.md             # This file
```

## Test Categories

### 🔌 **API Tests** (`tests/api/`)
- **TDX API Integration**: Tests real TDX API connectivity
- **v3 Endpoint Validation**: Verifies new API structure
- **Authentication Flow**: Tests OAuth token acquisition
- **Response Structure**: Validates API response format

### 🌐 **Integration Tests** (`tests/integration/`)
- **Chinese Encoding**: Comprehensive UTF-8 and character variant testing
- **Unicode Support**: Emoji and mixed-content handling
- **JSON Serialization**: Chinese text in JSON format
- **Control Character Sanitization**: Security input validation

### 🧪 **Unit Tests**
- **QueryParser**: Natural language parsing logic
- **Station Matching**: Fuzzy search algorithms
- **Time/Date Parsing**: Chinese time expression handling
- **Validation Methods**: Query validation and confidence scoring

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Categories
```bash
# Unit tests only
npm test unit-server

# API integration tests
npm test api

# Chinese encoding tests
npm test chinese-encoding

# With coverage
npm run test:coverage
```

### Test Environment Setup

#### For Unit Tests
No special setup required - uses mocked TDX API responses.

#### For API Integration Tests
Set up real TDX API credentials:

1. Register at [TDX Portal](https://tdx.transportdata.tw/)
2. Get API credentials from member center
3. Create `.env` file:
   ```bash
   TDX_CLIENT_ID=your_real_client_id
   TDX_CLIENT_SECRET=your_real_client_secret
   ```

**Note**: API tests will automatically skip if no real credentials are provided.

## Test Configuration

### Jest Configuration (`jest.config.js`)
- **ES Module Support**: Full ESM module resolution
- **TypeScript**: Direct .ts file execution with ts-jest
- **Timeout**: 15s for API calls
- **Setup**: Automatic test environment configuration
- **Coverage**: Source code coverage collection

### Environment Setup (`setup.ts`)
- **Mock Environment**: Safe test environment variables
- **Global Mocks**: Fetch API mocking for unit tests
- **Console Management**: Reduced noise in test output
- **Cleanup**: Automatic mock reset between tests

## Test Development Guidelines

### Writing New Tests

1. **Unit Tests**: Focus on pure function testing
   ```typescript
   describe('QueryParser', () => {
     it('should parse route correctly', () => {
       const result = parser.parse('台北到台中');
       expect(result.origin).toBe('台北');
     });
   });
   ```

2. **Integration Tests**: Test component interactions
   ```typescript
   describe('Chinese Encoding Integration', () => {
     it('should handle end-to-end Chinese processing', () => {
       // Test full pipeline
     });
   });
   ```

3. **API Tests**: Test real external dependencies
   ```typescript
   describe('TDX API', () => {
     it('should fetch real data', async () => {
       const response = await fetch(tdxEndpoint);
       expect(response.status).toBe(200);
     });
   });
   ```

### Test Naming Conventions
- **Files**: `*.test.ts`
- **Descriptions**: Clear, specific behavior descriptions
- **Test Names**: Should read like sentences describing expected behavior

### Chinese Text Testing
- **Character Variants**: Test 台/臺 variations
- **Unicode**: Include emoji and special character testing
- **Encoding**: Verify UTF-8 byte length calculations
- **JSON**: Test serialization/deserialization

## Debugging Tests

### Common Issues

1. **ES Module Errors**: Check `moduleNameMapper` configuration
2. **Timeout Errors**: API tests may need longer timeouts
3. **Environment Issues**: Verify `.env` file setup for API tests
4. **Chinese Characters**: Ensure terminal/IDE supports UTF-8

### Debug Commands
```bash
# Verbose test output
npm test -- --verbose

# Run specific test file
npm test -- chinese-encoding

# Debug with Node.js inspector
node --inspect-brk ./node_modules/.bin/jest --runInBand
```

## Coverage Reports

Generate coverage reports:
```bash
npm run test:coverage
```

View coverage:
- **Console**: Summary in terminal
- **HTML**: Open `coverage/lcov-report/index.html`
- **LCOV**: Machine-readable `coverage/lcov.info`

## Continuous Integration

Tests are designed to run in CI environments:
- **Unit Tests**: Always run (no external dependencies)
- **Integration Tests**: Run with mocked data
- **API Tests**: Skip unless real credentials provided

Environment variables for CI:
```bash
NODE_ENV=test
TDX_CLIENT_ID=mock_client_id
TDX_CLIENT_SECRET=mock_client_secret
```