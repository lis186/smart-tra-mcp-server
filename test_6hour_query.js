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

async function test6HourQuery() {
  const token = await getToken();
  
  // Get today's date for testing
  const today = new Date().toISOString().split('T')[0];
  
  const url = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/${today}?$format=JSON`;
  
  console.log('=== Testing 6-Hour Window vs 2-Hour Window ===\n');
  console.log('Simulating different time windows to show expected behavior\n');
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  const data = await response.json();
  const trains = data.TrainTimetables || [];
  
  console.log(`Total trains available today: ${trains.length}\n`);
  
  // Simulate different time windows from current time
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  
  console.log(`Current time: ${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}\n`);
  
  // Test 2-hour window
  const twoHourEnd = currentTimeInMinutes + 120;
  const trainsIn2Hours = trains.filter(train => {
    if (!train.StopTimes || train.StopTimes.length < 1) return false;
    const departureTime = train.StopTimes[0].DepartureTime;
    const [hours, minutes] = departureTime.split(':').map(Number);
    const trainTimeInMinutes = hours * 60 + minutes;
    return trainTimeInMinutes >= currentTimeInMinutes && trainTimeInMinutes <= twoHourEnd;
  });
  
  // Test 6-hour window
  const sixHourEnd = currentTimeInMinutes + 360;
  const trainsIn6Hours = trains.filter(train => {
    if (!train.StopTimes || train.StopTimes.length < 1) return false;
    const departureTime = train.StopTimes[0].DepartureTime;
    const [hours, minutes] = departureTime.split(':').map(Number);
    const trainTimeInMinutes = hours * 60 + minutes;
    return trainTimeInMinutes >= currentTimeInMinutes && trainTimeInMinutes <= sixHourEnd;
  });
  
  console.log('📊 **Comparison Results:**\n');
  console.log(`2-hour window (接下來2小時): ${trainsIn2Hours.length} trains`);
  console.log(`6-hour window (接下來6小時): ${trainsIn6Hours.length} trains\n`);
  
  // Show train type diversity
  const getTrainTypes = (trainList) => {
    const types = {};
    for (const train of trainList) {
      const typeName = train.TrainInfo.TrainTypeName.Zh_tw;
      const typeCode = train.TrainInfo.TrainTypeCode;
      if (!types[typeName]) {
        types[typeName] = { count: 0, code: typeCode };
      }
      types[typeName].count++;
    }
    return types;
  };
  
  const types2Hour = getTrainTypes(trainsIn2Hours);
  const types6Hour = getTrainTypes(trainsIn6Hours);
  
  console.log('🚄 **Train Types in 2-hour window:**');
  for (const [name, info] of Object.entries(types2Hour)) {
    console.log(`  - ${name} (Code: ${info.code}): ${info.count} trains`);
  }
  
  console.log('\\n🚄 **Train Types in 6-hour window:**');
  for (const [name, info] of Object.entries(types6Hour)) {
    console.log(`  - ${name} (Code: ${info.code}): ${info.count} trains`);
  }
  
  console.log('\\n✅ **Expected Results with Fix:**');
  console.log('1. Query "台北到台中接下來6小時" should parse timeWindowHours = 6');
  console.log('2. Response should show "接下來6小時" in headers');
  console.log('3. More trains should appear (including 莒光號, 太魯閣, 普悠瑪 if available)');
  console.log('4. TPASS eligibility should be correctly marked for all train types');
  
  // Show sample trains from 6-hour window that wouldn't appear in 2-hour
  const additionalTrains = trainsIn6Hours.filter(train => !trainsIn2Hours.includes(train));
  if (additionalTrains.length > 0) {
    console.log(`\\n🆕 **Additional trains in 6-hour window (${additionalTrains.length} trains):**`);
    additionalTrains.slice(0, 5).forEach(train => {
      const trainNo = train.TrainInfo.TrainNo;
      const trainType = train.TrainInfo.TrainTypeName.Zh_tw;
      const departureTime = train.StopTimes[0].DepartureTime;
      console.log(`  - ${trainType} ${trainNo}: ${departureTime}`);
    });
    if (additionalTrains.length > 5) {
      console.log(`  ... and ${additionalTrains.length - 5} more`);
    }
  }
}

test6HourQuery().catch(console.error);