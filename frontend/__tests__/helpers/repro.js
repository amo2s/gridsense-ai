const { spawn } = require('child_process');
const http = require('http');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  console.log('Starting Next.js on port 3001...');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const nextDev = spawn(npxCmd, ['next', 'dev', '-p', '3001'], {
    cwd: require('path').resolve(__dirname, '../../'),
    env: { ...process.env, BACKEND_API_URL: 'http://localhost:4000' }
  });

  nextDev.stdout.on('data', data => console.log(`[Next] ${data}`));
  nextDev.stderr.on('data', data => console.log(`[Next ERR] ${data}`));

  console.log('Waiting for Next.js to be ready...');
  await wait(10000); // give it time to compile

  console.log('Sending login request...');
  const postData = JSON.stringify({ email: 'test@example.com', password: 'correct-test-pw' });
  const start = Date.now();
  
  try {
    const res = await request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/proxy/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData);
    
    console.log(`Response received in ${Date.now() - start}ms`);
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
    console.log(`Body: ${res.body}`);
  } catch (err) {
    console.error(`Request failed in ${Date.now() - start}ms:`, err);
  }

  nextDev.kill();
}

run();
