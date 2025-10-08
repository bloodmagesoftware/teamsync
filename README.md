# TeamSync

TeamSync is a secure, self-hosted team communication platform with features similar to Slack, following the philosophy and self-hosting approach of Campfire (by 37signals).

## Features

- **End-to-End Message Encryption**: All messages are encrypted using AES-256-GCM (AEAD) encryption
- **Secure Key Management**: Encryption keys are protected in memory using secure enclaves
- **Real-time Messaging**: WebSocket-based real-time communication
- **Voice/Video Calls**: WebRTC-based calls with TURN server support
- **Self-Hosted**: Complete control over your data and infrastructure
- **Docker Support**: Easy deployment with Docker and Docker Compose

## Security Features

### Message Encryption

TeamSync uses **AES-256-GCM** (Authenticated Encryption with Associated Data) to encrypt all messages. This provides:
- **Confidentiality**: Messages are encrypted and unreadable without the key
- **Integrity**: Any tampering with encrypted messages is detected
- **Authentication**: Messages are bound to their conversation context

The encryption key is:
- Never stored on disk
- Protected in memory using `memguard` secure enclaves
- Automatically wiped from memory on shutdown

## Quick Start

### 1. Generate Encryption Key

First, generate a secure 256-bit encryption key:

```bash
go run scripts/generate-key.go
```

This will output a base64-encoded key. **Store this key securely** - you'll need it to decrypt messages (and start the server).

### 2. Set Up Environment

Do not store your `TEAMSYNC_ENCRYPTION_KEY` on disk.

### 3. Run with Docker Compose

For development:
```bash
docker compose up -d
```

For production (with enhanced security):
```bash
docker compose -f docker-compose.secure.yaml up -d
```

## Production Deployment

### Security Best Practices

1. **Environment Variables**: 
   - Use a secrets management system in production

2. **Docker Security**:
   - Use the `docker-compose.secure.yaml` for production
   - Bind to localhost only and use a reverse proxy (nginx/caddy/traefik)
   - Enable TLS/HTTPS on your reverse proxy

3. **Key Management**:
   - Store the encryption key in a secure vault (e.g., HashiCorp Vault, AWS Secrets Manager)
   - Use environment variable injection at runtime
   - Never log or display the key in plaintext

4. **Database Security**:
   - The SQLite database file contains encrypted message data
   - Ensure proper file permissions (600) on the database file
   - Regular backups should be encrypted at rest

### Example Production Setup

1. Generate and securely store the encryption key:
```bash
go run scripts/generate-key.go
# Store the output in your secrets management system
```

2. Deploy with Docker Compose:
```bash
# Set the encryption key from your secrets manager
export TEAMSYNC_ENCRYPTION_KEY=$(vault kv get -field=key secret/teamsync)

# Run with secure configuration
docker compose -f docker-compose.secure.yaml up -d
```

3. Configure reverse proxy (nginx example):
```nginx
server {
    listen 443 ssl http2;
    server_name teamsync.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Development

### Prerequisites

- Go 1.25+
- sqlc
- Node.js 22+
- pnpm
- Docker & Docker Compose

### Local Development

1. Backend:
```bash
cd backend
export TEAMSYNC_ENCRYPTION_KEY=$(go run ../scripts/generate-key.go | grep -A1 "==========" | tail -1)
go run .
```

2. Frontend:
```bash
cd frontend
pnpm install
pnpm dev
```

## Troubleshooting

### "Encryption not initialized" Error
- Ensure `TEAMSYNC_ENCRYPTION_KEY` environment variable is set
- Check that the key is valid base64 and exactly 32 bytes when decoded

### Messages Not Decrypting
- Verify you're using the same encryption key that was used to encrypt
- Check that all database migrations have been applied

### Memory Security Warnings
- These are normal - memguard locks memory pages to prevent swapping
- Requires appropriate system permissions in production

## License

Copyright (C) 2025 Mayer & Ott GbR  
Licensed under AGPL v3.0 - See LICENSE file for details
