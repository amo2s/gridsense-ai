# ==========================================
# Stage 1: Builder
# ==========================================
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Install build dependencies required for compiling ML libraries/C-extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment and update pip
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies from the clean UTF-8 requirements.txt
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==========================================
# Stage 2: Runtime
# ==========================================
FROM python:3.13-slim

# Enforce strict container environment settings
# Set default PORT to 8002 to align with Engine B network topography
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8002

# Install runtime system dependencies (OpenMP is required for LightGBM)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root system user for security
RUN groupadd -r gridsense && useradd -r -g gridsense engine

WORKDIR /app

# Copy the isolated virtual environment from the builder
COPY --from=builder /opt/venv /opt/venv

# Copy the application source code (including artifacts directory)
COPY . .

# Transfer ownership to the non-root user
RUN chown -R engine:gridsense /app

# Drop root privileges
USER engine

# Document the expected port
EXPOSE $PORT

# Execute Granian ASGI server using shell-wrapped exec for guaranteed variable expansion
CMD ["sh", "-c", "exec granian --interface asgi main:app --host 0.0.0.0 --port ${PORT}"]