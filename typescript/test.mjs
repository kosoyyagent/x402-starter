import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
// tests run against the compiled logic via tsx or plain JS path; for the
// starter repo we exercise the same code path via a JS import shim.

// Import TS source through node's type-stripping (Node >= 22.6) or fallback
let createApp;
try {
  ({ createApp } = await import('./src/app.ts'));
} catch {
  const { spawnSync } = await import('node:child_process');
  spawnSync('npx', ['-y', 'tsx', '-e', ''], { stdio: 'ignore' });
  ({ createApp } = await import('tsx/esm/api').then(() => import('./src/app.ts')));
}

const FAKE = {
  facilitator: 'http://localhost:1', // never reached in 402 tests
};

test('missing payment returns 402 with exact-scheme requirement', async () => {
  const srv = http.createServer(createApp({ price: '0.01', payTo: '0x' + '1'.repeat(40), ...FAKE }));
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const res = await fetch(`http://localhost:${port}/api/brief`);
  assert.equal(res.status, 402);
  const body = await res.json();
  assert.equal(body.x402Version, 1);
  assert.equal(body.accepts[0].scheme, 'exact');
  assert.equal(body.accepts[0].network, 'base');
  assert.equal(body.accepts[0].maxAmountRequired, '10000');
  assert.equal(body.accepts[0].asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  srv.close();
});

test('non-priced route is 404', async () => {
  const srv = http.createServer(createApp({ price: '0.01', payTo: '0x' + '1'.repeat(40), ...FAKE }));
  await new Promise(r => srv.listen(0, r));
  const res = await fetch(`http://localhost:${srv.address().port}/nope`);
  assert.equal(res.status, 404);
  srv.close();
});

test('malformed payment header returns 402 not a crash', async () => {
  const srv = http.createServer(createApp({ price: '0.01', payTo: '0x' + '1'.repeat(40), ...FAKE }));
  await new Promise(r => srv.listen(0, r));
  const res = await fetch(`http://localhost:${srv.address().port}/api/brief`,
    { headers: { 'X-PAYMENT': '!!!not-base64!!!' } });
  assert.equal(res.status, 402);
  srv.close();
});

test('price scales to USDC 6 decimals', async () => {
  const srv = http.createServer(createApp({ price: '5', payTo: '0x' + '1'.repeat(40), ...FAKE }));
  await new Promise(r => srv.listen(0, r));
  const res = await fetch(`http://localhost:${srv.address().port}/api/brief`);
  const body = await res.json();
  assert.equal(body.accepts[0].maxAmountRequired, '5000000');
  srv.close();
});
