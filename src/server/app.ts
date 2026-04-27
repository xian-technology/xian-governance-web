import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord } from "../shared/format.js";
import type { GovernanceLayer } from "../shared/types.js";
import type { GovernanceService } from "./governanceService.js";

export function createApiApp(service: GovernanceService): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/networks", (_req, res) => {
    res.json({ networks: service.listNetworks() });
  });

  app.get("/api/networks/:networkId/overview", asyncHandler(async (req, res) => {
    res.json(await service.overview(param(req, "networkId")));
  }));

  app.get("/api/networks/:networkId/proposals", asyncHandler(async (req, res) => {
    res.json(await service.proposals(param(req, "networkId")));
  }));

  app.get(
    "/api/networks/:networkId/proposals/:layer/:proposalId",
    asyncHandler(async (req, res) => {
      const layer = parseLayer(param(req, "layer"));
      const proposal = await service.proposal(
        param(req, "networkId"),
        layer,
        Number(param(req, "proposalId")),
      );
      if (!proposal) {
        res.status(404).json({ error: "proposal not found" });
        return;
      }
      res.json(proposal);
    }),
  );

  app.get(
    "/api/networks/:networkId/proposals/:layer/:proposalId/votes",
    asyncHandler(async (req, res) => {
      const layer = parseLayer(param(req, "layer"));
      res.json({
        votes: await service.proposalVotes(
          param(req, "networkId"),
          layer,
          Number(param(req, "proposalId")),
        )
      });
    }),
  );

  app.get("/api/networks/:networkId/validators", asyncHandler(async (req, res) => {
    res.json(await service.validators(param(req, "networkId")));
  }));

  app.get(
    "/api/networks/:networkId/state-patches",
    asyncHandler(async (req, res) => {
      res.json(await service.statePatches(param(req, "networkId")));
    }),
  );

  app.post("/api/networks/:networkId/simulate", asyncHandler(async (req, res) => {
    if (!isRecord(req.body)) {
      res.status(400).json({ error: "request body must be an object" });
      return;
    }
    res.json(await service.simulate(param(req, "networkId"), req.body));
  }));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.startsWith("unknown network") ? 404 : 500;
    res.status(status).json({ error: message });
  });

  return app;
}

export async function attachFrontend(app: express.Express): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDir = path.resolve(__dirname, "../client");
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
    return;
  }

  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

function parseLayer(value: string): GovernanceLayer {
  if (value === "protocol" || value === "validator") {
    return value;
  }
  throw new Error(`unknown governance layer ${value}`);
}

function param(req: express.Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new Error(`missing route parameter ${name}`);
  }
  return value;
}

function asyncHandler(
  handler: (req: express.Request, res: express.Response) => Promise<void>,
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    handler(req, res).catch(next);
  };
}
