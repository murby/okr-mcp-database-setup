import { Department, OKRStatus, KeyResultType } from './types.js';
import * as db from './db.js';
import { syncKeyResult } from './sync.js';

// Define the schemas for our MCP tools
export const TOOLS = [
  {
    name: 'list_objectives',
    description: 'List all OKR Objectives, optionally filtered by department, quarter, or owner.',
    inputSchema: {
      type: 'object',
      properties: {
        department: {
          type: 'string',
          enum: ['product', 'project-management', 'sales', 'engineering', 'executive'],
          description: 'Filter objectives by department',
        },
        quarter: {
          type: 'string',
          description: 'Filter objectives by quarter (e.g. "2026-Q2")',
        },
        owner: {
          type: 'string',
          description: 'Filter objectives by owner (name or email)',
        },
      },
    },
  },
  {
    name: 'get_objective',
    description: 'Get details of a single objective, including all of its associated key results.',
    inputSchema: {
      type: 'object',
      properties: {
        objectiveId: {
          type: 'string',
          description: 'The unique ID of the objective to retrieve',
        },
      },
      required: ['objectiveId'],
    },
  },
  {
    name: 'create_objective',
    description: 'Create a new OKR Objective.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The objective title (e.g. "Accelerate adoption of Devpost for Teams in Tier 1 accounts")',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what the objective entails',
        },
        department: {
          type: 'string',
          enum: ['product', 'project-management', 'sales', 'engineering', 'executive'],
          description: 'The department owning this objective',
        },
        quarter: {
          type: 'string',
          description: 'The target quarter (e.g. "2026-Q2")',
        },
        owner: {
          type: 'string',
          description: 'The name or email of the objective owner',
        },
        status: {
          type: 'string',
          enum: ['on-track', 'at-risk', 'behind', 'achieved'],
          description: 'Initial status of the objective (defaults to "on-track")',
        },
      },
      required: ['title', 'description', 'department', 'quarter', 'owner'],
    },
  },
  {
    name: 'create_key_result',
    description: 'Create a new Key Result linked to an Objective. Automatically rolls up progress to the parent objective.',
    inputSchema: {
      type: 'object',
      properties: {
        objectiveId: {
          type: 'string',
          description: 'The ID of the parent objective',
        },
        title: {
          type: 'string',
          description: 'The key result title (e.g. "Increase Q2 sales pipeline by $500k")',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the key result measurement',
        },
        type: {
          type: 'string',
          enum: ['number', 'percentage', 'boolean', 'currency'],
          description: 'The type of metric',
        },
        startValue: {
          type: 'number',
          description: 'The starting value of the key result metric',
        },
        targetValue: {
          type: 'number',
          description: 'The target value of the key result metric',
        },
        currentValue: {
          type: 'number',
          description: 'The current value of the key result metric',
        },
        owner: {
          type: 'string',
          description: 'The name or email of the key result owner',
        },
        source: {
          type: 'string',
          description: 'The origin of the data updates (e.g., "manual", "hubspot", "jira", "github"). Defaults to "manual".',
        },
      },
      required: ['objectiveId', 'title', 'description', 'type', 'startValue', 'targetValue', 'currentValue', 'owner'],
    },
  },
  {
    name: 'update_key_result_progress',
    description: 'Update the current value of a Key Result, log the progress update to history, and recalculate parent objective progress.',
    inputSchema: {
      type: 'object',
      properties: {
        keyResultId: {
          type: 'string',
          description: 'The ID of the key result to update',
        },
        value: {
          type: 'number',
          description: 'The new current value of the metric',
        },
        note: {
          type: 'string',
          description: 'Context or a comment explaining this update',
        },
        updatedBy: {
          type: 'string',
          description: 'The name or email of the person or system updating the key result',
        },
      },
      required: ['keyResultId', 'value', 'note', 'updatedBy'],
    },
  },
  {
    name: 'delete_objective',
    description: 'Delete an Objective and all of its associated key results and history logs.',
    inputSchema: {
      type: 'object',
      properties: {
        objectiveId: {
          type: 'string',
          description: 'The ID of the objective to delete',
        },
      },
      required: ['objectiveId'],
    },
  },
  {
    name: 'list_quarters',
    description: 'List all unique quarters represented in the OKR database.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_departments',
    description: 'List all valid departments.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_key_result_history',
    description: 'Retrieve the chronological history of progress updates and notes for a specific Key Result.',
    inputSchema: {
      type: 'object',
      properties: {
        keyResultId: {
          type: 'string',
          description: 'The unique ID of the key result',
        },
      },
      required: ['keyResultId'],
    },
  },
  {
    name: 'get_objective_history',
    description: 'Retrieve the chronological history of all progress updates and notes for all Key Results under an Objective.',
    inputSchema: {
      type: 'object',
      properties: {
        objectiveId: {
          type: 'string',
          description: 'The unique ID of the objective',
        },
      },
      required: ['objectiveId'],
    },
  },
  {
    name: 'list_integrations',
    description: 'List all configured data source integrations.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'configure_integration',
    description: 'Create or update a data source integration (Hubspot, ClickUp, Productboard, Trello).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique identifier for this integration (e.g. "hubspot-prod")',
        },
        type: {
          type: 'string',
          enum: ['hubspot', 'clickup', 'productboard', 'trello'],
          description: 'The type of integration',
        },
        name: {
          type: 'string',
          description: 'User-friendly display name',
        },
        credentials: {
          type: 'object',
          description: 'Credentials required for the API (e.g. apiKey, accessToken, workspaceId)',
          properties: {
            apiKey: { type: 'string' },
            accessToken: { type: 'string' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            workspaceId: { type: 'string' },
          },
        },
      },
      required: ['id', 'type', 'name', 'credentials'],
    },
  },
  {
    name: 'link_key_result_to_integration',
    description: 'Link a Key Result to an integration with specific query configurations.',
    inputSchema: {
      type: 'object',
      properties: {
        keyResultId: {
          type: 'string',
          description: 'The ID of the target Key Result',
        },
        integrationId: {
          type: 'string',
          description: 'The ID of the integration configuration to use',
        },
        config: {
          type: 'object',
          description: 'API-specific query parameters (e.g. listId, boardId, stageId)',
          properties: {
            pipelineId: { type: 'string' },
            stageId: { type: 'string' },
            listId: { type: 'string' },
            boardId: { type: 'string' },
            statusFilter: { type: 'string' },
            statusId: { type: 'string' },
            metricType: { type: 'string', enum: ['count', 'sum', 'percentage'] },
            metricField: { type: 'string' },
          },
        },
        combinationStrategy: {
          type: 'string',
          enum: ['sum', 'average', 'min', 'max'],
          description: 'Strategy for combining multiple data sources for this Key Result (default "sum")',
        },
      },
      required: ['keyResultId', 'integrationId', 'config'],
    },
  },
  {
    name: 'sync_key_result_data',
    description: 'Synchronize connected data sources for a Key Result and update its progress.',
    inputSchema: {
      type: 'object',
      properties: {
        keyResultId: {
          type: 'string',
          description: 'The ID of the Key Result to sync',
        },
        updatedBy: {
          type: 'string',
          description: 'The user or system triggering the sync',
        },
      },
      required: ['keyResultId'],
    },
  },
];

