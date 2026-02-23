#!/usr/bin/env bash
#
# deploy.sh – Deploy Corduroy AI to Google Cloud Run
#
# Usage:
#   ./deploy.sh                          # Deploy both frontend + backend
#   ./deploy.sh frontend                 # Deploy frontend only
#   ./deploy.sh backend                  # Deploy backend only
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated: gcloud auth login
#   2. Project set: gcloud config set project <PROJECT_ID>
#   3. APIs enabled:
#        gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com secretmanager.googleapis.com
#   4. Secrets created in Secret Manager:
#        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY,
#        PINECONE_API_KEY, PINECONE_HOST

set -euo pipefail

REGION="${GCP_REGION:-us-central1}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: No GCP project set. Run: gcloud config set project <PROJECT_ID>"
  exit 1
fi

echo "Deploying to project: $PROJECT_ID  region: $REGION"

deploy_frontend() {
  echo ""
  echo "=== Building & deploying FRONTEND ==="
  gcloud builds submit \
    --tag "gcr.io/$PROJECT_ID/corduroy-frontend" \
    --timeout=600 \
    .

  gcloud run deploy corduroy-frontend \
    --image "gcr.io/$PROJECT_ID/corduroy-frontend:latest" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 256Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 3

  FRONTEND_URL=$(gcloud run services describe corduroy-frontend --region "$REGION" --format='value(status.url)')
  echo ""
  echo "Frontend deployed: $FRONTEND_URL"
}

deploy_backend() {
  echo ""
  echo "=== Building & deploying BACKEND ==="
  gcloud builds submit \
    --tag "gcr.io/$PROJECT_ID/corduroy-backend" \
    --timeout=600 \
    backend/tradeai

  gcloud run deploy corduroy-backend \
    --image "gcr.io/$PROJECT_ID/corduroy-backend:latest" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 5 \
    --set-secrets="SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,PINECONE_API_KEY=PINECONE_API_KEY:latest,PINECONE_HOST=PINECONE_HOST:latest"

  BACKEND_URL=$(gcloud run services describe corduroy-backend --region "$REGION" --format='value(status.url)')
  echo ""
  echo "Backend deployed: $BACKEND_URL"
}

TARGET="${1:-all}"

case "$TARGET" in
  frontend) deploy_frontend ;;
  backend)  deploy_backend ;;
  all)
    deploy_frontend
    deploy_backend
    ;;
  *)
    echo "Usage: $0 [frontend|backend|all]"
    exit 1
    ;;
esac

echo ""
echo "Deployment complete."
