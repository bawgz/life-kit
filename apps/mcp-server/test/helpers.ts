// End-to-end harness: a real backend (temp SQLite DB) and the real MCP HTTP
// server, each on a free port, driven by an MCP client over HTTP — the same
// path an agent takes. node --test runs each test file in its own process.
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BACKEND_TOKEN = "test-backend-token";
export const MCP_TOKEN = "test-mcp-token";

// Both servers read env at import time, so set it before importing them.
const dataDir = mkdtempSync(join(tmpdir(), "life-kit-mcp-test-"));
process.env.DB_PATH = join(dataDir, "test.sqlite");
process.env.API_TOKEN = BACKEND_TOKEN;
process.env.ADMIN_PASSWORD_HASH = "unused";
process.env.BACKEND_API_TOKEN = BACKEND_TOKEN;
process.env.MCP_AUTH_TOKEN = MCP_TOKEN;

const { buildApp } = await import("../../backend/src/app.js");
const backend = await buildApp();
await backend.listen({ port: 0, host: "127.0.0.1" });
process.env.BACKEND_URL = `http://127.0.0.1:${(backend.server.address() as AddressInfo).port}`;

const { createMcpHttpServer } = await import("../src/server.js");
const mcpHttp = createMcpHttpServer();
await new Promise<void>((resolve) => mcpHttp.listen(0, "127.0.0.1", resolve));
export const mcpUrl = `http://127.0.0.1:${(mcpHttp.address() as AddressInfo).port}/mcp`;

export const client = new Client({ name: "life-kit-tests", version: "0.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${MCP_TOKEN}` } },
  })
);

export async function teardown(): Promise<void> {
  await client.close();
  await new Promise((resolve) => mcpHttp.close(resolve));
  await backend.close();
  rmSync(dataDir, { recursive: true, force: true });
}

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

/** Calls a tool and returns its parsed JSON; throws if the tool errored. */
// The tools return untyped JSON, so callers get `any` to keep tests terse.
export async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content[0]?.text ?? "";
  if (result.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text);
}

/** Calls a tool that is expected to fail and returns its error text. */
export async function callExpectingError(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  if (!result.isError) throw new Error(`${name} unexpectedly succeeded`);
  return result.content[0]?.text ?? "";
}
