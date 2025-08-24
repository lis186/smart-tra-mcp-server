/**
 * Data Manager
 * Handles station data loading, caching, and indexing for efficient searches
 */

import { AuthManager } from './auth-manager.js';
import { ErrorHandler, ErrorCategory } from './error-handler.js';
import type { StationMockData } from '../types/mcp.types.js';

export interface TRAStation {
  StationUID: string;
  StationID: string;
  StationName: {
    Zh_tw: string;
    En: string;
  };
  StationPosition: {
    PositionLon: number;
    PositionLat: number;
  };
  StationAddress?: string;
  StationPhone?: string;
  StationClass?: string;
}

export interface CachedLiveData {
  data: Array<[string, any]>;
  expiresAt: number;
}

const CACHE_CONFIG = {
  LIVE_DATA_CACHE_DURATION: 120000, // 2 minutes
  STATION_RETRY_COOLDOWN: 300000,   // 5 minutes
  CLEANUP_INTERVAL: 600000          // 10 minutes
};

export class DataManager {
  private stationData: TRAStation[] = [];
  private stationDataLoaded = false;
  private stationLoadFailed = false;
  private lastStationLoadAttempt = 0;
  
  // Optimized indices for O(1) lookups
  private stationNameIndex = new Map<string, TRAStation[]>();
  private stationEnNameIndex = new Map<string, TRAStation[]>();
  private stationPrefixIndex = new Map<string, TRAStation[]>();
  private stationIdIndex = new Map<string, TRAStation>();
  
  // Live data cache
  private liveDataCache = new Map<string, CachedLiveData>();
  private lastCacheCleanup = Date.now();

  constructor(
    private authManager: AuthManager,
    private errorHandler: ErrorHandler
  ) {}

