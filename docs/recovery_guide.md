# Disaster Recovery Guide for Custom Memos

This guide provides step-by-step instructions to rebuild and redeploy this custom version of Memos, including all the added financial and productivity features.

## 1. Prerequisites
- Docker & Docker Compose
- Node.js & pnpm (for web development)
- Go (for backend development)

## 2. Key Custom Files
The following files and directories contain the core custom logic:
- **Web Components:**
  - `web/src/pages/AssetManager.tsx`: Inventory management.
  - `web/src/pages/DebtManager.tsx`: Debt tracking.
  - `web/src/pages/CashflowTracker.tsx`: Income & Expense tracker.
  - `web/src/utils/autoTag.ts`: Smart tagging logic.
- **System Config:**
  - `scripts/Dockerfile`: Custom build configuration.
  - `scripts/entrypoint.sh`: Adjusted entrypoint for the container.

## 3. Rebuilding the Project

### Step A: Build the Frontend
```bash
cd web
pnpm install
pnpm release
```

### Step B: Build the Docker Image
```bash
cd ..
docker build -f scripts/Dockerfile -t nguyen/custom-memos:latest .
```

### Step C: Deploy (Local)
```bash
docker-compose up -d
```

## 4. Troubleshooting
- **Unicode Issues:** Ensure source files are saved in UTF-8.
- **Port Conflicts:** The custom build defaults to port 5230. Update `docker-compose.yml` if needed.
- **Database Backup:** Memos data is stored in `/var/opt/memos`. Ensure this volume is backed up regularly.
