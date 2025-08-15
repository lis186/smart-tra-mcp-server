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

async function checkTrainCodes() {
  const token = await getToken();
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];
  
  // Get trains from Taipei to Taichung
  const url = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/${date}?$format=JSON`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  const data = await response.json();
  
  // Group trains by type code
  const trainTypeStats = {};
  
  for (const train of (data.TrainTimetables || [])) {
    const typeCode = train.TrainInfo.TrainTypeCode;
    const typeName = train.TrainInfo.TrainTypeName.Zh_tw;
    const trainNo = train.TrainInfo.TrainNo;
    
    if (!trainTypeStats[typeCode]) {
      trainTypeStats[typeCode] = {
        name: typeName,
        trains: []
      };
    }
    
    trainTypeStats[typeCode].trains.push(trainNo);
  }
  
  console.log('Train Type Codes Summary:');
  console.log('========================');
  
  const restrictedTypes = ['1', '2', '3', '4', '5', '10', '11', '12', '13', '1102', '1108', '1110', '1114', '1115', '1120', '1131', '1132', '1140'];
  
  for (const [code, info] of Object.entries(trainTypeStats)) {
    const isRestricted = restrictedTypes.includes(code);
    const marker = isRestricted ? '❌ RESTRICTED' : '✅ TPASS OK';
    console.log(`\nCode: ${code} - ${info.name} ${marker}`);
    console.log(`  Trains: ${info.trains.slice(0, 5).join(', ')}${info.trains.length > 5 ? `, ... (${info.trains.length} total)` : ''}`);
  }
  
  // Check specific problematic trains
  console.log('\n\nProblematic Trains Check:');
  console.log('=========================');
  
  const problematicTrains = ['1', '2', '105', '2153'];
  
  for (const trainNo of problematicTrains) {
    const train = data.TrainTimetables?.find(t => t.TrainInfo.TrainNo === trainNo);
    if (train) {
      console.log(`\nTrain ${trainNo}:`);
      console.log(`  Type Name: ${train.TrainInfo.TrainTypeName.Zh_tw}`);
      console.log(`  Type Code: ${train.TrainInfo.TrainTypeCode}`);
      console.log(`  Should be restricted: ${restrictedTypes.includes(train.TrainInfo.TrainTypeCode) ? 'YES' : 'NO'}`);
      
      // Check stop times
      const originStop = train.StopTimes.find(s => s.StationID === '1000');
      const destStop = train.StopTimes.find(s => s.StationID === '3300');
      
      if (originStop && destStop) {
        const depTime = originStop.DepartureTime || originStop.ArrivalTime;
        const arrTime = destStop.ArrivalTime || destStop.DepartureTime;
        console.log(`  Departure: ${depTime}`);
        console.log(`  Arrival: ${arrTime}`);
      }
    }
  }
}

checkTrainCodes().catch(console.error);