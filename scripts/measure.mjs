import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const target = 'http://127.0.0.1:4000/api/facilities?q=Quezon%20City';
const durations = [];
await fetch(target).then((r) => {
  if (!r.ok) throw new Error('API must be running.');
  return r.arrayBuffer();
});
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  const response = await fetch(target);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  await response.arrayBuffer();
  durations.push(performance.now() - start);
}
durations.sort((a, b) => a - b);
const result = {
  measuredAt: new Date().toISOString(),
  conditions:
    '30 sequential loopback HTTP requests after one warm-up; local Windows Node 24 development API, native PostgreSQL, 20 seeded facilities; no concurrent load',
  endpoint: '/api/facilities?q=Quezon%20City',
  samples: 30,
  p50Ms: Number(durations[14].toFixed(2)),
  p95Ms: Number(durations[28].toFixed(2)),
  maxMs: Number(durations[29].toFixed(2)),
};
mkdirSync('.local', { recursive: true });
writeFileSync('.local/performance.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
