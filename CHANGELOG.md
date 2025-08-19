# Changelog

All notable changes to the Smart TRA MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Train Number Direct Query Support** - Users can now query specific trains by number (e.g., "152", "1234號列車")
- **Smart Train Search Engine** - Intelligent suggestions and real-time previews for train number queries
- **Real Timetable Integration** - Integration with TDX SpecificTrainTimetable and DailyTrainTimetable APIs
- **Live Status Integration** - Real-time train status via TDX TrainLiveBoard API
- **Enhanced Visual Design** - Modern emoji system with traffic light concept (🟢🟡🔴) and transit icons (🚈🚏➡️)
- **Delay Time Adjustment** - Automatic calculation of adjusted arrival/departure times based on real-time delays
- **Current Position Tracking** - Display of train's current location and status (arriving, at station, departed)
- **Live Data Coverage Statistics** - Show percentage of stations with real-time data available
- **Estimated Next Station Arrival** - Calculate and display estimated arrival time at next station
- **Enhanced Status Categories** - Detailed train and station status with descriptive text and icons

### Changed
- **Improved Emoji Design** - Replaced old emojis (🚂🛑🚀) with modern transit icons (🚈🚏➡️) for better user experience
- **Enhanced Delay Classification** - Categorize delays as minor (1-10 minutes) vs severe (>10 minutes) with appropriate colors
- **Better Time Display Format** - Show adjusted times with original schedule in parentheses for delayed trains
- **Optimized Response Size** - Reduced response token count by 60-85% while maintaining functionality

### Fixed
- **TypeScript Compilation Errors** - Resolved array type inference issues and API response type annotations
- **Duplicate Function Definitions** - Removed duplicate `addMinutesToTime` method implementations
- **Variable Name Mismatches** - Fixed test script variable naming inconsistencies

## [v0.6.0] - 2025-08-18 - Stage 6 Complete

### Added
- **search_trains Tool** - Complete train search functionality with fare integration
- **TDX Daily Train Timetable API Integration** - Real timetable data from production APIs
- **Origin-Destination (OD) Fare Integration** - Complete pricing information for all ticket types
- **Monthly Pass Filtering** - Commuter-focused defaults with 區間車/區間快車 filtering
- **Enhanced Response Format** - Machine-readable JSON output with comprehensive train data
- **Data Availability Handling** - Graceful degradation when trains not running
- **Robust Error Handling** - Comprehensive error handling for API failures and invalid routes

### Changed
- **Response Size Optimization** - Implemented context-aware response limits to prevent AI agent overflow

## [v0.5.0] - 2025-08-18 - Stage 5 Complete

### Added
- **Rule-Based Query Parsing** - Natural language query parsing with 84% success rate
- **Entity Extraction** - Extract origin/destination, dates, times, and preferences from queries
- **Confidence-Based Routing** - Score-based decision making for query handling
- **Integration with search_station** - Seamless station name validation and correction

## [v0.4.0] - 2025-08-18 - Stage 4 Complete

### Added
- **search_station Tool** - Station discovery and confirmation with fuzzy matching
- **244 TRA Stations** - Complete station database from TDX API
- **Fuzzy Matching** - Handle common abbreviations and typos (北車 → 臺北, 台北 → 臺北)
- **Confidence Scoring** - 0.0-1.0 confidence system for station matches
- **Candidate Suggestions** - Multiple possible matches with detailed information
- **English Station Names** - Support for English station name recognition
- **Structured JSON Output** - Machine-readable station information for downstream tools

## [v0.3.0] - 2025-08-18 - Stage 3 Complete

### Added
- **TDX Authentication** - OAuth 2.0 client credentials flow implementation
- **Token Management** - Automatic token refresh and caching system
- **API Client** - Robust TDX API client with error handling and retry logic
- **Production API Integration** - Real TDX production API connectivity validation

## [v0.2.0] - 2025-08-18 - Stage 2 Complete

### Added
- **STDIO Transport** - Claude Desktop integration with MCP protocol
- **Basic MCP Server** - Core server structure with tool registration
- **Protocol Handshake** - Proper MCP protocol negotiation and communication
- **Development Workflow** - Claude Desktop configuration and testing procedures

## [v0.1.0] - 2025-08-18 - Stage 1 Complete

### Added
- **Project Foundation** - npm project with TypeScript configuration
- **MCP SDK Integration** - @modelcontextprotocol/sdk integration and validation
- **Basic Server Structure** - Initial MCP server implementation
- **Development Environment** - TypeScript compilation and build system
- **Documentation** - Initial PRD, spec, and implementation plan documents

### Infrastructure
- **TypeScript 5.0+** - Type-safe development environment
- **Node.js 18+** - Modern runtime support
- **MCP Protocol Support** - Model Context Protocol implementation
- **Development Tooling** - Build scripts, linting, and development workflow

## Development Milestones

### Completed Features ✅
1. **Foundation (Stages 1-3)** - Project setup, MCP integration, TDX authentication
2. **Core Tools (Stages 4-6)** - search_station and search_trains with complete functionality
3. **Advanced Features** - Train number queries, live status, delay adjustment, visual enhancements
4. **Optimization (Stage 8)** - Response size optimization for AI agent compatibility

### In Progress ⏳
- **Deployment (Stage 7)** - Google Cloud Run deployment preparation
- **Trip Planning (Stage 9)** - plan_trip tool implementation

### Planned 📋
- **Transfer Planning (Phase 2)** - Basic main↔branch line transfers
- **Intelligent Transfers (Phase 3)** - Real-time delay considerations and multi-modal integration

---

## Technical Achievements

### API Integration
- ✅ TDX OAuth 2.0 authentication
- ✅ Daily Train Timetable API
- ✅ Specific Train Timetable API  
- ✅ Train Live Board API
- ✅ OD Fare API
- ✅ Station API

### MCP Protocol
- ✅ STDIO transport for Claude Desktop
- ✅ Unified parameter structure (query + context)
- ✅ User-intent focused tool design
- ✅ Response optimization for AI agents

### User Experience
- ✅ Natural language query support
- ✅ Fuzzy station name matching
- ✅ Real-time status visualization
- ✅ Delay-adjusted time calculations
- ✅ Modern emoji and icon system
- ✅ Context-aware response formatting

### Development Quality
- ✅ TypeScript type safety
- ✅ Comprehensive error handling
- ✅ Production-like testing approach
- ✅ Incremental development methodology
- ✅ Documentation-driven development

---

*This changelog follows the principles of transparent development and continuous learning as outlined in the project's core development principles.*
