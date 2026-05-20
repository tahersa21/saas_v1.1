# AI Gateway — Google Cloud Run Deployment Guide

Cloud Run runs two containers (serverless, pay-per-request):

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `ai-gateway-api` | `docker/Dockerfile.api` | 8080 | Express 5 API |
| `ai-gateway-dashboard` | `docker/Dockerfile.dashboard` | 3000 | React SPA |

---

## Prerequisites

| Tool | Install |
|------|---------|
| Google Cloud CLI | https://cloud.google.com/sdk/docs/install |
| Docker Desktop | https://docs.docker.com/get-docker/ |
| A GCP project | https://console.cloud.google.com |

---

## Step 1 — Initial setup (run once)

```bash
# Log in
gcloud auth login
gcloud auth configure-docker us-central1-docker.pkg.dev

# Set your project
export PROJECT_ID=your-gcp-project-id
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

# Create Artifact Registry repo (stores your Docker images)
gcloud artifacts repositories create ai-gateway \
  --repository-format=docker \
  --location=us-central1 \
  --description="AI Gateway images"
```

---

## Step 2 — Store secrets in Secret Manager

Cloud Run reads secrets securely — they are never baked into images.

```bash
# Required secrets (run each command and paste the value when prompted)
echo -n "postgresql://user:pass@host/db" | \
  gcloud secrets create DATABASE_URL --data-file=-

echo -n "your-jwt-secret-min-32-chars" | \
  gcloud secrets create JWT_SECRET --data-file=-

echo -n "your-64-hex-char-encryption-key" | \
  gcloud secrets create ENCRYPTION_KEY --data-file=-

echo -n "admin@yourdomain.com" | \
  gcloud secrets create ADMIN_EMAIL --data-file=-

echo -n "your-admin-password" | \
  gcloud secrets create ADMIN_PASSWORD --data-file=-
```

### Optional secrets (add as needed)

```bash
# Email (SMTP)
echo -n "smtp.gmail.com"   | gcloud secrets create SMTP_HOST --data-file=-
echo -n "587"              | gcloud secrets create SMTP_PORT --data-file=-
echo -n "you@gmail.com"    | gcloud secrets create SMTP_USER --data-file=-
echo -n "your-app-password"| gcloud secrets create SMTP_PASS --data-file=-
echo -n "AI Gateway <you@gmail.com>" | gcloud secrets create SMTP_FROM --data-file=-

# App base URL (for email links — set AFTER you know the API URL)
echo -n "https://ai-gateway-api-xxxx-uc.a.run.app" | \
  gcloud secrets create APP_BASE_URL --data-file=-

# Payments
echo -n "your-chargily-secret" | gcloud secrets create CHARGILY_SECRET_KEY --data-file=-
echo -n "your-chargily-webhook-secret" | gcloud secrets create CHARGILY_WEBHOOK_SECRET --data-file=-
echo -n "live" | gcloud secrets create CHARGILY_MODE --data-file=-

# GitHub OAuth
echo -n "your-github-client-id"     | gcloud secrets create GITHUB_CLIENT_ID --data-file=-
echo -n "your-github-client-secret" | gcloud secrets create GITHUB_CLIENT_SECRET --data-file=-
```

---

## Step 3 — Create a Service Account for the API

The API container needs permission to read secrets.

```bash
export PROJECT_ID=your-gcp-project-id

# Create service account
gcloud iam service-accounts create ai-gateway-api \
  --display-name="AI Gateway API"

# Grant Secret Manager access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ai-gateway-api@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Grant Cloud Run invoker (needed for service-to-service calls if any)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ai-gateway-api@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Step 4 — Build and deploy

### Option A — Cloud Build (recommended, runs in the cloud)

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1
export API_URL=https://ai-gateway-api-xxxx-uc.a.run.app   # set after first deploy

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=$REGION,_REPO=ai-gateway,_VITE_API_URL=$API_URL \
  --project=$PROJECT_ID
```

> **First deploy:** leave `_VITE_API_URL` empty. After the API is deployed,
> copy its URL, then rebuild with the correct value.

### Option B — Manual build + deploy (local Docker)

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1
export REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/ai-gateway"

# Build
docker build -f docker/Dockerfile.api -t $REPO/api:latest .
docker build -f docker/Dockerfile.dashboard -t $REPO/dashboard:latest .

# Push
docker push $REPO/api:latest
docker push $REPO/dashboard:latest

