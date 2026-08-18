# FinManage ML Signals Service

FastAPI service that produces the live trading signals used by the FinManage
web app **Research → ML Trading Signals** panel and by the AI Advisor
(`ml_signal` tool). It serves models from the two vendored repos:

- `ml/nifty500/` — [nifty500-feb26](https://github.com/RohitSwami33/nifty500-feb26)
  (Nifty 500 XGBoost intraday trading system)
- `ml/crypto/` — [Crypto-model-jan2026](https://github.com/RohitSwami33/Crypto-model-jan2026)
  (crypto ML model with wick-based TP/SL targets)

## Endpoints

| Endpoint                   | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `GET /health`              | Liveness + model availability                         |
| `GET /signals/nifty500?symbol=RELIANCE`        | Nifty 500 5-min signal (BUY / SHORT / HOLD + probabilities) |
| `GET /signals/nifty500/history?symbol=RELIANCE&days=2` | Recent bar counts + last signal             |
| `GET /signals/crypto?symbol=BTC-USD`           | Hourly crypto signal (BUY / SHORT + probabilities)    |

Responses are JSON of the form:

```json
{
  "symbol": "RELIANCE",
  "market": "nifty500",
  "direction": "BUY",
  "probability": 0.72,
  "probabilities": { "BUY": 0.72, "SHORT": 0.26, "HOLD": 0.02 },
  "price": 3120.4,
  "time": "2026-08-18T10:30:00+00:00",
  "model": "xgb v1",
  "bars": 360
}
```

The web app never calls this service directly — it proxies through
`/api/ml/signals` (Next.js route), keeping `ML_SERVICE_URL` server-side.

## Models

**Nifty 500 (`Nifty500TradingStrategy`)** — live data, no artifacts required
- Fetches 5-min OHLCV bars live from Yahoo Finance (`{SYMBOL}.NS`) via
  `yfinance` (falls back to the local Kaggle `data/NIFTY_500_minute_data.csv`
  when present).
- Walks recent bars; BUY/SHORT/HOLD from an XGBoost classifier retrained
  in-process every 5 minutes on the symbol's own recent bars; falls back to a
  trend/RSI statistical vote when XGBoost is unavailable. Below 58% conviction
  the signal folds to HOLD.
- The vendored offline pipeline (`ml/nifty500/`: `data_loader.py` →
  `feature_engine_v2.py` → `train_xgb_v2.py`, 2y Kaggle data + Angel One
  credentials) remains available for training a static `xgb_v2.json` +
  `scaler_v2.pkl` if you prefer artifact-based serving.

**Crypto (`BoostPredictor`)** — live data, optional trained artifact
- Fetches 1h klines from the public Binance API (no key required), cached
  locally as parquet for 10 minutes.
- Feature set: SMA crossovers, RSI(14), volume ratio, rolling up-signal
  fraction. `HistGradientBoostingClassifier(max_iter=80)` trained on each
  symbol's own history (retrained hourly), with a rolling win-rate fallback.
- A static artifact trained on 5y of hourly OHLCV (BTC/ETH/SOL) with
  wick-based TP/SL targets is also produced by `train_crypto.py` (see below)
  and stored at `models/crypto_trained_model.pkl` — currently used for
  research/backtesting rather than the live endpoint.

## Local development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt   # or: pipenv install
.venv/bin/uvicorn main:app --port 8000

curl "localhost:8000/signals/crypto?symbol=BTC-USD"
curl "localhost:8000/signals/nifty500?symbol=RELIANCE"
```

Point the web app at the service by setting in the app's `.env.local`:

```
ML_SERVICE_URL=http://127.0.0.1:8000
```

Then verify the proxy end-to-end:

```bash
curl "localhost:3000/api/ml/signals?kind=crypto&symbol=BTC-USD"
curl "localhost:3000/api/ml/signals?kind=nifty500&symbol=RELIANCE"
```

### Training the crypto artifact (optional)

CryptoCompare now requires an API key; `train_crypto.py` sources the same
5-year hourly OHLCV from Binance's public API and reuses the vendored repo's
feature engineering + wick-based targets:

```bash
.venv/bin/python train_crypto.py    # → crypto/trained_model.pkl
cp crypto/trained_model.pkl models/crypto_trained_model.pkl
```

## Deploy to Cloud Run

```bash
gcloud builds submit --tag gcr.io/$GCP_PROJECT/finmanage-ml .
gcloud run deploy finmanage-ml \
  --image gcr.io/$GCP_PROJECT/finmanage-ml \
  --region us-central1 \
  --memory 2Gi --cpu 1 \
  --allow-unauthenticated \
  --timeout 60s
# then point the web app at it:
#   ML_SERVICE_URL=https://finmanage-ml-<hash>-uc.a.run.app
```

Memory note: pandas loading of a full NIFTY minute dataset needs ≥ 1.5 GiB
(use 2 GiB). The service has no persistent storage — parquet caches are
per-instance (fine for low traffic; add a tiny GCS mount if you want them
shared).

## Health

`GET /health` returns `{"status":"ok","xgboost":"True","sklearn":"True"}` —
both model paths fall back to statistical signals if the libraries are
missing, so the service never crashes on a cold start.
