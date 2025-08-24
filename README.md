# Smart TRA MCP Server

An intelligent Taiwan Railway Administration (TRA) query server following the Model Context Protocol (MCP) design philosophy. This project integrates TDX (Transport Data eXchange) Taiwan railway APIs through natural language interfaces, providing train schedules, real-time information, fare queries, and trip planning.

## ✨ Features

### 🚄 **search_trains** - Intelligent Train Search ✅ Complete
- **Natural Language Queries**: "明早8點台北到台中最快的自強號"
- **Train Number Direct Search**: "152", "1234號列車" with smart completion
- **Real-time Status**: Live train positions and delay information
- **Delay Time Adjustment**: Automatic calculation of adjusted arrival/departure times
- **Visual Status System**: 🟢準點 🟡輕微誤點 🔴嚴重誤點
- **Modern Transit Icons**: 🚈進站中 🚏停靠中 ➡️已離站
- **Comprehensive Data**: Timetables, fares, and live status from TDX APIs

### 🏢 **search_station** - Station Discovery ✅ Complete  
- **Fuzzy Matching**: Handles abbreviations and typos (北車 → 臺北)
- **Confidence Scoring**: 0.0-1.0 confidence system with alternatives
- **244 TRA Stations**: Complete station database with detailed information
- **Smart Suggestions**: Multiple candidate matches for ambiguous queries

### 🗺️ **plan_trip** - Trip Planning ✅ Complete
- **Journey Planning**: Multi-segment routes with transfers
- **Non-station Destinations**: Tourist spot mapping (九份→瑞芳, 墾丁→枋寮)
- **Branch Line Support**: Pingxi, Jiji, Neiwan line transfers
- **TRA-only Scope**: Clear boundaries with actionable advice

## 🏗️ Architecture

### MCP Design Philosophy
- **Maximum 3 Tools**: Following Shopify Storefront MCP design
- **User-Intent Naming**: Tools named by user goals, not technical functions
- **Unified Parameters**: All tools use `query` (required) + `context` (optional)
- **Business Value Focus**: Every tool solves real user problems

### Technology Stack
- **Runtime**: Node.js 18+ with TypeScript 5.0+
- **MCP SDK**: @modelcontextprotocol/sdk for protocol implementation
- **APIs**: TDX Taiwan Railway v3 APIs with OAuth 2.0 authentication
- **Transport**: Dual support - STDIO (Claude Desktop) + Streamable HTTP (web/n8n)
- **Deployment**: Google Cloud Run ready with Docker containerization

## 🚀 Getting Started

