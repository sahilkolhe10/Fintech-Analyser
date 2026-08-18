# Deployment Guide (Google Cloud Run)

Follow these steps to deploy your **XGBoost Live Trader** with GenAI Sentiment Filter to GCP.

## Prerequisites
1.  **Google Cloud Project**: Ensure billing is enabled.
2.  **APIs Enabled**: Cloud Run API, Cloud Build API, Cloud Storage API.
3.  **gcloud CLI**: Installed and authorized.

## 1. Create Storage Bucket (For Persistence)
We need a bucket to store `trader_state.json` so the bot remembers daily trades across restarts.

```bash
# Replace YOUR_BUCKET_NAME with a unique name (e.g., nifty-trader-state-123)
export BUCKET_NAME="nifty-trader-state-$(date +%s)"
gcloud storage buckets create gs://$BUCKET_NAME --location=asia-south1
echo "Bucket created: $BUCKET_NAME"
```

## 2. Deploy to Cloud Run
This command builds the Docker image and deploys it as a serverless Job (or Service, but script runs once and exits, so Job is better. However, Cloud Scheduler triggers HTTP usually, so a Service is easier to schedule via standard HTTP trigger).
*Note: Our script assumes it runs once. We can wrap it in Flask for HTTP trigger or use Cloud Run Jobs.*

**Option A: Cloud Run Job (Recommended for scheduled scripts)**

```bash
# Set your secrets
export GEMINI_KEY="YOUR_KEY"
export TELEGRAM_TOKEN="YOUR_TOKEN"
export TELEGRAM_CHAT_ID="YOUR_ID"

# 1. Build & Push Image
gcloud builds submit --tag gcr.io/$(gcloud config get-value project)/live-trader

# 2. Create Job
gcloud run jobs create live-trader-job \
  --image gcr.io/$(gcloud config get-value project)/live-trader \
  --feature-creation-policy=always \
  --region asia-south1 \
  --set-env-vars GCS_BUCKET_NAME=$BUCKET_NAME \
  --set-env-vars GEMINI_API_KEY=$GEMINI_KEY \
  --set-env-vars TELEGRAM_BOT_TOKEN=$TELEGRAM_TOKEN \
  --set-env-vars TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID \
  --max-retries 0 \
  --task-timeout 10m

# 3. Test Run
gcloud run jobs execute live-trader-job --region asia-south1
```

## 3. Schedule Execution (Cloud Scheduler)
Run the job every 5 minutes during market hours (9:15 AM - 3:30 PM IST).
*Note: Cron syntax for IST is tricky in UTC. 9:15 IST = 03:45 UTC.*

```bash
# Schedule: Every 5 mins from 03:45 to 10:00 UTC (9:15 AM - 3:30 PM IST)
gcloud scheduler jobs create http live-trader-schedule \
  --location asia-south1 \
  --schedule "*/5 3-10 * * 1-5" \
  --uri "https://asia-south1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$(gcloud config get-value project)/jobs/live-trader-job:run" \
  --http-method POST \
  --oauth-service-account-email $(gcloud auth list --filter=status:ACTIVE --format="value(account)")
```
*Note: The URI approach for Jobs via Scheduler is complex. Easier method via Console: Cloud Run Jobs -> Triggers -> Add Scheduler.*

## 4. Verification
Check logs to see if it's running:
```bash
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=live-trader-job" --limit 20
```
