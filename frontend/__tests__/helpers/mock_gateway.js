const http = require('http');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    console.log(`Mock Gateway: ${req.method} ${req.url}`);
    
    if (req.method === 'POST' && req.url === '/api/auth/login') {
      const data = JSON.parse(body || '{}');
      if (data.email === 'test@example.com' && data.password === 'correct-test-pw') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          data: {
            access_token: 'fake-access-token-which-is-not-checked',
            refresh_token: 'fake-refresh-token',
            user: { id: "123", email: "test@example.com", name: "Test User", role: "Admin", status: "Approved" }
          }
        }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password'
        }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/auth/refresh') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        data: {
          access_token: 'new-fake-access-token',
          refresh_token: 'new-fake-refresh-token'
        }
      }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/auth/logout') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        data: { message: "Successfully logged out" }
      }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/v1/ping')) {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', data: 'pong' }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', code: 'UNAUTHORIZED', message: 'Missing token' }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found in mock' }));
  });
});

server.listen(4000, () => {
  console.log('Mock Gateway listening on port 4000');
});