### Prerequisites
- Node.js 18 or higher
- TDX API credentials (register at [TDX](https://tdx.transportdata.tw/))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd smart-tra-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

### Configuration

Copy and configure environment variables:

```bash
# Copy example configuration
cp .env.example .env

# Edit with your TDX API credentials
TDX_CLIENT_ID=your-client-id
TDX_CLIENT_SECRET=your-client-secret
```

### Running the Server

```bash
# STDIO mode (Claude Desktop)
npm run dev:stdio
npm run start:stdio

# HTTP mode (web clients, n8n)  
npm run dev:http
npm run start:http

# Default mode (STDIO)
npm run dev
npm start
```

## 🚀 Deployment to Google Cloud Run

### Quick Deployment
```bash
# Deploy with automatic setup
./deploy-cloudrun.sh YOUR-PROJECT-ID asia-east1

# Set TDX credentials after deployment  
gcloud run services update smart-tra-mcp-server \
  --set-env-vars TDX_CLIENT_ID=your_client_id \
  --set-env-vars TDX_CLIENT_SECRET=your_client_secret \
  --region asia-east1
```

### Manual Deployment
```bash
# Build and push container
gcloud builds submit --tag gcr.io/YOUR-PROJECT-ID/smart-tra-mcp-server

# Deploy to Cloud Run
gcloud run deploy smart-tra-mcp-server \
  --image gcr.io/YOUR-PROJECT-ID/smart-tra-mcp-server \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars NODE_ENV=production
```

Your service will be available at:
- **Health Check**: `https://your-service-url/health`
- **MCP Endpoint**: `https://your-service-url/mcp`

## 📖 Usage Examples

### Train Search Examples

```json
{
  "name": "search_trains",
  "arguments": {
    "query": "明早8點台北到台中最快的班次",
    "context": "結果上限5，含票價"
  }
}
```

```json
{
  "name": "search_trains", 
  "arguments": {
    "query": "152",
    "context": "顯示詳細時刻表"
  }
}
```

### Station Search Examples

```json
{
  "name": "search_station",
  "arguments": {
    "query": "松山站",
    "context": "列出候選3個，繁體中文"
  }
}
```

### Response Features

#### Real-time Status Display
```
🚄 車次 152 詳細資訊

📊 即時狀態 (20:30 更新)
🟡 目前誤點 5 分鐘
🎯 嘉義 🚏 停靠中
📡 即時資料覆蓋: 25/50 站 (50%)
⏭️ 下一站: 斗六 預估 20:52 到達
🏁 汐止 預估 00:28 到達 (原定 00:23)
```

#### Adjusted Time Display
```
⏰ 今日時刻表
🚩 潮州       18:31發 (原定18:26)🟡 輕微誤點5分
   屏東       18:43到 (原定18:38) → 18:45發 (原定18:40) (2分)
   高雄       19:08到 (原定19:03) → 19:10發 (原定19:05) (2分)
🏁 汐止       00:28到 (原定00:23)
```

## 🔧 Development

### Project Structure

```
smart-tra-mcp-server/
├── src/                        # Source code
│   ├── unified-server.ts       # Main server entry point (dual transport)
│   ├── server.ts              # Core MCP server class
│   ├── core/                  # Core modules
│   │   ├── express-server.ts  # HTTP server for Cloud Run
│   │   ├── auth-manager.ts    # TDX authentication
│   │   ├── data-manager.ts    # Station data management
│   │   └── error-handler.ts   # Error categorization
│   ├── services/              # Business logic
│   │   ├── train-service.ts   # Train search service
│   │   └── trip-planner.ts    # Trip planning service
│   ├── types/                 # TypeScript definitions
│   └── utils/                 # Utility functions
├── dist/                      # Compiled JavaScript
├── tests/                     # Comprehensive test suite
├── Dockerfile                 # Container configuration
├── deploy-cloudrun.sh         # Cloud Run deployment script
├── cloudrun-service.yaml      # Cloud Run service config
└── README.md                  # This file
```

### Development Principles

- **Deploy Fast First**: Small, verifiable changes
- **Critical Risk First**: Address unknowns early
- **Fail Fast**: 3-attempt rule, then reassess
- **Production-Like Testing**: Real APIs from day one
- **Continuous Learning**: Document lessons learned

### Testing

```bash
# Build project
npm run build

# Run comprehensive test suite
npm test

# Run specific test categories
npm run test:unit        # Unit tests
npm run test:integration # Integration tests  
npm run test:e2e        # End-to-end tests
```

**Current Test Results**: 96.4% success rate (54/56 tests passing)
- ✅ Unit Tests: 35/35 (100%) - Core logic validation
- ✅ Integration Tests: 9/9 (100%) - Tool boundary enforcement
- ❌ Delegation Tests: 4/6 (67%) - Minor display format issues
- ✅ E2E Tests: 6/6 (100%) - User journey validation

## 📊 Current Status

### ✅ Production Ready - All Core Stages Complete

**Stage 1-10.1**: All development stages completed
- **✅ Stage 1-6**: Foundation through search_trains tool  
- **✅ Stage 7**: HTTP transport & Google Cloud Run deployment
- **✅ Stage 8**: Response size optimization (60-85% reduction)
- **✅ Stage 9**: plan_trip tool with transfer support
- **✅ Stage 10-10.1**: Complete TypeScript type safety

### 🎯 Current Capabilities
- **All 3 MCP Tools**: search_trains, search_station, plan_trip
- **Dual Transport**: STDIO (Claude Desktop) + HTTP (Cloud Run, web clients)
- **Real-time Data**: Live train status with delay adjustments
- **Production Deployment**: Docker containerization with Cloud Run support
- **Comprehensive Testing**: 96.4% test success rate

### 🚀 Ready For
- ✅ **Claude Desktop Integration** (STDIO transport)
- ✅ **Google Cloud Run Deployment** (HTTP transport)
- ✅ **Web Client Integration** (n8n, custom HTTP clients)
- ✅ **Production Traffic** (error handling, monitoring, scaling)

## 🎯 Key Achievements

### Technical
- **Real TDX Integration**: Production API connectivity with OAuth 2.0
- **MCP Protocol**: Full compliance with Model Context Protocol
- **Type Safety**: Complete TypeScript implementation
- **Error Handling**: Comprehensive error management and user guidance

### User Experience  
- **Natural Language**: Intuitive query interface
- **Real-time Data**: Live train positions and delays
- **Visual Design**: Modern emoji system for status indication
- **Delay Awareness**: Automatic time adjustments for accurate planning

### Performance
- **Response Optimization**: Context-efficient responses for AI agents
- **Caching Strategy**: Smart caching for frequently accessed data
- **Rate Limiting**: Respectful API usage with proper throttling

## 📚 Documentation

- **[PRD](prd.md)**: Product Requirements Document
- **[Spec](spec.md)**: Technical Specifications  
- **[Implementation Plan](IMPLEMENTATION_PLAN.md)**: Development Stages
- **[CLAUDE.md](CLAUDE.md)**: Development Guidelines
- **[CHANGELOG.md](CHANGELOG.md)**: Version History

## 🤝 Contributing

This project follows strict development principles:

1. **Small Batch Development**: Single feature per commit
2. **Test-Driven**: Real API testing from start
3. **Documentation First**: Update docs with changes
4. **Type Safety**: All code must compile without errors

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **TDX (Transport Data eXchange)**: Taiwan's open transportation data platform
- **Model Context Protocol**: Protocol specification and SDK
- **Taiwan Railway Administration**: Railway system and data

---

**Project Status**: 🎉 **Production Ready** - All Core Stages Complete (1-10.1)  
**Last Updated**: August 24, 2025  
**Current Milestone**: ✅ Google Cloud Run Deployment Ready (Stage 7 Complete)
**Deployment**: Ready for production deployment to Google Cloud Run
