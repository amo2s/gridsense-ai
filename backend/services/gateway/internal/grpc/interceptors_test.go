package server

// Layer 1 test: the real auth interceptors (NewAuthUnaryInterceptor,
// NewAuthStreamInterceptor) called directly as functions, no bufconn, no
// network, no server startup. Tokens are generated in-process with a test
// HMAC secret — nothing here needs a bearer token supplied by hand.
//
// This closes the gap left by alert_service_test.go, whose bufconn harness
// bypasses the real interceptor with a metadata-shortcut fake. That file
// proves the RPC handlers trust context identity correctly; this file proves
// the interceptor is what correctly puts that identity there in the first
// place, from a real signed JWT.

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"

	"gateway/middleware"
)

const testJWTSecret = "test-signing-secret-do-not-use-in-prod"

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

// signToken builds a JWT the same shape middleware.ValidateJWT expects: HMAC,
// "sub" claim set to userID. expiresIn <= 0 means no expiry set at all.
func signToken(t *testing.T, secret, userID string, expiresIn time.Duration) string {
	t.Helper()
	claims := jwt.MapClaims{"sub": userID}
	if expiresIn != 0 {
		claims["exp"] = time.Now().Add(expiresIn).Unix()
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign test token: %v", err)
	}
	return signed
}

// signTokenNoSubClaim builds a validly-signed token with no "sub" claim at
// all, to exercise ValidateJWT's "invalid token payload" path.
func signTokenNoSubClaim(t *testing.T, secret string) string {
	t.Helper()
	claims := jwt.MapClaims{"not_sub": "irrelevant"}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign test token: %v", err)
	}
	return signed
}

// signTokenNoneAlg builds a token using the "none" algorithm to exercise the
// HMAC-only enforcement in middleware.ValidateJWT (alg confusion defense).
func signTokenNoneAlg(t *testing.T, userID string) string {
	t.Helper()
	claims := jwt.MapClaims{"sub": userID}
	tok := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	signed, err := tok.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("failed to sign none-alg test token: %v", err)
	}
	return signed
}

func incomingCtxWithAuth(header string) context.Context {
	md := metadata.MD{}
	if header != "" {
		md = metadata.Pairs("authorization", header)
	}
	return metadata.NewIncomingContext(context.Background(), md)
}

// ---------------------------------------------------------------------------
// Unary interceptor
// ---------------------------------------------------------------------------

// capturingHandler records whether it was invoked and what context it saw,
// so tests can assert both "was the request allowed through" and "was the
// right identity attached to the context the handler actually received."
func capturingHandler() (grpc.UnaryHandler, *bool, *context.Context) {
	called := false
	var seenCtx context.Context
	h := func(ctx context.Context, req interface{}) (interface{}, error) {
		called = true
		seenCtx = ctx
		return "ok", nil
	}
	return h, &called, &seenCtx
}

func TestUnaryAuth_ValidToken_SetsUserIDAndCallsHandler(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	token := signToken(t, testJWTSecret, "user-abc-123", time.Hour)
	ctx := incomingCtxWithAuth("Bearer " + token)

	handler, called, seenCtx := capturingHandler()
	resp, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{FullMethod: "/test/Method"}, handler)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !*called {
		t.Fatal("handler was never called")
	}
	if resp != "ok" {
		t.Fatalf("unexpected response: %v", resp)
	}
	gotID, ok := (*seenCtx).Value(middleware.UserIDKey).(string)
	if !ok || gotID != "user-abc-123" {
		t.Fatalf("expected UserIDKey=user-abc-123 in handler's context, got %q (ok=%v)", gotID, ok)
	}
}

func TestUnaryAuth_MissingMetadata_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	// No metadata attached at all — context.Background(), not even an empty MD.
	handler, called, _ := capturingHandler()

	_, err := interceptor(context.Background(), "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called when metadata is missing")
	}
}

func TestUnaryAuth_MissingAuthorizationHeader_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	ctx := incomingCtxWithAuth("") // metadata present, but no authorization key
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called when authorization header is missing")
	}
}

func TestUnaryAuth_MalformedHeader_NoSpace_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	ctx := incomingCtxWithAuth("BearerNoSpace")
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called on malformed header")
	}
}

func TestUnaryAuth_WrongScheme_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	token := signToken(t, testJWTSecret, "user-1", time.Hour)
	ctx := incomingCtxWithAuth("Basic " + token)
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called for non-Bearer scheme")
	}
}

