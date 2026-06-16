import { Department, OKRStatus, KeyResultType } from './types.js';
import * as db from './db.js';

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
