import { maxDuration, dynamic, POST } from "../app/api/proxy/v1/assistant/query/route";
import { NextRequest } from "next/server";

async function runProxyTests() {
  console.log("=================================================================");
  console.log("GRIDSENSE AI ASSISTANT: DEDICATED PROXY ROUTE VERIFICATION SUITE");
  console.log("=================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName} - Detail: ${detail || "Assertion failed"}`);
    }
  }

  // TEST 1: Runtime Configuration Constants
  assert(maxDuration === 60, "maxDuration exported and set to exactly 60 seconds");
  assert(dynamic === "force-dynamic", "dynamic exported and set to 'force-dynamic'");

  // TEST 2: Unauthenticated Request Rejection (401 Unauthorized)
  try {
    const unauthReq = new NextRequest("http://localhost:3000/api/proxy/v1/assistant/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "What is the status of Feeder Alpha?",
        sessionId: "sess-test-01",
      }),
    });

    const res = await POST(unauthReq);
    assert(res.status === 401, "Unauthenticated request returns HTTP 401 Unauthorized");
    const json = await res.json();
    assert(json.error === "Unauthorized", "Response JSON contains Unauthorized error code");
  } catch (err: any) {
    assert(false, "Unauthenticated Request Rejection", err.message);
  }

  // TEST 3: Missing Required Query Parameter (400 Bad Request)
  try {
    const noQueryReq = new NextRequest("http://localhost:3000/api/proxy/v1/assistant/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "auth_token=mock-valid-jwt-token-for-test",
      },
      body: JSON.stringify({
        sessionId: "sess-test-02",
      }),
    });

    const res = await POST(noQueryReq);
    assert(res.status === 400, "Missing query parameter returns HTTP 400 Bad Request");
    const json = await res.json();
    assert(json.message.includes("query"), "Error message specifies missing 'query'");
  } catch (err: any) {
    assert(false, "Missing Query Parameter", err.message);
  }

  // TEST 4: Missing Required Session ID (400 Bad Request)
  try {
    const noSessionReq = new NextRequest("http://localhost:3000/api/proxy/v1/assistant/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "auth_token=mock-valid-jwt-token-for-test",
      },
      body: JSON.stringify({
        query: "Check transformer loading",
      }),
    });

    const res = await POST(noSessionReq);
    assert(res.status === 400, "Missing session_id returns HTTP 400 Bad Request");
    const json = await res.json();
    assert(json.message.includes("session_id"), "Error message specifies missing 'session_id'");
  } catch (err: any) {
    assert(false, "Missing Session ID", err.message);
  }

  // TEST 5: Malformed JSON Handling (400 Bad Request)
  try {
    const badJsonReq = new NextRequest("http://localhost:3000/api/proxy/v1/assistant/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "auth_token=mock-valid-jwt-token-for-test",
      },
      body: "not-valid-json{{{",
    });

    const res = await POST(badJsonReq);
    assert(res.status === 400, "Malformed JSON returns HTTP 400 Bad Request");
  } catch (err: any) {
    assert(false, "Malformed JSON Handling", err.message);
  }

  // TEST 6: Diagnostic Simulation Hook (503 Service Unavailable)
  try {
    const simReq = new NextRequest("http://localhost:3000/api/proxy/v1/assistant/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-simulate-response": "503",
        cookie: "auth_token=mock-valid-jwt-token-for-test",
      },
      body: JSON.stringify({
        query: "Health check query",
        sessionId: "sess-test-03",
      }),
    });

    const res = await POST(simReq);
    assert(res.status === 503, "Simulation hook relays HTTP 503 Service Unavailable");
    const json = await res.json();
    assert(json.message.includes("circuit breaker open"), "Simulation body relays circuit breaker message");
  } catch (err: any) {
    assert(false, "Diagnostic Simulation Hook", err.message);
  }

  console.log(`\n=================================================================`);
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log(`=================================================================`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runProxyTests().catch((err) => {
  console.error("Fatal proxy verification test runner error:", err);
  process.exit(1);
});
