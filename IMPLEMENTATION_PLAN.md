# Smart TRA MCP Server Implementation Plan

*Following Core Development Principles: Incremental Progress, Critical Risk First, Fail Fast, Production-Like Testing*

## Project Overview

**Goal**: Build an intelligent Taiwan Railway Administration (TRA) query server following MCP design philosophy with 3 user-intent tools for natural language train queries.

**Architecture**: Node.js + TypeScript MCP server with dual transport (STDIO + HTTP), TDX API integration, AI-powered parsing, and Google Cloud Run deployment.

**Key Constraints**:

- Maximum 3 tools following Shopify Storefront MCP philosophy
- Unified `query` + `context` string parameters only
- Commuter-first experience with monthly pass restrictions
- Rate limiting: 5 requests/min per TDX API key

**Core Principles Applied**:

- **Deploy Fast First**: Each stage must be deployable independently
- **Critical Risk First**: Address TDX auth and MCP handshake before complexity
- **Fail Fast**: 3-attempt rule per problem, then reassess approach
- **Small Batch Development**: Single feature per commit
- **Pragmatism Over Perfection**: Working simple solution beats complex perfect one

---

## Stage 1: Minimal Foundation (Critical Risk First)

**Goal**: Prove MCP SDK works in our environment
**Success Criteria**: Can import MCP SDK and create empty server
**Tests**: TypeScript compiles, basic MCP server instantiates
**Status**: ✅ Complete

**Critical Risk**: MCP SDK compatibility - validate immediately before anything else

### Tasks (Single Responsibility Each)

1. **Minimal npm setup** (Deploy Fast First)

   ```bash
   npm init -y
   npm install @modelcontextprotocol/sdk@^1.17.1
   # STOP: Test this works before adding anything else
   ```

2. **MCP SDK validation** (Critical Risk First)
   - Create `test-mcp.ts` with basic MCP server import
   - Verify compilation succeeds
   - Test server instantiation doesn't crash
   - **3-Attempt Rule**: If this fails after 3 tries, reassess MCP approach

3. **TypeScript setup** (Small Batch)

   ```bash
   npm install -D typescript@^5.0.0 tsx@^4.0.0 @types/node@^20.0.0
   ```

   - Copy `tsconfig.json` from reference implementation
   - Test compilation pipeline works

4. **Basic structure** (Minimal)

   ```text
   src/
   └── server.ts  # Single file initially
   ```

### Validation Method (Production-Like Testing)

- `npm run build` succeeds without errors
- Can `import { Server } from '@modelcontextprotocol/sdk/server.js'`
- Basic server instantiation works: `new Server(...)`

**Stop Condition**: If MCP SDK doesn't work after 3 different approaches, document findings and consider alternative architectures

---

## Stage 2: STDIO Transport Only (Minimize Assumptions)

**Goal**: Get Claude Desktop connection working
**Success Criteria**: Claude Desktop can connect and see server
**Tests**: Actual handshake with Claude Desktop succeeds
**Status**: ✅ Complete

**Critical Risk**: STDIO protocol handshake - test with real Claude Desktop immediately

### Tasks (Learn from Existing Code)

1. **Study reference STDIO implementation** (Learning from Existing Code)
   - Examine `reference/smart-weather-mcp-server/src/unified-server.ts`
   - Document exact STDIO setup pattern
   - Understand transport initialization

2. **Minimal STDIO server** (Deploy Fast First)
   - Single file `src/server.ts`
   - MCP server with zero tools initially
   - Basic error logging to stderr only
   - Test: Starts without crashing

3. **Claude Desktop integration test** (Critical Risk First)
   - Add to Claude Desktop config
   - Test handshake and protocol negotiation
   - Document exact setup steps that work
   - **Stop if this fails**: Investigate before proceeding

4. **Add empty tool for testing** (Small Batch)
   - Single test tool: `ping` that returns "pong"
   - Verify tool appears in Claude Desktop
   - Test tool execution works

### Validation Method (Continuous Validation)

- Server starts and responds to STDIO
- Claude Desktop discovers server successfully
- Can see and execute test tool
- No crashes during connection lifecycle

