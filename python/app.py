"""x402 paid agent starter (Python): one priced route, exact scheme on Base.
Zero-dependency stdlib HTTP server. create_app(price, pay_to, facilitator,
network) -> WSGI-style handler via app.serve(port).
"""
import base64, json, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

USDC = {
    'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}


def _requirement(cfg):
    net = cfg.get('network', 'base')
    return {
        'scheme': 'exact',
        'network': net,
        'maxAmountRequired': str(round(float(cfg['price']) * 1_000_000)),
        'asset': cfg.get('asset') or USDC[net],
        'payTo': cfg['pay_to'],
        'resource': '/api/brief',
        'description': 'one research brief',
        'mimeType': 'application/json',
        'maxTimeoutSeconds': 60,
    }


def _post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def create_app(price, pay_to, facilitator, network='base'):
    cfg = {'price': price, 'pay_to': pay_to, 'facilitator': facilitator, 'network': network}

    class H(BaseHTTPRequestHandler):
        def _json(self, code, obj, extra=None):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            req0 = _requirement(cfg)
            if self.path.split('?')[0] != '/api/brief':
                return self._json(404, {'error': 'not found'})
            payment = self.headers.get('X-PAYMENT')
            if not payment:
                return self._json(402, {'x402Version': 1, 'accepts': [req0],
                                        'error': 'X-PAYMENT header is required'})
            try:
                base64.b64decode(payment)
            except Exception:
                return self._json(402, {'x402Version': 1, 'accepts': [req0],
                                        'error': 'malformed payment header'})
            try:
                v = _post(f"{cfg['facilitator']}/verify",
                          {'x402Version': 1, 'paymentHeader': payment,
                           'paymentRequirements': req0})
                if not v.get('isValid'):
                    return self._json(402, {'x402Version': 1, 'accepts': [req0],
                                            'error': f"invalid payment: {v.get('invalidReason', 'unknown')}"})
                s = _post(f"{cfg['facilitator']}/settle",
                          {'x402Version': 1, 'paymentHeader': payment,
                           'paymentRequirements': req0})
                if not s.get('success'):
                    return self._json(402, {'x402Version': 1, 'accepts': [req0],
                                            'error': 'settlement failed'})
            except Exception:
                return self._json(402, {'x402Version': 1, 'accepts': [req0],
                                        'error': 'facilitator unreachable'})
            resp = base64.b64encode(json.dumps(s).encode()).decode()
            return self._json(200, {'brief': 'research brief'},
                              {'X-PAYMENT-RESPONSE': resp})

        def log_message(self, *a):
            pass

    class App:
        handler = H

        def serve(self, port=4021):
            HTTPServer(('0.0.0.0', port), H).serve_forever()

    return App()


if __name__ == '__main__':
    import os
    create_app(os.environ.get('PRICE', '0.01'),
               os.environ.get('PAY_TO', '0x' + '0' * 40),
               os.environ.get('FACILITATOR', 'https://x402.org/facilitator'),
               os.environ.get('NETWORK', 'base')).serve(4021)
