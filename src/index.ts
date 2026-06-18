import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, handleToolCall } from './tools.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { syncKeyResult, fetchConnectionValue } from './sync.js';
import { KRConnection } from './types.js';

// Initialize the MCP Server
const server = new Server(
  {
    name: 'okr-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register the tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Register the tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await handleToolCall(name, args);
});

// Setup Express Portal App
const app = express();
app.use(cors());
app.use(express.json());

// API Routes

// 1. Fetch objectives with details and key results
app.get('/api/objectives', async (req, res) => {
  try {
    const objectives = await db.listObjectives();
    const result = [];
    for (const obj of objectives) {
      const details = await db.getObjective(obj.id);
      result.push({
        ...obj,
        keyResults: details.keyResults,
        projection: details.projection,
      });
    }
    res.json(result);
  } catch (err: any) {
    console.error('Error listing objectives:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Create new objective
app.post('/api/objectives', async (req, res) => {
  try {
    const { title, description, department, quarter, owner, status } = req.body;
    const obj = await db.createObjective({ title, description, department, quarter, owner, status });
    res.json(obj);
  } catch (err: any) {
    console.error('Error creating objective:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Update objective
app.put('/api/objectives/:id', async (req, res) => {
  try {
    const obj = await db.updateObjective(req.params.id, req.body);
    res.json(obj);
  } catch (err: any) {
    console.error('Error updating objective:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Delete objective
app.delete('/api/objectives/:id', async (req, res) => {
  try {
    await db.deleteObjective(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting objective:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 2. List all integrations
app.get('/api/integrations', async (req, res) => {
  try {
    const integrations = await db.listIntegrations();
    res.json(integrations);
  } catch (err: any) {
    console.error('Error listing integrations:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 3. Save/configure integration
app.post('/api/integrations', async (req, res) => {
  try {
    const { id, type, name, credentials } = req.body;
    const result = await db.saveIntegration({ id, type, name, credentials });
    res.json(result);
  } catch (err: any) {
    console.error('Error saving integration:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 4. Delete integration
app.delete('/api/integrations/:id', async (req, res) => {
  try {
    await db.deleteIntegration(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting integration:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 5. List connections for key result
app.get('/api/key-results/:krId/connections', async (req, res) => {
  try {
    const conns = await db.listKRConnections(req.params.krId);
    res.json(conns);
  } catch (err: any) {
    console.error('Error listing connections:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Create key result
app.post('/api/key-results', async (req, res) => {
  try {
    const { objectiveId, title, description, type, startValue, targetValue, currentValue, owner, source, connectionIds, combinationStrategy } = req.body;
    const kr = await db.createKeyResult({ objectiveId, title, description, type, startValue, targetValue, currentValue, owner, source, connectionIds, combinationStrategy });
    res.json(kr);
  } catch (err: any) {
    console.error('Error creating key result:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Update key result
app.put('/api/key-results/:id', async (req, res) => {
  try {
    const kr = await db.updateKeyResult(req.params.id, req.body);
    res.json(kr);
  } catch (err: any) {
    console.error('Error updating key result:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// Delete key result
app.delete('/api/key-results/:id', async (req, res) => {
  try {
    const objectiveId = await db.deleteKeyResult(req.params.id);
    res.json({ success: true, objectiveId });
  } catch (err: any) {
    console.error('Error deleting key result:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 6. Save connection
app.post('/api/connections', async (req, res) => {
  try {
    const { id, keyResultId, integrationId, config, combinationStrategy, explanation } = req.body;
    const connection = await db.saveKRConnection({ id, keyResultId, integrationId, config, explanation });
    
    // Update key result source and combination strategy
    const krRef = db.db.collection('key_results').doc(keyResultId);
    const updateData: any = {
      source: 'automated',
      updatedAt: new Date(),
    };
    if (combinationStrategy) {
      updateData.combinationStrategy = combinationStrategy;
    }
    await krRef.update(updateData);

    res.json(connection);
  } catch (err: any) {
    console.error('Error saving connection:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 7. Delete connection
app.delete('/api/connections/:id', async (req, res) => {
  try {
    await db.deleteKRConnection(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting connection:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 8. Manual sync key result
app.post('/api/key-results/:krId/sync', async (req, res) => {
  try {
    const updatedKR = await syncKeyResult(req.params.krId, req.body.updatedBy || 'Web Portal Sync');
    res.json(updatedKR);
  } catch (err: any) {
    console.error('Error syncing key result:', err);
    res.status(500).json({ error: err.message || err });
  }
});

// 9. Test connection/integration
app.post('/api/integrations/:id/test', async (req, res) => {
  try {
    const integration = await db.getIntegration(req.params.id);
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    const dummyConn: KRConnection = {
      id: 'test-connection',
      keyResultId: 'test-kr',
      integrationId: integration.id,
      config: req.body.config || {},
      currentValue: 0,
      updatedAt: new Date(),
    };
    const val = await fetchConnectionValue(dummyConn, integration);
    res.json({ success: true, value: val });
  } catch (err: any) {
    console.error('Error testing integration:', err);
    res.status(400).json({ success: false, error: err.message || err });
  }
});

// Serve static portal UI files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
app.use(express.static(path.join(rootDir, 'public')));

// Run the server over stdio transport and HTTP
async function main() {
  // Connect stdio transport for Claude Desktop
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OKR MCP Server successfully started and running on stdio.');

  // Start Express server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.error(`OKR Configuration Portal active at http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error('Fatal error in OKR MCP Server:', error);
  process.exit(1);
});