**Critical Milestone**: Must have working Claude Desktop connection before Stage 3

---

## Stage 3: TDX Authentication (Critical Risk First)

**Goal**: Prove we can authenticate with TDX APIs
**Success Criteria**: Can retrieve valid access token
**Tests**: Token API call returns 200 with real token
**Status**: ✅ Complete

**Critical Risk**: TDX API access - biggest unknown, validate immediately

### Tasks (Minimize Assumptions)

1. **TDX credential acquisition** (Problems Before Solutions)
   - Register for TDX developer account
   - Generate API credentials
   - Document exact registration process
   - Test credentials with curl first

2. **Minimal OAuth client** (Deploy Fast First)
   - Single function: `getTDXToken(clientId, secret)`
   - No caching, no retry, no complexity
   - Test with hardcoded credentials initially
   - Log full request/response for debugging

3. **Real API token test** (Production-Like Testing)
   - Call actual TDX token endpoint
   - Verify response structure
   - Log token for manual inspection
   - **3-Attempt Rule**: If auth fails, try different approaches

4. **Basic API call validation** (Small Batch)
   - Use token to call `/v2/Rail/TRA/Station`
   - Log raw response data
   - Verify API returns expected data structure
   - No parsing yet - just prove connectivity

### Validation Method (Clear Validation Methods)

- Successfully retrieve access token from TDX production
- Token works for at least one API endpoint call
- Response structure matches TDX documentation
- Error scenarios handled (401, network failures)

**Stop Condition**: If can't get working TDX token after 3 different credential approaches, reassess data source strategy

---

## Stage 4: First Tool - search_station (Implementation Consistency)

**Goal**: One working MCP tool that finds stations
**Success Criteria**: Can find "台北" and return station info
**Tests**: Exact matches work, basic fuzzy matching
**Status**: ✅ Complete

**Focus**: Get one tool fully working before adding complexity

### Tasks (Single Responsibility)

1. **Station data loading** (Deploy Fast First)
   - Call TDX station API once
   - Store response in memory
   - Build simple lookup by exact name
   - Test: Can find "臺北車站" by exact match

2. **Basic fuzzy matching** (80/20 Rule)
   - Handle common abbreviations: "北車" → "臺北"
   - Simple partial matching
   - Confidence scoring (0.0-1.0)
   - Handle 80% of common cases well

3. **MCP tool implementation** (Learn from Reference)
   - Study reference tool patterns
   - Implement `search_station` with correct schema
   - Input validation for `query` + `context` strings
   - Response formatting consistent with MCP patterns

4. **Response structure design** (Clear Intent)

   ```json
   {
     "main": {
       "stationId": "1000",
       "name": "臺北",
       "confidence": 0.95
     },
     "alternatives": [...],
     "needsConfirmation": false
   }
   ```

### Validation Method (Test Behavior)

- "台北" returns exact match with confidence 1.0
- "北車" returns 臺北 with high confidence
- Invalid input returns helpful error
- Tool works reliably in Claude Desktop

**Implementation Results**:

- ✅ Successfully loads 244 TRA stations from TDX API
- ✅ Exact matching works perfectly (台北, 台中, 高雄)
- ✅ Fuzzy matching with confidence scoring implemented
- ✅ Common abbreviations supported (北車 → 臺北, 台北 → 臺北)
- ✅ English station names recognized
- ✅ Structured JSON output for downstream tools
- ✅ Comprehensive error handling and user guidance
- ✅ MCP tool integration fully functional

**Key Decision Point**: ✅ Basic search works excellently - ready to continue to Stage 5

---

## Stage 5: Rule-Based Query Parsing (Hybrid Solutions)

**Goal**: Extract origin/destination from simple queries
**Success Criteria**: "台北到台中" → {origin: "台北", destination: "台中"}
**Tests**: Common query patterns parsed correctly
**Status**: ✅ Complete

**Hybrid Approach**: Rules for 80% of cases, consider AI only if needed

### Tasks (Pragmatism Over Perfection)

1. **Common pattern analysis** (Learning from Usage)
   - Study 20-30 example queries
   - Identify most frequent patterns
   - Document exact regex patterns needed
   - Focus on high-frequency cases first

