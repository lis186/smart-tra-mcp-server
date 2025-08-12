# Reference Implementation Learnings

## Key Patterns Extracted from Reference Projects

### From smart-weather-mcp-server

1. **Dual Transport Architecture** (unified-server.ts)
   - STDIO mode for Claude Desktop
   - HTTP mode for web clients
   - Mode switching via command-line args

2. **MCP Tool Design**
   - Maximum 3-4 tools per server
   - Unified `query` + `context` parameters
   - User-intent naming convention

3. **Error Handling Patterns**
   - Structured error types
   - User-friendly error messages
   - Graceful degradation

4. **Testing Strategy**
   - Unit tests for core logic
   - Integration tests for MCP protocol
   - Mock SDK for test isolation

### From tdx-tra-mcp-server

1. **TDX API Integration**
   - OAuth 2.0 client credentials flow
   - Token caching (24-hour expiration)
   - Rate limiting considerations

2. **Tool Organization**
   - Group related functionality
   - Consistent parameter structure
   - Clear tool descriptions

3. **Development Principles**
   - Document-oriented SDLC
   - Johari Window for knowledge management
   - Incremental development approach

## Implementation Decisions

Based on these learnings, we implemented:

1. **Stage 1**: Basic MCP foundation with 3 tools
2. **Stage 2**: STDIO transport with security framework
3. **Stage 3**: (Upcoming) TDX authentication

## Original Reference Repositories

If needed for future reference:
- smart-weather-mcp-server: [GitHub link if available]
- tdx-tra-mcp-server: [GitHub link if available]

These were used as learning references during initial development but are no longer needed in the repository.