// Handles tool calls and maps to db operations
export async function handleToolCall(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'list_objectives': {
        const objectives = await db.listObjectives({
          department: args.department as Department | undefined,
          quarter: args.quarter,
          owner: args.owner,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(objectives, null, 2),
            },
          ],
        };
      }

      case 'get_objective': {
        const result = await db.getObjective(args.objectiveId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'create_objective': {
        const objective = await db.createObjective({
          title: args.title,
          description: args.description,
          department: args.department as Department,
          quarter: args.quarter,
          owner: args.owner,
          status: args.status as OKRStatus | undefined,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Objective created successfully:\n${JSON.stringify(objective, null, 2)}`,
            },
          ],
        };
      }

      case 'create_key_result': {
        const keyResult = await db.createKeyResult({
          objectiveId: args.objectiveId,
          title: args.title,
          description: args.description,
          type: args.type as KeyResultType,
          startValue: args.startValue,
          targetValue: args.targetValue,
          currentValue: args.currentValue,
          owner: args.owner,
          source: args.source,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Key Result created successfully and progress rolled up to objective:\n${JSON.stringify(keyResult, null, 2)}`,
            },
          ],
        };
      }

      case 'update_key_result_progress': {
        const keyResult = await db.updateKeyResultProgress(
          args.keyResultId,
          args.value,
          args.note,
          args.updatedBy
        );
        return {
          content: [
            {
              type: 'text',
              text: `Key Result progress updated successfully and progress rolled up to objective:\n${JSON.stringify(keyResult, null, 2)}`,
            },
          ],
        };
      }

      case 'delete_objective': {
        await db.deleteObjective(args.objectiveId);
        return {
          content: [
            {
              type: 'text',
              text: `Objective ${args.objectiveId} and all associated key results and history logs deleted successfully.`,
            },
          ],
        };
      }

      case 'list_quarters': {
        const quarters = await db.listQuarters();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(quarters, null, 2),
            },
          ],
        };
      }

      case 'list_departments': {
        const departments: Department[] = ['product', 'project-management', 'sales', 'engineering', 'executive'];
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(departments, null, 2),
            },
          ],
        };
      }

      case 'get_key_result_history': {
        const history = await db.getKeyResultHistory(args.keyResultId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(history, null, 2),
            },
          ],
        };
      }

      case 'get_objective_history': {
        const history = await db.getObjectiveHistory(args.objectiveId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(history, null, 2),
            },
          ],
        };
      }

      case 'list_integrations': {
        const integrations = await db.listIntegrations();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(integrations, null, 2),
            },
          ],
        };
      }

      case 'configure_integration': {
        const integration = await db.saveIntegration({
          id: args.id,
          type: args.type,
          name: args.name,
          credentials: args.credentials,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Integration configured successfully:\n${JSON.stringify(integration, null, 2)}`,
            },
          ],
        };
      }

      case 'link_key_result_to_integration': {
        // Create the connection doc
        const connection = await db.saveKRConnection({
          keyResultId: args.keyResultId,
          integrationId: args.integrationId,
          config: args.config,
        });
        // Update the key result's combination strategy if provided
        if (args.combinationStrategy) {
          const krRef = db.db.collection('key_results').doc(args.keyResultId);
          await krRef.update({
            combinationStrategy: args.combinationStrategy,
            source: 'automated',
            updatedAt: new Date(),
          });
        } else {
          const krRef = db.db.collection('key_results').doc(args.keyResultId);
          await krRef.update({
            source: 'automated',
            updatedAt: new Date(),
          });
        }
        return {
          content: [
            {
              type: 'text',
              text: `Key Result linked to integration successfully:\n${JSON.stringify(connection, null, 2)}`,
            },
          ],
        };
      }

      case 'sync_key_result_data': {
        const updatedKR = await syncKeyResult(args.keyResultId, args.updatedBy || 'MCP Tool Sync');
        return {
          content: [
            {
              type: 'text',
              text: `Key Result sync complete:\n${JSON.stringify(updatedKR, null, 2)}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing tool '${name}': ${error.message || error}`,
        },
      ],
    };
  }
}
