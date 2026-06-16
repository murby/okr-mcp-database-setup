import {
  createObjective,
  createKeyResult,
  updateKeyResultProgress,
  getObjective,
  listObjectives,
  deleteObjective,
  getKeyResultHistory,
  getObjectiveHistory,
} from '../src/db.js';

async function runTests() {
  console.log('🚀 Starting OKR Database Integration Tests...');

  let testObjectiveId: string | undefined;

  try {
    // 1. Create a test objective
    console.log('\nCreating test objective...');
    const objective = await createObjective({
      title: 'Boost dev velocity by adopting Copilot',
      description: 'Upskill engineering team and track tool usage to increase coding efficiency.',
      department: 'engineering',
      quarter: '2026-Q2',
      owner: 'richard@devpost.com',
      status: 'on-track',
    });
    testObjectiveId = objective.id;
    console.log(`✅ Objective created with ID: ${objective.id}`);
    console.log(`Initial progress: ${objective.progress}% (Expected: 0)`);
    if (objective.progress !== 0) throw new Error('Initial progress should be 0');

    // 2. Create Key Result 1 (e.g. upskill 50 developers)
    console.log('\nCreating Key Result 1 (developers upskilled)...');
    const kr1 = await createKeyResult({
      objectiveId: testObjectiveId,
      title: 'Upskill 50 developers on GitHub Copilot',
      description: 'Track how many developers complete the onboarding and advanced training workshops.',
      type: 'number',
      startValue: 0,
      targetValue: 50,
      currentValue: 0,
      owner: 'willa@devpost.com',
      source: 'manual',
    });
    console.log(`✅ Key Result 1 created with ID: ${kr1.id}`);
    console.log(`KR1 Progress: ${kr1.progress}% (Expected: 0)`);
    if (kr1.progress !== 0) throw new Error('KR1 initial progress should be 0');

    // 3. Create Key Result 2 (e.g. 80% daily active usage)
    console.log('\nCreating Key Result 2 (active usage percentage)...');
    const kr2 = await createKeyResult({
      objectiveId: testObjectiveId,
      title: 'Reach 80% daily active usage of Copilot',
      description: 'Measure daily active developers using Copilot features in their IDEs.',
      type: 'percentage',
      startValue: 0,
      targetValue: 80,
      currentValue: 20, // starts at 20%
      owner: 'robson@devpost.com',
      source: 'manual',
    });
    console.log(`✅ Key Result 2 created with ID: ${kr2.id}`);
    console.log(`KR2 Progress: ${kr2.progress}% (Expected: 25%)`); // (20-0)/(80-0) = 25%
    if (kr2.progress !== 25) throw new Error(`KR2 initial progress should be 25%, got ${kr2.progress}%`);

    // Verify Objective Rollup after KR creation
    // KR1 is 0%, KR2 is 25%. Average should be 12.5%.
    console.log('\nVerifying objective progress rollup after KR creation...');
    let data = await getObjective(testObjectiveId);
    console.log(`Objective progress rollup: ${data.objective.progress}% (Expected: 12.5%)`);
    if (data.objective.progress !== 12.5) {
      throw new Error(`Objective rollup progress should be 12.5%, got ${data.objective.progress}%`);
    }

    // 4. Update Key Result 1 progress
    console.log('\nUpdating Key Result 1 progress (upskilled 25 devs)...');
    const updatedKr1 = await updateKeyResultProgress(
      kr1.id,
      25, // 25 out of 50 -> 50%
      'Completed the mid-quarter training cohort',
      'richard@devpost.com'
    );
    console.log(`✅ Key Result 1 updated. New value: ${updatedKr1.currentValue}, Progress: ${updatedKr1.progress}% (Expected: 50%)`);
    if (updatedKr1.progress !== 50) throw new Error(`KR1 updated progress should be 50%, got ${updatedKr1.progress}%`);

    // Verify Objective Rollup after update
    // KR1 is 50%, KR2 is 25%. Average should be 37.5%.
    console.log('\nVerifying objective progress rollup after update...');
    data = await getObjective(testObjectiveId);
    console.log(`Objective progress rollup: ${data.objective.progress}% (Expected: 37.5%)`);
    if (data.objective.progress !== 37.5) {
      throw new Error(`Objective rollup progress should be 37.5%, got ${data.objective.progress}%`);
    }

    // 4.5. Verify history logging
    console.log('\nVerifying Key Result history query...');
    const krHistory = await getKeyResultHistory(kr1.id);
    console.log(`✅ KR1 History entries: ${krHistory.length} (Expected: 1)`);
    if (krHistory.length !== 1) throw new Error(`Expected 1 history entry, got ${krHistory.length}`);
    console.log(`History entry note: "${krHistory[0].note}" (Expected: "Completed the mid-quarter training cohort")`);
    if (krHistory[0].note !== 'Completed the mid-quarter training cohort') {
      throw new Error(`Expected note "Completed the mid-quarter training cohort", got "${krHistory[0].note}"`);
    }

    console.log('\nVerifying Objective history query...');
    const objHistory = await getObjectiveHistory(testObjectiveId);
    console.log(`✅ Objective History entries: ${objHistory.length} (Expected: 1)`);
    if (objHistory.length !== 1) throw new Error(`Expected 1 history entry, got ${objHistory.length}`);

    // 5. Query objectives list
    console.log('\nListing objectives for engineering...');
    const objectives = await listObjectives({ department: 'engineering', quarter: '2026-Q2' });
    console.log(`✅ Objectives found: ${objectives.length} (Expected: >= 1)`);
    if (objectives.length === 0) throw new Error('List objectives returned empty list');

    // 6. Cleanup (delete objective and verify cascade)
    console.log('\nCleaning up test data...');
    await deleteObjective(testObjectiveId);
    console.log('✅ Test objective deleted.');

    // Verify it is gone
    try {
      await getObjective(testObjectiveId);
      throw new Error('Objective should have been deleted, but was found');
    } catch (e: any) {
      if (e.message.includes('not found')) {
        console.log('✅ Objective deletion verified (not found).');
      } else {
        throw e;
      }
    }

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    // Cleanup if possible
    if (testObjectiveId) {
      try {
        await deleteObjective(testObjectiveId);
        console.log('Cleanup: Deleted test objective.');
      } catch (_) {}
    }
    process.exit(1);
  }
}

runTests();
