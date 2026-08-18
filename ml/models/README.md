# Trained model artifacts (gitignored — never commit)

Drop trained files here before deploying the artifact-based variant, or after
running `train_crypto.py`:

- `crypto_trained_model.pkl` — from `ml/train_crypto.py` (Binance 5y hourly
  BTC/ETH/SOL, wick-based targets → `crypto/trained_model.pkl`), or from
  `ml/crypto/train_model.py` (CryptoCompare; requires API key).
- `nifty500_xgb_v2.json` — optional, from `ml/nifty500/train_xgb_v2.py`
  (offline 2y Kaggle pipeline).
- `nifty500_scaler_v2.pkl` — same pipeline.

Note: the live `main.py` service does NOT require these — Nifty trains
in-process on live yfinance bars and crypto trains on live Binance klines.
The artifacts are for research, backtesting, and artifact-based serving.
