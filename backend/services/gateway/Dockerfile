# Stage 1: Builder
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install certificates
RUN apk --no-cache add ca-certificates

# Copy go.mod and go.sum, then download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Compile the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o gateway-service ./cmd/api

# Stage 2: Runtime
FROM scratch

# Copy root certificates
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy compiled binary
COPY --from=builder /app/gateway-service /gateway-service

# Expose Gateway port
EXPOSE 8080

ENTRYPOINT ["/gateway-service"]
