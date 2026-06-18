import * as db from '../src/db.js';
import * as sync from '../src/sync.js';

async function runSyncTests() {
  console.log('🚀 Starting OKR Sync Engine Integration Tests...');

  let testObjectiveId: string | undefined;
  let testKeyResultId: string | undefined;
  
  const hubspotId = 'test-hubspot-sandbox';
  const clickupId = 'test-clickup-sandbox';

  try {
    // 1. Configure HubSpot and ClickUp Integrations in Sandbox Mode
    console.log('\nConfiguring test integrations in Sandbox Mode...');
    await db.saveIntegration({
      id: hubspotId,
      type: 'hubspot',
      name: 'Test HubSpot Sandbox',
      credentials: { apiKey: 'sandbox' }
    });
    console.log('✅ HubSpot sandbox integration saved.');

    await db.saveIntegration({
      id: clickupId,
      type: 'clickup',
      name: 'Test ClickUp Sandbox',
      credentials: { apiKey: 'sandbox' }
    });
    console.log('✅ ClickUp sandbox integration saved.');

    // 2. Create a test Objective
    console.log('\nCreating test objective...');
    const objective = await db.createObjective({
      title: 'Automated Sales & Task Execution',
      description: 'Upskill business development and project execution via automated integrations.',
      department: 'sales',
      quarter: '2026-Q2',
      owner: 'richard@devpost.com',
      status: 'on-track'
    });
    testObjectiveId = objective.id;
    console.log(`✅ Objective created with ID: ${objective.id}`);

    // 3. Create a test Key Result
    console.log('\nCreating test Key Result (Multi-source)...');
    const keyResult = await db.createKeyResult({
      objectiveId: testObjectiveId,
      title: 'Combined revenue and task completions',
      description: 'Sum of closed HubSpot deals value and ClickUp tasks count.',
      type: 'number',
      startValue: 0,
      targetValue: 200000,
      currentValue: 0,
      owner: 'richard@devpost.com',
      source: 'manual'
    });
    testKeyResultId = keyResult.id;
    console.log(`✅ Key Result created with ID: ${keyResult.id}`);

    // 4. Connect Key Result to HubSpot
    console.log('\nLinking Key Result to HubSpot sandbox connection...');
    const connHubSpot = await db.saveKRConnection({
      keyResultId: testKeyResultId,
      integrationId: hubspotId,
      config: {
        stageId: 'closedwon',
        metricType: 'sum',
        metricField: 'amount'
      }
    });
    console.log(`✅ HubSpot connection created with ID: ${connHubSpot.id}`);

    // 5. Connect Key Result to ClickUp
    console.log('\nLinking Key Result to ClickUp sandbox connection...');
    const connClickUp = await db.saveKRConnection({
      keyResultId: testKeyResultId,
      integrationId: clickupId,
      config: {
        listId: '9015012345',
        statusFilter: 'complete',
        metricType: 'count'
      }
    });
    console.log(`✅ ClickUp connection created with ID: ${connClickUp.id}`);

    // Set combination strategy to SUM
    const krRef = db.db.collection('key_results').doc(testKeyResultId);
    await krRef.update({
      combinationStrategy: 'sum',
      source: 'automated'
    });
    console.log('✅ Set Key Result combination strategy to SUM.');

    // 6. Run Sync Engine
    console.log('\nTriggering syncKeyResult()...');
    const syncedKR = await sync.syncKeyResult(testKeyResultId, 'Test Runner');
    console.log('✅ Sync complete!');
    console.log(`Key Result Value: ${syncedKR.currentValue} (Start: 0, Target: 200000)`);
    console.log(`Key Result Progress: ${syncedKR.progress}%`);

    if (syncedKR.currentValue <= 0) {
      throw new Error('Synced value should be greater than 0');
    }
    if (syncedKR.progress <= 0) {
      throw new Error('Synced progress should be greater than 0');
    }

    // 7. Verify Rollup to Parent Objective
    console.log('\nVerifying parent objective rollup progress...');
    const objDetails = await db.getObjective(testObjectiveId);
    console.log(`Objective Progress: ${objDetails.objective.progress}% (Expected: ${syncedKR.progress}%)`);
    
    if (Math.round(objDetails.objective.progress) !== Math.round(syncedKR.progress)) {
      throw new Error(`Objective progress should equal Key Result progress, expected ${syncedKR.progress}%, got ${objDetails.objective.progress}%`);
    }

    // 8. Verify Progress Updates History log
    console.log('\nVerifying Key Result history log...');
    const history = await db.getKeyResultHistory(testKeyResultId);
    console.log(`History records count: ${history.length} (Expected: 1)`);
    if (history.length !== 1) {
      throw new Error(`History should have 1 record, got ${history.length}`);
    }
    console.log(`Latest log note: "${history[0].note}"`);
    console.log(`Latest log updatedBy: "${history[0].updatedBy}"`);

    if (history[0].updatedBy !== 'Test Runner') {
      throw new Error(`History updater should be 'Test Runner', got '${history[0].updatedBy}'`);
    }

    console.log('\n🎉 ALL SYNC ENGINE INTEGRATION TESTS PASSED!');
    
  } catch (error) {
    console.error('\n❌ TEST RUN FAILED:', error);
    process.exitCode = 1;
  } finally {
    // 9. Clean up test data
    console.log('\nCleaning up test data...');
    if (testObjectiveId) {
      await db.deleteObjective(testObjectiveId);
      console.log('✅ Deleted test objective, key result, and history logs.');
    }
    
    // Delete test integrations
    await db.deleteIntegration(hubspotId);
    await db.deleteIntegration(clickupId);
    console.log('✅ Deleted test integrations.');
    console.log('Test run cleanup complete.');
  }
}

runSyncTests();
