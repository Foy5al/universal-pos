import { createApp } from '../src/app';
import { createDefaultDeps } from '../src/deps';

// Vercel-compatible serverless entrypoint: export the app, never call listen().
const app = createApp(createDefaultDeps());

export default app;