# Deploy API
gcloud run deploy ai-gateway-api \
  --image=$REPO/api:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300 \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,ADMIN_EMAIL=ADMIN_EMAIL:latest,ADMIN_PASSWORD=ADMIN_PASSWORD:latest" \
  --set-env-vars="NODE_ENV=production,PORT=8080,MIGRATIONS_DIR=/app/migrations" \
  --service-account="ai-gateway-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Deploy Dashboard
gcloud run deploy ai-gateway-dashboard \
  --image=$REPO/dashboard:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --concurrency=200 \
  --timeout=60 \
  --set-env-vars="NODE_ENV=production,PORT=3000"
```

---

## Step 5 — Configure the Dashboard API URL

After first deploy you will have two Cloud Run URLs:
- API: `https://ai-gateway-api-xxxx-uc.a.run.app`
- Dashboard: `https://ai-gateway-dashboard-xxxx-uc.a.run.app`

The dashboard needs to know the API URL **at build time** (Vite embeds it).

```bash
# Rebuild dashboard with the real API URL
docker build -f docker/Dockerfile.dashboard \
  --build-arg VITE_API_URL=https://ai-gateway-api-xxxx-uc.a.run.app \
  -t $REPO/dashboard:latest .

docker push $REPO/dashboard:latest

gcloud run deploy ai-gateway-dashboard \
  --image=$REPO/dashboard:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=256Mi \
  --set-env-vars="NODE_ENV=production,PORT=3000"
```

---

## Step 6 — Custom domain (optional)

```bash
# Map your domain to the dashboard service
gcloud run domain-mappings create \
  --service=ai-gateway-dashboard \
  --domain=yourdomain.com \
  --region=$REGION

# Map API subdomain
gcloud run domain-mappings create \
  --service=ai-gateway-api \
  --domain=api.yourdomain.com \
  --region=$REGION
```

Then add the DNS records shown in the Cloud Console (CNAME or A records).

---

## Step 7 — Verify

```bash
# Check health
curl https://ai-gateway-api-xxxx-uc.a.run.app/healthz

# Check status page
curl https://ai-gateway-api-xxxx-uc.a.run.app/api/status/summary

# View logs (last 50 lines)
gcloud run services logs read ai-gateway-api --region=$REGION --limit=50

# View recent deployments
gcloud run revisions list --service=ai-gateway-api --region=$REGION
```

---

## Auto-deploy on every git push (CI/CD)

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Build and deploy
        run: |
          gcloud builds submit \
            --config=cloudbuild.yaml \
            --substitutions=_REGION=us-central1,_REPO=ai-gateway,_VITE_API_URL=${{ secrets.API_URL }} \
            --project=${{ secrets.GCP_PROJECT_ID }}
```

**GitHub Secrets needed:**

| Secret | Value |
|--------|-------|
| `GCP_PROJECT_ID` | your GCP project ID |
| `WIF_PROVIDER` | Workload Identity Federation provider |
| `WIF_SERVICE_ACCOUNT` | Service account email |
| `API_URL` | Cloud Run API URL |

> Set up Workload Identity Federation (no static keys):
> https://cloud.google.com/blog/products/identity-security/enabling-keyless-authentication-from-github-actions

---

## Costs (approximate)

Cloud Run charges **only for actual usage** (CPU + memory while handling requests).

| Resource | Free tier / month | After free tier |
|----------|------------------|----------------|
| Requests | 2M requests | $0.40 per million |
| CPU | 180,000 vCPU-seconds | $0.00002400 / vCPU-second |
| Memory | 360,000 GB-seconds | $0.00000250 / GB-second |

For a typical small deployment: **~$0–$5/month**.

---

## Troubleshooting

```bash
# See real-time logs
gcloud run services logs tail ai-gateway-api --region=us-central1

# Check environment variables set on the service
gcloud run services describe ai-gateway-api \
  --region=us-central1 \
  --format="yaml(spec.template.spec.containers[0].env)"

# Force new deployment with same image (e.g. after secret update)
gcloud run deploy ai-gateway-api \
  --image=REGION-docker.pkg.dev/PROJECT_ID/ai-gateway/api:latest \
  --region=us-central1

# Roll back to previous revision
gcloud run services update-traffic ai-gateway-api \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

### Common errors

| Error | Fix |
|-------|-----|
| `Container failed to start` | Check logs — usually a missing env var / bad DATABASE_URL |
| `Permission denied on secret` | Grant `secretmanager.secretAccessor` to the service account |
| `CORS error in browser` | Set `APP_BASE_URL` secret to match the dashboard URL |
| `Database connection refused` | Ensure Neon allows connections from Cloud Run IPs (or use Neon serverless driver) |
| `Cold start slow (>2s)` | Set `--min-instances=1` on the API to keep one instance warm |
