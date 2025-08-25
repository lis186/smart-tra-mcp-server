#!/usr/bin/env node

/**
 * Generate Station Fallback Data
 * Uses TDX API to fetch station data and create stations-fallback.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const TDX_CLIENT_ID = process.env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

if (!TDX_CLIENT_ID || !TDX_CLIENT_SECRET) {
  console.error('Error: TDX_CLIENT_ID and TDX_CLIENT_SECRET must be set in .env file');
  process.exit(1);
}

/**
 * Get OAuth access token from TDX
 */
async function getAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', TDX_CLIENT_ID);
  params.append('client_secret', TDX_CLIENT_SECRET);

  const postData = params.toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'tdx.transportdata.tw',
      port: 443,
      path: '/auth/realms/TDXConnect/protocol/openid-connect/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error('No access token in response'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Fetch station data from TDX API
 */
async function fetchStationData(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'tdx.transportdata.tw',
      port: 443,
      path: '/api/basic/v3/Rail/TRA/Station?%24format=JSON',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('API Response structure:', Object.keys(response));
          
          // Handle different response formats
          let stations = [];
          if (Array.isArray(response)) {
            stations = response;
          } else if (response.data && Array.isArray(response.data)) {
            stations = response.data;
          } else if (response.Stations && Array.isArray(response.Stations)) {
            stations = response.Stations;
          } else {
            console.log('Full response:', JSON.stringify(response, null, 2));
            reject(new Error('Unexpected response format'));
            return;
          }

          console.log(`Fetched ${stations.length} stations from TDX API`);
          resolve(stations);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🔑 Getting TDX access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained');

    console.log('🚉 Fetching station data from TDX API...');
    const stations = await fetchStationData(accessToken);
    
    if (!Array.isArray(stations) || stations.length === 0) {
      throw new Error('No station data received from TDX API');
    }

    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Save to fallback file
    const fallbackPath = path.join(dataDir, 'stations-fallback.json');
    fs.writeFileSync(fallbackPath, JSON.stringify(stations, null, 2), 'utf-8');
    
    console.log(`✅ Successfully saved ${stations.length} stations to ${fallbackPath}`);
    console.log('📋 Sample station data:');
    if (stations.length > 0) {
      console.log(JSON.stringify(stations[0], null, 2));
    }

    // Verify file
    const savedData = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
    console.log(`🔍 Verification: File contains ${savedData.length} stations`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