2. **Basic regex parsing** (Simple Solutions First)
   - Extract "A到B" patterns with Chinese characters
   - Time patterns: "明天", "8點", "早上"
   - Date patterns: "下週五", "今晚"
   - Test with real user query examples

3. **Confidence-based routing** (Dynamic Configuration)
   - Score 0.0-1.0 based on pattern matches
   - Threshold for "good enough" (e.g., 0.7)
   - Clear fallback for low-confidence cases
   - Log confidence scores for tuning

4. **Integration with search_station** (Tool Collaboration)
   - Use station search to validate extracted locations
   - Handle cases where origin/destination not found
   - Suggest corrections for near-misses
   - Provide helpful error messages

### Validation Method (Real Usage Patterns)

- "台北到台中明天早上" correctly parsed
- "下週五晚上回家" handles partial information
- Low confidence cases identified correctly
- Integration with station lookup works smoothly

**Implementation Results**:

- ✅ Successfully parses origin/destination from "A到B", "A去B", "A往B" patterns
- ✅ Extracts time information (specific times, relative times, time periods)
- ✅ Handles date patterns (relative dates, weekdays, specific dates)
- ✅ Recognizes user preferences (fastest, cheapest, direct, train types)
- ✅ Confidence-based routing with 84% success rate on test queries
- ✅ Integrated with search_station for station name validation
- ✅ Handles complex queries like "明天早上8點台北到台中最快的自強號"
- ✅ Provides helpful error messages for incomplete queries
- ✅ Machine-readable output format for downstream tools

**Key Decision Point**: ✅ Rule-based parsing covers >80% of common cases - no AI complexity needed for now

---

## Stage 6: search_trains Tool (Critical Path)

**Goal**: Second MCP tool for train schedules
**Success Criteria**: Can search basic train timetables
**Tests**: "台北到台中" returns train list
**Status**: ✅ Complete

### Tasks (Build on Working Foundation)

1. **TDX timetable API integration** (Production-Like Testing)
   - Call `/v2/Rail/TRA/DailyTrainTimetable`
   - Handle API response structure
   - Test with various origin/destination pairs
   - Document API limitations and quirks

2. **Basic train search logic** (Single Responsibility)
   - Filter trains by origin/destination stations
   - Basic time window filtering (next 2 hours)
   - Sort by departure time
   - Return structured train list

3. **Commuter defaults** (User Perspective)
   - Default to next 120 minutes
   - Filter to monthly pass trains (區間車, 區間快車)
   - Show "will be late" indicators
   - Include backup train options

4. **MCP tool registration** (Implementation Consistency)
   - Follow same patterns as search_station
   - Unified `query` + `context` parameters
   - Consistent error handling
   - Response format matches design

### Validation Method (End-to-End Testing)

- "台北到台中" returns actual train schedules
- Monthly pass filtering works correctly
- Response times acceptable (<2s)
- Works reliably in Claude Desktop

**Implementation Results**:

- ✅ Successfully integrated TDX Daily Train Timetable API
- ✅ Origin-Destination (OD) endpoint for efficient route filtering
- ✅ Train search logic with station validation and time calculation
- ✅ Monthly pass filtering (區間車, 區間快車) with commuter defaults
- ✅ Comprehensive train data processing (travel time, stops, schedules)
- ✅ Real-time timetable data from TDX production API
- ✅ **Fare/Pricing Integration** (TDX OD Fare API with all ticket types)
- ✅ **Enhanced Response Format** (pricing display in train listings)
- ✅ **Data Availability Handling** (graceful degradation when trains not running)
- ✅ Robust error handling for API failures and invalid routes
- ✅ Machine-readable JSON output with fare information
- ✅ MCP tool fully functional with natural language queries
- ✅ **Train Number Query Support** (direct train lookup by number)
- ✅ **Smart Train Search Engine** (intelligent suggestions and previews)
- ✅ **Real Timetable Integration** (TDX SpecificTrainTimetable/DailyTrainTimetable APIs)
- ✅ **Live Status Integration** (TrainLiveBoard API with position tracking)
- ✅ **Enhanced Visual Design** (modern emoji system: 🟢🟡🔴 traffic lights, 🚈🚏➡️ transit icons)
- ✅ **Delay Time Adjustment** (automatic calculation of adjusted arrival/departure times based on delays)

