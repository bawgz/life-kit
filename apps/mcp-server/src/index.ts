import "dotenv/config";
import { config } from "./config.js";
import { createMcpHttpServer } from "./server.js";

createMcpHttpServer().listen(config.port, () => {
  console.log(`MCP server listening on :${config.port}/mcp`);
});
