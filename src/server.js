import 'dotenv/config';
import { createApp } from './app.js';
import { runDealHealthScan } from './jobs/deal-health.job.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

const DEAL_HEALTH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

app.listen(port, () => {
  console.log(`DealFlow360 API listening on port ${port}`);

  runDealHealthScan()
    .then((n) => console.log(`[deal-health-job] startup scan complete — ${n} quotes assessed`))
    .catch((err) => console.error('[deal-health-job] startup scan failed:', err.message));

  setInterval(() => {
    runDealHealthScan()
      .then((n) => console.log(`[deal-health-job] periodic scan complete — ${n} quotes assessed`))
      .catch((err) => console.error('[deal-health-job] periodic scan failed:', err.message));
  }, DEAL_HEALTH_INTERVAL_MS);
});
