import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_GRAPHQL_URL = 'http://gateway-service:8080/graphql';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cookieHeader = request.headers.get('cookie') || '';
    
    // Proxy the request to the internal Go gateway
    const response = await fetch(GATEWAY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error('GraphQL Proxy Error:', error);
    return NextResponse.json({ errors: [{ message: 'Internal Server Error' }] }, { status: 500 });
  }
}
