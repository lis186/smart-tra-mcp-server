/**
 * Validation Utilities
 * Input validation, sanitization, and constraint checking
 */

export interface ValidationConfig {
  MAX_QUERY_LENGTH: number;
  MAX_CONTEXT_LENGTH: number;
  RATE_LIMIT_WINDOW: number;
  MAX_REQUESTS_PER_WINDOW: number;
}

export class ValidationUtils {
  private static config: ValidationConfig = {
    MAX_QUERY_LENGTH: 500,
    MAX_CONTEXT_LENGTH: 200,
    RATE_LIMIT_WINDOW: 60000,
    MAX_REQUESTS_PER_WINDOW: 30
  };

  private static requestCount = new Map<string, number>();
  private static lastRequestTime = new Map<string, number>();
  private static lastRateLimitCleanup = Date.now();

  /**
   * Update validation configuration
   */
  static updateConfig(newConfig: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Validate and sanitize API input
   */
  static validateApiInput(
    value: unknown, 
    fieldName: string, 
    maxLength: number
  ): string {
    // Type validation
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    const stringValue = value as string;

    // Empty check
    if (!stringValue.trim()) {
      throw new Error(`${fieldName} cannot be empty`);
    }

    // Length validation
    if (stringValue.length > maxLength) {
      const errorType = fieldName === 'query' ? 'API error' : 'System error';
      throw new Error(`${errorType}: ${fieldName} exceeds maximum length of ${maxLength} characters`);
    }

    return stringValue.trim();
  }

  /**
   * Sanitize user input by removing potentially problematic characters
   */
  static sanitizeInput(input: string): string {
    return input
      .trim()
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, this.config.MAX_QUERY_LENGTH); // Ensure length limit
  }

  /**
   * Validate query and context parameters for MCP tools
   */
  static validateToolInputs(query: unknown, context?: unknown): {
    validatedQuery: string;
    validatedContext?: string;
  } {
    const validatedQuery = this.validateApiInput(
      query, 
      'query', 
      this.config.MAX_QUERY_LENGTH
    );

    const validatedContext = context ? 
      this.validateApiInput(context, 'context', this.config.MAX_CONTEXT_LENGTH) : 
      undefined;

    return { validatedQuery, validatedContext };
  }

  /**
   * Check rate limiting for client requests
   */
  static checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    
    // Clean up old entries periodically
    if (now - this.lastRateLimitCleanup > this.config.RATE_LIMIT_WINDOW) {
      this.cleanupRateLimit();
      this.lastRateLimitCleanup = now;
    }

    const lastRequest = this.lastRequestTime.get(clientId) || 0;
    const requestCount = this.requestCount.get(clientId) || 0;

    // Reset counter if window has passed
    if (now - lastRequest > this.config.RATE_LIMIT_WINDOW) {
      this.requestCount.set(clientId, 1);
      this.lastRequestTime.set(clientId, now);
      return true;
    }

    // Check if under rate limit
    if (requestCount < this.config.MAX_REQUESTS_PER_WINDOW) {
      this.requestCount.set(clientId, requestCount + 1);
      this.lastRequestTime.set(clientId, now);
      return true;
    }

