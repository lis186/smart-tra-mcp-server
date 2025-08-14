#!/usr/bin/env node

/**
 * TDX API 憑證測試腳本
 * 用於驗證 TDX API 憑證是否正確配置
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

console.log('🔧 測試 TDX API 憑證配置...\n');

// 載入環境變數
try {
  dotenv.config();
  console.log('✅ 環境變數已載入');
} catch (error) {
  console.error('❌ 無法載入環境變數:', error.message);
}

// 檢查憑證
const clientId = process.env.TDX_CLIENT_ID;
const clientSecret = process.env.TDX_CLIENT_SECRET;

console.log('\n📋 憑證檢查:');
console.log(`TDX_CLIENT_ID: ${clientId ? '✅ 已設定' : '❌ 未設定'}`);
console.log(`TDX_CLIENT_SECRET: ${clientSecret ? '✅ 已設定' : '❌ 未設定'}`);

if (!clientId || !clientSecret) {
  console.log('\n❌ 缺少必要憑證！');
  console.log('\n📝 設定步驟:');
  console.log('1. 複製 .env.example 為 .env');
  console.log('2. 到 https://tdx.transportdata.tw/ 註冊並申請 API 金鑰');
  console.log('3. 在 .env 檔案中填入您的憑證');
  process.exit(1);
}

// 測試 API 認證
console.log('\n🌐 測試 TDX API 連接...');

const authUrl = process.env.TDX_AUTH_URL || 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

try {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ 認證失敗: ${response.status} ${response.statusText}`);
    console.error(`錯誤詳情: ${errorText}`);
    process.exit(1);
  }

  const tokenData = await response.json();
  console.log('✅ TDX API 認證成功！');
  console.log(`🔑 取得 access token (有效期: ${tokenData.expires_in} 秒)`);

  // 測試基本 API 呼叫
  console.log('\n🚄 測試車站資料 API...');
  const baseUrl = process.env.TDX_BASE_URL || 'https://tdx.transportdata.tw/api/basic';
  const stationResponse = await fetch(`${baseUrl}/v2/Rail/TRA/Station?%24format=JSON&%24top=1`, {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Accept': 'application/json'
    }
  });

  if (stationResponse.ok) {
    const stationData = await stationResponse.json();
    console.log('✅ 車站資料 API 測試成功！');
    console.log(`📍 測試站點: ${stationData[0]?.StationName?.Zh_tw || '未知'}`);
  } else {
    console.error('❌ 車站資料 API 測試失敗');
  }

  console.log('\n🎉 所有測試通過！MCP 伺服器應該可以正常運作。');

} catch (error) {
  console.error('❌ 測試失敗:', error.message);
  console.log('\n💡 可能的問題:');
  console.log('- 網路連接問題');
  console.log('- TDX API 憑證錯誤');
  console.log('- TDX API 服務暫時不可用');
  process.exit(1);
}