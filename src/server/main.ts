import { createApiApp, attachFrontend } from "./app.js";
import { loadConfig } from "./config.js";
import { GovernanceService } from "./governanceService.js";

const config = loadConfig();
const service = new GovernanceService(config.networks);
const app = createApiApp(service, { corsOrigins: config.corsOrigins });
await attachFrontend(app);

app.listen(config.port, "127.0.0.1", () => {
  console.log(`xian-governance-web listening on http://127.0.0.1:${config.port}`);
});
