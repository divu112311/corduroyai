#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# deploy-backend-cloudrun.sh
#
# Builds and deploys the Python backend (backend/tradeai) to Cloud Run.
#
# Prerequisites:
#   - Google Cloud SDK installed (gcloud)
#   - Authenticated: gcloud auth login
#   - Run from the root of the corduroyai repo
#
# Usage:
#   ./docs/deploy-backend-cloudrun.sh
###############################################################################

PROJECT_ID="project-1fe125c4-7788-4a50-8cf"
REGION="us-central1"
REPO="tradeairepo"
SERVICE="trade-ai"
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}"
SA_NUMBER="947648351634"
PORT="8080"

# Determine build context (prefer backend/tradeai if it contains a Dockerfile)
if [ -f "./backend/tradeai/Dockerfile" ]; then
  BUILD_CONTEXT="./backend/tradeai"
else
  BUILD_CONTEXT="."
fi

echo "=== 1/4  Setting GCP project: ${PROJECT_ID} ==="
gcloud config set project "${PROJECT_ID}"

echo "=== 2/4  Building image from ${BUILD_CONTEXT} ==="
gcloud builds submit "${BUILD_CONTEXT}" --tag "${IMAGE}"

echo "=== 3/4  Granting Secret Manager access to default compute SA ==="
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet

echo "=== 4/4  Deploying ${SERVICE} to Cloud Run (${REGION}) ==="
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port "${PORT}"

echo ""
echo "Deploy complete."
echo "Copy the Service URL above and set PY_BASE_URL in Supabase"
echo "(Edge Functions → python-dev → Secrets) to that URL."