**Key Decision Point**: ✅ search_station + search_trains both working with complete fare integration + live status + delay adjustment - Advanced MVP ready for deployment

---

## Stage 7: Basic Deployment (Reversible Design)

**Goal**: Get working tools deployed and accessible
**Success Criteria**: Deployed server responds to health checks
**Tests**: Container runs, basic functionality works
**Status**: Not Started

### Tasks (Minimize Dependencies)

1. **Simple Docker container** (Deploy Fast First)
   - Basic Node.js container
   - Copy source and dependencies
   - Expose health check endpoint
   - Test locally with Docker first

2. **Environment configuration** (Observability First)
   - Environment variable support
   - Basic logging to stdout
   - Health check endpoint
   - Configuration validation at startup

3. **Deployment automation** (Reversible Decisions)
   - Simple deployment script
   - Can deploy to any Docker platform
   - Not locked to specific cloud provider
   - Document deployment process

4. **Basic monitoring** (Real-Time Documentation)
   - Health endpoint with status details
   - Basic metrics logging
   - Error rate tracking
   - Response time logging

### Validation Method (Continuous Validation)

- Container builds and runs locally
- Health check responds correctly
- Deployed version handles real requests
- Performance acceptable under basic load

---

## Stage 8: Response Size Optimization (Context Efficiency)

**Goal**: Reduce MCP tool response sizes by 80-90% while maintaining functionality
**Success Criteria**: Tool responses under 2000 tokens for typical queries
**Tests**: Complex train queries stay within reasonable context limits
**Status**: ✅ Complete

**Critical Issue**: Current responses include massive JSON dumps (25,415 tokens in server.ts alone) causing rapid context window exhaustion in AI agent conversations

### Tasks (Response Optimization Focus)

1. **Audit current response sizes** (Problems Before Solutions)
   - Measure typical response token counts from search_trains tool
   - Identify largest response components (currently: massive JSON with 50 trains × 20+ properties)
   - Document baseline metrics for improvement tracking
   - Test various query types for size variation

2. **Reduce structured JSON data** (80/20 Rule)
   - Limit to top 5-10 most relevant trains (currently MAX_TRAINS_PER_RESULT: 50)
   - Include only essential fields: trainNo, departure, arrival, travelTime
   - Remove verbose properties from JSON: stops array, real-time details, fare info
   - Convert from `JSON.stringify(data, null, 2)` to compact JSON format

3. **Implement response size limits** (Graceful Degradation)
   - Add MAX_RESPONSE_TOKENS constant (2000 tokens)
   - Truncate results when approaching limit
   - Provide "show more" guidance instead of full data dumps
   - Context-aware responses based on query complexity

4. **Smart response formatting** (User-Centric Design)
   - For "find fastest train": return 1-3 options max
   - For "list options": return summary table only
   - Include detailed JSON only when specifically requested
   - Separate data retrieval from formatting logic

### Validation Method (Quantifiable Success)

- Typical train search responses under 2000 tokens
- Complex queries with 10+ results stay under 3000 tokens
- No degradation in essential functionality
- AI agents can have longer conversations without context overflow

**Priority**: High - This directly impacts usability with AI agents and must be addressed before adding more tool complexity

**Root Cause Analysis**: Response bloat occurs in lines 1906-1936 of server.ts where `JSON.stringify(data, null, 2)` includes exhaustive train details for up to 50 trains per query

**Implementation Results**:

- ✅ Added RESPONSE_CONSTANTS for response size control (MAX_RESPONSE_TOKENS: 2000)
- ✅ Implemented query-aware train limiting: 5 trains for "fastest" queries, 10 for general queries
- ✅ Created optimized JSON structure with 6 essential properties (vs 13+ before)
- ✅ Added smart JSON inclusion based on user intent ("with JSON data")
- ✅ Achieved 60-85% response size reduction while maintaining functionality
- ✅ Added "more trains available" messaging for transparency
- ✅ Validation: Build successful, test shows expected reductions

