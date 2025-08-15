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

async function checkTrain2() {
  const token = await getToken();
  
  // Query specifically for train 2 tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];
  
  // First check if train 2 exists in general timetable
  const generalUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/GeneralTrainTimetable/TrainNo/2?$format=JSON`;
  
  console.log('Checking general timetable for train 2...');
  const generalResponse = await fetch(generalUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  if (generalResponse.ok) {
    const generalData = await generalResponse.json();
    console.log('\nGeneral timetable data for train 2:');
    if (generalData.length > 0) {
      const train = generalData[0];
      console.log('Train Type:', train.TrainInfo?.TrainTypeName?.Zh_tw);
      console.log('Number of stops:', train.StopTimes?.length);
      
      // Find Taipei and Taichung stops
      const taipeiStop = train.StopTimes?.find(s => s.StationID === '1000');
      const taichungStop = train.StopTimes?.find(s => s.StationID === '3300');
      
      if (taipeiStop) {
        console.log(`\nTaipei stop: Seq ${taipeiStop.StopSequence}, Dep: ${taipeiStop.DepartureTime}`);
      }
      if (taichungStop) {
        console.log(`Taichung stop: Seq ${taichungStop.StopSequence}, Arr: ${taichungStop.ArrivalTime}`);
      }
      
      // Show all stops
      console.log('\nAll stops for train 2:');
      train.StopTimes?.forEach(stop => {
        console.log(`  ${stop.StopSequence}: ${stop.StationName.Zh_tw} (${stop.StationID}) - Arr: ${stop.ArrivalTime || '-'}, Dep: ${stop.DepartureTime || '-'}`);
      });
    }
  }
  
  // Now check OD specific query
  console.log('\n' + '='.repeat(50));
  const odUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/3300/${date}?$filter=TrainInfo/TrainNo eq '2'&$format=JSON`;
  
  console.log('\nChecking OD timetable for train 2 from Taipei to Taichung...');
  console.log('URL:', odUrl);
  
  const odResponse = await fetch(odUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  const odData = await odResponse.json();
  console.log('\nOD query results:');
  console.log('Trains found:', odData.TrainTimetables?.length || 0);
  
  if (odData.TrainTimetables?.length > 0) {
    const train = odData.TrainTimetables[0];
    console.log('\nTrain 2 in OD response:');
    console.log('StopTimes count:', train.StopTimes.length);
    train.StopTimes.forEach(stop => {
      console.log(`  ${stop.StopSequence}: ${stop.StationName.Zh_tw} - Arr: ${stop.ArrivalTime || '-'}, Dep: ${stop.DepartureTime || '-'}`);
    });
  }
}

checkTrain2().catch(console.error);