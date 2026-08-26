import os
import jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

# Read the secret from your .env
secret = os.getenv("JWT_SECRET")

if not secret:
    print("Error: JWT_SECRET not found in .env")
    exit(1)

# Construct payload adhering to Go middleware requirements
payload = {
    "sub": "test-admin-uuid",
    "role": "admin",
    "exp": datetime.now(timezone.utc) + timedelta(hours=1)
}

# Generate the signed JWT
token = jwt.encode(payload, secret, algorithm="HS256")
print(f"\nYour Test Token:\n{token}\n")