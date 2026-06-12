import react from "@vitejs/plugin-react";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import aiSummaryHandler from "./api/analysis/ai-summary";
import technicalAnalysisHandler from "./api/analysis/technical";
import authHandler from "./api/auth/[action]";
import cloudPortfolioHandler from "./api/cloud/portfolio";
import dcaCronHandler from "./api/cron/dca";
import fundPricesHandler from "./api/funds/prices";
import fxRatesHandler from "./api/fx/rates";
import healthHandler from "./api/health";
import okxBalancesHandler from "./api/okx/balances";
import okxPricesHandler from "./api/okx/prices";
import refreshPricesHandler from "./api/refresh-prices";
import yahooPricesHandler from "./api/yahoo/prices";

type ApiHandler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;
type QueryValue = string | string[];

const apiRoutes = new Map<string, ApiHandler>([
  ["/api/analysis/ai-summary", aiSummaryHandler],
  ["/api/analysis/technical", technicalAnalysisHandler],
  ["/api/auth/login", authHandler],
  ["/api/auth/logout", authHandler],
  ["/api/auth/me", authHandler],
  ["/api/auth/register", authHandler],
  ["/api/cloud/portfolio", cloudPortfolioHandler],
  ["/api/cron/dca", dcaCronHandler],
  ["/api/funds/prices", fundPricesHandler],
  ["/api/fx/rates", fxRatesHandler],
  ["/api/health", healthHandler],
  ["/api/okx/balances", okxBalancesHandler],
  ["/api/okx/prices", okxPricesHandler],
  ["/api/refresh-prices", refreshPricesHandler],
  ["/api/yahoo/prices", yahooPricesHandler]
]);

const parseQuery = (searchParams: URLSearchParams) => {
  const query: Record<string, QueryValue> = {};

  searchParams.forEach((value, key) => {
    const existing = query[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (existing) {
      query[key] = [existing, value];
    } else {
      query[key] = value;
    }
  });

  return query;
};

const readBody = (req: IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      if (!rawBody) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch {
        resolve(rawBody);
      }
    });
  });

const createCacheResetPage = (redirectTo: string) => `<!doctype html>
<meta charset="utf-8" />
<title>Reset local cache</title>
<script>
  (async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    window.location.replace(${JSON.stringify(redirectTo)});
  })();
</script>`;

const createVercelResponse = (res: ServerResponse) => {
  const response = res as VercelResponse;

  response.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return response;
  };

  response.json = (body: unknown) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
    return response;
  };

  response.send = (body: unknown) => {
    if (typeof body === "object" && body !== null && !Buffer.isBuffer(body)) {
      return response.json(body);
    }
    res.end(body as string | Buffer);
    return response;
  };

  return response;
};

const localApiPlugin = (): Plugin => ({
  name: "local-vercel-api",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      if (requestUrl.pathname === "/__clear-sw") {
        const redirectTo = requestUrl.searchParams.get("to") || "/";
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(createCacheResetPage(redirectTo.startsWith("/") ? redirectTo : "/"));
        return;
      }

      const handler = apiRoutes.get(requestUrl.pathname);

      if (!handler) {
        next();
        return;
      }

      try {
        const request = Object.assign(req, {
          body: await readBody(req),
          query: parseQuery(requestUrl.searchParams)
        }) as VercelRequest;

        await handler(request, createVercelResponse(res));
      } catch (error) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : "Internal server error"
            })
          );
        }
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), localApiPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    server: {
      port: 5173
    }
  };
});
