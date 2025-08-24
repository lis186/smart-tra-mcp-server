# Smart TRA MCP Server - Test Suite

Comprehensive test suite for validating the Smart TRA MCP Server functionality, focusing on business logic validation and tool boundary enforcement.

## Test Architecture

### Directory Structure

```
tests/
├── lib/
│   └── test-runner.js      # Custom test framework (no external dependencies)
├── unit/
│   └── destination-mapping.test.js    # Unit tests for mapping logic
├── integration/
│   ├── tool-boundaries.test.js        # Tool boundary enforcement tests  
│   └── delegation.test.js             # Internal delegation tests
├── e2e/
│   └── user-journeys.test.js          # End-to-end user workflow tests
├── run-all-tests.js        # Main test suite runner
└── README.md              # This file
```

### Test Categories

#### Unit Tests
- **Destination Mapping Tests**: Validate the three-criteria rule for non-station destination mapping
  - Famous tourist spots with non-obvious TRA connections
  - MRT-only destinations mapping to TRA hubs
  - Boundary cases and mapping consistency

#### Integration Tests
- **Tool Boundary Tests**: Ensure proper separation between search_trains and plan_trip
- **Internal Delegation Tests**: Verify plan_trip correctly delegates to search_trains internally

#### End-to-End Tests
- **User Journey Tests**: Realistic user workflows across multiple tools
  - Tourist planning (九份 trip)
  - Local commuter efficiency
  - Family trip planning (日月潭)
  - Business traveler scenarios
  - Adventure traveler (branch lines)
  - Error recovery workflows

## Running Tests

### All Tests
```bash
npm test                    # Run complete test suite
```

### Category-Specific Tests
```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only  
npm run test:e2e          # End-to-end tests only
```

### Individual Test Files
```bash
node tests/unit/destination-mapping.test.js
node tests/integration/tool-boundaries.test.js
node tests/integration/delegation.test.js
node tests/e2e/user-journeys.test.js
```

### With Authentication
```bash
npm run test:auth          # Run tests with TDX authentication environment
```

## Test Environment Setup

### Environment Variables
```bash
NODE_ENV=test              # Required for test mode
TDX_CLIENT_ID=test_client_id      # Test credentials
TDX_CLIENT_SECRET=test_secret     # Test credentials
```

### Requirements
- Node.js 18+
- TypeScript compiled (`npm run build`)
- No external test framework dependencies (uses custom TestRunner)

## Test Philosophy

### Focus Areas
1. **Business Logic Validation**: Core mapping rules and transfer detection
2. **Tool Boundary Enforcement**: Proper separation of responsibilities
3. **User Experience Validation**: Realistic user workflows
4. **Error Handling**: Graceful degradation and helpful guidance

### What We Test
- ✅ Destination mapping accuracy (three-criteria rule compliance)
- ✅ Tool boundary enforcement (search_trains vs plan_trip)
- ✅ Transfer detection for branch lines and cross-coast routes
- ✅ Internal delegation correctness
- ✅ User journey completion rates
- ✅ Error recovery and guidance

### What We Don't Test
- ❌ TDX API availability (expected to fail in test environment)
- ❌ Network connectivity issues
- ❌ Authentication success (mocked in test environment)
- ❌ Performance benchmarking (separate concern)

## Test Results Interpretation

### Success Criteria
- **Unit Tests**: 90%+ success rate expected
- **Integration Tests**: 75%+ success rate expected (may have TDX auth failures)
- **E2E Tests**: 70%+ success rate expected (complex multi-step workflows)

### Common Test Failures
1. **TDX Authentication Errors**: Expected in test environment with mock credentials
2. **Network Timeouts**: Expected for live API calls in test environment
3. **Business Logic Failures**: Should be investigated and fixed immediately

### Business Impact Assessment
The test runner provides business impact analysis:
- **Core Logic (Unit)**: Destination mapping correctness
- **Tool Integration**: Boundary enforcement effectiveness  
- **User Experience (E2E)**: Journey completion rates

### Production Readiness Indicators
- ✅ **90%+ overall success rate**: Ready for production
- ⚠️ **75-89% success rate**: Caution - some issues need attention
- ❌ **<75% success rate**: Not ready - significant issues require resolution

## Key Test Insights

### Destination Mapping Validation
Tests ensure only appropriate destinations are mapped:
- Famous tourist spots with non-obvious TRA connections
- MRT-only destinations routing to TRA hubs
- Actual TRA stations are NOT mapped (handled by transfer detection)

### Transfer Detection Accuracy
Validates complex routing scenarios:
- Branch line connections (平溪線, 集集線, 內灣線)
- Cross-coast transfers (高雄↔台東 via 枋寮)
- Multi-segment journey planning

### User Journey Completeness
Ensures realistic workflows succeed:
- Tourist confusion → actionable guidance
- Commuter efficiency → direct information
- Family planning → scenic route options
- Business needs → time-critical routing

## Maintenance Notes

### When Adding New Destinations
1. Update destination mapping in `src/server.ts`
2. Add corresponding test cases in `tests/unit/destination-mapping.test.js`
3. Verify three-criteria rule compliance
4. Run full test suite to check for regressions

### When Modifying Tools
1. Update boundary tests if tool responsibilities change
2. Verify delegation logic remains correct
3. Add new user journey scenarios if needed
4. Update business impact assessment criteria

### Test Data Updates
- Station lists may need updates as TRA network changes
- Tourist destination mappings should reflect current popular spots
- Transfer hub logic should accommodate network modifications

---

*For more information about the Smart TRA MCP Server architecture, see the main [CLAUDE.md](../CLAUDE.md) documentation.*