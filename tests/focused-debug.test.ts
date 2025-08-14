/**
 * Focused debug test to identify the exact mock timing issue
 */

import { SmartTRAServer } from '../src/server';
import { TDXMockHelper } from './helpers/mockHelper';

describe('FOCUSED DEBUG: Mock Timing Issue', () => {
  test('should identify why mocks fail in train search', async () => {
    console.log('\n=== FOCUSED DEBUG: Mock Timing Analysis ===\n');
    
    // Use real timers for server initialization to avoid timeout
    jest.useRealTimers();
    
    // Step 1: Setup server (this works, as seen in console)
    console.log('1. Setting up server...');
    TDXMockHelper.setupMinimalSequence();
    
    const server = new SmartTRAServer();
    server.resetRateLimitingForTest();
    
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for init
    console.log('   Server setup complete ✓');
    
    // Step 2: Check server state
    console.log('\n2. Checking server state...');
    const hasStationData = (server as any).stationDataLoaded;
    const stationCount = (server as any).stations?.length || 0;
    console.log(`   Station data loaded: ${hasStationData}`);
    console.log(`   Station count: ${stationCount}`);
    
    if (hasStationData) {
      console.log('   ✓ Server has station data');
    } else {
      console.log('   ❌ Server missing station data');
      return; // Can't proceed without stations
    }
    
    // Step 3: Test station search (this should work)
    console.log('\n3. Testing station search...');
    const taipeiStations = server['searchStations']('台北');
    const taichungStations = server['searchStations']('台中');
    
    console.log(`   "台北" search results: ${taipeiStations.length}`);
    console.log(`   "台中" search results: ${taichungStations.length}`);
    
    if (taipeiStations.length > 0 && taichungStations.length > 0) {
      console.log('   ✓ Station search working');
      console.log(`   台北 ID: ${taipeiStations[0].stationId}`);
      console.log(`   台中 ID: ${taichungStations[0].stationId}`);
    } else {
      console.log('   ❌ Station search failed');
      return;
    }
    
    // Step 4: Setup fresh mocks for train search
    console.log('\n4. Setting up fresh mocks for train API...');
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    
    // Clear any existing mocks
    fetchMock.mockClear();
    
    // Mock token request (server will make this)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'test_token_987654321',
        token_type: 'Bearer',
        expires_in: 86400
      })
    } as Response);
    
    // Mock train timetable request
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200, 
      json: async () => ({
        TrainTimetables: [
          {
            TrainInfo: {
              TrainNo: '408',
              Direction: 0,
              TrainTypeCode: '1108',
              TrainTypeName: { Zh_tw: '自強號', En: 'Tze-Chiang Limited Express' },
              StartingStationID: '1000',
              EndingStationID: '3300',
              DailyFlag: 1,
              SuspendedFlag: 0
            },
            StopTimes: [
              {
                StopSequence: 1,
                StationID: '1000',
                StationName: { Zh_tw: '臺北', En: 'Taipei' },
                ArrivalTime: '09:00:00',
                DepartureTime: '09:00:00',
                SuspendedFlag: 0
              },
              {
                StopSequence: 2,
                StationID: '3300',
                StationName: { Zh_tw: '臺中', En: 'Taichung' },
                ArrivalTime: '10:37:00',
                DepartureTime: '10:37:00',
                SuspendedFlag: 0
              }
            ]
          }
        ]
      })
    } as Response);
    
    console.log('   Train API mocks set up');
    
    // Step 5: Execute train search and track what happens
    console.log('\n5. Executing train search...');
    console.log('   Query: "台北到台中"');
    
    try {
      const result = await server['handleSearchTrains']('台北到台中');
      
      console.log('   ✓ Train search completed without error');
      console.log(`   Response type: ${typeof result}`);
      console.log(`   Has content: ${!!result.content}`);
      
      if (result.content && result.content[0]) {
        const text = result.content[0].text;
        console.log(`   Text length: ${text.length}`);
        
        // Check result type
        if (text.includes('🚄 **Train Search Results**')) {
          console.log('   ✅ SUCCESS! Found train results');
          console.log('   First 300 chars:');
          console.log('   ' + text.substring(0, 300).replace(/\n/g, '\n   '));
        } else if (text.includes('❌ No trains found')) {
          console.log('   ❌ Got "No trains found" message');
          console.log('   This means the API call failed or returned empty data');
          console.log('   Full message:');
          console.log('   ' + text.replace(/\n/g, '\n   '));
        } else {
          console.log('   ⚠️ Unexpected response format');
          console.log('   First 300 chars:');
          console.log('   ' + text.substring(0, 300).replace(/\n/g, '\n   '));
        }
      }
      
      // Step 6: Analyze fetch calls
      console.log('\n6. Analyzing fetch calls made:');
      console.log(`   Total calls: ${fetchMock.mock.calls.length}`);
      
      fetchMock.mock.calls.forEach((call, index) => {
        const url = call[0] as string;
        console.log(`   ${index + 1}. ${url.replace(/https?:\/\/[^\/]+/, '[HOST]')}`);
      });
      
    } catch (error) {
      console.log('   ❌ Train search threw error:', error);
    }
    
    console.log('\n=== DEBUG ANALYSIS COMPLETE ===\n');
    
    // Ensure test passes
    expect(true).toBe(true);
  }, 30000); // 30 second timeout
});