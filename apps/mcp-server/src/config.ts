function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3002),
  backendUrl: process.env.BACKEND_URL ?? "http://backend:3001",
  // Token this server presents to the backend REST API.
  backendApiToken: requireEnv("BACKEND_API_TOKEN"),
  // Token MCP clients (Claude Code, Muse, etc.) must present to this server.
  mcpAuthToken: requireEnv("MCP_AUTH_TOKEN"),
};
