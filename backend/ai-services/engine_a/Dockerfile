# ==========================================
# Stage 1: Builder
# ==========================================
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Create virtual environment and update pip
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies from requirements.txt
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==========================================
# Stage 2: Runtime
# ==========================================
FROM python:3.13-slim

# Enforce strict container environment settings
# Set default PORT to match the service allocation (8001 for Engine A, 8002 for Engine B)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8001

# Create a non-root system user for security
RUN groupadd -r gridsense && useradd -r -g gridsense engine

WORKDIR /app

# Copy the isolated virtual environment from the builder
COPY --from=builder /opt/venv /opt/venv

# Copy the application source code
COPY . .

# Transfer ownership to the non-root user
RUN chown -R engine:gridsense /app

# Drop root privileges
USER engine

# Document the expected port
EXPOSE $PORT

# Execute Granian ASGI server using shell-wrapped exec for guaranteed variable expansion
CMD ["sh", "-c", "exec granian --interface asgi main:app --host 0.0.0.0 --port ${PORT}"]