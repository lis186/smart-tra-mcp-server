#!/usr/bin/env tsx
/**
 * Test script for TDX authentication - Stage 3 validation
 * Run with: npm run test:auth
 */

import { getTDXToken, testTDXApiCall } from './tdx-auth.js';
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
    
    // Save test results for documentation
    const testResults = {
      timestamp: new Date().toISOString(),
      success: true,
      tokenLength: token.length,
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
    console.error('\nTroubleshooting:');
    console.error('1. Verify your TDX account is approved');
    console.error('2. Check credentials are correct');
    console.error('3. Ensure network connectivity to tdx.transportdata.tw');
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);