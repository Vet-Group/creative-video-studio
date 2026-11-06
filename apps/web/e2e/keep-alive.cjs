// Preloaded into the e2e `next dev` (see serve.ts). Playwright pools Node-side request sockets with no idle timeout, and Node's
// server closes an idle socket after 5 s by default, so a reuse that races that close fails page.request/route.fetch with ECONNRESET.
// 0 turns the idle close off.
const http = require('node:http');

const createServer = http.createServer;
http.createServer = (...args) => {
  const server = createServer(...args);
  server.keepAliveTimeout = 0;
  return server;
};
