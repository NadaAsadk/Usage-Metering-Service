const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const apiKey = process.env.API_KEY;
const userId = Number(process.env.USER_ID);
const total = Number(process.env.TOTAL || 500);
const concurrency = Number(process.env.CONCURRENCY || 25);
const units = Number(process.env.UNITS || 1);

if (!apiKey || !Number.isSafeInteger(userId) || userId <= 0) {
  console.error('Required: API_KEY and USER_ID. Optional: BASE_URL, TOTAL, CONCURRENCY, UNITS.');
  process.exit(1);
}
if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isSafeInteger(units) || units < 1) {
  console.error('TOTAL, CONCURRENCY, and UNITS must be positive integers.');
  process.exit(1);
}

const samples = [];
const outcomes = { accepted: 0, rejected: 0, other: 0, errors: 0 };
let next = 0;
const started = performance.now();

async function worker() {
  while (true) {
    const index = next++;
    if (index >= total) return;
    const t0 = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/consumptions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ userId, units, requestId: `load-${Date.now()}-${index}-${crypto.randomUUID()}` }),
      });
      const body = await response.json().catch(() => ({}));
      samples.push(performance.now() - t0);
      if (response.ok && body.status === 'accepted') outcomes.accepted++;
      else if (response.ok && body.status === 'rejected') outcomes.rejected++;
      else outcomes.other++;
    } catch (error) {
      samples.push(performance.now() - t0);
      outcomes.errors++;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
const elapsedMs = performance.now() - started;
samples.sort((a, b) => a - b);
const percentile = p => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)] ?? 0;
console.log(JSON.stringify({
  baseUrl, total, concurrency, units,
  elapsedMs: Math.round(elapsedMs),
  requestsPerSecond: Number((total / (elapsedMs / 1000)).toFixed(2)),
  latencyMs: { min: Math.round(samples[0] ?? 0), median: Math.round(percentile(0.5)), p95: Math.round(percentile(0.95)), max: Math.round(samples.at(-1) ?? 0) },
  outcomes,
  note: 'This test writes real consumption history and usage counters to the selected account. Use a disposable local account/user.'
}, null, 2));
if (outcomes.errors > 0 || outcomes.other > 0) process.exitCode = 1;
