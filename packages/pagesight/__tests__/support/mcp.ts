import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

export async function callTool(register: (server: McpServer) => void, name: string, args: Record<string, unknown>) {
  const server = new McpServer({ name: "tool-check", version: "1" });
  const client = new Client({ name: "tool-check", version: "1" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  register(server);
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return JSON.stringify((await client.callTool({ name, arguments: args })).content);
  } finally {
    await client.close();
    await server.close();
  }
}
