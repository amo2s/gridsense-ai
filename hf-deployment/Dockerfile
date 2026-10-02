FROM python:3.12-slim

# Install system dependencies (Go, NGINX, Supervisor)
RUN apt-get update && apt-get install -y \
    golang \
    nginx \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire backend source code
COPY backend /app/backend

# =============================================================================
# Compile Go Microservices
# =============================================================================
RUN cd /app/backend/services/gateway && CGO_ENABLED=0 go build -ldflags="-w -s" -o gateway-service ./cmd/api
RUN cd /app/backend/services/auth && CGO_ENABLED=0 go build -ldflags="-w -s" -o auth-service ./cmd/server
RUN cd /app/backend/services/alerts && CGO_ENABLED=0 go build -ldflags="-w -s" -o alerts-service ./cmd/main.go
RUN cd /app/backend/services/dashboard-bff && CGO_ENABLED=0 go build -ldflags="-w -s" -o dashboard-bff-service ./cmd/bff

# =============================================================================
# Install Python Engine Dependencies
# =============================================================================
COPY backend/unified_requirements.txt /app/backend/unified_requirements.txt
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r /app/backend/unified_requirements.txt

# Configure NGINX and Supervisor
COPY hf-deployment/nginx.conf /etc/nginx/nginx.conf
COPY hf-deployment/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose Hugging Face Space target port
EXPOSE 7860

# Launch all processes via Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
