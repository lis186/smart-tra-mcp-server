# 僅車次號碼查詢功能設計

## 🎯 需求分析

### 用戶期望
當用戶輸入 "152" 時，系統應該回覆：
1. **完整時刻表** - 該車次的所有停靠站和時間
2. **即時狀態** - 目前位置、準點/誤點情況
3. **基本資訊** - 車種、起迄站、行程時間
4. **月票資訊** - 是否適用月票

### 查詢範例
```
用戶輸入: "152"
用戶輸入: "1234"
用戶輸入: "自強152"
用戶輸入: "152號列車"
```

## 🔧 技術實現方案

### 1. 查詢解析器增強

在 `QueryParser` 中新增車次號碼識別：

```typescript
// 新增車次號碼解析介面
export interface TrainNumberQuery {
  trainNumber: string;
  trainType?: string;
  isTrainNumberOnly: boolean;
}

// 在 ParsedQuery 中新增
export interface ParsedQuery {
  // ... 現有欄位
  trainNumber?: string;
  isTrainNumberOnly?: boolean;
}

// 新增車次號碼識別模式
private readonly TRAIN_NUMBER_PATTERNS = {
  PURE_NUMBER: /^(\d{3,4})$/,                    // 純數字: "152", "1234"
  WITH_TYPE: /(自強|莒光|區間|普悠瑪|太魯閣)號?\s*(\d{3,4})/,  // 含車種: "自強152"
  WITH_SUFFIX: /(\d{3,4})號?列車/,               // 含後綴: "152號列車"
  STATUS_QUERY: /(\d{3,4})號?(列車)?(準點|誤點|位置|狀況)/  // 狀態查詢
};
```

### 2. 新增專用工具

建議新增 `search_train_by_number` 工具：

```typescript
{
  name: 'search_train_by_number',
  description: '根據車次號碼查詢完整列車資訊',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '車次號碼查詢 (如: "152", "自強152", "1234號列車")'
      },
      context: {
        type: 'string',
        description: '額外查詢選項 (如: "即時狀態", "完整時刻表")'
      }
    },
    required: ['query']
  }
}
```

### 3. TDX API 整合策略

使用以下 TDX API 組合：

```typescript
// 主要資料來源 (按優先順序)
const APIs = [
  'get_TRA_SpecificTrainTimetable_TrainNo_by_TrainNo',    // 特定車次時刻表
  'get_TRA_DailyTrainTimetable_Today_TrainNo_by_TrainNo', // 當天車次時刻表  
  'get_TRA_GeneralTrainTimetable_TrainNo_by_TrainNo',     // 定期時刻表
  'get_TRA_TrainLiveBoard_TrainNo_by_TrainNo'             // 即時位置狀態
];

// 平行查詢策略
async function getTrainInfo(trainNumber: string) {
  const [timetable, liveStatus] = await Promise.all([
    getTrainTimetable(trainNumber),
    getTrainLiveStatus(trainNumber)
  ]);
  
  return mergeTrainData(timetable, liveStatus);
}
```

## 📋 理想回覆格式設計

### 格式 A: 完整資訊型 (推薦)

```
🚄 **自強號 152 車次資訊**

**基本資料**
• 車種: 自強號 (推拉式自強號且無自行車車廂)
• 路線: 臺北 → 高雄 (南下)
• 總行程: 4小時57分 | 經停 8 站
• 月票適用: 🎫 是

**今日時刻表 (2025/08/18)**
🚩 臺北     18:59 發車 ✅ 準點
   板橋     19:08 → 19:09 (1分)
   桃園     19:32 → 19:34 (2分)
   新竹     20:15 → 20:17 (2分)
   臺中     21:28 → 21:31 (3分)
   嘉義     22:31 → 22:33 (2分)
   臺南     22:58 → 23:00 (2分)
🏁 高雄     23:56 到達

**即時狀態**
• 目前狀態: ✅ 準點行駛
• 預估位置: 已發車，行駛中
• 下一站: 板橋 (預計 19:08)

**票價資訊**
• 全票: $843 | 兒童票: $422 | 敬老愛心票: $422

💡 提示: 此車次月票可搭，無需另外購票
```

### 格式 B: 簡潔型

```
🚄 **自強 152** | 臺北→高雄 | 4h57m | 🎫 月票可搭

**今日班次**: 18:59 臺北發車 → 23:56 高雄到達
**即時狀態**: ✅ 準點 | 目前位置: 行駛中
**經停站**: 板橋(19:08) → 桃園(19:32) → 新竹(20:15) → 臺中(21:28) → 嘉義(22:31) → 臺南(22:58)

💰 全票 $843 | 🎫 月票適用，無需購票
```

### 格式 C: 狀態查詢型

```
🚄 **自強 152 即時狀態**

✅ **準點行駛** | 目前位置: 臺北-板橋間
⏰ 下一站: 板橋 (預計 19:08 到達)
🗓️ 今日班次: 18:59 臺北 → 23:56 高雄

📍 **行程進度**: ████▒▒▒▒▒ 15% (1/8站)
⏱️ **預估剩餘**: 4小時47分

🎫 月票可搭 | 💰 全票 $843
```

## 🎨 使用者體驗設計

### 情境 1: 純數字查詢
```
用戶: "152"
系統: 🔍 找到車次 152 (自強號)，顯示完整資訊...
```

### 情境 2: 狀態查詢
```
用戶: "152準點嗎"
系統: 🚄 自強 152: ✅ 準點行駛，目前位置...
```

### 情境 3: 時刻表查詢
```
用戶: "152時刻表"
系統: 🚄 自強 152 完整時刻表: 臺北 18:59 → 高雄 23:56...
```

### 情境 4: 找不到車次
```
用戶: "9999"
系統: ❌ 找不到車次 9999
      
      可能原因:
      • 車次號碼不存在
      • 今日未營運 (週末或特殊日期)
      • 輸入錯誤
      
      💡 建議:
      • 確認車次號碼正確
      • 嘗試常見車次: 152, 1121, 1234
      • 使用路線查詢: "台北到高雄"
```

## 🔄 實作步驟

### Phase 1: 基礎功能 (1週)
1. ✅ 增強 QueryParser 識別純車次號碼
2. ✅ 整合 SpecificTrainTimetable API
3. ✅ 實作基本回覆格式

### Phase 2: 即時資訊 (1週)
4. ✅ 整合 TrainLiveBoard API
5. ✅ 合併時刻表與即時資訊
6. ✅ 優化回覆格式

### Phase 3: 用戶體驗 (1週)
7. ✅ 處理邊緣情況 (找不到車次)
8. ✅ 加入智慧建議
9. ✅ 完善錯誤訊息

## 📊 預期效果

實作完成後:
- ✅ 支援純車次號碼查詢 (0% → 100%)
- ✅ 車次識別率大幅提升 (18.8% → 85%+)
- ✅ 即時狀態資訊完整 (限制 → 完整支援)
- ✅ 用戶體驗顯著改善

## 🧪 測試案例

```javascript
const testCases = [
  { input: "152", expected: "自強152完整資訊" },
  { input: "1234", expected: "找到對應車次或建議" },
  { input: "自強152", expected: "識別車種和號碼" },
  { input: "152準點嗎", expected: "即時狀態資訊" },
  { input: "152時刻表", expected: "完整停靠站資訊" },
  { input: "9999", expected: "找不到車次，提供建議" }
];
```

這個設計能讓用戶僅輸入車次號碼就獲得完整、實用的列車資訊，大幅提升查詢便利性。
