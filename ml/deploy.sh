#!/bin/bash
set -e

# Deploy the ML signals service to Cloud Run.
# Requires gcloud authenticated with the khatahouse project.

PROJECT_ID=$(gcloud config get-value project)
echo "Deploying ML service to Project: $PROJECT_ID"

# 1. Train the models locally and copy artifacts into ml/models/:
#    Nifty500: cd ml/nifty500 && python train_xgb_v2.py   -> xgb_v2.json + scaler_v2.pkl
#      cp xgb_v2.json scaler_v2.pkl ../models/nifty500_xgb_v2.json ../models/nifty500_scaler_v2.pkl
#    Crypto:   cd ml/crypto && python train_model.py      -> trained_model.pkl
#      cp trained_model.pkl ../models/crypto_trained_model.pkl

# 2. Build + deploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/ml-service .
gcloud run deploy ml-service \
  --image gcr.io/$PROJECT_ID/ml-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 5m

echo "ML service deployed. Set ML_SERVICE_URL=https://ml-service-<hash>.run.app in .env.local and redeploy the web app."