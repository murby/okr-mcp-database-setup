import * as db from './db.js';
import { KRConnection, KeyResult, Integration } from './types.js';

// Helper to determine if an integration is running in sandbox/mock mode
function isSandbox(integration: Integration): boolean {
  const key = integration.credentials.apiKey || integration.credentials.accessToken || '';
  return !key || key.toLowerCase() === 'sandbox' || key.toLowerCase().startsWith('mock-');
}

// Fetch metric values from APIs or return sandbox values
export async function fetchConnectionValue(conn: KRConnection, integration: Integration): Promise<number> {
  const sandbox = isSandbox(integration);

  switch (integration.type) {
    case 'hubspot':
      return sandbox ? getHubSpotSandbox(conn) : getHubSpotReal(conn, integration);
    case 'clickup':
      return sandbox ? getClickUpSandbox(conn) : getClickUpReal(conn, integration);
    case 'productboard':
      return sandbox ? getProductboardSandbox(conn) : getProductboardReal(conn, integration);
    case 'trello':
      return sandbox ? getTrelloSandbox(conn) : getTrelloReal(conn, integration);
    default:
      throw new Error(`Unsupported integration type: ${integration.type}`);
  }
}

// HubSpot Sandbox Generator
function getHubSpotSandbox(conn: KRConnection): number {
  const metricType = conn.config.metricType || 'sum';
  const stage = conn.config.stageId || 'closedwon';

  // Seed changes over time based on minutes elapsed
  const minuteCycle = Math.floor(Date.now() / 60000);
  
  if (metricType === 'sum') {
    // Return mock revenue/value of deals
    if (stage === 'closedwon') {
      return 150000 + (minuteCycle % 10) * 15000; // $150k - $285k
    } else {
      return 50000 + (minuteCycle % 10) * 8000; // $50k - $122k
    }
  } else {
    // Return count of deals
    return 12 + (minuteCycle % 5);
  }
}

