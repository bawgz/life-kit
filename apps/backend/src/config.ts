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
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? "./data/life-kit.sqlite",
  // bcrypt hash of the admin password (generate with `npx bcryptjs-cli hash`
  // or the scripts/hash-password.mjs helper), never the plaintext password.
  adminPasswordHash: requireEnv("ADMIN_PASSWORD_HASH"),
  // Long-lived static token used by the MCP server (and any other
  // programmatic client) instead of a browser session cookie.
  apiToken: requireEnv("API_TOKEN"),
  sessionCookieName: "life_kit_session",
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  isProduction: process.env.NODE_ENV === "production",
};
