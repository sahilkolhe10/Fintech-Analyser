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
gcloud run deploy khatahouse \
  --image gcr.io/$PROJECT_ID/khatahouse \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars HETZNER_API_KEY="$HETZNER_API_KEY",HETZNER_MODEL="$HETZNER_MODEL",GROQ_API_KEY="$GROQ_API_KEY",GROQ_MODEL="$GROQ_MODEL",AI_PROVIDER="$AI_PROVIDER",GEMINI_API_KEY="$GEMINI_API_KEY",GEMINI_MODEL="$GEMINI_MODEL",ALPHA_VANTAGE_API_KEY="$ALPHA_VANTAGE_API_KEY",FIREBASE_SERVICE_ACCOUNT="$FIREBASE_SERVICE_ACCOUNT",TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN",TELEGRAM_WEBHOOK_SECRET="$TELEGRAM_WEBHOOK_SECRET",NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL",ML_SERVICE_URL="$ML_SERVICE_URL"

# Optional: deploy Firebase Hosting (khatahouse-sih.web.app → rewrites to Cloud Run)
if command -v firebase >/dev/null 2>&1 && firebase projects:list >/dev/null 2>&1; then
  echo "Deploying Firebase Hosting (khatahouse-sih)..."
  firebase deploy --only hosting:khatahouse-sih
else
  echo "Skipping Firebase Hosting deploy (firebase CLI not logged in). Run: firebase login && firebase deploy --only hosting:khatahouse-sih"
fi

echo "Deployment Complete!"
