// x402 paid agent starter (TypeScript): one priced route, exact scheme on Base.
// createApp({price, payTo, facilitator, network?}) -> Node http handler.
// No framework: pure node:http so it runs anywhere.

import http from 'node:http';

export interface X402Config {
  price: string;            // e.g. '0.01' in USDC
  payTo: string;            // EVM address receiving payment
  facilitator: string;      // facilitator base URL, e.g. https://x402.org/facilitator
  network?: string;         // 'base' | 'base-sepolia' (tests), default 'base'
  asset?: string;           // USDC contract; defaults per network below
}

const USDC: Record<string, string> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

function requirement(cfg: X402Config) {
  const network = cfg.network || 'base';
  return {
    scheme: 'exact',
    network,
    maxAmountRequired: Math.round(parseFloat(cfg.price) * 1e6).toString(),
    asset: cfg.asset || USDC[network],
    payTo: cfg.payTo,
    resource: '/api/brief',
    description: 'one research brief',
    mimeType: 'application/json',
    maxTimeoutSeconds: 60,
  };
}

export function createApp(cfg: X402Config): http.RequestListener {
  return async (req, res) => {
    if (req.url !== '/api/brief') {
      res.writeHead(404).end(JSON.stringify({ error: 'not found' }));
      return;
    }
    const payment = req.headers['x-payment'];
    const req0 = requirement(cfg);
    if (!payment) {
      const body = {
        x402Version: 1,
        accepts: [req0],
        error: 'X-PAYMENT header is required',
      };
      res.writeHead(402, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
      return;
    }
    // verify with the facilitator
    try {
      const decoded = JSON.parse(Buffer.from(String(payment), 'base64').toString());
      const v = await fetch(`${cfg.facilitator}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x402Version: 1, paymentHeader: String(payment), paymentRequirements: req0 }),
      });
      const vr: any = await v.json();
      if (!vr.isValid) {
        res.writeHead(402, { 'Content-Type': 'application/json' }).end(JSON.stringify({
          x402Version: 1, accepts: [req0], error: `invalid payment: ${vr.invalidReason || 'unknown'}` }));
        return;
      }
      // settle
      const s = await fetch(`${cfg.facilitator}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x402Version: 1, paymentHeader: String(payment), paymentRequirements: req0 }),
      });
      const sr: any = await s.json();
      if (!sr.success) {
        res.writeHead(402).end(JSON.stringify({ x402Version: 1, accepts: [req0], error: 'settlement failed' }));
        return;
      }
      const q = new URL('http://x' + req.url).searchParams.get('q') || 'your brief';
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-PAYMENT-RESPONSE': Buffer.from(JSON.stringify(sr)).toString('base64'),
      }).end(JSON.stringify({ brief: `research brief for: ${q}`, payer: decoded.payload?.authorization?.from }));
    } catch (e: any) {
      res.writeHead(402).end(JSON.stringify({ x402Version: 1, accepts: [req0], error: 'malformed payment header' }));
    }
  };
}

// runnable entry
if (process.argv[1]?.endsWith('app.ts') || process.argv[1]?.endsWith('app.js')) {
  const app = createApp({
    price: process.env.PRICE || '0.01',
    payTo: process.env.PAY_TO || '0x0000000000000000000000000000000000000000',
    facilitator: process.env.FACILITATOR || 'https://x402.org/facilitator',
    network: (process.env.NETWORK as 'base' | 'base-sepolia') || 'base',
  });
  http.createServer(app).listen(4021, () => console.log('paid agent on :4021, route /api/brief'));
}
