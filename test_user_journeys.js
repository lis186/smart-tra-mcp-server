#!/usr/bin/env node

/**
 * User Journey Tests - Real-world Usage Scenarios
 * Tests realistic user workflows across multiple tools
 * Validates tool collaboration in practice
 */

import { SmartTRAServer } from './dist/server.js';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.TDX_CLIENT_ID = 'test_client_id';
process.env.TDX_CLIENT_SECRET = 'test_secret';

const server = new SmartTRAServer();

// Real user journey scenarios
const userJourneyTests = [
  {
    name: 'Tourist Planning Jiufen Trip',
    persona: 'Foreign tourist unfamiliar with Taiwan trains',
    scenario: 'Wants to visit Jiufen from Taipei',
    steps: [
      {
        step: 1,
        tool: 'search_station',
        query: '九份',
        expected: 'Station not found, provides suggestions',
        validation: response => response.includes('找不到') || response.includes('candidates') || response.includes('沒有找到')
      },
      {
        step: 2,
        tool: 'plan_trip',
        query: '台北到九份怎麼去',
        expected: 'Maps to 瑞芳 with clear guidance',
        validation: response => response.includes('瑞芳') && response.includes('不是火車站')
      },
      {
        step: 3,
        tool: 'search_trains',
        query: '台北到瑞芳明天早上8點',
        expected: 'Specific train schedules',
        validation: response => response.includes('出發') && response.includes('抵達')
      }
    ],
    successCriteria: 'User gets complete journey guidance from initial confusion to actionable train times'
  },

  {
    name: 'Local Commuter Quick Check',
    persona: 'Local resident familiar with train system',
    scenario: 'Checking morning commute options',
    steps: [
      {
        step: 1,
        tool: 'search_trains',
        query: '板橋到桃園明天7點到8點',
        expected: 'Direct train options shown',
        validation: response => response.includes('板橋') && response.includes('桃園') && response.includes('出發')
      },
      {
        step: 2,
        tool: 'search_trains',
        query: '1234號列車',
        expected: 'Specific train timetable',
        validation: response => response.includes('1234') || response.includes('時刻表')
      }
    ],
    successCriteria: 'Quick access to specific train information without unnecessary complexity'
  },

  {
    name: 'Family Weekend Trip Planning',
    persona: 'Family planning weekend getaway',
    scenario: 'Multi-destination trip with transfers',
    steps: [
      {
        step: 1,
        tool: 'plan_trip',
        query: '台北到日月潭',
        expected: 'Route via Jiji Line stations',
        validation: response => response.includes('車埕') || response.includes('集集') || response.includes('日月潭')
      },
      {
        step: 2,
        tool: 'search_trains',
        query: '台中到車埕',
        expected: 'Jiji Line connection trains',
        validation: response => response.includes('車埕') && response.includes('出發')
      },
      {
        step: 3,
        tool: 'plan_trip',
        query: '車埕回台北',
        expected: 'Return journey planning',
        validation: response => response.includes('車埕') && response.includes('台北')
      }
    ],
    successCriteria: 'Complete multi-segment journey planning with scenic route options'
  },

  {
    name: 'Business Traveler Efficiency',
    persona: 'Business person needing fastest routes',
    scenario: 'Time-critical travel planning',
    steps: [
      {
        step: 1,
        tool: 'search_trains',
        query: '台北到高雄最快的班次',
        expected: 'Fastest trains prioritized',
        validation: response => response.includes('自強號') && response.includes('最快')
      },
      {
        step: 2,
        tool: 'search_trains',
        query: '高鐵和台鐵比較',
        expected: 'Handles non-TRA comparison gracefully',
        validation: response => response.includes('台鐵') || response.includes('本服務')
      }
    ],
    successCriteria: 'Quick access to fastest options with clear service scope'
  },

  {
    name: 'Adventure Traveler Branch Lines',
    persona: 'Adventurous traveler exploring Taiwan',
    scenario: 'Visiting remote destinations via branch lines',
    steps: [
      {
        step: 1,
        tool: 'plan_trip',
        query: '台北到平溪放天燈',
        expected: 'Pingxi Line route with transfer',
        validation: response => response.includes('平溪') && (response.includes('轉車') || response.includes('瑞芳'))
      },
      {
        step: 2,
        tool: 'search_trains',
        query: '瑞芳到十分',
        expected: 'Pingxi Line local trains',
        validation: response => response.includes('十分') && response.includes('出發')
      },
      {
        step: 3,
        tool: 'plan_trip',
        query: '十分到菁桐',
        expected: 'Branch line continuation',
        validation: response => response.includes('菁桐') && response.includes('十分')
      }
    ],
    successCriteria: 'Navigate complex branch line connections successfully'
  },

  {
    name: 'Confused User Recovery',
    persona: 'User making common mistakes',
    scenario: 'Recovery from typical user errors',
    steps: [
      {
        step: 1,
        tool: 'search_trains',
        query: '台北101到信義區',
        expected: 'Helpful error with guidance',
        validation: response => response.includes('Station data') || response.includes('search_station')
      },
      {
        step: 2,
        tool: 'search_station',
        query: '信義區',
        expected: 'Station suggestions or alternatives',
        validation: response => response.includes('台北') || response.includes('candidates')
      },
      {
        step: 3,
        tool: 'plan_trip',
        query: '台北車站到信義區',
        expected: 'Maps to reasonable TRA station',
        validation: response => response.includes('台北') || response.includes('不是火車站')
      }
    ],
    successCriteria: 'User guided from confusion to useful information'
  }
];

