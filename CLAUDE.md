# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Smart TRA MCP Server - An intelligent Taiwan Railway Administration (TRA) query server following the Model Context Protocol (MCP) design philosophy. This project integrates TDX (Transport Data eXchange) Taiwan railway APIs through natural language interfaces, providing train schedules, real-time information, fare queries, and trip planning.

**Project Status**: Active Development - Stage 6 Complete + Advanced Features

**🎯 Current Status**: Stage 6 Complete + Advanced Features - search_trains with Live Status & Delay Adjustment

## Commands

### Development Commands

**Available commands:**

```bash
# Development
npm run dev          # Build and start development server (STDIO mode)
npm run build        # Build TypeScript to JavaScript
npm start            # Run production server

# Testing (to be implemented)
npm test             # Run test suite
```

## Architecture Overview

### Design Philosophy (MCP)

Following the Shopify Storefront MCP design philosophy:

- **Maximum 3-4 tools** per MCP server (this project: 3 tools)
- **User-intent naming**: Tools named by what users want to do, not technical implementation
- **Unified parameters**: All tools use `query` (required) + `context` (optional) strings only
- **Business value focus**: Every tool solves a real user problem

### Implemented Tools (2/3 Complete)

1. **`search_trains`** - Query train schedules, real-time status, and fares ✅ **COMPLETE**
   - Natural language queries like "Tomorrow morning 8am Taipei to Taichung fastest train"
   - Intelligent routing to appropriate TDX APIs (timetables, live boards, fares)
   - **NEW**: Train number direct queries (e.g., "152", "1234號列車")
   - **NEW**: Smart completion with intelligent suggestions
   - **NEW**: Real-time live status integration (TrainLiveBoard API)
   - **NEW**: Enhanced visual design with modern emoji system (🟢🟡🔴 traffic lights)
   - **NEW**: Delay time adjustment - automatic calculation of adjusted arrival/departure times

2. **`search_station`** - Station discovery and confirmation ✅ **COMPLETE**
   - Handle ambiguous station names, provide candidates with confidence scores
   - Support both TRA and Alishan Forest Railway (AFR)
   - Fuzzy matching with confidence scoring
   - Common abbreviations support (北車 → 臺北)

3. **`plan_trip`** - Trip planning and recommendations ⏳ **PLANNED**
   - Provide actionable suggestions based on schedules and real-time data
   - Include backup options and transfer recommendations

### Technology Stack

- **Runtime**: Node.js 18+ (Google Cloud Run deployment target)
- **Language**: TypeScript 5.0+
- **MCP SDK**: @modelcontextprotocol/sdk
- **Transport**: Dual support - STDIO (Claude Desktop) + Streamable HTTP (web/n8n)
- **AI Parser**: Google Gemini 2.5 Flash-Lite for natural language understanding
- **APIs**: TDX Taiwan Railway APIs (OAuth 2.0 authentication)

### Reference Implementations

The repository includes two reference MCP servers:

1. **tdx-tra-mcp-server/** - Direct TDX API integration with 50+ low-level tools
2. **smart-weather-mcp-server/** - Weather MCP server following user-intent design

## Development Guidelines

### Development Philosophy

#### Core Beliefs

- **Incremental progress over big bangs**: Small changes that compile and pass tests
- **Learning from existing code**: Study and plan before implementing
- **Pragmatic over dogmatic**: Adapt to project reality
- **Clear intent over clever code**: Be boring and obvious

#### Simplicity Means

- Single responsibility per function/class
- Avoid premature abstractions
- No clever tricks - choose the boring solution
- If you need to explain it, it's too complex

### Core Development Principles

#### Speed & Delivery

- **Deploy Fast First**: Remove time constraints, deploy simple features first, iterate quickly
- **Small Batch Development**: Each step must be small and verifiable, avoid large integrations
- **Incremental Value Delivery**: Start with MVP, enhance gradually, each phase operates independently
- **Pragmatism Over Perfection**: "Working" is more important than "perfect", apply 80/20 rule

#### Risk Management

- **Critical Risk First**: Validate most critical parts earliest, confirm technical feasibility first
- **Fail Fast Principle**: Discover non-viable approaches quickly, set time boxes, failure is learning
- **Minimize Assumptions**: Don't assume technology will work, validate every assumption
- **Reversible Design**: Every decision must be rollback-able, keep old versions

#### Validation & Learning

- **Continuous Validation**: Test in actual production environment, not just locally
- **Clear Validation Methods**: Success criteria must be quantifiable, have backup plans
- **Continuous Learning**: Record lessons after each step, document difficult experiences
- **Problems Before Solutions**: Understand "why" before rushing to code

#### Technical Management

- **Observability First**: Add logging from day one, clear error messages
- **Minimize Dependencies**: Use standard library when possible, every dependency is risk
- **Complexity Budget**: Simple systems are easier to maintain
- **Implementation Consistency**: Use same approaches for same problems
- **Hybrid Solutions**: Combine local processing with remote fallbacks
- **Dynamic Configuration**: Context-aware decisions over fixed thresholds
- **Graceful Degradation**: Design to work when dependencies fail
- **Production-Like Testing**: Real usage patterns over engineered test cases
- **Composition over inheritance**: Use dependency injection
- **Interfaces over singletons**: Enable testing and flexibility
- **Singletons via DI when justified**: If a singleton is necessary, create and manage it via the DI/provider layer and expose only through interfaces
- **Explicit over implicit**: Clear data flow and dependencies

### MCP Design Philosophy

#### Core Design Principles

1. **User-Centric Tool Design**
   - Tool names MUST reflect user intent, NOT technical implementation
   - ✅ Good: `search_trains`, `search_station`, `plan_trip`
   - ❌ Bad: `get_timetable_api`, `call_tdx_endpoint`, `fetch_data`

2. **Minimal Tool Count**
   - Maximum 3-4 tools per MCP server
   - Each tool must have clear business value
   - Avoid technical function splitting

3. **Unified Parameter Structure**
   - ALL tools MUST use identical parameters:

     ```json
     {
       "query": "natural language user request",
       "context": "optional preferences and context"
     }
     ```

   - No structured parameters like `stationId`, `date`, `trainType` separately

4. **Business Value Orientation**
   - Every tool must solve a real user problem
   - Include actionable recommendations in responses
   - Think: "What should the user do next?"

5. **Tool Collaboration Design**
   - Tools must work together in logical user journeys:

     ```text
     User Need → Tool 1 (Discovery) → Tool 2 (Action) → Tool 3 (Confirmation)
     ```

   - Example: `search_station` → `search_trains` → `plan_trip`

#### Anti-Patterns to Avoid

- ❌ Technical function splitting (separate tools for each API)
- ❌ Parameter structure inconsistency
- ❌ Implementation-focused naming
- ❌ Data-only responses without guidance

### Response Format

- **Dual-format output**: Prefer responses that include both machine-readable structure (e.g., compact JSON as text) and a concise human-readable summary. Keep user-facing text actionable.

### Git Commit Standards

#### Format

```text
<type>(<scope>): <subject>

<body>

<footer>
```

#### Subject Line Rules

- Use imperative verb (Add, Fix, Update, Remove)
- Keep under 50 characters
- Do not end with period
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

#### Body Guidelines

- Leave blank line after subject
- Explain "why" this change was made, not just "what"
- Keep lines under 72 characters
- List important changes

#### Examples

```text
feat(tools): add search_station tool with fuzzy matching

- Implement station name disambiguation
- Add confidence scoring for matches
- Support both TRA and AFR stations

Closes #42
```

```text
fix(auth): handle TDX token expiration correctly

- Check token expiry before API calls
- Implement automatic token refresh
- Add retry logic for 401 responses
```

## Development Process

### Planning & Staging

Break complex work into 3-5 stages. Document in `IMPLEMENTATION_PLAN.md`:

```markdown
## Stage N: [Name]
**Goal**: [Specific deliverable]
**Success Criteria**: [Testable outcomes]
**Tests**: [Specific test cases]
**Status**: [Not Started|In Progress|Complete]
```

- Update status as you progress
- Remove file when all stages are done

### Implementation Flow

1. **Understand** - Study existing patterns in codebase
2. **Test** - Write test first (red)
3. **Implement** - Minimal code to pass (green)
4. **Refactor** - Clean up with tests passing
5. **Commit** - With clear message linking to plan

### When Stuck (After 3 Attempts)

**CRITICAL**: Maximum 3 attempts per issue, then STOP.

1. **Document what failed**:
   - What you tried
   - Specific error messages
   - Why you think it failed

2. **Research alternatives**:
   - Find 2-3 similar implementations
   - Note different approaches used

3. **Question fundamentals**:
   - Is this the right abstraction level?
   - Can this be split into smaller problems?
   - Is there a simpler approach entirely?

4. **Try different angle**:
   - Different library/framework feature?
   - Different architectural pattern?
   - Remove abstraction instead of adding?

## Implementation Plan

Based on `prd.md` and `spec.md`:

### Phase 1: Core Infrastructure

- Set up TypeScript project structure
- Implement MCP server base with dual transport (STDIO + HTTP)
- Integrate TDX OAuth 2.0 authentication
- Set up Secret Manager for credentials

### Phase 2: Station Search Tool

- Implement `search_station` with fuzzy matching
- Add Gemini AI for natural language parsing
- Handle station disambiguation and confidence scoring

### Phase 3: Train Search Tool

- Implement `search_trains` with intelligent routing
- Support timetables, real-time status, and fare queries
- Add OData query parameter support

### Phase 4: Trip Planning Tool

- Implement `plan_trip` with recommendations
- Consider real-time delays and transfer options
- Provide multiple route options (fastest/cheapest/fewest transfers)

### Phase 5: Production Deployment

- Docker containerization
- Google Cloud Run deployment
- Monitoring and observability setup
- Performance optimization and caching
- Health check endpoint: expose `/health` with basic status and mode

## Key Technical Considerations

### TDX API Integration

- OAuth 2.0 client credentials flow
- Token caching (24-hour expiration)
- Rate limiting: 50 requests/second, 60 parallel connections per IP
- OData v4 query support for filtering and pagination

### Error Handling Strategy

- Honest transparency for unsupported queries
- User-friendly error messages with actionable suggestions
- Graceful degradation when AI services unavailable
- Proper HTTP status code mapping
- Fail fast with descriptive messages
- Include context for debugging
- Handle errors at appropriate level
- Never silently swallow exceptions

### Performance Targets

- Average response time < 1.5 seconds
- AI parsing time < 500ms
- Cache hit rate ≥ 60% for common queries
- Cold start time < 800ms for Cloud Run

## Current Repository Structure

```text
smart-tra-mcp-server/
├── src/                     # Source code
│   └── server.ts            # Main MCP server implementation
├── dist/                    # Compiled JavaScript (gitignored)
├── reference/               # Reference implementations
│   ├── tdx-tra-mcp-server/  # Direct TDX API integration (50+ tools)
│   └── smart-weather-mcp-server/ # Weather MCP with user-intent design
├── .cursor/rules/           # Development principles and guidelines
├── package.json             # Node.js project configuration
├── tsconfig.json            # TypeScript configuration
├── IMPLEMENTATION_PLAN.md   # Staged development plan (Stage 1 ✅)
├── prd.md                   # Product requirements document
├── spec.md                  # Technical specifications
└── CLAUDE.md                # This file
```

## Completed Features

1. ✅ **Stage 1**: Initialize npm project with TypeScript configuration
2. ✅ **Stage 2**: STDIO Transport - Claude Desktop integration working
3. ✅ **Stage 3**: TDX Authentication - OAuth client implemented
4. ✅ **Stage 4**: `search_station` tool - Fuzzy matching with confidence scoring
5. ✅ **Stage 5**: Rule-based query parsing - 84% success rate
6. ✅ **Stage 6**: `search_trains` tool - Complete with fare integration
7. ✅ **Stage 8**: Response size optimization - 60-85% reduction
8. ✅ **Advanced Features**: 
   - Train number direct queries with smart completion
   - Real timetable integration (TDX SpecificTrainTimetable/DailyTrainTimetable APIs)
   - Live status integration (TrainLiveBoard API)
   - Enhanced visual design (🟢🟡🔴 traffic lights, 🚈🚏➡️ transit icons)
   - **Delay time adjustment** - automatic calculation of adjusted times based on delays

## Next Steps

1. **Stage 7**: Basic deployment to Google Cloud Run
2. **Stage 9**: Implement `plan_trip` tool for trip planning
3. **Phase 2**: Basic transfer planning (main↔branch lines)
4. **Phase 3**: Intelligent transfers with real-time delay considerations

## Implementation Best Practices

### When Starting Development

1. **Review Principles First**: Check development principles before each phase
2. **Validate Early**: Confirm technical feasibility with minimal code
3. **Document Immediately**: Record decisions and learnings in real-time
4. **Test in Production-Like Environment**: Use actual TDX APIs early
5. **Learn from Codebase**: Find 3 similar features and identify patterns
6. **Use Existing Tools**: Don't introduce new tools without justification

### Priority Order (When Principles Conflict)

1. **Speed & Delivery** - Rapidly validate ideas
2. **Risk Management** - Avoid big disasters
3. **Validation & Learning** - Ensure doing the right thing
4. **Other Principles** - Optimize based on above three

### Quality Gates

- Validate (build + tests + lint) must pass before every commit

#### Definition of Done

- [ ] Tests written and passing
- [ ] Code follows project conventions
- [ ] No linter/formatter warnings
- [ ] Commit messages are clear
- [ ] Implementation matches plan
- [ ] No TODOs without issue numbers
- [ ] Every commit compiles successfully
- [ ] All existing tests pass

#### Test Guidelines

- Test behavior, not implementation
- One assertion per test when possible
- Clear test names describing scenario
- Use existing test utilities/helpers
- Tests should be deterministic
- Never disable tests, fix them

### Code Review Checklist

- [ ] All tools use identical `query` + `context` parameters
- [ ] Tool names reflect user intent, not technical implementation
- [ ] Maximum 3 tools total
- [ ] Each tool has clear business value
- [ ] Tools work together in logical user journeys
- [ ] Responses include actionable recommendations
- [ ] No technical jargon in user-facing descriptions
- [ ] Consistent error handling across all tools
- [ ] Natural language query support in all tools

### Common Pitfalls to Avoid

1. **Over-engineering**: Start simple, add complexity only when needed
2. **Ignoring Rate Limits**: TDX has 50 req/s limit - implement proper throttling
3. **Hardcoding Values**: Use configuration for all environment-specific values
4. **Poor Error Messages**: Always provide actionable suggestions to users
5. **Skipping Integration Tests**: Unit tests pass but real APIs behave differently
6. **Using console.log in MCP Servers**: NEVER use `console.log` in MCP servers - it corrupts the JSON-RPC protocol on stdout. Always use `console.error` for debugging output
7. **Missing .js Extensions**: In ES modules, always include `.js` extensions in relative imports (e.g., `import { Parser } from './parser.js'`)
8. **Third-party Dependencies Stdout Pollution**: Some packages like `dotenv` may output to stdout. In MCP servers, avoid packages that write to stdout or configure them to be silent

### Documentation to Maintain

- **IMPLEMENTATION_PLAN.md**: Current development stages and progress
- **decisions.md**: Record architectural decisions and rationale
- **lessons-learned.md**: Document challenges and solutions
- **troubleshooting.md**: Common issues and fixes
- **api-coverage.md**: Track which TDX APIs are integrated

### Decision Framework

When multiple valid approaches exist, choose based on:

1. **Testability** - Can I easily test this?
2. **Readability** - Will someone understand this in 6 months?
3. **Consistency** - Does this match project patterns?
4. **Simplicity** - Is this the simplest solution that works?
5. **Reversibility** - How hard to change later?

### GitHub Issue Workflow

When fixing a GitHub issue:

1. **Create a new branch** for the issue (e.g., `fix/issue-123` or `feat/issue-456`)
2. **Find the root cause first** - Understand the problem before implementing a solution
3. **Fix and test the solution** - Ensure the fix works and doesn't break existing functionality
4. **Commit changes at each step** - Make incremental commits with clear messages
5. **Ask for verification** - Request user to verify the fix before considering it complete
6. **Only push when explicitly requested** - Never push to remote unless user asks
7. **Only create PR when explicitly requested** - Never create pull requests unless user asks

### Implementation Workflow

When implementing new features or functionality:

1. **Understand requirements first** - Clarify what needs to be built before starting
2. **Study existing patterns** - Look at similar implementations in the codebase
3. **Use TodoWrite tool** - Create a task list for complex implementations (3+ steps)
4. **Start with minimal working version** - Get basic functionality working first
5. **Iterate and enhance** - Add features incrementally, test each addition
6. **Commit frequently** - Make commits after each working increment
7. **Run tests and linters** - Execute `npm run build`, `npm test`, `npm run lint` if available
8. **Ask for feedback** - Request user verification at key milestones
9. **Document decisions** - Update relevant docs if making architectural choices
10. **Only push/PR when requested** - Never push or create PRs unless explicitly asked

### Important Reminders

**NEVER**:

- Use `--no-verify` to bypass commit hooks
- Disable tests instead of fixing them
- Commit code that doesn't compile
- Make assumptions - verify with existing code
- Use `console.log` in MCP servers (breaks JSON-RPC protocol)
- Import packages that output to stdout in MCP servers (e.g., dotenv)
- Push to remote unless explicitly requested by user

**ALWAYS**:

- Commit working code incrementally
- Update plan documentation as you go
- Learn from existing implementations
- Stop after 3 failed attempts and reassess
- Run formatters/linters before committing
- Self-review changes before pushing
- Use `console.error` for debugging in MCP servers (not `console.log`)
- Include `.js` extensions in ES module imports
- Verify third-party packages don't output to stdout in MCP servers
- Create a new branch when working on GitHub issues
