/**
 * TDX API Integration Tests
 * Tests real TDX API connectivity and v3 endpoint functionality
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as dotenv from 'dotenv';

// Load environment variables for API testing
dotenv.config();

const clientId = process.env.TDX_CLIENT_ID;
const clientSecret = process.env.TDX_CLIENT_SECRET;
const baseUrl = 'https://tdx.transportdata.tw/api/basic';
const authUrl = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

describe('TDX API Integration Tests', () => {
  let accessToken: string;

  beforeAll(async () => {
    if (!clientId || !clientSecret || clientId === 'test_client_id') {
      console.warn('⚠️  Skipping API tests - no real TDX credentials provided');
      return;
    }

    // Get real access token
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (response.ok) {
      const tokenData = await response.json() as { access_token: string };
      accessToken = tokenData.access_token;
    }
  }, 30000);

  describe('Authentication', () => {
    it('should obtain valid access token', () => {
      if (!clientId || clientId === 'test_client_id') {
        console.log('Skipping authentication test - no real credentials');
        return;
      }
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(100);
    });
  });

  describe('v3 API Endpoints', () => {
    it('should fetch train dates successfully', async () => {
      if (!accessToken) {
        console.log('Skipping API test - no access token');
        return;
      }

      const response = await fetch(
        `${baseUrl}/v3/Rail/TRA/DailyTrainTimetable/TrainDates?%24format=JSON`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      expect(response.status).toBe(200);
      
      const data = await response.json() as { TrainDates: string[] };
      expect(data).toHaveProperty('TrainDates');
      expect(Array.isArray(data.TrainDates)).toBe(true);
      expect(data.TrainDates.length).toBeGreaterThan(0);
    }, 10000);

    it('should fetch train timetables with correct structure', async () => {
      if (!accessToken) {
        console.log('Skipping API test - no access token');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(
        `${baseUrl}/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/${today}?%24format=JSON&%24top=3`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      expect(response.status).toBe(200);
      
      const data = await response.json() as { TrainTimetables: Array<{ TrainInfo: any; StopTimes: any[] }> };
      expect(data).toHaveProperty('TrainTimetables');
      expect(Array.isArray(data.TrainTimetables)).toBe(true);
      
      if (data.TrainTimetables.length > 0) {
        const firstTrain = data.TrainTimetables[0];
        expect(firstTrain).toHaveProperty('TrainInfo');
        expect(firstTrain).toHaveProperty('StopTimes');
        expect(firstTrain.TrainInfo).toHaveProperty('TrainNo');
        expect(firstTrain.TrainInfo).toHaveProperty('TrainTypeName');
      }
    }, 10000);

    it('should handle station data correctly', async () => {
      if (!accessToken) {
        console.log('Skipping API test - no access token');
        return;
      }

      const response = await fetch(
        `${baseUrl}/v2/Rail/TRA/Station?%24format=JSON&%24top=5`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      expect(response.status).toBe(200);
      
      const data = await response.json() as any[];
      expect(Array.isArray(data)).toBe(true);
      
      if (data.length > 0) {
        const firstStation = data[0];
        expect(firstStation).toHaveProperty('StationID');
        expect(firstStation).toHaveProperty('StationName');
        expect(firstStation.StationName).toHaveProperty('Zh_tw');
      }
    }, 10000);
  });

  describe('Chinese Character Support', () => {
    it('should handle traditional Chinese characters correctly', () => {
      const testStrings = [
        '台北到台中',
        '台北到臺中',  // Traditional variant
        '🚄 台北 → 台中 🕐',  // With emojis
        '明天早上八點台北到台中的自強號'
      ];

      testStrings.forEach(testString => {
        expect(testString.length).toBeGreaterThan(0);
        expect(Buffer.byteLength(testString, 'utf8')).toBeGreaterThan(testString.length);
        
        // Test JSON serialization
        const serialized = JSON.stringify({ query: testString });
        const parsed = JSON.parse(serialized);
        expect(parsed.query).toBe(testString);
      });
    });
  });
});