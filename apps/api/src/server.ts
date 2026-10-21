import { loadRootEnv } from '@pos/db/env';

import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDefaultDeps } from './deps';

loadRootEnv();
const env = loadEnv();
const app = createApp(createDefaultDeps());

app.listen(env.PORT, () => {
  // Structured logging arrives with the observability increment.
  console.log(`Universal POS API listening on http://localhost:${env.PORT}`);
});
