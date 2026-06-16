import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, handleToolCall } from './tools.js';

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

// Run the server over stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OKR MCP Server successfully started and running on stdio.');
}

main().catch((error) => {
  console.error('Fatal error in OKR MCP Server:', error);
  process.exit(1);
});