    return false; // Rate limited
  }

  /**
   * Clean up expired rate limit entries
   */
  private static cleanupRateLimit(): void {
    const now = Date.now();
    const expiredClients: string[] = [];

    for (const [clientId, lastRequestTime] of this.lastRequestTime.entries()) {
      if (now - lastRequestTime > this.config.RATE_LIMIT_WINDOW) {
        expiredClients.push(clientId);
      }
    }

    for (const clientId of expiredClients) {
      this.requestCount.delete(clientId);
      this.lastRequestTime.delete(clientId);
    }
  }

  /**
   * Validate train number format
   */
  static validateTrainNumber(trainNumber: string): boolean {
    // Train numbers are typically 1-4 digits, sometimes with letters
    const trainNumberRegex = /^[0-9]{1,4}[A-Za-z]?$/;
    return trainNumberRegex.test(trainNumber.trim());
  }

  /**
   * Validate station name format
   */
  static validateStationName(stationName: string): boolean {
    // Station names can contain Chinese characters, English letters, numbers, and some symbols
    const stationNameRegex = /^[\u4e00-\u9fff\u3400-\u4dbf\w\s\-\(\)（）]+$/;
    return stationNameRegex.test(stationName.trim()) && stationName.trim().length >= 1;
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  static validateDateFormat(dateStr: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) return false;
    
    const date = new Date(dateStr);
    const isValidDate = !isNaN(date.getTime()) && date.toISOString().startsWith(dateStr);
    
    // Check if date is not too far in the past or future
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const oneYearLater = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    
    return isValidDate && date >= oneYearAgo && date <= oneYearLater;
  }

  /**
   * Validate time format (HH:mm)
   */
  static validateTimeFormat(timeStr: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeStr);
  }

  /**
   * Check if string contains only allowed characters for queries
   */
  static isCleanQuery(query: string): boolean {
    // Allow Chinese characters, letters, numbers, basic punctuation, and common symbols
    const allowedRegex = /^[\u4e00-\u9fff\u3400-\u4dbf\w\s\-\.\,\!\?\(\)（）「」『』：。，！？→←↑↓\+\=]+$/;
    return allowedRegex.test(query);
  }

  /**
   * Extract and validate numeric values from strings
   */
  static extractNumbers(input: string): number[] {
    const numberMatches = input.match(/\d+/g);
    return numberMatches ? numberMatches.map(Number) : [];
  }

  /**
   * Check if input contains potential security risks
   */
  static containsSecurityRisks(input: string): boolean {
    const riskyPatterns = [
      /<script/i,           // Script tags
      /javascript:/i,       // JavaScript URLs
      /on\w+\s*=/i,        // Event handlers
      /data:.*base64/i,     // Data URLs with base64
      /vbscript:/i,         // VBScript URLs
      /file:\/\//i,         // File URLs
      /\\x[0-9a-f]{2}/i,    // Hex encoded characters
      /\u0000/,             // Null bytes
    ];

    return riskyPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Normalize Unicode characters to prevent bypass attempts
   */
  static normalizeUnicode(input: string): string {
    return input.normalize('NFKC');
  }

  /**
   * Validate context string for reasonable content
   */
  static validateContext(context: string): boolean {
    // Context should not be excessively repetitive or contain suspicious patterns
    const words = context.split(/\s+/);
    const uniqueWords = new Set(words);
    
    // If more than 80% of words are repetitive, it might be spam/attack
    const repetitionRatio = uniqueWords.size / words.length;
    
    return repetitionRatio > 0.2 && !this.containsSecurityRisks(context);
  }

  /**
   * Get validation error message with suggestions
   */
  static getValidationError(fieldName: string, error: string): string {
    const suggestions: Record<string, string[]> = {
      query: [
        '• 確保查詢長度不超過 500 字元',
        '• 使用繁體中文或英文字母',
        '• 避免特殊字元和控制字元'
      ],
      context: [
        '• 確保內容長度不超過 200 字元',
        '• 提供相關的背景資訊',
        '• 避免重複內容'
      ],
      trainNumber: [
        '• 車次號碼應為 1-4 位數字',
        '• 可選擇性包含一個字母後綴',
        '• 例如: 152, 1234, 152A'
      ],
      stationName: [
        '• 使用完整或部分車站名稱',
        '• 支援中文和英文站名',
        '• 例如: 台北, 花蓮, Taipei'
      ]
    };

    const suggestionList = suggestions[fieldName] || ['• 請檢查輸入格式'];
    return `${error}\n\n建議:\n${suggestionList.join('\n')}`;
  }

  /**
   * Batch validate multiple inputs
   */
  static validateBatch(inputs: Array<{value: unknown, fieldName: string, maxLength: number}>): {
    valid: boolean;
    errors: string[];
    validatedInputs: string[];
  } {
    const errors: string[] = [];
    const validatedInputs: string[] = [];

    for (const input of inputs) {
      try {
        const validated = this.validateApiInput(input.value, input.fieldName, input.maxLength);
        validatedInputs.push(validated);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        validatedInputs.push(''); // placeholder for failed validation
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      validatedInputs
    };
  }
}