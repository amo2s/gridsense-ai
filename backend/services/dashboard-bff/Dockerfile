# ==========================================
# Stage 1: Builder
# ==========================================
FROM golang:1.23-alpine AS builder

# Set the working directory
WORKDIR /app

# Install root CA certificates required for secure downstream communication[cite: 1]
RUN apk --no-cache add ca-certificates

# Copy module files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the application source code
COPY . .

# Build a statically linked Go binary
# CGO_ENABLED=0 is critical for the binary to execute correctly on a scratch image
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o bff-service ./cmd/bff

# ==========================================
# Stage 2: Runtime
# ==========================================
FROM scratch

# Import the CA certificates from the builder stage[cite: 1]
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the statically linked binary from the builder stage[cite: 1]
COPY --from=builder /app/bff-service /bff-service

# Document the default port assignment
EXPOSE 8082

# Execute the binary directly (scratch has no shell for variable expansion, 
# so the Go binary natively handles port binding internally)
ENTRYPOINT ["/bff-service"]