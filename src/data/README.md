# TPASS Regional Monthly Pass Data

This directory contains the regional data files for Taiwan's TPASS (Taiwan Pass) monthly pass system.

## Overview

TPASS is Taiwan's integrated monthly pass system that allows unlimited travel on eligible trains within defined life circles (生活圈) for a fixed monthly fee. The system covers 9 regional zones across Taiwan, each with different pricing and station coverage.

## Data Files

### `tpass-regions.json`

Main data file containing all TPASS regional information. This file defines:

1. **Regional zones**: 9 life circles covering different parts of Taiwan
2. **Station coverage**: TRA station IDs included in each zone
3. **Pricing**: Monthly pass price for each zone
4. **Official documentation**: Links to TDX/TRA official pages

#### Data Structure

```json
{
  "regionKey": {
    "name": "Display name (Chinese)",
    "fullName": "Official full name with geographic description", 
    "price": 999,
    "url": "https://www.railway.gov.tw/...",
    "stations": ["stationId1", "stationId2", ...]
  }
}
```

#### Station ID Mapping

Station IDs correspond to TRA's official station numbering system:

- **0xxx**: Keelung region (基隆線)
- **1xxx**: Main line Northern Taiwan (西部幹線北段)
- **2xxx**: Branch lines (Liujia, etc.) (內灣線、六家線等)
- **3xxx**: Main line Central Taiwan (西部幹線中段) 
- **4xxx**: Main line Southern Taiwan (西部幹線南段)
- **5xxx**: Southern region (高雄都會區)
- **6xxx**: Pingtung region (屏東線)
- **7xxx**: Eastern region North (宜蘭線、北迴線)
- **8xxx**: Eastern region South (花東線南段)

## Regional Zones

### 1. 基北北桃生活圈 (Keelung-Taipei-New Taipei-Taoyuan Life Circle)
- **Price**: NT$ 1,200
- **Coverage**: Keelung, Taipei, New Taipei, Taoyuan
- **Major stations**: 基隆, 台北, 板橋, 桃園, 松山
- **Note**: Largest zone covering the Greater Taipei metropolitan area

### 2. 桃竹竹苗生活圈 (Taoyuan-Hsinchu Life Circle) 
- **Price**: NT$ 999
- **Coverage**: Southern Taoyuan, Hsinchu City/County, Northern Miaoli
- **Major stations**: 中壢, 新竹, 竹南

### 3. 中彰投苗生活圈 (Taichung-Changhua-Nantou-Miaoli Life Circle)
- **Price**: NT$ 999
- **Coverage**: Taichung, Changhua, Nantou, Southern Miaoli
- **Major stations**: 台中, 彰化, 員林
- **Note**: Includes mountain line connections

### 4. 雲林生活圈 (Yunlin Life Circle)
- **Price**: NT$ 799
- **Coverage**: Yunlin County
- **Major stations**: 斗六, 斗南

### 5. 嘉義生活圈 (Chiayi Life Circle)
- **Price**: NT$ 799  
- **Coverage**: Chiayi City/County
- **Major stations**: 嘉義, 民雄

### 6. 南高屏生活圈 (Tainan-Kaohsiung-Pingtung Life Circle)
- **Price**: NT$ 1,200
- **Coverage**: Tainan, Kaohsiung, Pingtung
- **Major stations**: 台南, 高雄, 屏東
- **Note**: Second largest zone covering Southern Taiwan metropolitan area

### 7. 北宜生活圈 (North-Yilan Life Circle)
- **Price**: NT$ 999
- **Coverage**: Yilan County
- **Major stations**: 宜蘭, 羅東, 蘇澳

### 8. 花蓮生活圈 (Hualien Life Circle)
- **Price**: NT$ 799
- **Coverage**: Hualien County
- **Major stations**: 花蓮, 光復, 瑞穗

### 9. 臺東生活圈 (Taitung Life Circle)  
- **Price**: NT$ 799
- **Coverage**: Taitung County
- **Major stations**: 台東, 池上, 關山

## Data Sources and Validation

### Official Sources
- **TRA TPASS Official Page**: https://www.railway.gov.tw/tra-tip-web/tip
- **TDX Transport Data**: https://tdx.transportdata.tw/
- **Individual zone pages**: Each zone has official documentation linked in the `url` field

### Validation Process
1. **Station coverage**: Cross-referenced with TRA official station lists
2. **Pricing**: Verified against current TRA tariff schedules
3. **Geographic boundaries**: Validated with official TPASS life circle definitions
4. **Missing stations**: Regular audits to detect stations not included in any zone

### Last Updated
- **Data version**: January 2025
- **Source validation**: December 2024
- **Next review**: Quarterly (aligned with TRA schedule changes)

## Data Maintenance

### Update Procedures
1. **Schedule changes**: Review when TRA publishes new timetables
2. **New stations**: Add to appropriate zones when TRA opens new stations
3. **Price changes**: Update when TRA announces tariff modifications
4. **Zone boundary changes**: Monitor TRA announcements for life circle adjustments

### Quality Assurance
- All changes must be verified against official TRA sources
- Station IDs must match TDX API station identifiers
- Pricing must reflect current official rates
- URLs must point to active TRA documentation

## Usage in Code

### Loading and Caching
```typescript
// Data is loaded once at startup for optimal performance
private static loadTPASSData(): void {
  const tpassDataPath = path.join(process.cwd(), 'src', 'data', 'tpass-regions.json');
  TrainService.tpassData = JSON.parse(fs.readFileSync(tpassDataPath, 'utf8'));
  
  // Build O(1) lookup map: station ID → regions
  TrainService.stationToRegionsMap = new Map<string, string[]>();
}
```

### Regional Eligibility Logic
```typescript
// Check if both stations are in the same region (eligible)
// Cross-region travel requires separate tickets (ineligible)
getTPASSRegion(originStationId: string, destinationStationId: string): TPASSEligibility
```

## Business Rules

### Monthly Pass Eligibility
1. **Same zone travel**: ✅ Eligible for monthly pass
2. **Cross-zone travel**: ❌ Not eligible (requires regular tickets)  
3. **Train type restrictions**: Some express trains not covered by monthly pass
4. **Station not in network**: ❌ Not eligible

### Performance Optimization
- **Static caching**: Data loaded once at server startup
- **O(1) lookups**: Station-to-region mapping via hash tables
- **Memory efficient**: Pre-computed indices eliminate runtime processing

## Error Handling

### Common Issues
1. **Missing station**: Station ID not found in any zone
2. **Invalid station ID**: Non-existent or malformed station identifier
3. **Data loading failure**: File system or JSON parsing errors
4. **Cross-zone confusion**: Users expect passes to work across zones

### User Messages
- **Eligible**: "TPASS適用: [zone name] ✅"
- **Cross-zone**: "TPASS: 需跨區購票 ❌" 
- **Not covered**: "TPASS: 不適用此路線"
- **Data error**: "TPASS: 資料載入錯誤"

## Integration with MCP Tools

This data integrates with all three MCP tools:

1. **search_trains**: Shows monthly pass eligibility (💳/💰 icons)
2. **search_station**: Provides zone information when relevant  
3. **plan_trip**: Considers pass eligibility in route recommendations

The data supports the core MCP design philosophy of user-intent focused tools that provide actionable business value.