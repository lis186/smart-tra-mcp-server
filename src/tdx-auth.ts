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

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 10000;

// Custom error types
export class TDXAuthenticationError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'TDXAuthenticationError';
  }
}

export class TDXApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'TDXApiError';
  }
}

/**
 * Get TDX access token using OAuth 2.0 Client Credentials flow
 * No caching, no retry, no complexity - just prove it works
 */
export async function getTDXToken(clientId: string, clientSecret: string): Promise<string> {
  console.error(`[TDX Auth] Requesting token from authentication endpoint`);
  
  // Create request body
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  console.error(`[TDX Auth] Client ID: ${clientId.substring(0, 6)}***`);
  
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
  try {
    const response = await fetch(TDX_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      signal: controller.signal
    });

    console.error(`[TDX Auth] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TDX Auth] Authentication failed with status ${response.status}`);
      throw new TDXAuthenticationError(
        `TDX authentication failed: ${response.status} - ${errorText}`,
        response.status
      );
    }

    const tokenData = await response.json() as TokenResponse;
    console.error(`[TDX Auth] Token acquired successfully, expires in ${tokenData.expires_in} seconds`);
    
    // Extract token before clearing response data
    const accessToken = tokenData.access_token;
    
    // Clear sensitive data from memory
    tokenData.access_token = '';
    
    return accessToken;
    
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TDXAuthenticationError('TDX authentication request timed out');
    }
    throw error;
  } finally {
    // Clear timeout and ensure cleanup
    clearTimeout(timeoutId);
    
    // Clear URLSearchParams body from memory
    try {
      body.delete('client_secret');
      body.delete('client_id');
    } catch {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Test API call to validate token works
 * Call TRA station list endpoint as validation
 */
export async function testTDXApiCall(token: string): Promise<any> {
  const endpoint = '/v2/Rail/TRA/Station';
  const url = `${TDX_BASE_URL}${endpoint}?$top=5`;
  
  console.error(`[TDX API] Testing API connectivity with station endpoint`);
  
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'Smart-TRA-MCP-Server/1.0.0'
      },
      signal: controller.signal
    });

    console.error(`[TDX API] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TDX API] API call failed with status ${response.status}`);
      
      if (response.status === 401) {
        throw new TDXApiError('Token is invalid or expired', response.status);
      } else if (response.status === 429) {
        throw new TDXApiError('Rate limit exceeded - please retry later', response.status);
      } else {
        throw new TDXApiError(
          `TDX API call failed: ${response.status} - ${errorText}`,
          response.status
        );
      }
    }

    const data = await response.json();
    console.error(`[TDX API] Success! Received ${Array.isArray(data) ? data.length : 0} stations`);
    
    return data;
    
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TDXApiError('TDX API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}