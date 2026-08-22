# Stage 1: Compile Go Auth Service
FROM golang:1.24-bookworm AS go-builder

WORKDIR /build

# Copy dependency manifests for layer caching
COPY backend/services/auth/go.mod backend/services/auth/go.sum* ./
RUN go mod download

# Copy source files and compile static binary
COPY backend/services/auth/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/auth-service .