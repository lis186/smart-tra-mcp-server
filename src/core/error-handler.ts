/**
 * Error Handler
 * Provides standardized error categorization and response formatting
 */

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network',
  API_ERROR = 'api_error',
  VALIDATION = 'validation',
  DATA = 'data',
  SYSTEM = 'system'
}

export interface CategorizedError {
  category: ErrorCategory;
  message: string;
  originalError?: Error;
  context?: Record<string, any>;
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export class ErrorHandler {
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Categorize an error based on its properties and context
   */
  categorizeError(error: unknown, context?: Record<string, any>): CategorizedError {
    // Default categorization
    let category = ErrorCategory.SYSTEM;
    let message = 'An unexpected error occurred';

    if (error instanceof Error) {
      message = error.message;

      // Authentication errors
      if (message.includes('authentication') || message.includes('401') || message.includes('invalid_client')) {
        category = ErrorCategory.AUTHENTICATION;
      }
      // Rate limiting
      else if (message.includes('rate limit') || message.includes('429')) {
        category = ErrorCategory.RATE_LIMIT;
      }
      // Network errors
      else if (message.includes('network') || message.includes('timeout') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
        category = ErrorCategory.NETWORK;
      }
      // API errors
      else if (message.includes('API') || message.includes('400') || message.includes('500') || message.includes('502') || message.includes('503')) {
        category = ErrorCategory.API_ERROR;
      }
      // Validation errors
      else if (message.includes('validation') || message.includes('invalid') || message.includes('missing') || 
               message.includes('empty') || message.includes('exceeds maximum length')) {
        category = ErrorCategory.VALIDATION;
      }
      // Data errors
      else if (message.includes('not found') || message.includes('no data') || message.includes('parse')) {
        category = ErrorCategory.DATA;
      }
    }

    return {
      category,
      message,
      originalError: error instanceof Error ? error : undefined,
      context
    };
  }

  /**
   * Create a standardized error response for MCP tools
   */
  createErrorResponse(categorizedError: CategorizedError, query: string, toolName: string): MCPToolResponse {
    let errorMessage = '';
    let suggestions: string[] = [];

    switch (categorizedError.category) {
      case ErrorCategory.AUTHENTICATION:
        errorMessage = '🔐 TDX API 認證問題';
        suggestions = [
          '• 請稍後再試，服務可能暫時無法使用',
          '• 如問題持續，請聯繫系統管理員'
        ];
        break;

      case ErrorCategory.RATE_LIMIT:
        errorMessage = '🚦 請求頻率限制';
        suggestions = [
          '• 請稍後再試 (建議等待 30 秒)',
          '• 減少查詢頻率'
        ];
        break;

      case ErrorCategory.NETWORK:
        errorMessage = '🌐 網路連線問題';
        suggestions = [
          '• 檢查網路連線狀況',
          '• 稍後再試',
          '• 嘗試簡化查詢條件'
        ];
        break;

      case ErrorCategory.API_ERROR:
        errorMessage = '⚙️ API 服務錯誤';
        suggestions = [
          '• TDX 服務暫時不穩定',
          '• 稍後再試',
          '• 如問題持續，請聯繫支援'
        ];
        break;

      case ErrorCategory.VALIDATION:
        errorMessage = '📝 查詢格式錯誤';
        suggestions = this.getValidationSuggestions(toolName);
        break;

      case ErrorCategory.DATA:
        errorMessage = '📊 資料處理錯誤';
        suggestions = this.getDataErrorSuggestions(toolName);
        break;

      default:
        errorMessage = `❌ ${this.getToolDisplayName(toolName)}失敗`;
        suggestions = this.getDefaultSuggestions(toolName);
    }

    const responseText = `${errorMessage}: ${categorizedError.message}\n\n` +
      `請嘗試:\n${suggestions.join('\n')}\n\n` +
      `💡 提示: 查詢 "${query}" 時發生問題`;

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
  }

  /**
   * Log error with structured format
   */
  logError(message: string, error?: unknown, context?: Record<string, any>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      message,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      context
    };

    // Use console.error for structured logging (not console.log which corrupts MCP protocol)
    console.error(JSON.stringify(logEntry, null, 2));
  }

  // Helper methods for tool-specific error suggestions
  private getToolDisplayName(toolName: string): string {
    switch (toolName) {
      case 'search_trains': return '列車查詢';
      case 'search_station': return '車站搜尋';  
      case 'plan_trip': return '行程規劃';
      default: return '查詢';
    }
  }

  private getValidationSuggestions(toolName: string): string[] {
    const baseSuggestions = ['• 確認輸入格式正確'];
    
    switch (toolName) {
      case 'search_trains':
        return [
          ...baseSuggestions,
          '• 確認站名正確 (使用 search_station 工具)',
          '• 例如: "台北到花蓮" 或 "明天早上台中到高雄"',
          '• 車次號碼請使用純數字 (如: 152, 1234)'
        ];
      case 'search_station':
        return [
          ...baseSuggestions,
          '• 輸入完整或部分車站名稱',
          '• 例如: "台北", "花蓮", "高雄"',
          '• 支援模糊搜尋和縮寫'
        ];
      case 'plan_trip':
        return [
          ...baseSuggestions,
          '• 指定明確的出發地和目的地',
          '• 例如: "台北到花蓮" 或 "明天早上台中到高雄"',
          '• 觀光景點會自動對應最近火車站'
        ];
      default:
        return baseSuggestions;
    }
  }

  private getDataErrorSuggestions(toolName: string): string[] {
    const baseSuggestions = ['• 嘗試使用更明確的關鍵字'];
    
    switch (toolName) {
      case 'search_trains':
        return [
          ...baseSuggestions,
          '• 確認站名拼寫正確',
          '• 檢查日期和時間格式',
          '• 使用 search_station 確認站名'
        ];
      case 'search_station':
        return [
          ...baseSuggestions,
          '• 嘗試輸入車站的不同寫法',
          '• 使用常見縮寫 (如: 北車, 台中)'
        ];
      case 'plan_trip':
        return [
          ...baseSuggestions,
          '• 如為觀光景點，系統會提供最近火車站的班次',
          '• 使用 search_station 確認站名',
          '• 檢查是否需要轉車的路線'
        ];
      default:
        return baseSuggestions;
    }
  }

  private getDefaultSuggestions(toolName: string): string[] {
    switch (toolName) {
      case 'search_trains':
        return [
          '• 確認站名正確 (使用 search_station 工具)',
          '• 檢查網路連線狀況',
          '• 稍後再試或簡化查詢條件'
        ];
      case 'search_station':
        return [
          '• 檢查網路連線狀況',
          '• 嘗試其他車站名稱',
          '• 稍後再試'
        ];
      case 'plan_trip':
        return [
          '• 確認站名正確 (使用 search_station 工具)',
          '• 指定明確的出發地和目的地',
          '• 如為觀光景點，我們會提供最近火車站的班次'
        ];
      default:
        return ['• 請稍後再試'];
    }
  }
}