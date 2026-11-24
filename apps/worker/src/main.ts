import { Application } from '@tablemate/api';
import { openStore } from '@tablemate/api/store';

const key = process.env.SESSION_REPLAY_KEY;
if (!key || key.length < 32 || !process.env.DATABASE_URL) {
  throw new Error('The durable worker needs DATABASE_URL and SESSION_REPLAY_KEY');
}
const store = openStore();
const app = new Application(store, key);
await store.healthy();

let stop = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { stop = true; });
let cycles = 0;
console.log('Tablemate deadline and retention worker started');
try {
  while (!stop) {
    try {
      await store.publishOutbox();
      if (cycles % 6 === 0) await app.tick();
      if (cycles++ % 400 === 0) await app.prune();
    } catch {
      console.error('Worker pass failed; retry scheduled');
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
} finally {
  await store.close();
}
