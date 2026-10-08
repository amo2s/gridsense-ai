const { NextRequest } = require('next/server');
const { GET, POST } = require('../../app/api/proxy/[...slug]/route');

// Actually, testing Next.js App Router handlers outside the framework is hard because of `cookies()`
