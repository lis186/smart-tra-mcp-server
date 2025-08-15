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

async function testTPASSEligibility() {
  const token = await getToken();
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];
  
  const url = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/${date}?$format=JSON`;
  
  console.log('=== TPASS Monthly Pass Eligibility Test ===');
  console.log('Based on reference Line Bot implementation\n');
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  const data = await response.json();
  
  // TPASS restriction rule from reference implementation
  const RESTRICTED_CODES = ['1', '2', '11'];
  
  console.log('❌ TPASS Restricted Train Types (不可搭乘):');
  console.log('  - Code 1: 太魯閣號 (Taroko Express)');
  console.log('  - Code 2: 普悠瑪號 (Puyuma Express)');
  console.log('  - Code 11: 新自強號 EMU3000\n');
  
  console.log('✅ TPASS Eligible Train Types (可搭乘):');
  console.log('  - Code 3: 自強號 (including 商務/推拉式)');
  console.log('  - Code 4: 莒光號');
  console.log('  - Code 5: 復興號');
  console.log('  - Code 6: 區間車');
  console.log('  - Code 7: 普快車');
  console.log('  - Code 10: 區間快\n');
  
  // Test specific trains from the issue
  console.log('=== Testing Specific Trains ===\n');
  const testTrains = ['105', '2153', '2', '1'];
  
  for (const trainNo of testTrains) {
    const train = data.TrainTimetables?.find(t => t.TrainInfo.TrainNo === trainNo);
    if (train) {
      const typeCode = train.TrainInfo.TrainTypeCode;
      const typeName = train.TrainInfo.TrainTypeName.Zh_tw;
      const isRestricted = RESTRICTED_CODES.includes(typeCode);
      const eligibility = isRestricted ? '❌ NOT eligible' : '✅ ELIGIBLE';
      
      console.log(`Train ${trainNo}: ${typeName}`);
      console.log(`  Type Code: ${typeCode}`);
      console.log(`  TPASS Monthly Pass: ${eligibility}`);
      
      // Get times
      const originStop = train.StopTimes.find(s => s.StationID === '1000');
      const destStop = train.StopTimes.find(s => s.StationID === '3300');
      
      if (originStop && destStop) {
        const depTime = originStop.DepartureTime || originStop.ArrivalTime;
        const arrTime = destStop.ArrivalTime || destStop.DepartureTime;
        console.log(`  Schedule: ${depTime} → ${arrTime}`);
      }
      console.log('');
    }
  }
  
  // Summary statistics
  console.log('=== Summary Statistics ===\n');
  const typeStats = {};
  
  for (const train of (data.TrainTimetables || [])) {
    const typeCode = train.TrainInfo.TrainTypeCode;
    const typeName = train.TrainInfo.TrainTypeName.Zh_tw;
    
    if (!typeStats[typeCode]) {
      typeStats[typeCode] = {
        name: typeName,
        count: 0,
        restricted: RESTRICTED_CODES.includes(typeCode)
      };
    }
    typeStats[typeCode].count++;
  }
  
  // Sort by code
  const sortedCodes = Object.keys(typeStats).sort((a, b) => {
    const numA = parseInt(a) || 999;
    const numB = parseInt(b) || 999;
    return numA - numB;
  });
  
  for (const code of sortedCodes) {
    const info = typeStats[code];
    const marker = info.restricted ? '❌' : '✅';
    console.log(`${marker} Code ${code.padEnd(3)} - ${info.name.padEnd(30)} : ${info.count} trains`);
  }
  
  console.log('\n=== Correction Summary ===');
  console.log('✅ According to the reference Line Bot implementation:');
  console.log('   - Only train type codes 1, 2, and 11 are restricted');
  console.log('   - 自強號 (code 3) including business trains ARE eligible');
  console.log('   - 區間快 (code 10) IS eligible');
  console.log('   - This matches the actual TPASS monthly pass rules');
}

testTPASSEligibility().catch(console.error);