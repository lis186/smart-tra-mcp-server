/**
 * Smart Train Search - 智慧車次搜尋功能
 * 支援部分輸入的智慧補全和即時預覽
 */

export interface TrainSuggestion {
  trainNumber: string;
  trainType: string;
  trainTypeChinese: string;
  route: {
    origin: string;
    destination: string;
  };
  schedule: {
    departureTime: string;
    arrivalTime?: string;
    isToday: boolean;
    isUpcoming: boolean; // 是否即將發車 (2小時內)
  };
  popularity: 'hot' | 'normal' | 'rare';
  tags: string[]; // ['夜車', '熱門', '直達', '月票可搭']
  confidence: number; // 匹配信心度 0-1
}

export interface SmartSearchResult {
  query: string;
  totalMatches: number;
  suggestions: TrainSuggestion[];
  searchStrategy: 'exact' | 'partial' | 'fuzzy';
  timeContext: string;
  nextSteps: string[];
}

export class SmartTrainSearchEngine {
  // 熱門車次資料庫 (基於實際使用統計)
  private readonly POPULAR_TRAINS = new Map([
    // 西部幹線熱門車次
    ['152', { popularity: 'hot', route: '台北→高雄', tags: ['熱門', '月票可搭'] }],
    ['154', { popularity: 'hot', route: '台北→高雄', tags: ['熱門', '月票可搭'] }],
    ['1121', { popularity: 'hot', route: '台北→桃園', tags: ['熱門', '月票可搭', '通勤'] }],
    ['1234', { popularity: 'normal', route: '台北→新竹', tags: ['月票可搭', '通勤'] }],
    
    // 東部幹線
    ['2', { popularity: 'hot', route: '樹林→臺東', tags: ['普悠瑪', '東部最快'] }],
    ['408', { popularity: 'hot', route: '台北→花蓮', tags: ['太魯閣', '觀光熱門'] }],
    
    // 夜車
    ['22', { popularity: 'normal', route: '台北→臺東', tags: ['夜車', '月票可搭'] }],
    ['562', { popularity: 'normal', route: '台北→高雄', tags: ['夜車', '較便宜'] }],
  ]);

  // 車種對應表
  private readonly TRAIN_TYPE_MAP = new Map([
    ['1', '太魯閣號'],
    ['2', '普悠瑪號'],
    ['1', '太魯閣號'],
    ['4', '莒光號'],
    ['5', '復興號'],
    ['6', '區間車'],
    ['10', '區間快車'],
    ['11', 'EMU3000'],
  ]);

  // 時間感知的車次推薦權重
  private readonly TIME_WEIGHTS = {
    MORNING: ['通勤', '早班'],
    AFTERNOON: ['熱門', '商務'],
    EVENING: ['返鄉', '熱門'],
    NIGHT: ['夜車', '長途'],
    WEEKEND: ['觀光', '返鄉']
  };

  /**
   * 智慧搜尋車次
   */
  public searchTrains(query: string): SmartSearchResult {
    const normalizedQuery = query.trim();
    const currentTime = new Date();
    const timeContext = this.getTimeContext(currentTime);
    
    // 1. 嘗試精確匹配
    const exactMatches = this.findExactMatches(normalizedQuery);
    if (exactMatches.length > 0) {
      return {
        query: normalizedQuery,
        totalMatches: exactMatches.length,
        suggestions: exactMatches,
        searchStrategy: 'exact',
        timeContext,
        nextSteps: ['輸入完整車次號碼獲得詳細資訊']
      };
    }

    // 2. 部分匹配搜尋
    const partialMatches = this.findPartialMatches(normalizedQuery);
    if (partialMatches.length > 0) {
      return {
        query: normalizedQuery,
        totalMatches: partialMatches.length,
        suggestions: this.rankSuggestions(partialMatches, timeContext),
        searchStrategy: 'partial',
        timeContext,
        nextSteps: [
          '輸入更多數字可縮小搜尋範圍',
          '或提供起迄站資訊: "台北到高雄"'
        ]
      };
    }

    // 3. 模糊匹配 (相似號碼)
    const fuzzyMatches = this.findFuzzyMatches(normalizedQuery);
    return {
      query: normalizedQuery,
      totalMatches: fuzzyMatches.length,
      suggestions: this.rankSuggestions(fuzzyMatches, timeContext),
      searchStrategy: 'fuzzy',
      timeContext,
      nextSteps: [
        '嘗試相似的車次號碼',
        '或使用路線查詢: "台北到高雄"'
      ]
    };
  }

