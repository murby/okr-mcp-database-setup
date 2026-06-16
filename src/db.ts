import { Firestore, Timestamp } from '@google-cloud/firestore';
import dotenv from 'dotenv';
import { Objective, KeyResult, ProgressUpdate, Department, OKRStatus } from './types.js';

dotenv.config();

const projectId = process.env.FIRESTORE_PROJECT_ID || 'project-c0f57fde-e415-4f6a-a26';
const databaseId = process.env.FIRESTORE_DATABASE_ID || 'okrs';

// Initialize Firestore
export const db = new Firestore({
  projectId,
  databaseId,
});

// Helper to convert Firestore Timestamps to JS Dates
const toDate = (val: any): Date => {
  if (val instanceof Timestamp) {
    return val.toDate();
  }
  if (val && typeof val === 'object' && '_seconds' in val) {
    return new Timestamp(val._seconds, val._nanoseconds).toDate();
  }
  return new Date(val);
};

export interface ProjectionData {
  quarterElapsed: number; // e.g. 84.6
  expectedProgress: number; // e.g. 84.6
  deficit: number; // expectedProgress - progress
  alertLevel: 'info' | 'warning' | 'danger' | 'none';
  message: string;
}

export function getProjection(quarter: string, progress: number): ProjectionData | undefined {
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return undefined;

  const year = parseInt(match[1], 10);
  const qNum = parseInt(match[2], 10);

  let startMonth = 0;
  if (qNum === 2) startMonth = 3;
  if (qNum === 3) startMonth = 6;
  if (qNum === 4) startMonth = 9;

  const startDate = new Date(Date.UTC(year, startMonth, 1));
  const endDate = new Date(Date.UTC(year, startMonth + 3, 1));
  const now = new Date();

  const totalMs = endDate.getTime() - startDate.getTime();
  const elapsedMs = now.getTime() - startDate.getTime();

  if (elapsedMs < 0) {
    return {
      quarterElapsed: 0,
      expectedProgress: 0,
      deficit: 0,
      alertLevel: 'none',
      message: `Quarter ${quarter} has not started yet.`,
    };
  }

  if (elapsedMs >= totalMs) {
    const deficit = 100 - progress;
    if (progress === 100) {
      return {
        quarterElapsed: 100,
        expectedProgress: 100,
        deficit: 0,
        alertLevel: 'none',
        message: `Quarter ${quarter} ended. OKR achieved!`,
      };
    }
    return {
      quarterElapsed: 100,
      expectedProgress: 100,
      deficit,
      alertLevel: 'danger',
      message: `Quarter ${quarter} has ended. OKR ended with a ${deficit.toFixed(1)}% deficit.`,
    };
  }

  const quarterElapsed = Math.round((elapsedMs / totalMs) * 1000) / 10;
  const expectedProgress = quarterElapsed;
  const deficit = Math.round((expectedProgress - progress) * 10) / 10;

  let alertLevel: 'info' | 'warning' | 'danger' | 'none' = 'none';
  let message = '';

  if (deficit <= 0) {
    alertLevel = 'none';
    message = `On track. Ahead of target progress by ${Math.abs(deficit).toFixed(1)}%.`;
  } else if (deficit <= 10) {
    alertLevel = 'info';
    message = `On track. Slightly behind target progress by ${deficit.toFixed(1)}%.`;
  } else if (deficit <= 25) {
    alertLevel = 'warning';
    message = `At risk. Behind target progress by ${deficit.toFixed(1)}%.`;
  } else {
    alertLevel = 'danger';
    message = `Behind schedule. Significant deficit of ${deficit.toFixed(1)}% against expected progress.`;
  }

  return {
    quarterElapsed,
    expectedProgress,
    deficit,
    alertLevel,
    message,
  };
}

export function getCalculatedStatus(quarter: string, progress: number, fallback: OKRStatus): OKRStatus {
  if (progress === 100) return 'achieved';
  const projection = getProjection(quarter, progress);
  if (!projection) return fallback;

  if (projection.alertLevel === 'none' || projection.alertLevel === 'info') {
    return 'on-track';
  } else if (projection.alertLevel === 'warning') {
    return 'at-risk';
  } else {
    return 'behind';
  }
}

