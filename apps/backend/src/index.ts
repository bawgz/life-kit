import "dotenv/config";
import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp({ logger: true });

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
