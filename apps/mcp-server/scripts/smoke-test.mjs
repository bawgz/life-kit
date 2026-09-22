import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = process.argv[2];
if (!token) {
  console.error("Usage: node scripts/smoke-test.mjs <MCP_AUTH_TOKEN>");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:3002/mcp"),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
);

const client = new Client({ name: "smoke-test", version: "0.1.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log(
  "Tools:",
  tools.tools.map((t) => t.name)
);

const result = await client.callTool({ name: "list_plans", arguments: {} });
console.log("list_plans result:", JSON.stringify(result, null, 2));

await client.close();
