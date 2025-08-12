#!/usr/bin/env tsx
/**
 * Test script for TDX authentication - Stage 3 validation
 * Run with: npm run test:auth
 */

import { getTDXToken, testTDXApiCall, TDXAuthenticationError, TDXApiError } from './tdx-auth.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function main() {
  console.log('=== TDX Authentication Test ===\n');
  
  // Step 1: Check for credentials
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error('❌ TDX credentials not found in environment variables');
    console.error('\nPlease set the following in your .env file:');
    console.error('TDX_CLIENT_ID=your_client_id');
    console.error('TDX_CLIENT_SECRET=your_client_secret');
    console.error('\nTo get credentials:');
    console.error('1. Register at https://tdx.transportdata.tw/');
    console.error('2. Verify email and wait for admin approval');
    console.error('3. Go to member center and generate API keys');
    process.exit(1);
  }
  
  console.log('✓ Credentials found in environment\n');
  
  try {
    // Step 2: Get access token
    console.log('📡 Requesting access token...');
    const token = await getTDXToken(clientId, clientSecret);
    console.log('✅ Token acquired successfully!\n');
    
    // Step 3: Test API call with token
    console.log('📡 Testing API call with token...');
    const stations = await testTDXApiCall(token);
    console.log('✅ API call successful!\n');
    
    // Step 4: Display sample data
    console.log('Sample station data:');
    if (Array.isArray(stations) && stations.length > 0) {
      stations.slice(0, 3).forEach((station: any) => {
        console.log(`  - ${station.StationName?.Zh_tw || 'Unknown'} (ID: ${station.StationID})`);
      });
    }
    
    console.log('\n🎉 Stage 3 validation complete! TDX authentication is working.');
    
    // Save test results for documentation (no sensitive info)
    const testResults = {
      timestamp: new Date().toISOString(),
      success: true,
      apiResponse: {
        stationCount: Array.isArray(stations) ? stations.length : 0,
        sampleStation: stations[0]?.StationName?.Zh_tw || 'Unknown'
      }
    };
    
    const resultsPath = path.join(process.cwd(), 'tdx-auth-test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
    console.log(`\nTest results saved to: ${resultsPath}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Provide specific troubleshooting based on error type
    if (error instanceof TDXAuthenticationError) {
      console.error('\n🔐 Authentication Error Troubleshooting:');
      if (error.statusCode === 400) {
        console.error('1. Check that TDX_CLIENT_ID and TDX_CLIENT_SECRET are correct');
        console.error('2. Ensure no extra spaces or special characters in .env file');
        console.error('3. Verify credentials were copied correctly from TDX portal');
      } else if (error.statusCode === 401) {
        console.error('1. Your TDX account may not be approved yet');
        console.error('2. API keys might be expired - generate new ones');
        console.error('3. Check TDX member center for account status');
      } else {
        console.error('1. TDX authentication service may be temporarily unavailable');
        console.error('2. Check https://tdx.transportdata.tw/ for service status');
      }
    } else if (error instanceof TDXApiError) {
      console.error('\n🌐 API Error Troubleshooting:');
      if (error.statusCode === 401) {
        console.error('1. Token may have expired (24-hour limit)');
        console.error('2. Token authentication failed - check token format');
      } else if (error.statusCode === 429) {
        console.error('1. Rate limit exceeded - wait before retrying');
        console.error('2. TDX limit: 50 requests/second per API key');
      } else {
        console.error('1. TDX API service may be temporarily unavailable');
        console.error('2. Network connectivity issues to tdx.transportdata.tw');
      }
    } else {
      console.error('\n🔧 General Troubleshooting:');
      console.error('1. Check network connectivity to tdx.transportdata.tw');
      console.error('2. Verify all dependencies are installed (npm install)');
      console.error('3. Check that .env file exists and is readable');
    }
    
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);