  /**
   * 尋找精確匹配的車次
   */
  private findExactMatches(query: string): TrainSuggestion[] {
    const suggestions: TrainSuggestion[] = [];
    
    // 檢查是否為完整車次號碼
    if (this.POPULAR_TRAINS.has(query)) {
      const trainInfo = this.POPULAR_TRAINS.get(query)!;
      suggestions.push(this.createTrainSuggestion(query, trainInfo, 1.0));
    }

    return suggestions;
  }

  /**
   * 尋找部分匹配的車次
   */
  private findPartialMatches(query: string): TrainSuggestion[] {
    const suggestions: TrainSuggestion[] = [];
    
    for (const [trainNumber, trainInfo] of this.POPULAR_TRAINS) {
      if (trainNumber.includes(query)) {
        const confidence = this.calculateMatchConfidence(query, trainNumber);
        suggestions.push(this.createTrainSuggestion(trainNumber, trainInfo, confidence));
      }
    }

    return suggestions;
  }

  /**
   * 尋找模糊匹配的車次
   */
  private findFuzzyMatches(query: string): TrainSuggestion[] {
    const suggestions: TrainSuggestion[] = [];
    
    // 基於編輯距離和數字相似性
    for (const [trainNumber, trainInfo] of this.POPULAR_TRAINS) {
      const similarity = this.calculateSimilarity(query, trainNumber);
      if (similarity > 0.3) { // 相似度閾值
        suggestions.push(this.createTrainSuggestion(trainNumber, trainInfo, similarity));
      }
    }

    // 如果模糊匹配結果太少，加入一些熱門車次
    if (suggestions.length < 3) {
      const popularTrains = Array.from(this.POPULAR_TRAINS.entries())
        .filter(([_, info]) => info.popularity === 'hot')
        .slice(0, 3);
      
      for (const [trainNumber, trainInfo] of popularTrains) {
        if (!suggestions.find(s => s.trainNumber === trainNumber)) {
          suggestions.push(this.createTrainSuggestion(trainNumber, trainInfo, 0.2));
        }
      }
    }

    return suggestions;
  }

  /**
   * 建立車次建議物件
   */
  private createTrainSuggestion(
    trainNumber: string, 
    trainInfo: any, 
    confidence: number
  ): TrainSuggestion {
    const currentTime = new Date();
    const isUpcoming = this.isUpcomingTrain(trainNumber, currentTime);
    
    return {
      trainNumber,
      trainType: this.getTrainTypeCode(trainNumber),
      trainTypeChinese: this.getTrainTypeChinese(trainNumber),
      route: this.parseRoute(trainInfo.route),
      schedule: {
        departureTime: this.getDepartureTime(trainNumber),
        isToday: true,
        isUpcoming
      },
      popularity: trainInfo.popularity,
      tags: trainInfo.tags || [],
      confidence
    };
  }

  /**
   * 根據時間上下文排序建議
   */
  private rankSuggestions(suggestions: TrainSuggestion[], timeContext: string): TrainSuggestion[] {
    return suggestions
      .sort((a, b) => {
        // 1. 信心度權重
        let scoreA = a.confidence * 0.4;
        let scoreB = b.confidence * 0.4;
        
        // 2. 熱門度權重
        const popularityWeight = { hot: 0.3, normal: 0.2, rare: 0.1 };
        scoreA += popularityWeight[a.popularity];
        scoreB += popularityWeight[b.popularity];
        
        // 3. 時間相關性權重
        const timeRelevance = this.getTimeRelevance(a, timeContext);
        scoreA += timeRelevance * 0.2;
        scoreB += this.getTimeRelevance(b, timeContext) * 0.2;
        
        // 4. 即將發車加分
        if (a.schedule.isUpcoming) scoreA += 0.1;
        if (b.schedule.isUpcoming) scoreB += 0.1;
        
        return scoreB - scoreA;
      })
      .slice(0, 5); // 只返回前5個建議
  }

  /**
   * 計算匹配信心度
   */
  private calculateMatchConfidence(query: string, trainNumber: string): number {
    if (trainNumber === query) return 1.0;
    if (trainNumber.startsWith(query)) return 0.8;
    if (trainNumber.includes(query)) return 0.6;
    return 0.3;
  }

  /**
   * 計算字串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * 計算編輯距離
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * 獲取時間上下文
   */
  private getTimeContext(date: Date): string {
    const hour = date.getHours();
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    
    if (isWeekend) return 'weekend';
    if (hour >= 6 && hour < 10) return 'morning';
    if (hour >= 10 && hour < 14) return 'afternoon';
    if (hour >= 14 && hour < 19) return 'evening';
    return 'night';
  }

  /**
   * 獲取時間相關性分數
   */
  private getTimeRelevance(suggestion: TrainSuggestion, timeContext: string): number {
    const relevantTags = this.TIME_WEIGHTS[timeContext.toUpperCase() as keyof typeof this.TIME_WEIGHTS] || [];
    const matchingTags = suggestion.tags.filter(tag => relevantTags.includes(tag));
    return matchingTags.length / relevantTags.length;
  }