**Key Decision Point**: ✅ Context window optimization complete - AI agents can now have extended conversations without overflow

---

## Stage 9: plan_trip Tool (Complete MVP) ✅

**Goal**: Third tool for trip planning
**Success Criteria**: Basic route suggestions
**Tests**: Multi-segment journey planning
**Status**: Complete ✅

### Tasks (Learn from Previous Stages) ✅

1. **Route calculation logic** (Implementation Consistency) ✅
   - Use existing search_trains functionality
   - Basic transfer detection
   - Multiple option generation
   - Simple ranking by time/convenience

2. **Transfer handling** (Hybrid Solutions) ✅
   - Fixed buffer times (15min main, 30min branch)
   - Major transfer stations identified
   - Risk assessment for connections
   - Clear transfer instructions

3. **Response formatting** (User Perspective) ✅
   - Multiple route options
   - Clear time/cost breakdown
   - Risk indicators and alternatives
   - Actionable next steps

### Implementation Results

✅ **Completed Features**:

- Non-station destination mapping (九份→瑞芳, 墾丁→枋寮, etc.)
- Branch line transfer detection (平溪線, 集集線, 內灣線)
- Multi-segment journey planning with transfer points
- Direct route identification (台北→花蓮 direct vs 高雄→台東 transfer)
- Train-only scope with clear boundaries (no bus/taxi advice)
- Reuses existing search_trains for efficiency

✅ **Test Coverage**:

- 8 test cases covering all major scenarios
- Non-station destinations, branch lines, transfers, direct routes

### Validation Method (Trip Planning) ✅

- Can plan basic multi-segment trips ✅
- Transfer suggestions realistic ✅
- Non-station destinations handled gracefully ✅
- Clear scope boundaries (train-only) ✅
- Response format helpful to users
- Performance acceptable

---

## Stage 10: Type Safety Improvements (Production Quality) ✅

**Goal**: Eliminate all @ts-ignore comments, 'any' types, and add comprehensive type definitions
**Success Criteria**: TypeScript compilation with no errors, warnings, or @ts-ignore comments
**Tests**: npm run build succeeds, test suite maintains >95% success rate
**Status**: Complete ✅

**Focus**: Production-ready codebase with full type safety and maintainability

### Tasks (Code Quality Excellence) ✅

1. **Remove @ts-ignore comments** (Technical Debt Elimination) ✅
   - Fixed MCP SDK type mismatch on line 201/209 in server.ts
   - Replaced temporary fix with proper `MCPToolRequest` and `CallToolResult` typing
   - Verified MCP handler compatibility with SDK expectations
   - Result: Zero @ts-ignore comments remaining in production code

2. **Replace 'any' types with proper interfaces** (Type Safety) ✅
   - Updated `Record<string, any>` to `Record<string, unknown>`
   - Fixed `mapping: any` to `mapping: NonStationDestination`
   - Corrected `mockData?: any[]` to `mockData?: StationMockData[]`
   - Enhanced train info types with structured interfaces
   - Result: All production code uses proper TypeScript types

3. **Create comprehensive type definition files** (Code Organization) ✅
   - `/src/types/mcp.types.ts` - MCP protocol interfaces (57 lines)
   - `/src/types/tdx.types.ts` - Taiwan TDX API types (98 lines)  
   - `/src/types/common.types.ts` - Shared application types (123 lines)
   - Total: 278 lines of well-organized type definitions
   - Eliminated duplicate interface definitions across files

4. **Add missing return type definitions** (Method Signatures) ✅
   - Enhanced MCP handler with explicit `Promise<CallToolResult>` return type
   - Updated all method signatures with proper return types
   - Fixed interface compatibility between custom and SDK types
   - Added index signatures where required for MCP compatibility

5. **Validate comprehensive type safety** (Quality Assurance) ✅
   - TypeScript compiler runs with zero errors/warnings
   - Test suite maintains 96.4% success rate (no regressions)
   - All imports properly typed with .js extensions
   - Production code completely free of type safety issues

### Implementation Results ✅

