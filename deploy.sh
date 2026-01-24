#!/bin/bash
set -e

# Extract Project ID
PROJECT_ID=$(gcloud config get-value project)
echo "Deploying to Project: $PROJECT_ID"

# Source env vars
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
fi

echo "Submitting Build to Cloud Build..."
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_NEXT_PUBLIC_FIREBASE_API_KEY="$NEXT_PUBLIC_FIREBASE_API_KEY",_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",_NEXT_PUBLIC_FIREBASE_PROJECT_ID="$NEXT_PUBLIC_FIREBASE_PROJECT_ID",_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",_NEXT_PUBLIC_FIREBASE_APP_ID="$NEXT_PUBLIC_FIREBASE_APP_ID",_NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",_NEXT_PUBLIC_APP_NAME="$NEXT_PUBLIC_APP_NAME" .

echo "Deploying to Cloud Run..."
gcloud run deploy finmanage \
  --image gcr.io/$PROJECT_ID/finmanage \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="$GEMINI_API_KEY",ALPHA_VANTAGE_API_KEY="$ALPHA_VANTAGE_API_KEY"

echo "Deployment Complete!"
