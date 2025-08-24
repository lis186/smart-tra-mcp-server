/**
 * Authentication Manager
 * Handles TDX API authentication, token management, and HTTP client functionality
 */

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY: 30000,
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504]
};

export class AuthManager {
  private tokenCache: CachedToken | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private baseUrl: string = 'https://tdx.transportdata.tw/api/basic'
  ) {}

  /**
   * Get a valid access token, using cache or refreshing as needed
   */
  async getAccessToken(): Promise<string> {
    // Check cache first
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    // Prevent concurrent token refresh requests
    if (!this.tokenRefreshPromise) {
      this.tokenRefreshPromise = this.refreshToken();
    }

    try {
      const token = await this.tokenRefreshPromise;
      return token;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  /**
   * Refresh the access token from TDX API
   */
  private async refreshToken(): Promise<string> {
    const authUrl = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
    
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);

    try {
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TDX authentication failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const tokenData = await response.json() as TokenResponse;
      const expiresAt = Date.now() + (tokenData.expires_in * 1000) - 60000; // 1 minute buffer

      this.tokenCache = {
        token: tokenData.access_token,
        expiresAt
      };

      return tokenData.access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Make an authenticated API request with retry logic
   */
  async apiRequest(
    endpoint: string, 
    options: RequestInit = {}, 
    retryCount = 0
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;
    
    const requestOptions: RequestInit = {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, requestOptions);
      
      // Check if we should retry based on status code
      if (RETRY_CONFIG.RETRYABLE_STATUS_CODES.includes(response.status) && 
          retryCount < RETRY_CONFIG.MAX_RETRIES) {
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount),
          RETRY_CONFIG.MAX_DELAY
        );
        
        console.error(
          `API request failed with status ${response.status}, retrying in ${delay}ms... ` +
          `(attempt ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES})`
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.apiRequest(endpoint, options, retryCount + 1);
      }
      
      return response;
    } catch (error) {
      // Network errors or timeouts
      if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount),
          RETRY_CONFIG.MAX_DELAY
        );
        
        console.error(
          `API request failed with error: ${error}, retrying in ${delay}ms... ` +
          `(attempt ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES})`
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.apiRequest(endpoint, options, retryCount + 1);
      }
      
      throw error; // Re-throw after all retries exhausted
    }
  }

  /**
   * Clear cached token (useful for testing or error recovery)
   */
  clearTokenCache(): void {
    this.tokenCache = null;
    this.tokenRefreshPromise = null;
  }

  /**
   * Check if we have a valid cached token
   */
  hasValidToken(): boolean {
    return this.tokenCache !== null && this.tokenCache.expiresAt > Date.now();
  }
}