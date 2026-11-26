import { buildApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { startHoldSweeper } from './modules/ticketing-service.js';
import { startCampaignScheduler } from './modules/crm.js';
import { startAutomations } from './modules/automations.js';

await runMigrations();
const app = await buildApp({ logger: true });
startHoldSweeper();
startCampaignScheduler();
startAutomations();
await app.listen({ port: config.port, host: '0.0.0.0' });