func TestUnaryAuth_SchemeCaseInsensitive_Allowed(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	token := signToken(t, testJWTSecret, "user-1", time.Hour)
	ctx := incomingCtxWithAuth("bearer " + token) // lowercase scheme
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	if err != nil {
		t.Fatalf("expected lowercase 'bearer' scheme to be accepted, got: %v", err)
	}
	if !*called {
		t.Fatal("handler should have been called")
	}
}

func TestUnaryAuth_ExpiredToken_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	token := signToken(t, testJWTSecret, "user-1", -time.Hour) // expired 1h ago
	ctx := incomingCtxWithAuth("Bearer " + token)
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called for an expired token")
	}
}

func TestUnaryAuth_WrongSecret_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	token := signToken(t, "a-different-secret-entirely", "user-1", time.Hour)
	ctx := incomingCtxWithAuth("Bearer " + token)
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called when signature doesn't match the server's secret")
	}
}

func TestUnaryAuth_NoneAlgorithm_Rejected(t *testing.T) {
	// Regression guard for algorithm-confusion attacks: a token claiming
	// alg=none must never be accepted, even with a "valid" sub claim.
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	token := signTokenNoneAlg(t, "attacker")
	ctx := incomingCtxWithAuth("Bearer " + token)
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called for an alg=none token")
	}
}

func TestUnaryAuth_MissingSubClaim_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	token := signTokenNoSubClaim(t, testJWTSecret)
	ctx := incomingCtxWithAuth("Bearer " + token)
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called for a token with no sub claim")
	}
}

func TestUnaryAuth_GarbageToken_Unauthenticated(t *testing.T) {
	interceptor := NewAuthUnaryInterceptor(testJWTSecret)
	ctx := incomingCtxWithAuth("Bearer not.a.jwt")
	handler, called, _ := capturingHandler()

	_, err := interceptor(ctx, "req", &grpc.UnaryServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("handler must not be called for an unparseable token")
	}
}

// ---------------------------------------------------------------------------
// Stream interceptor
// ---------------------------------------------------------------------------

// fakeServerStream implements grpc.ServerStream with a settable base context,
// enough to exercise the stream interceptor's context-wrapping behavior.
type fakeServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (f *fakeServerStream) Context() context.Context { return f.ctx }

func capturingStreamHandler() (grpc.StreamHandler, *bool, *context.Context) {
	called := false
	var seenCtx context.Context
	h := func(srv interface{}, stream grpc.ServerStream) error {
		called = true
		seenCtx = stream.Context()
		return nil
	}
	return h, &called, &seenCtx
}

func TestStreamAuth_ValidToken_SetsUserIDAndCallsHandler(t *testing.T) {
	interceptor := NewAuthStreamInterceptor(testJWTSecret)
	token := signToken(t, testJWTSecret, "stream-user-1", time.Hour)
	stream := &fakeServerStream{ctx: incomingCtxWithAuth("Bearer " + token)}

	handler, called, seenCtx := capturingStreamHandler()
	err := interceptor(nil, stream, &grpc.StreamServerInfo{FullMethod: "/test/Stream"}, handler)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !*called {
		t.Fatal("stream handler was never called")
	}
	gotID, ok := (*seenCtx).Value(middleware.UserIDKey).(string)
	if !ok || gotID != "stream-user-1" {
		t.Fatalf("expected UserIDKey=stream-user-1 in handler's stream context, got %q (ok=%v)", gotID, ok)
	}
}

func TestStreamAuth_NoAuth_Unauthenticated(t *testing.T) {
	interceptor := NewAuthStreamInterceptor(testJWTSecret)
	stream := &fakeServerStream{ctx: context.Background()}
	handler, called, _ := capturingStreamHandler()

	err := interceptor(nil, stream, &grpc.StreamServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("stream handler must not be called without valid auth")
	}
}

func TestStreamAuth_ExpiredToken_Unauthenticated(t *testing.T) {
	interceptor := NewAuthStreamInterceptor(testJWTSecret)
	token := signToken(t, testJWTSecret, "stream-user-1", -time.Hour)
	stream := &fakeServerStream{ctx: incomingCtxWithAuth("Bearer " + token)}
	handler, called, _ := capturingStreamHandler()

	err := interceptor(nil, stream, &grpc.StreamServerInfo{}, handler)

	assertUnauthenticated(t, err)
	if *called {
		t.Fatal("stream handler must not be called for an expired token")
	}
}

// ---------------------------------------------------------------------------
// Shared assertion
// ---------------------------------------------------------------------------

func assertUnauthenticated(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if got := grpcCode(t, err); got != codes.Unauthenticated {
		t.Fatalf("expected Unauthenticated, got %v", got)
	}
}