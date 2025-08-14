/**
 * Debug tests to identify why train search tests return "No trains found"
 */

import { SmartTRAServer } from '../src/server';
import { TDXMockHelper } from './helpers/mockHelper';

describe('DEBUG: Train Search Issues', () => {
  let server: SmartTRAServer;

  beforeAll(async () => {
    console.log('\n=== DEBUG: Setting up server ===');
    
    // Setup server with minimal mocks
    TDXMockHelper.setupMinimalSequence();
    server = new SmartTRAServer();
    server.resetRateLimitingForTest();
    
    // Wait for initialization
    await TDXMockHelper.waitForServerInitialization(200);
    console.log('Server initialized');
  });

  describe('Station Data Analysis', () => {
    test('should have loaded station data correctly', () => {
      console.log('\n=== DEBUG: Station Data ===');
      console.log('Station data loaded:', (server as any).stationDataLoaded);
      console.log('Station load failed:', (server as any).stationLoadFailed);
      console.log('Total stations:', (server as any).stations?.length || 0);
      
      if ((server as any).stations?.length > 0) {
        console.log('Sample stations:');
        (server as any).stations.slice(0, 3).forEach((station: any) => {
          console.log(`  - ${station.StationID}: ${station.StationName.Zh_tw} (${station.StationName.En})`);
        });
      }
      
      expect((server as any).stationDataLoaded).toBe(true);
      expect((server as any).stations).toHaveLength(4); // Our mock data has 4 stations
    });

    test('should find stations correctly', () => {
      console.log('\n=== DEBUG: Station Search ===');
      
      const taipeiResults = server['searchStations']('台北');
      console.log('Search "台北":', taipeiResults);
      
      const taichungResults = server['searchStations']('台中');  
      console.log('Search "台中":', taichungResults);
      
      expect(taipeiResults.length).toBeGreaterThan(0);
      expect(taichungResults.length).toBeGreaterThan(0);
      
      console.log('Station search working ✓');
    });
  });

  describe('Query Parsing Analysis', () => {
    test('should parse queries correctly', async () => {
      console.log('\n=== DEBUG: Query Parsing ===');
      
      const { QueryParser } = await import('../src/query-parser');
      const parser = new QueryParser();
      
      const query = '台北到台中';
      const result = parser.parse(query);
      
      console.log('Input query:', query);
      console.log('Parsed result:', JSON.stringify(result, null, 2));
      
      expect(result.origin).toBe('台北');
      expect(result.destination).toBe('台中');
      expect(result.confidence).toBeGreaterThan(0);
      
      console.log('Query parsing working ✓');
    });
  });

  describe('API Mock Analysis', () => {
    test('should analyze mock setup sequence', async () => {
      console.log('\n=== DEBUG: API Mock Analysis ===');
      
      // Reset and setup fresh mocks
      const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
      fetchMock.mockReset();
      
      console.log('Setting up complete API sequence...');
      
      // Track what we're mocking
      const tokenResponse = { access_token: 'debug_token', token_type: 'Bearer', expires_in: 86400 };
      const trainResponse = {
        TrainTimetables: [
          {
            TrainInfo: {
              TrainNo: '408',
              Direction: 0,
              TrainTypeCode: '1108',
              TrainTypeName: { Zh_tw: '自強號', En: 'Tze-Chiang Limited Express' },
              DailyFlag: 1,
              SuspendedFlag: 0
            },
            StopTimes: [
              {
                StopSequence: 1,
                StationID: '1000',
                StationName: { Zh_tw: '臺北', En: 'Taipei' },
                ArrivalTime: '08:30:00',
                DepartureTime: '08:30:00',
                SuspendedFlag: 0
              },
              {
                StopSequence: 2,
                StationID: '3300', 
                StationName: { Zh_tw: '臺中', En: 'Taichung' },
                ArrivalTime: '10:07:00',
                DepartureTime: '10:07:00',
                SuspendedFlag: 0
              }
            ]
          }
        ]
      };
      
      console.log('Mock token response:', JSON.stringify(tokenResponse, null, 2));
      console.log('Mock train response:', JSON.stringify(trainResponse, null, 2));
      
      // Setup mocks
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => tokenResponse
        } as Response)
        .mockResolvedValueOnce({
          ok: true, 
          status: 200,
          json: async () => trainResponse
        } as Response);
      
      console.log('Mocks set up, making train search call...');
    });

    test('should execute train search and analyze result', async () => {
      console.log('\n=== DEBUG: Train Search Execution ===');
      
      try {
        const result = await server['handleSearchTrains']('台北到台中');
        
        console.log('Search result type:', typeof result);
        console.log('Has content:', !!result.content);
        console.log('Content array length:', result.content?.length || 0);
        
        if (result.content && result.content[0]) {
          const text = result.content[0].text;
          console.log('Result text length:', text.length);
          console.log('First 500 chars:', text.substring(0, 500));
          
          // Check for key indicators
          if (text.includes('🚄 **Train Search Results**')) {
            console.log('✓ SUCCESS: Found train results indicator');
          } else if (text.includes('❌ No trains found')) {
            console.log('❌ ISSUE: No trains found message');
          } else {
            console.log('⚠️  UNEXPECTED: Different message format');
          }
          
          // Check what fetch calls were made
          const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
          console.log('\nFetch calls made:', fetchMock.mock.calls.length);
          
          fetchMock.mock.calls.forEach((call, index) => {
            const url = call[0] as string;
            console.log(`  ${index + 1}. ${url}`);
            
            if (url.includes('token')) {
              console.log('     -> Token request');
            } else if (url.includes('DailyTrainTimetable')) {
              console.log('     -> Train timetable request');
            } else if (url.includes('Station')) {
              console.log('     -> Station data request');  
            } else if (url.includes('ODFare')) {
              console.log('     -> Fare data request');
            }
          });
        }
        
      } catch (error) {
        console.error('❌ Train search failed:', error);
        if (error instanceof Error) {
          console.error('Error stack:', error.stack);
        }
      }
    });
  });

  describe('Time Window Analysis', () => {
    test('should check time-related filtering', () => {
      console.log('\n=== DEBUG: Time Analysis ===');
      
      const now = new Date();
      console.log('Current test time:', now.toISOString());
      console.log('Current local time:', now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));
      
      // Test time parsing
      const testTime = server['parseTrainTime']('08:30:00');
      console.log('Parsed train time (08:30:00):', testTime.toISOString());
      
      // Check if train time is within expected window
      const timeDiff = testTime.getTime() - now.getTime();
      const hoursFromNow = timeDiff / (1000 * 60 * 60);
      
      console.log('Time difference (hours):', hoursFromNow);
      console.log('Within 2-hour window:', Math.abs(hoursFromNow) <= 2);
    });
  });
});