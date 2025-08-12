/**
 * Minimal TDX OAuth 2.0 client for Stage 3
 * Following Core Principle: Deploy Fast First - simplest possible implementation
 */

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// TDX API endpoints
const TDX_AUTH_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_BASE_URL = 'https://tdx.transportdata.tw/api/basic';

/**
 * Get TDX access token using OAuth 2.0 Client Credentials flow
 * No caching, no retry, no complexity - just prove it works
 */
export async function getTDXToken(clientId: string, clientSecret: string): Promise<string> {
  console.error(`[TDX Auth] Requesting token from: ${TDX_AUTH_URL}`);
  
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  console.error(`[TDX Auth] Client ID: ${clientId.substring(0, 8)}...`);
  
  const response = await fetch(TDX_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  console.error(`[TDX Auth] Response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TDX Auth] Error response: ${errorText}`);
    throw new Error(`TDX authentication failed: ${response.status} - ${errorText}`);
  }

  const tokenData = await response.json() as TokenResponse;
  console.error(`[TDX Auth] Token acquired, expires in ${tokenData.expires_in} seconds`);
  console.error(`[TDX Auth] Token preview: ${tokenData.access_token.substring(0, 20)}...`);
  
  return tokenData.access_token;
}

/**
 * Test API call to validate token works
 * Call TRA station list endpoint as validation
 */
export async function testTDXApiCall(token: string): Promise<any> {
  const endpoint = '/v2/Rail/TRA/Station';
  const url = `${TDX_BASE_URL}${endpoint}?$top=5`;
  
  console.error(`[TDX API] Testing with: ${url}`);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'User-Agent': 'Smart-TRA-MCP-Server/1.0.0'
    }
  });

  console.error(`[TDX API] Response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TDX API] Error response: ${errorText}`);
    throw new Error(`TDX API call failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.error(`[TDX API] Success! Received ${Array.isArray(data) ? data.length : 0} stations`);
  
  return data;
}