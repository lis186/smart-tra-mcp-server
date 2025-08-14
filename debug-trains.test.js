/**
 * Debug script to identify why train search tests return "No trains found"
 * This is a standalone debug file to isolate the issue
 */

import { SmartTRAServer } from './src/server.js';
import { TDXMockHelper } from './tests/helpers/mockHelper.js';

// Mock environment
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_client_secret';
process.env.NODE_ENV = 'test';

// Create simple mock function
function createMockFetch() {
  const mockCalls = [];
  const mockFn = async (url, options) => {
    mockCalls.push([url, options]);
    return mockFn._nextResponse || { ok: false, status: 404 };
  };
  
  mockFn.mock = { calls: mockCalls };
  mockFn.mockReset = () => { mockCalls.length = 0; mockFn._responses = []; mockFn._responseIndex = 0; };
  mockFn.mockResolvedValueOnce = (response) => {
    if (!mockFn._responses) mockFn._responses = [];
    mockFn._responses.push(response);
    mockFn._nextResponse = response;
    return mockFn;
  };
  
  return mockFn;
}

// Mock fetch globally
global.fetch = createMockFetch();

async function debugTrainSearch() {
  console.log('=== DEBUG: Train Search Issue ===\n');
  
  try {
    // Step 1: Setup server
    console.log('1. Setting up server...');
    TDXMockHelper.setupMinimalSequence();
    
    const server = new SmartTRAServer();
    server.resetRateLimitingForTest();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('   Server initialized ✓\n');
    
    // Step 2: Test station search
    console.log('2. Testing station search...');
    const stationResults = server.searchStations('台北');
    console.log('   Station search results:', JSON.stringify(stationResults, null, 2));
    
    if (stationResults.length === 0) {
      console.log('   ❌ No stations found - this is the root issue!');
      return;
    }
    console.log('   Station search working ✓\n');
    
    // Step 3: Check station data loading
    console.log('3. Checking station data...');
    console.log('   Station data loaded:', server.stationDataLoaded);
    console.log('   Station load failed:', server.stationLoadFailed);
    console.log('   Total stations:', server.stations?.length || 0);
    if (server.stations?.length > 0) {
      console.log('   Sample station:', JSON.stringify(server.stations[0], null, 2));
    }
    console.log('');
    
    // Step 4: Test simple train search with debug mocks
    console.log('4. Testing train search with debug mocks...');
    
    // Reset mocks and setup fresh sequence
    const fetchMock = global.fetch;
    fetchMock.mockReset();
    
    // Setup token mock
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'debug_token_123',
        token_type: 'Bearer',
        expires_in: 86400
      })
    });
    
    // Setup train data mock (realistic structure)
    const debugTrainData = {
      TrainTimetables: [
        {
          TrainInfo: {
            TrainNo: '408',
            Direction: 0,
            TrainTypeCode: '1108',
            TrainTypeName: { Zh_tw: '自強號', En: 'Tze-Chiang Limited Express' },
            TripHeadSign: '往臺中',
            StartingStationID: '1000',
            StartingStationName: { Zh_tw: '臺北', En: 'Taipei' },
            EndingStationID: '3300',
            EndingStationName: { Zh_tw: '臺中', En: 'Taichung' },
            DailyFlag: 1,
            SuspendedFlag: 0
          },
          StopTimes: [
            {
              StopSequence: 1,
              StationID: '1000',
              StationName: { Zh_tw: '臺北', En: 'Taipei' },
              ArrivalTime: '08:15:00',
              DepartureTime: '08:15:00',
              SuspendedFlag: 0
            },
            {
              StopSequence: 2,
              StationID: '3300',
              StationName: { Zh_tw: '臺中', En: 'Taichung' },
              ArrivalTime: '09:52:00',
              DepartureTime: '09:52:00',
              SuspendedFlag: 0
            }
          ]
        }
      ]
    };
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => debugTrainData
    });
    
    console.log('   Mock train data prepared:', JSON.stringify(debugTrainData, null, 2));
    console.log('');
    
    // Step 5: Execute train search
    console.log('5. Executing train search...');
    console.log('   Query: "台北到台中"');
    console.log('   Current time:', new Date().toISOString());
    
    const result = await server.handleSearchTrains('台北到台中');
    
    console.log('   Raw result structure:');
    console.log('   - Type:', typeof result);
    console.log('   - Has content:', !!result.content);
    console.log('   - Content length:', result.content?.length || 0);
    
    if (result.content && result.content[0]) {
      console.log('   - Text preview:', result.content[0].text.substring(0, 300));
      console.log('   - Full result:', result.content[0].text);
    }
    
    // Step 6: Check what fetch calls were made
    console.log('\n6. Checking fetch calls made:');
    console.log('   Total fetch calls:', fetchMock.mock.calls.length);
    
    fetchMock.mock.calls.forEach((call, index) => {
      console.log(`   Call ${index + 1}:`, call[0]);
      if (call[1]?.headers) {
        console.log(`     Headers:`, call[1].headers);
      }
    });
    
    // Step 7: Test query parsing
    console.log('\n7. Testing query parsing...');
    const { QueryParser } = await import('./src/query-parser.js');
    const queryParser = new QueryParser();
    const parsedQuery = queryParser.parse('台北到台中');
    console.log('   Parsed query:', JSON.stringify(parsedQuery, null, 2));
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run debug 
debugTrainSearch().then(() => {
  console.log('\n=== DEBUG COMPLETE ===');
  process.exit(0);
}).catch(error => {
  console.error('Debug error:', error);
  process.exit(1);
});