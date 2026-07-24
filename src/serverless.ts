import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";

/**
 * Sovereign Hono Serverless Edge Adapter
 * Multi-runtime standard compliant (Cloudflare Workers, Vercel Edge, Deno, Bun, AWS Lambda@Edge)
 */
export const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  secureHeaders({
    xFrameOptions: "SAMEORIGIN",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
  })
);
app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-User-Id", "X-File-Metadata", "Authorization"],
    credentials: true,
  })
);

app.get("/api/hono/health", (c) => {
  return c.json({
    status: "ok",
    engine: "Hono Web-Standard Edge Engine",
    mode: "Serverless Edge Mode",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/hono/serverless/info", (c) => {
  return c.json({
    serverless: true,
    supportedRuntimes: [
      "Cloudflare Workers & Pages",
      "Vercel Edge Functions",
      "AWS Lambda / Lambda@Edge",
      "Deno Deploy",
      "Bun 1.3 Native HTTP",
      "Fastly Compute@Edge"
    ],
    features: [
      "Zero Cold Start Overhead",
      "Standard Fetch API Request/Response Interfaces",
      "Built-in Security Headers & Global CORS Handler",
      "Stateless Web-Standard Middleware Routing"
    ],
  });
});

export default app;
