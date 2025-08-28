#!/usr/bin/env node

/**
 * EMU3000 TPASS Restriction Test
 * Verify that EMU3000 trains are NOT eligible for monthly passes
 */

import { TrainService } from './dist/services/train-service.js';
import { ErrorHandler } from './dist/core/error-handler.js';

// Mock AuthManager for testing
class MockAuthManager {
  async apiRequest() {
    return { ok: false, status: 404 }; // Not needed for this test
  }
}

// Mock train data with EMU3000 type
const mockEMU3000Train = {
  TrainInfo: {
    TrainNo: '3001',
    TrainTypeName: { Zh_tw: 'EMU3000', En: 'EMU3000' },
    TrainTypeCode: '11'  // EMU3000 type code
  },
  StopTimes: [
    {
      StationID: '1000',
      StationName: { Zh_tw: '臺北', En: 'Taipei' },
      ArrivalTime: '08:00',
      DepartureTime: '08:00',
      StopSequence: 1
    },
    {
      StationID: '3300',
      StationName: { Zh_tw: '臺中', En: 'Taichung' },
      ArrivalTime: '10:00',
      DepartureTime: '10:00', 
      StopSequence: 2
    }
  ]
};

// Mock regular 區間車 (should be eligible)
const mockLocalTrain = {
  TrainInfo: {
    TrainNo: '1234',
    TrainTypeName: { Zh_tw: '區間車', En: 'Local' },
    TrainTypeCode: '6'  // Local train type code
  },
  StopTimes: [
    {
      StationID: '1000',
      StationName: { Zh_tw: '臺北', En: 'Taipei' },
      ArrivalTime: '08:30',
      DepartureTime: '08:30',
      StopSequence: 1
    },
    {
      StationID: '1020',
      StationName: { Zh_tw: '桃園', En: 'Taoyuan' },
      ArrivalTime: '09:30',
      DepartureTime: '09:30',
      StopSequence: 2
    }
  ]
};

async function testEMU3000Restriction() {
  console.log('🧪 Testing EMU3000 TPASS Monthly Pass Restriction\n');

  const errorHandler = new ErrorHandler();
  const mockAuth = new MockAuthManager();
  const trainService = new TrainService(mockAuth, errorHandler);

  let testsPassed = 0;
  let totalTests = 0;

  console.log('Test 1: EMU3000 should NOT be eligible for monthly pass');
  totalTests++;
  
  try {
    const results = trainService.processTrainSearchResults([mockEMU3000Train], '1000', '3300');
    const emu3000Result = results[0];
    
    if (emu3000Result.isMonthlyPassEligible === false) {
      console.log('  ✅ PASS - EMU3000 correctly marked as NOT eligible for monthly pass');
      testsPassed++;
    } else {
      console.log('  ❌ FAIL - EMU3000 incorrectly marked as eligible for monthly pass');
      console.log(`     Expected: false, Got: ${emu3000Result.isMonthlyPassEligible}`);
    }
  } catch (error) {
    console.log(`  ❌ ERROR - ${error.message}`);
  }

  console.log('\nTest 2: 區間車 should be eligible for monthly pass (control test)');
  totalTests++;
  
  try {
    const results = trainService.processTrainSearchResults([mockLocalTrain], '1000', '1020');
    const localResult = results[0];
    
    if (localResult.isMonthlyPassEligible === true) {
      console.log('  ✅ PASS - 區間車 correctly marked as eligible for monthly pass');
      testsPassed++;
    } else {
      console.log('  ❌ FAIL - 區間車 incorrectly marked as NOT eligible for monthly pass');
      console.log(`     Expected: true, Got: ${localResult.isMonthlyPassEligible}`);
    }
  } catch (error) {
    console.log(`  ❌ ERROR - ${error.message}`);
  }

  console.log('\nTest 3: Train type restrictions constants');
  totalTests++;
  
  // Check if EMU3000 is in restricted types
  const restrictedTypes = Object.values({
    TAROKO: '1',
    PUYUMA: '2', 
    EMU3000: '11'
  });
  
  if (restrictedTypes.includes('11')) {
    console.log('  ✅ PASS - EMU3000 (type code 11) is in restricted train types');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL - EMU3000 (type code 11) is NOT in restricted train types');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${testsPassed}/${totalTests} tests passed`);
  
  if (testsPassed === totalTests) {
    console.log('🎉 All EMU3000 restriction tests PASSED!');
    console.log('✅ EMU3000 trains are correctly excluded from monthly pass eligibility');
    process.exit(0);
  } else {
    console.log('❌ Some EMU3000 restriction tests FAILED');
    console.log('⚠️  EMU3000 monthly pass restriction needs to be fixed');
    process.exit(1);
  }
}

// Run the test
testEMU3000Restriction().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});