// HubSpot Real API Fetcher
async function getHubSpotReal(conn: KRConnection, integration: Integration): Promise<number> {
  const token = integration.credentials.accessToken || integration.credentials.apiKey;
  const metricType = conn.config.metricType || 'sum';
  const metricField = conn.config.metricField || 'amount';

  // We search for deals using the Search API
  const url = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  const filters: any[] = [];

  if (conn.config.stageId) {
    filters.push({
      propertyName: 'dealstage',
      operator: 'EQ',
      value: conn.config.stageId,
    });
  }

  if (conn.config.pipelineId) {
    filters.push({
      propertyName: 'pipeline',
      operator: 'EQ',
      value: conn.config.pipelineId,
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: filters.length > 0 ? [{ filters }] : [],
      properties: [metricField, 'dealstage'],
      limit: 100,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API responded with status ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();
  const deals = data.results || [];

  if (metricType === 'sum') {
    return deals.reduce((sum: number, deal: any) => {
      const val = parseFloat(deal.properties[metricField]);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  } else {
    return deals.length;
  }
}

// ClickUp Sandbox Generator
function getClickUpSandbox(conn: KRConnection): number {
  const metricType = conn.config.metricType || 'percentage';
  const minuteCycle = Math.floor(Date.now() / 60000);

  const closedTasks = 18 + (minuteCycle % 6); // 18 - 23 tasks closed
  const totalTasks = 25;

  if (metricType === 'percentage') {
    return Math.round((closedTasks / totalTasks) * 100);
  } else {
    return closedTasks;
  }
}

// ClickUp Real API Fetcher
async function getClickUpReal(conn: KRConnection, integration: Integration): Promise<number> {
  const token = integration.credentials.apiKey || integration.credentials.accessToken;
  const listId = conn.config.listId;
  const statusFilter = conn.config.statusFilter || 'closed';
  const metricType = conn.config.metricType || 'percentage';

  if (!listId) {
    throw new Error('ClickUp connection config is missing listId');
  }

  const url = `https://api.clickup.com/api/v2/list/${listId}/task?subtasks=true`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': token || '',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClickUp API responded with status ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();
  const tasks = data.tasks || [];
  
  const filteredTasks = tasks.filter((t: any) => {
    const taskStatus = (t.status?.status || '').toLowerCase();
    return taskStatus === statusFilter.toLowerCase();
  });

  if (metricType === 'percentage') {
    if (tasks.length === 0) return 0;
    return Math.round((filteredTasks.length / tasks.length) * 100);
  } else {
    return filteredTasks.length;
  }
}

// Productboard Sandbox Generator
function getProductboardSandbox(conn: KRConnection): number {
  const minuteCycle = Math.floor(Date.now() / 120000);
  return 8 + (minuteCycle % 6); // 8 - 13 features in target status
}

// Productboard Real API Fetcher
async function getProductboardReal(conn: KRConnection, integration: Integration): Promise<number> {
  const token = integration.credentials.apiKey || integration.credentials.accessToken;
  const statusId = conn.config.statusId;

  const url = 'https://api.productboard.com/features';
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Version': '1',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Productboard API responded with status ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();
  const features = data.data || [];

  if (statusId) {
    const filtered = features.filter((f: any) => f.status?.id === statusId || f.status?.name === statusId);
    return filtered.length;
  }

  return features.length;
}

// Trello Sandbox Generator
function getTrelloSandbox(conn: KRConnection): number {
  const minuteCycle = Math.floor(Date.now() / 90000);
  return 5 + (minuteCycle % 7); // 5 - 11 cards
}

// Trello Real API Fetcher
async function getTrelloReal(conn: KRConnection, integration: Integration): Promise<number> {
  const apiKey = integration.credentials.apiKey;
  const token = integration.credentials.accessToken || integration.credentials.clientSecret;
  const listId = conn.config.listId;

  if (!listId) {
    throw new Error('Trello connection config is missing listId');
  }
  if (!apiKey || !token) {
    throw new Error('Trello integration is missing apiKey or token');
  }

  const url = `https://api.trello.com/1/lists/${listId}/cards?key=${apiKey}&token=${token}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Trello API responded with status ${response.status}: ${errorText}`);
  }

  const cards: any = await response.json();
  return Array.isArray(cards) ? cards.length : 0;
}

// Helper to combine connection values based on strategy
export function combineValues(values: number[], strategy: 'sum' | 'average' | 'min' | 'max'): number {
  if (values.length === 0) return 0;
  switch (strategy) {
    case 'sum':
      return values.reduce((sum, val) => sum + val, 0);
    case 'average':
      return values.reduce((sum, val) => sum + val, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return values.reduce((sum, val) => sum + val, 0);
  }
}

// Synchronize all connected data sources for a Key Result, roll up progress, and write history log
export async function syncKeyResult(keyResultId: string, updatedBy: string = 'System Sync'): Promise<KeyResult> {
  // 1. Get Key Result from Firestore
  const krSnap = await db.db.collection('key_results').doc(keyResultId).get();
  if (!krSnap.exists) {
    throw new Error(`Key Result with ID ${keyResultId} not found.`);
  }
  const kr = krSnap.data() as KeyResult;
  kr.id = krSnap.id;

  // 2. Fetch all connections for this Key Result
  const connections = await db.listKRConnections(keyResultId);
  if (connections.length === 0) {
    throw new Error(`No connected data sources for Key Result ${keyResultId}.`);
  }

  const values: number[] = [];
  const logs: string[] = [];

  // 3. Query each data source connection
  for (const conn of connections) {
    const integration = await db.getIntegration(conn.integrationId);
    if (!integration) {
      logs.push(`[Error] Connection ${conn.id}: Integration ${conn.integrationId} not found.`);
      continue;
    }

    try {
      const val = await fetchConnectionValue(conn, integration);
      values.push(val);
      logs.push(`${integration.name} (${integration.type}): ${val}`);

      // Save the latest currentValue to the connection doc
      await db.db.collection('kr_connections').doc(conn.id).update({
        currentValue: val,
        updatedAt: new Date(),
      });
    } catch (error: any) {
      console.error(`Sync error on connection ${conn.id}:`, error);
      logs.push(`[Error] ${integration.name}: ${error.message || error}`);
    }
  }

  if (values.length === 0) {
    throw new Error(`Failed to sync from all connected data sources: ${logs.join('; ')}`);
  }

  // 4. Combine the values using Key Result's combination strategy
  const strategy = kr.combinationStrategy || 'sum';
  const combinedValue = combineValues(values, strategy);

  // 5. Generate progress update note
  const syncNote = `Sync run successful. Individual sources: ${logs.join('; ')}. Strategy: ${strategy.toUpperCase()}.`;

  // 6. Update key result value and trigger parent objective rollup via standard transaction
  const updatedKR = await db.updateKeyResultProgress(
    keyResultId,
    combinedValue,
    syncNote,
    updatedBy
  );

  return updatedKR;
}
