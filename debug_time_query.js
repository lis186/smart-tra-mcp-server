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

async function debugTimeQuery() {
  const token = await getToken();
  
  // Query for trains from Taipei (1000) to Taichung (3300) tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];
  
  const url = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/${date}?$format=JSON`;
  
  console.log('Querying:', url);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log('Total trains found:', data.TrainTimetables?.length || 0);
  
  // Check problematic trains
  const problematicTrains = [];
  
  for (const train of (data.TrainTimetables || [])) {
    const trainNo = train.TrainInfo.TrainNo;
    const trainType = train.TrainInfo.TrainTypeName.Zh_tw;
    
    // Check if train actually stops at both stations
    const originStop = train.StopTimes.find(stop => stop.StationID === '1000');
    const destStop = train.StopTimes.find(stop => stop.StationID === '3300');
    
    if (!originStop || !destStop) {
      console.log(`WARNING: Train ${trainNo} doesn't stop at both stations!`);
      console.log(`  StopTimes count: ${train.StopTimes.length}`);
      console.log(`  Stops:`, train.StopTimes.map(s => `${s.StationName.Zh_tw}(${s.StationID})`).join(' -> '));
      problematicTrains.push(trainNo);
      continue;
    }
    
    // Calculate travel time
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
    
    // Check for abnormal travel times (> 4 hours for Taipei to Taichung)
    if (hours > 4) {
      console.log(`\nAbnormal travel time for train ${trainNo} (${trainType}):`);
      console.log(`  Departure: ${depTime}`);
      console.log(`  Arrival: ${arrTime}`);
      console.log(`  Travel time: ${hours}h ${minutes}m`);
      console.log(`  StopSequence: ${originStop.StopSequence} -> ${destStop.StopSequence}`);
      console.log(`  Stops in data:`, train.StopTimes.map(s => s.StationName.Zh_tw).join(' -> '));
    }
    
    // Check specific problematic trains
    if (['105', '2153', '2'].includes(trainNo)) {
      console.log(`\nDetailed info for train ${trainNo} (${trainType}):`);
      console.log(`  Departure: ${depTime} from ${originStop.StationName.Zh_tw}`);
      console.log(`  Arrival: ${arrTime} at ${destStop.StationName.Zh_tw}`);
      console.log(`  Travel time: ${hours}h ${minutes}m`);
      console.log(`  StopSequence: ${originStop.StopSequence} -> ${destStop.StopSequence}`);
      console.log(`  Total stops in StopTimes: ${train.StopTimes.length}`);
    }
  }
  
  if (problematicTrains.length > 0) {
    console.log(`\n⚠️ Found ${problematicTrains.length} trains that don't stop at both stations:`, problematicTrains);
  }
}

debugTimeQuery().catch(console.error);