// Convert Firestore document data to Objective interface
const docToObjective = (doc: any): Objective => {
  const data = doc.data();
  const rawStatus = data.status as OKRStatus;
  const progress = data.progress || 0;
  const calculatedStatus = getCalculatedStatus(data.quarter, progress, rawStatus);

  return {
    id: doc.id,
    title: data.title,
    description: data.description,
    department: data.department as Department,
    quarter: data.quarter,
    owner: data.owner,
    status: calculatedStatus,
    progress,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
};

// Convert Firestore document data to KeyResult interface
const docToKeyResult = (doc: any): KeyResult => {
  const data = doc.data();
  return {
    id: doc.id,
    objectiveId: data.objectiveId,
    title: data.title,
    description: data.description,
    type: data.type,
    startValue: data.startValue,
    targetValue: data.targetValue,
    currentValue: data.currentValue,
    progress: data.progress || 0,
    owner: data.owner,
    source: data.source || 'manual',
    updatedAt: toDate(data.updatedAt),
  };
};

// Retrieve all objectives with optional filters
export async function listObjectives(filters: {
  department?: Department;
  quarter?: string;
  owner?: string;
} = {}): Promise<Objective[]> {
  let query: FirebaseFirestore.Query = db.collection('objectives');

  if (filters.department) {
    query = query.where('department', '==', filters.department);
  }
  if (filters.quarter) {
    query = query.where('quarter', '==', filters.quarter);
  }
  if (filters.owner) {
    query = query.where('owner', '==', filters.owner);
  }

  const snapshot = await query.get();
  const objectives = snapshot.docs.map(docToObjective);

  // Sort in memory to avoid requiring complex composite indexes
  return objectives.sort((a, b) => {
    const qCompare = (b.quarter || '').localeCompare(a.quarter || '');
    if (qCompare !== 0) return qCompare;
    return (a.department || '').localeCompare(b.department || '');
  });
}

// Retrieve a single objective and its key results
export async function getObjective(id: string): Promise<{
  objective: Objective;
  keyResults: KeyResult[];
  projection?: ProjectionData;
}> {
  const objRef = db.collection('objectives').doc(id);
  const objSnap = await objRef.get();

  if (!objSnap.exists) {
    throw new Error(`Objective with ID ${id} not found.`);
  }

  const objective = docToObjective(objSnap);

  const krSnap = await db.collection('key_results')
    .where('objectiveId', '==', id)
    .get();

  const keyResults = krSnap.docs.map(docToKeyResult);
  const projection = getProjection(objective.quarter, objective.progress);

  return { objective, keyResults, projection };
}

// Create a new objective
export async function createObjective(data: {
  title: string;
  description: string;
  department: Department;
  quarter: string;
  owner: string;
  status?: OKRStatus;
}): Promise<Objective> {
  const objRef = db.collection('objectives').doc();
  const now = new Date();
  
  const newObjective: Omit<Objective, 'id'> = {
    title: data.title,
    description: data.description,
    department: data.department,
    quarter: data.quarter,
    owner: data.owner,
    status: data.status || 'on-track',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  await objRef.set(newObjective);

  return {
    id: objRef.id,
    ...newObjective,
  };
}

// Create a new key result and trigger rollup
export async function createKeyResult(data: {
  objectiveId: string;
  title: string;
  description: string;
  type: KeyResult['type'];
  startValue: number;
  targetValue: number;
  currentValue: number;
  owner: string;
  source?: string;
}): Promise<KeyResult> {
  // Verify objective exists
  const objRef = db.collection('objectives').doc(data.objectiveId);
  const objSnap = await objRef.get();
  if (!objSnap.exists) {
    throw new Error(`Cannot create key result: Objective with ID ${data.objectiveId} does not exist.`);
  }

  const krRef = db.collection('key_results').doc();
  const now = new Date();

  // Calculate progress percentage
  const range = data.targetValue - data.startValue;
  let progress = 0;
  if (range !== 0) {
    progress = ((data.currentValue - data.startValue) / range) * 100;
    progress = Math.max(0, Math.min(100, Math.round(progress * 100) / 100)); // clamp to 0-100, round to 2 decimals
  } else {
    progress = data.currentValue >= data.targetValue ? 100 : 0;
  }

  const newKR: Omit<KeyResult, 'id'> = {
    objectiveId: data.objectiveId,
    title: data.title,
    description: data.description,
    type: data.type,
    startValue: data.startValue,
    targetValue: data.targetValue,
    currentValue: data.currentValue,
    progress,
    owner: data.owner,
    source: data.source || 'manual',
    updatedAt: now,
  };

  await krRef.set(newKR);

  const keyResult = {
    id: krRef.id,
    ...newKR,
  };

  // Roll up to parent objective
  await rollupObjectiveProgress(data.objectiveId);

  return keyResult;
}

// Update progress of a key result and create a history log entry
export async function updateKeyResultProgress(
  keyResultId: string,
  newValue: number,
  note: string,
  updatedBy: string
): Promise<KeyResult> {
  const krRef = db.collection('key_results').doc(keyResultId);
  
  const result = await db.runTransaction(async (transaction) => {
    const krSnap = await transaction.get(krRef);
    if (!krSnap.exists) {
      throw new Error(`Key Result with ID ${keyResultId} not found.`);
    }

    const krData = krSnap.data() as Omit<KeyResult, 'id'>;
    const now = new Date();

    // Calculate new progress percentage
    const range = krData.targetValue - krData.startValue;
    let progress = 0;
    if (range !== 0) {
      progress = ((newValue - krData.startValue) / range) * 100;
      progress = Math.max(0, Math.min(100, Math.round(progress * 100) / 100));
    } else {
      progress = newValue >= krData.targetValue ? 100 : 0;
    }

    // Update Key Result
    transaction.update(krRef, {
      currentValue: newValue,
      progress,
      updatedAt: now,
    });

    // Log update history entry
    const updateRef = db.collection('progress_updates').doc();
    const updateLog: Omit<ProgressUpdate, 'id'> = {
      keyResultId,
      objectiveId: krData.objectiveId,
      value: newValue,
      note,
      updatedBy,
      timestamp: now,
    };
    transaction.set(updateRef, updateLog);

    return {
      id: keyResultId,
      ...krData,
      currentValue: newValue,
      progress,
      updatedAt: now,
    };
  });

  // Roll up to parent objective
  await rollupObjectiveProgress(result.objectiveId);

  return result;
}

// Recalculate and update the progress of an Objective based on its Key Results
export async function rollupObjectiveProgress(objectiveId: string): Promise<void> {
  const krSnap = await db.collection('key_results')
    .where('objectiveId', '==', objectiveId)
    .get();

  const krs = krSnap.docs.map(doc => doc.data() as KeyResult);

  let averageProgress = 0;
  if (krs.length > 0) {
    const sum = krs.reduce((acc, kr) => acc + (kr.progress || 0), 0);
    averageProgress = Math.round((sum / krs.length) * 100) / 100;
  }

  const updateData: any = {
    progress: averageProgress,
    updatedAt: new Date(),
  };

  // If 100% achieved, auto-mark objective status as 'achieved'
  if (averageProgress === 100) {
    updateData.status = 'achieved';
  }

  await db.collection('objectives').doc(objectiveId).update(updateData);
}

// Retrieve list of unique quarters
export async function listQuarters(): Promise<string[]> {
  const snapshot = await db.collection('objectives').select('quarter').get();
  const quarters = new Set<string>();
  snapshot.docs.forEach(doc => {
    const q = doc.data().quarter;
    if (q) quarters.add(q);
  });
  return Array.from(quarters).sort().reverse();
}

// Delete an objective and its child key results
export async function deleteObjective(id: string): Promise<void> {
  const batch = db.batch();

  // Delete key results
  const krSnap = await db.collection('key_results')
    .where('objectiveId', '==', id)
    .get();
  krSnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  // Delete progress updates
  const updateSnap = await db.collection('progress_updates')
    .where('objectiveId', '==', id)
    .get();
  updateSnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  // Delete the objective
  batch.delete(db.collection('objectives').doc(id));

  await batch.commit();
}

// Convert Firestore document data to ProgressUpdate interface
const docToProgressUpdate = (doc: any): ProgressUpdate => {
  const data = doc.data();
  return {
    id: doc.id,
    keyResultId: data.keyResultId,
    objectiveId: data.objectiveId,
    value: data.value,
    note: data.note || '',
    updatedBy: data.updatedBy || '',
    timestamp: toDate(data.timestamp),
  };
};

// Retrieve progress update history for a key result, sorted chronologically in memory
export async function getKeyResultHistory(keyResultId: string): Promise<ProgressUpdate[]> {
  const snapshot = await db.collection('progress_updates')
    .where('keyResultId', '==', keyResultId)
    .get();

  const updates = snapshot.docs.map(docToProgressUpdate);
  return updates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

// Retrieve progress update history for an objective (all its key results), sorted chronologically in memory
export async function getObjectiveHistory(objectiveId: string): Promise<ProgressUpdate[]> {
  const snapshot = await db.collection('progress_updates')
    .where('objectiveId', '==', objectiveId)
    .get();

  const updates = snapshot.docs.map(docToProgressUpdate);
  return updates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