  /**
   * Load station data from TDX API or use fallback
   */
  async loadStationData(): Promise<void> {
    if (this.stationDataLoaded) return;

    // Check if we're in retry cooldown period
    const now = Date.now();
    if (this.stationLoadFailed && (now - this.lastStationLoadAttempt) < CACHE_CONFIG.STATION_RETRY_COOLDOWN) {
      throw new Error('Station data loading failed recently. Please wait before retrying.');
    }

    this.lastStationLoadAttempt = now;

    try {
      console.error('Loading TRA station data from TDX API...');
      
      const response = await this.authManager.apiRequest('/v3/Rail/TRA/Station?%24format=JSON');
      
      if (!response.ok) {
        throw new Error(`Station API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      const stations = data.data || data.Stations || [];
      
      if (!Array.isArray(stations) || stations.length === 0) {
        throw new Error('No station data received from API');
      }

      this.stationData = stations;
      this.buildStationIndices();
      this.stationDataLoaded = true;
      this.stationLoadFailed = false;
      
      console.error(`Successfully loaded ${stations.length} TRA stations`);
    } catch (error) {
      this.stationLoadFailed = true;
      this.errorHandler.logError('Failed to load station data', error);
      
      // Try to load fallback data in production
      if (!this.isTestEnvironment()) {
        await this.loadFallbackStationData();
      } else {
        throw error;
      }
    }
  }

  /**
   * Load fallback station data from local file
   */
  private async loadFallbackStationData(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const fallbackPath = path.join(process.cwd(), 'data', 'stations-fallback.json');
      
      if (fs.existsSync(fallbackPath)) {
        const fallbackData = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
        this.stationData = fallbackData;
        this.buildStationIndices();
        this.stationDataLoaded = true;
        this.stationLoadFailed = false;
        
        console.error(`Loaded ${fallbackData.length} stations from fallback data`);
      } else {
        throw new Error('No fallback station data available');
      }
    } catch (error) {
      console.error('Failed to load fallback station data:', error);
      throw error;
    }
  }

  /**
   * Build optimized indices for fast station lookups
   */
  private buildStationIndices(): void {
    this.stationNameIndex.clear();
    this.stationEnNameIndex.clear();
    this.stationPrefixIndex.clear();
    this.stationIdIndex.clear();

    for (const station of this.stationData) {
      // ID index for exact lookups
      this.stationIdIndex.set(station.StationID, station);
      
      // Chinese name index
      const zhName = station.StationName?.Zh_tw;
      if (zhName) {
        this.addToIndex(this.stationNameIndex, zhName.toLowerCase(), station);
        
        // Add prefix matches for partial search
        for (let i = 1; i <= zhName.length; i++) {
          const prefix = zhName.substring(0, i).toLowerCase();
          this.addToIndex(this.stationPrefixIndex, prefix, station);
        }
      }
      
      // English name index
      const enName = station.StationName?.En;
      if (enName) {
        this.addToIndex(this.stationEnNameIndex, enName.toLowerCase(), station);
      }
    }

    console.error(`Built indices: ${this.stationIdIndex.size} stations indexed`);
  }

  /**
   * Helper method to add stations to index maps
   */
  private addToIndex(index: Map<string, TRAStation[]>, key: string, station: TRAStation): void {
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(station);
  }

  /**
   * Search for stations with fuzzy matching
   */
  searchStations(query: string, limit: number = 10): Array<{name: string, confidence: number, station: TRAStation}> {
    if (!this.stationDataLoaded) {
      throw new Error('Station data not loaded');
    }

    const results: Array<{name: string, confidence: number, station: TRAStation}> = [];
    const seen = new Set<string>();
    const searchQuery = query.trim().toLowerCase();

    if (!searchQuery) return results;

    // 1. Exact matches (highest confidence)
    const exactMatches = this.stationNameIndex.get(searchQuery) || [];
    for (const station of exactMatches) {
      if (!seen.has(station.StationID)) {
        results.push({
          name: station.StationName.Zh_tw,
          confidence: 1.0,
          station
        });
        seen.add(station.StationID);
      }
    }

    // 2. Prefix matches (high confidence)
    const prefixMatches = this.stationPrefixIndex.get(searchQuery) || [];
    for (const station of prefixMatches) {
      if (!seen.has(station.StationID) && results.length < limit) {
        const confidence = searchQuery.length / station.StationName.Zh_tw.length;
        results.push({
          name: station.StationName.Zh_tw,
          confidence: Math.max(0.7, confidence),
          station
        });
        seen.add(station.StationID);
      }
    }

    // 3. English name matches (medium confidence)
    const enMatches = this.stationEnNameIndex.get(searchQuery) || [];
    for (const station of enMatches) {
      if (!seen.has(station.StationID) && results.length < limit) {
        results.push({
          name: station.StationName.Zh_tw,
          confidence: 0.8,
          station
        });
        seen.add(station.StationID);
      }
    }

    // 4. Fuzzy matches (lower confidence)
    if (results.length < limit) {
      for (const station of this.stationData) {
        if (seen.has(station.StationID) || results.length >= limit) continue;
        
        const zhName = station.StationName.Zh_tw.toLowerCase();
        if (zhName.includes(searchQuery) || searchQuery.includes(zhName)) {
          const confidence = Math.max(0.5, 1 - Math.abs(zhName.length - searchQuery.length) / Math.max(zhName.length, searchQuery.length));
          results.push({
            name: station.StationName.Zh_tw,
            confidence,
            station
          });
          seen.add(station.StationID);
        }
      }
    }

    // Sort by confidence and limit results
    return results
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Get station by ID
   */
  getStationById(stationId: string): TRAStation | undefined {
    return this.stationIdIndex.get(stationId);
  }

  /**
   * Get all station data
   */
  getAllStations(): TRAStation[] {
    return [...this.stationData];
  }

  /**
   * Cache live data for a station
   */
  cacheLiveData(stationId: string, data: Array<{ TrainNo: string; [key: string]: unknown }>): void {
    const expiresAt = Date.now() + CACHE_CONFIG.LIVE_DATA_CACHE_DURATION;
    this.liveDataCache.set(stationId, {
      data: data.map(item => [item.TrainNo, item]),
      expiresAt
    });
  }

  /**
   * Get cached live data for a station
   */
  getCachedLiveData(stationId: string): Map<string, any> | null {
    const cached = this.liveDataCache.get(stationId);
    
    if (!cached) return null;
    
    if (cached.expiresAt <= Date.now()) {
      this.liveDataCache.delete(stationId);
      return null;
    }
    
    return new Map(cached.data);
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    
    if (now - this.lastCacheCleanup < CACHE_CONFIG.CLEANUP_INTERVAL) {
      return;
    }

    let cleanedCount = 0;
    for (const [key, value] of this.liveDataCache.entries()) {
      if (value.expiresAt <= now) {
        this.liveDataCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.error(`Cleaned up ${cleanedCount} expired cache entries`);
    }

    this.lastCacheCleanup = now;
  }

  /**
   * Check if station data is loaded
   */
  isStationDataLoaded(): boolean {
    return this.stationDataLoaded;
  }

  /**
   * Force reload station data (useful for testing)
   */
  async reloadStationData(): Promise<void> {
    this.stationDataLoaded = false;
    this.stationLoadFailed = false;
    this.lastStationLoadAttempt = 0;
    await this.loadStationData();
  }

  /**
   * Load mock data for testing
   */
  loadMockData(mockData: StationMockData[]): void {
    this.stationData = mockData as TRAStation[];
    this.buildStationIndices();
    this.stationDataLoaded = true;
    this.stationLoadFailed = false;
  }

  private isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test';
  }
}