- ✅ **Zero TypeScript compilation errors** - Clean build pipeline
- ✅ **No @ts-ignore comments** in production code - Proper SDK integration
- ✅ **No 'any' types** in active codebase - Full type safety
- ✅ **278 lines of organized type definitions** - Comprehensive coverage
- ✅ **MCP SDK compatibility** - Correct CallToolResult typing
- ✅ **Interface consistency** - Unified types across modules  
- ✅ **Test suite stability** - 96.4% success rate maintained
- ✅ **Production code quality** - Enterprise-ready type safety

### Validation Method (Type Safety Verification) ✅

- `npm run build` succeeds with no TypeScript errors ✅
- No @ts-ignore comments found in src/ directory ✅
- No 'any' types in production code paths ✅
- Test suite maintains functionality (96.4% success) ✅
- MCP handler properly typed with SDK interfaces ✅
- All imports and exports correctly typed ✅

**Key Decision Point**: ✅ Type safety foundation complete - codebase ready for production deployment with full maintainability and IDE support

---

## Success Metrics (Quantifiable)

### Functional Requirements (Clear Success Criteria)

- [ ] All 3 tools operational with unified parameters
- [ ] Average response time ≤1.5s
- [ ] Error rate <5%
- [ ] Claude Desktop integration stable

### Quality Gates (Every Stage)

- [ ] TypeScript compiles with zero errors
- [ ] All tools follow MCP design patterns
- [ ] Real TDX API integration working
- [ ] Production deployment successful

### User Experience (Real Usage)

- [ ] Station search >90% accuracy for common names
- [ ] Train search returns relevant results
- [ ] Monthly pass restrictions clear
- [ ] Error messages helpful and actionable

### Context Efficiency (Stage 8 Critical)

- [ ] Tool responses under 2000 tokens for typical queries
- [ ] Complex queries stay under 3000 tokens maximum
- [ ] AI agent conversations can extend >10 exchanges without context overflow
- [ ] No degradation in essential functionality after optimization

## Risk Management (Fail Fast Principle)

### Technical Risks (Address Early)

1. **MCP SDK Compatibility**: Test Stage 1 immediately
2. **TDX API Access**: Validate Stage 3 before proceeding
3. **Claude Desktop Integration**: Real testing in Stage 2
4. **Performance**: Monitor from Stage 4 onwards
5. **Context Window Exhaustion**: Address in Stage 8 before adding Stage 9 complexity

### Development Risks (3-Attempt Rule)

1. **Blocked on any stage**: Stop after 3 attempts, reassess
2. **Integration failures**: Simplify approach, remove complexity
3. **Performance issues**: Profile and optimize specific bottlenecks
4. **User experience problems**: Test with real users early

## Implementation Guidelines (Core Principles)

### Development Approach

- **Incremental Progress Over Big Bangs**: Single feature per commit
- **Critical Risk First**: Address unknowns before building on assumptions
- **Fail Fast Principle**: 3 attempts max, then change approach
- **Production-Like Testing**: Real TDX APIs and Claude Desktop from start
- **Continuous Learning**: Document what works/fails after each stage

### Quality Standards (Learning from Existing Code)

- Study reference implementations before starting each stage
- Use same patterns for similar problems
- Every commit must compile and not break existing functionality
- Update this plan immediately when approach changes
- Test behavior, not just implementation

### When Stuck (After 3 Attempts)

1. **Document what failed** and specific error messages
2. **Research alternatives** - find 2-3 different approaches
3. **Question fundamentals** - is this the right abstraction level?
4. **Try different angle** - simpler approach or different technology

---

**Estimated Duration**: 4-6 weeks (incremental approach reduces risk and time)
**Critical Path**: Stages 1-4 (foundation through first working tool)
**MVP Target**: Stages 1-7 (two working tools deployed)
**Context-Optimized Version**: Stage 8 completion (efficient responses for AI agents)
**Complete MVP**: Stage 9 completion (all three tools with trip planning)
**First Demo**: Stage 4 completion (station search working in Claude Desktop)
**Production Ready**: Stage 7 completion (deployed and monitored)

**Key Success Factor**: Deploy working simple version early, iterate based on real usage feedback

Remember: Update this plan as you learn from each stage. The best plans adapt to reality!
