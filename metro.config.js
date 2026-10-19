const { getDefaultConfig } = require('expo/metro-config');
const http = require('node:http');
const config = getDefaultConfig(__dirname);

// Development only: fixed upstream and path; never accept a destination from the request.
config.server = {
  ...config.server,
  enhanceMiddleware(middleware) {
    return (req, res, next) => {
      if (!/^\/webol\/index\.php(?:\?|$)/.test(req.url || '')) return middleware(req, res, next);
      const upstream = http.request({
        hostname: '10.11.0.11', port: 80, path: req.url,
        method: req.method, headers: { ...req.headers, host: '10.11.0.11' },
      }, response => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      });
      upstream.setTimeout(30000, () => upstream.destroy(new Error('Upstream timeout')));
      upstream.on('error', () => {
        if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'erro', mensagem: 'NETWORK: Tradetools local indisponível.' })); }
        else res.destroy();
      });
      req.on('aborted', () => upstream.destroy());
      req.pipe(upstream);
    };
  },
};
module.exports = config;
