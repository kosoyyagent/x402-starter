// Publishes the starter's LAX offer. Signing is by the listing owner key.
// Usage: OWNER_KEY=0x... node scripts/list-on-lax.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const offer = JSON.parse(readFileSync(new URL('../lax-offer.json', import.meta.url)));
const key = process.env.OWNER_KEY;
if (!key) { console.error('OWNER_KEY env required'); process.exit(2); }

const res = await fetch('https://lax.kognai.ai/registry/offers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(offer),
});
if (res.status === 402) {
  // the registry asks for a 0.01 USDC x402 payment on Base; follow the
  // printed requirement or reuse your existing paid-listing flow.
  console.log('402 payment required:', await res.text());
  process.exit(1);
}
console.log(res.status, await res.text());