async function runUserJourneyTests() {
  console.log('='.repeat(80));
  console.log('USER JOURNEY TESTS - Real-world Usage Scenarios');
  console.log('='.repeat(80));
  console.log();

  // Initialize server
  await server.loadStationDataForTest();

  const results = {
    journeysPassed: 0,
    journeysFailed: 0,
    totalSteps: 0,
    stepsPassed: 0,
    details: []
  };

  for (const journey of userJourneyTests) {
    console.log(`\n🎭 ${journey.name}`);
    console.log(`👤 Persona: ${journey.persona}`);
    console.log(`📖 Scenario: ${journey.scenario}`);
    console.log('═'.repeat(60));

    const journeyResult = {
      name: journey.name,
      steps: [],
      overallPassed: true
    };

    for (const step of journey.steps) {
      console.log(`\n📍 Step ${step.step}: Using ${step.tool}`);
      console.log(`❓ Query: "${step.query}"`);
      console.log(`🎯 Expected: ${step.expected}`);

      try {
        let response;
        const startTime = Date.now();

        // Execute the tool
        switch (step.tool) {
          case 'search_trains':
            response = await server.handleSearchTrainsForTest(step.query, '');
            break;
          case 'search_station':
            response = await server.handleSearchStationForTest(step.query, '');
            break;
          case 'plan_trip':
            response = await server.handlePlanTripForTest(step.query, '');
            break;
          default:
            throw new Error(`Unknown tool: ${step.tool}`);
        }

        const responseTime = Date.now() - startTime;
        const responseText = response?.content?.[0]?.text || '';

        // Validate response
        const passed = step.validation(responseText);
        
        console.log(`⏱️  Response time: ${responseTime}ms`);
        console.log(`📊 Response length: ${responseText.length} chars`);
        console.log(`✅ Validation: ${passed ? '✅ PASS' : '❌ FAIL'}`);

        if (responseText.length > 0) {
          console.log(`📄 Sample response (first 150 chars):`);
          console.log(`   "${responseText.substring(0, 150)}${responseText.length > 150 ? '...' : ''}"`);
        }

        journeyResult.steps.push({
          step: step.step,
          tool: step.tool,
          query: step.query,
          passed,
          responseTime,
          responseLength: responseText.length,
          sampleResponse: responseText.substring(0, 200)
        });

        if (passed) {
          results.stepsPassed++;
        } else {
          journeyResult.overallPassed = false;
        }

        results.totalSteps++;

      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        
        journeyResult.steps.push({
          step: step.step,
          tool: step.tool,
          query: step.query,
          passed: false,
          error: error.message
        });

        journeyResult.overallPassed = false;
        results.totalSteps++;
      }
    }

    // Overall journey assessment
    console.log(`\n🏆 Journey Result: ${journeyResult.overallPassed ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`📋 Success Criteria: ${journey.successCriteria}`);
    
    if (journeyResult.overallPassed) {
      console.log(`✨ User would successfully complete their goal`);
      results.journeysPassed++;
    } else {
      console.log(`⚠️  User might face difficulties or confusion`);
      results.journeysFailed++;
    }

    results.details.push(journeyResult);
  }

  return results;
}

async function analyzeUserExperience(results) {
  console.log('\n' + '='.repeat(80));
  console.log('USER EXPERIENCE ANALYSIS');
  console.log('='.repeat(80));

  // Overall metrics
  console.log(`\n📊 Overall Metrics:`);
  console.log(`   Complete journeys: ${results.journeysPassed}/${results.journeysPassed + results.journeysFailed}`);
  console.log(`   Individual steps: ${results.stepsPassed}/${results.totalSteps}`);
  console.log(`   Journey success rate: ${((results.journeysPassed / (results.journeysPassed + results.journeysFailed)) * 100).toFixed(1)}%`);
  console.log(`   Step success rate: ${((results.stepsPassed / results.totalSteps) * 100).toFixed(1)}%`);

  // Tool effectiveness
  const toolStats = {};
  results.details.forEach(journey => {
    journey.steps.forEach(step => {
      if (!toolStats[step.tool]) {
        toolStats[step.tool] = { passed: 0, failed: 0, totalTime: 0 };
      }
      if (step.passed) toolStats[step.tool].passed++;
      else toolStats[step.tool].failed++;
      if (step.responseTime) toolStats[step.tool].totalTime += step.responseTime;
    });
  });

  console.log(`\n🔧 Tool Performance:`);
  Object.entries(toolStats).forEach(([tool, stats]) => {
    const total = stats.passed + stats.failed;
    const successRate = ((stats.passed / total) * 100).toFixed(1);
    const avgTime = (stats.totalTime / total).toFixed(0);
    console.log(`   ${tool.padEnd(15)}: ${successRate}% success, ${avgTime}ms avg`);
  });

  // Journey type analysis
  console.log(`\n🎭 Journey Type Analysis:`);
  results.details.forEach(journey => {
    const stepSuccessRate = ((journey.steps.filter(s => s.passed).length / journey.steps.length) * 100).toFixed(1);
    const status = journey.overallPassed ? '✅' : '❌';
    console.log(`   ${status} ${journey.name}: ${stepSuccessRate}% steps passed`);
  });

  // Key insights
  console.log(`\n💡 Key User Experience Insights:`);
  
  const touristJourneys = results.details.filter(j => j.name.includes('Tourist') || j.name.includes('Confused'));
  const expertJourneys = results.details.filter(j => j.name.includes('Local') || j.name.includes('Business'));
  
  const touristSuccess = touristJourneys.filter(j => j.overallPassed).length / touristJourneys.length;
  const expertSuccess = expertJourneys.filter(j => j.overallPassed).length / expertJourneys.length;

  console.log(`   • Tourist/Confused users: ${(touristSuccess * 100).toFixed(1)}% journey success`);
  console.log(`   • Expert users: ${(expertSuccess * 100).toFixed(1)}% journey success`);
  
  if (touristSuccess < expertSuccess) {
    console.log(`   • System favors experienced users (${((expertSuccess - touristSuccess) * 100).toFixed(1)}% gap)`);
  } else {
    console.log(`   • System is well-balanced for all user types`);
  }

  // Recommendations
  console.log(`\n🔮 Recommendations:`);
  const failedJourneys = results.details.filter(j => !j.overallPassed);
  if (failedJourneys.length > 0) {
    console.log(`   • Focus on improving: ${failedJourneys.map(j => j.name).join(', ')}`);
  }
  
  const slowTools = Object.entries(toolStats)
    .filter(([, stats]) => stats.totalTime / (stats.passed + stats.failed) > 2000)
    .map(([tool]) => tool);
  
  if (slowTools.length > 0) {
    console.log(`   • Optimize performance for: ${slowTools.join(', ')}`);
  }
  
  console.log(`   • Most critical user journey: Tourist guidance (highest business impact)`);
  console.log(`   • Tool coordination appears ${results.stepsPassed / results.totalSteps > 0.8 ? 'effective' : 'needs improvement'}`);
}

async function runAllTests() {
  try {
    const results = await runUserJourneyTests();
    await analyzeUserExperience(results);

    console.log('\n' + '='.repeat(80));
    console.log('USER JOURNEY TEST SUMMARY');
    console.log('='.repeat(80));
    
    console.log(`\n🎯 Business Impact Assessment:`);
    console.log(`   • User satisfaction prediction: ${results.journeysPassed / (results.journeysPassed + results.journeysFailed) > 0.7 ? 'High' : 'Needs improvement'}`);
    console.log(`   • Tool ecosystem maturity: ${results.stepsPassed / results.totalSteps > 0.8 ? 'Mature' : 'Developing'}`);
    console.log(`   • Ready for production: ${results.journeysPassed / (results.journeysPassed + results.journeysFailed) > 0.8 ? 'Yes' : 'Needs refinement'}`);

  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch(error => {
  console.error('Failed to run user journey tests:', error);
  process.exit(1);
});