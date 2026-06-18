export type Department = 'product' | 'project-management' | 'sales' | 'engineering' | 'executive';

export type OKRStatus = 'on-track' | 'at-risk' | 'behind' | 'achieved';

export type KeyResultType = 'number' | 'percentage' | 'boolean' | 'currency';

export interface Objective {
  id: string;
  title: string;
  description: string;
  department: Department;
  quarter: string; // e.g. "2026-Q2"
  owner: string;
  status: OKRStatus;
  progress: number; // 0 to 100
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  description: string;
  type: KeyResultType;
  startValue: number;
  targetValue: number;
  currentValue: number;
  progress: number; // 0 to 100
  owner: string;
  source: string; // e.g. "manual", "hubspot", "jira"
  updatedAt: Date;
  connectionIds?: string[];
  combinationStrategy?: 'sum' | 'average' | 'min' | 'max';
  connections?: KRConnection[];
}

export interface ProgressUpdate {
  id: string;
  keyResultId: string;
  objectiveId: string;
  value: number;
  note: string;
  updatedBy: string;
  timestamp: Date;
}

export interface Integration {
  id: string;
  type: 'hubspot' | 'clickup' | 'productboard' | 'trello';
  name: string;
  credentials: {
    apiKey?: string;
    accessToken?: string;
    clientId?: string;
    clientSecret?: string;
    workspaceId?: string;
    apiUrl?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface KRConnection {
  id: string;
  keyResultId: string;
  integrationId: string;
  config: {
    pipelineId?: string;
    stageId?: string;
    listId?: string;
    boardId?: string;
    statusFilter?: string;
    statusId?: string;
    metricType?: 'count' | 'sum' | 'percentage';
    metricField?: string;
    [key: string]: any;
  };
  currentValue: number;
  explanation?: string;
  updatedAt: Date;
}