  /**
   * 判斷是否為即將發車的車次
   */
  private isUpcomingTrain(trainNumber: string, currentTime: Date): boolean {
    // 簡化版本 - 實際應該查詢 TDX API
    const hour = currentTime.getHours();
    const departureHour = parseInt(this.getDepartureTime(trainNumber).split(':')[0]);
    
    return Math.abs(departureHour - hour) <= 2; // 2小時內算即將發車
  }

  /**
   * 獲取發車時間 (模擬資料)
   */
  private getDepartureTime(trainNumber: string): string {
    // 簡化版本 - 實際應該從 TDX API 獲取
    const timeMap = new Map([
      ['2', '06:00'],
      ['152', '18:59'],
      ['154', '19:30'],
      ['1121', '07:04'],
      ['1234', '08:15'],
      ['22', '22:00'],
      ['408', '08:30'],
      ['562', '19:45']
    ]);
    
    return timeMap.get(trainNumber) || '08:00';
  }

  /**
   * 獲取車種代碼
   */
  private getTrainTypeCode(trainNumber: string): string {
    if (trainNumber === '2') return 'Puyuma';
    if (trainNumber.startsWith('4')) return 'Taroko';
    if (trainNumber.length === 3 && trainNumber.startsWith('1')) return 'TzeChiang';
    if (trainNumber.length === 4) return 'Local';
    return 'TzeChiang';
  }

  /**
   * 獲取車種中文名稱
   */
  private getTrainTypeChinese(trainNumber: string): string {
    const typeMap = new Map([
      ['Puyuma', '普悠瑪號'],
      ['Taroko', '太魯閣號'],
      ['TzeChiang', '自強號'],
      ['ChuKuang', '莒光號'],
      ['Local', '區間車'],
      ['FastLocal', '區間快車']
    ]);
    
    return typeMap.get(this.getTrainTypeCode(trainNumber)) || '自強號';
  }

  /**
   * 解析路線資訊
   */
  private parseRoute(routeString: string): { origin: string; destination: string } {
    const parts = routeString.split('→');
    return {
      origin: parts[0] || '未知',
      destination: parts[1] || '未知'
    };
  }

  /**
   * 格式化搜尋結果為文字回覆
   */
  public formatSearchResult(result: SmartSearchResult): string {
    let response = `🔍 **車次智慧搜尋**\n\n`;
    
    if (result.searchStrategy === 'exact') {
      response += `找到精確匹配的車次 "${result.query}"\n\n`;
    } else {
      response += `正在搜尋包含 "${result.query}" 的車次...\n\n`;
    }
    
    response += `📍 **最可能的車次** (基於使用頻率):\n`;
    
    result.suggestions.forEach((suggestion, index) => {
      const icon = this.getTrainIcon(suggestion.trainType);
      const popularityIcon = suggestion.popularity === 'hot' ? ' ⭐ 熱門' : '';
      const upcomingIcon = suggestion.schedule.isUpcoming ? ' ⏰' : '';
      const tagIcons = this.getTagIcons(suggestion.tags);
      
      response += `${index + 1}. ${icon} **${suggestion.trainTypeChinese} ${suggestion.trainNumber}** - `;
      response += `${suggestion.route.origin}→${suggestion.route.destination} `;
      response += `(${suggestion.schedule.departureTime}發車)${popularityIcon}${upcomingIcon}${tagIcons}\n`;
    });
    
    response += `\n💡 ${result.nextSteps.join('\n💡 ')}\n`;
    response += `🕐 基於現在時間 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}，推薦即將發車的班次`;
    
    return response;
  }

  /**
   * 獲取車種圖示
   */
  private getTrainIcon(trainType: string): string {
    const iconMap = new Map([
      ['Puyuma', '🚄'],
      ['Taroko', '🚄'],
      ['TzeChiang', '🚄'],
      ['ChuKuang', '🚃'],
      ['Local', '🚌'],
      ['FastLocal', '🚌']
    ]);
    
    return iconMap.get(trainType) || '🚄';
  }

  /**
   * 獲取標籤圖示
   */
  private getTagIcons(tags: string[]): string {
    const iconMap = new Map([
      ['夜車', ' 🌙'],
      ['熱門', ''],
      ['直達', ' 🎯'],
      ['月票可搭', ' 🎫'],
      ['較便宜', ' 💰'],
      ['通勤', ' 💼'],
      ['觀光熱門', ' 📸'],
      ['東部最快', ' ⚡'],
      ['普悠瑪', ''],
      ['太魯閣', '']
    ]);
    
    return tags.map(tag => iconMap.get(tag) || '').join('');
  }
}
