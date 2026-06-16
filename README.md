# OKR MCP Server

An Model Context Protocol (MCP) server that provides a secure, shared source of truth for Objectives and Key Results (OKRs) backed by Google Cloud Firestore. It is designed to integrate seamlessly with Claude Desktop and other MCP-compatible AI interfaces.

This project is built to support quarterly business reviews and progress tracking across multiple departments (Product, Project Management, Sales, Engineering, Executive).

## Features

- **Standardized Schema**: Tracks Objectives, Key Results (metric/percentage/boolean/currency), and Progress Update logs.
- **Automatic Rollups**: Updating a Key Result automatically recalculates and rolls up the parent Objective's overall progress percentage.
- **Secured by Google Workspace**: Uses Google Application Default Credentials (ADC) to ensure that users access the database securely using their own Workspace identity.
- **History Logs**: Every update is written to a transaction-safe ledger, tracking the value, timestamp, owner, and update notes.

---

## Setup & Installation

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **gcloud CLI** (installed and configured on your machine)

### 2. Install Dependencies
Clone the repository and run:
```bash
npm install
```

### 3. Authentication (Google Workspace Auth)
To secure the database without managing static API keys or service account files, this server uses Google Cloud's **Application Default Credentials (ADC)**.

On your local machine, run the following command to authenticate with your Google Workspace account:
```bash
gcloud auth application-default login
```
This stores your personal user credentials locally in a secure location, which the Firestore client library automatically detects and uses when Claude Desktop spawns the server.

*Note: If you wish to run the server in a non-interactive environment or via a shared service account, you can set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of your Service Account JSON file.*

### 4. Firestore Database Setup
Make sure you have a Firestore Native mode database created in your Google Cloud / Firebase project. You can create one via the Firebase CLI:
```bash
npx -y firebase-tools@latest firestore:databases:create okrs --project YOUR_PROJECT_ID --location us-central1
```

---

## Claude Desktop Configuration

To connect this server to Claude Desktop, open your configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server config to the `mcpServers` object:

```json
{
  "mcpServers": {
    "okr-database": {
      "command": "node",
      "args": [
        "/Users/richard/.gemini/antigravity/worktrees/blissful-einstein/okr-mcp-database-setup/dist/index.js"
      ],
      "env": {
        "FIRESTORE_PROJECT_ID": "project-c0f57fde-e415-4f6a-a26",
        "FIRESTORE_DATABASE_ID": "okrs"
      }
    }
  }
}
```

### Development Configuration
If you want to run the server in development mode using `tsx` (so you don't have to rebuild after every change):

```json
{
  "mcpServers": {
    "okr-database-dev": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/Users/richard/.gemini/antigravity/worktrees/blissful-einstein/okr-mcp-database-setup/src/index.ts"
      ],
      "env": {
        "FIRESTORE_PROJECT_ID": "project-c0f57fde-e415-4f6a-a26",
        "FIRESTORE_DATABASE_ID": "okrs"
      }
    }
  }
}
```

---

## MCP Tools

Once connected, the server exposes the following tools to Claude:

### 1. `list_objectives`
List all objectives in the database.
- **Parameters**:
  - `department` (optional string): `product`, `project-management`, `sales`, `engineering`, `executive`
  - `quarter` (optional string): e.g., `2026-Q2`
  - `owner` (optional string): owner's name/email

### 2. `get_objective`
Retrieve details of a specific objective and all of its associated key results.
- **Parameters**:
  - `objectiveId` (string): The unique objective ID.

### 3. `create_objective`
Create a new objective.
- **Parameters**:
  - `title` (string)
  - `description` (string)
  - `department` (string): `product`, `project-management`, `sales`, `engineering`, `executive`
  - `quarter` (string): e.g., `2026-Q2`
  - `owner` (string)
  - `status` (optional string, defaults to `on-track`): `on-track`, `at-risk`, `behind`, `achieved`

### 4. `create_key_result`
Create a new key result linked to an objective.
- **Parameters**:
  - `objectiveId` (string)
  - `title` (string)
  - `description` (string)
  - `type` (string): `number`, `percentage`, `boolean`, `currency`
  - `startValue` (number)
  - `targetValue` (number)
  - `currentValue` (number)
  - `owner` (string)
  - `source` (optional string, defaults to `manual`)

### 5. `update_key_result_progress`
Update a key result's current value and document the change.
- **Parameters**:
  - `keyResultId` (string)
  - `value` (number): The new current value of the metric
  - `note` (string): A short log message explaining the update
  - `updatedBy` (string): The email/name of the user making the update

### 6. `delete_objective`
Delete an objective and all of its key results/history logs.
- **Parameters**:
  - `objectiveId` (string)

### 7. `list_quarters`
Retrieve a list of all unique quarters represented in the database.

### 8. `list_departments`
Retrieve the list of valid departments.

### 9. `get_key_result_history`
Retrieve the chronological history of progress updates and notes for a specific Key Result.
- **Parameters**:
  - `keyResultId` (string): The unique ID of the key result.

### 10. `get_objective_history`
Retrieve the chronological history of all progress updates and notes for all Key Results under an Objective.
- **Parameters**:
  - `objectiveId` (string): The unique ID of the objective.

---

## License

This project is open-source and licensed under the MIT License.
