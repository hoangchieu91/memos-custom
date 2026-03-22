# Deploy Guide — Memos Custom

## Server Info

| Mục | Giá trị |
|---|---|
| **IP** | `10.25.7.212` |
| **SSH** | `root` / `Admin@12345` |
| **Memos URL** | `http://10.25.7.212:5230` |
| **Tailscale** | `memos.taileeaab.ts.net` |
| **Data dir** | `/opt/personal-os/memos-data` |
| **Image** | `nguyen/custom-memos:latest` |
| **OS** | Ubuntu (Docker host) |
| **RAM** | 1.9 GB + 1G swap |
| **Disk** | 32 GB (31% used, ~21G free) |

## Services

| Service | Port | Image |
|---|---|---|
| Memos | 5230 | nguyen/custom-memos:latest |
| n8n | 5678 | n8nio/n8n:latest |
| NocoDB | 8080 | nocodb/nocodb:latest |
| NocoDB DB | 5432 (internal) | postgres:16-alpine |
| Nginx Proxy | 80, 81, 443 | jc21/nginx-proxy-manager:latest |
| Memory Bridge | cron 23:30 | /opt/personal-os/memory-bridge/ |

> **Ollama** chạy trên máy local Windows `10.25.7.111` (RTX 3050), KHÔNG chạy trên server 212.

## Deploy Steps

### 1. Build frontend
```powershell
cd d:\00_Code\memos\web
pnpm release
```

### 2. Build Docker image (local)
```powershell
cd d:\00_Code\memos
docker build -f scripts/Dockerfile -t nguyen/custom-memos:latest .
```

### 3. Export image
```powershell
docker save nguyen/custom-memos:latest -o memos_custom.tar
```

### 4. Upload to server
```powershell
scp memos_custom.tar root@10.25.7.212:/opt/personal-os/
```

### 5. Load & restart on server
```bash
ssh root@10.25.7.212
cd /opt/personal-os
docker load -i memos_custom.tar
docker compose down memos
docker compose up -d memos
rm memos_custom.tar   # cleanup
```

## Quick Deploy (sử dụng plink)
```powershell
# One-liner from Windows
echo y | plink -ssh root@10.25.7.212 -pw "Admin@12345" "cd /opt/personal-os && docker load -i memos_custom.tar && docker compose down memos && docker compose up -d memos && rm memos_custom.tar"
```
