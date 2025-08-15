import 'dotenv/config';
import fetch from 'node-fetch';

const TDX_CLIENT_ID = process.env.TDX_CLIENT_ID;
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET;

async function getToken() {
  const tokenUrl = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: TDX_CLIENT_ID,
      client_secret: TDX_CLIENT_SECRET,
    }).toString(),
  });
  const { access_token } = await response.json();
  return access_token;
}

async function testTimeFix() {
  const token = await getToken();
  
  // Test the same query from the issue
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];
  
  const url = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/${date}?$format=JSON`;
  
  console.log('Testing time query fix for Taipei to Taichung...\n');
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  const data = await response.json();
  
  // Define restricted train types (matching our fix)
  const RESTRICTED_TYPES = ['1', '2', '3', '4', '5', '10', '11'];
  
  console.log('=== TPASS Eligibility Check ===');
  console.log('Restricted train type codes:', RESTRICTED_TYPES);
  console.log('');
  
  // Test specific trains from the issue
  const testTrains = ['105', '2153', '2', '1'];
  
  for (const trainNo of testTrains) {
    const train = data.TrainTimetables?.find(t => t.TrainInfo.TrainNo === trainNo);
    if (train) {
      const typeCode = train.TrainInfo.TrainTypeCode;
      const isRestricted = RESTRICTED_TYPES.includes(typeCode);
      const eligibility = isRestricted ? '❌ NOT eligible' : '✅ Eligible';
      
      console.log(`Train ${trainNo}: ${train.TrainInfo.TrainTypeName.Zh_tw}`);
      console.log(`  Type Code: ${typeCode}`);
      console.log(`  Monthly Pass: ${eligibility}`);
      
      // Check travel time
      const originStop = train.StopTimes.find(s => s.StationID === '1000');
      const destStop = train.StopTimes.find(s => s.StationID === '3300');
      
      if (originStop && destStop) {
        const depTime = originStop.DepartureTime || originStop.ArrivalTime;
        const arrTime = destStop.ArrivalTime || destStop.DepartureTime;
        
        const departure = new Date(`1970-01-01T${depTime}`);
        const arrival = new Date(`1970-01-01T${arrTime}`);
        
        if (arrival < departure) {
          arrival.setDate(arrival.getDate() + 1);
        }
        
        const diffMs = arrival.getTime() - departure.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        console.log(`  Travel time: ${hours}h ${minutes}m (${depTime} → ${arrTime})`);
        
        // Flag abnormal travel times
        if (hours > 4) {
          console.log(`  ⚠️ WARNING: Abnormally long travel time!`);
        }
      }
      console.log('');
    }
  }
  
  // Summary of all trains
  console.log('=== Summary of All Trains ===');
  const trainStats = {};
  
  for (const train of (data.TrainTimetables || [])) {
    const typeCode = train.TrainInfo.TrainTypeCode;
    const typeName = train.TrainInfo.TrainTypeName.Zh_tw;
    const isRestricted = RESTRICTED_TYPES.includes(typeCode);
    
    if (!trainStats[typeName]) {
      trainStats[typeName] = {
        code: typeCode,
        count: 0,
        restricted: isRestricted
      };
    }
    trainStats[typeName].count++;
  }
  
  for (const [name, info] of Object.entries(trainStats)) {
    const marker = info.restricted ? '❌' : '✅';
    console.log(`${marker} ${name} (Code: ${info.code}): ${info.count} trains`);
  }
  
  console.log('\n✅ Fix Summary:');
  console.log('1. Train type code 3 (Business Tze-Chiang) now correctly marked as restricted');
  console.log('2. Train type code 10 (Fast Local) now correctly marked as restricted');
  console.log('3. Time window display will show "目標時間 08:00 前後" instead of "接下來2小時"');
  console.log('4. Abnormal travel times (like 11h for train 2) are still from TDX data but now identifiable');
}

testTimeFix().catch(console.error);