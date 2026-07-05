import { createApiApp, attachFrontend } from "./app.js";
import { formatListenUrl, loadConfig } from "./config.js";
import { GovernanceService } from "./governanceService.js";

const config = loadConfig();
const service = new GovernanceService(config.networks);
const app = createApiApp(service, { corsOrigins: config.corsOrigins });
await attachFrontend(app);

app.listen(config.port, config.host, () => {
  console.log(
    `xian-governance-web listening on ${formatListenUrl(
      config.host,
      config.port,
    )}`,
  );
});
