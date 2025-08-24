/**
 * MCP (Model Context Protocol) Type Definitions
 * Provides proper typing for MCP SDK interactions
 */

/**
 * MCP Tool Response interface
 * Standard response format for all MCP tool handlers
 */
export interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  [key: string]: unknown;
}

/**
 * MCP Tool Request interface
 * Matches the expected structure from CallToolRequestSchema
 */
export interface MCPToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

/**
 * Tool handler function type
 */
export type ToolHandler = (query: string, context?: string) => Promise<MCPToolResponse>;

/**
 * Test method signatures for external testing
 */
export interface TestMethods {
  loadStationDataForTest(mockData?: StationMockData[]): Promise<void>;
  handleSearchStationForTest(query: string, context?: string): Promise<MCPToolResponse>;
  handleSearchTrainsForTest(query: string, context?: string): Promise<MCPToolResponse>;
  handlePlanTripForTest(query: string, context?: string): Promise<MCPToolResponse>;
}

/**
 * Station mock data for testing
 */
export interface StationMockData {
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  StationAddress?: string;
  StationPosition?: {
    PositionLat: number;
    PositionLon: number;
  };
}