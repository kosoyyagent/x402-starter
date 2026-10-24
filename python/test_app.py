import json, threading, urllib.request, unittest
from http.server import HTTPServer
from app import create_app


def run(app):
    srv = HTTPServer(('127.0.0.1', 0), app.handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class X402Test(unittest.TestCase):
    def setUp(self):
        self.srv = run(create_app('0.01', '0x' + '1' * 40, 'http://localhost:1'))
        self.base = f"http://127.0.0.1:{self.srv.server_port}"

    def tearDown(self):
        self.srv.shutdown()

    def get(self, path, headers=None):
        req = urllib.request.Request(self.base + path, headers=headers or {})
        try:
            return urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            return e

    def test_missing_payment_402_with_requirement(self):
        r = self.get('/api/brief')
        self.assertEqual(r.status, 402)
        body = json.loads(r.read())
        self.assertEqual(body['x402Version'], 1)
        acc = body['accepts'][0]
        self.assertEqual(acc['scheme'], 'exact')
        self.assertEqual(acc['network'], 'base')
        self.assertEqual(acc['maxAmountRequired'], '10000')
        self.assertEqual(acc['asset'], '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')

    def test_unknown_route_404(self):
        self.assertEqual(self.get('/nope').status, 404)

    def test_malformed_payment_402_not_crash(self):
        r = self.get('/api/brief', {'X-PAYMENT': '!!!'})
        self.assertEqual(r.status, 402)

    def test_price_scaling(self):
        srv = run(create_app('5', '0x' + '1' * 40, 'http://localhost:1'))
        port = srv.server_port
        req = urllib.request.Request(f'http://127.0.0.1:{port}/api/brief')
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            body = json.loads(e.read())
        self.assertEqual(body['accepts'][0]['maxAmountRequired'], '5000000')
        srv.shutdown()


if __name__ == '__main__':
    unittest.main()
