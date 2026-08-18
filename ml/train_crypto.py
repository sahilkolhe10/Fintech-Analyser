"""
train_crypto.py
===============
Driver that trains the crypto model for the FinManage ML service using
Binance public hourly klines (no API key required).

CryptoCompare (used by ml/crypto/train_model.py) now requires a paid API
key, so this script reuses the vendored repo's feature engineering,
wick-based targets and training logic (imported from ml/crypto/train_model.py)
but sources the same OHLCV data from Binance's public REST API.

Output (same shape as ml/crypto/train_model.py):
    ml/crypto/trained_model.pkl  ->  {model, scaler, feature_cols, ...}

Usage:
    .venv/bin/python train_crypto.py
"""

import json
import pickle
import time
from datetime import datetime, timezone
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import StandardScaler

# Reuse the vendored repo's feature/target logic.
from crypto.train_model import (
    SYMBOLS,
    prepare_features,
    create_wick_based_target,
    get_feature_cols,
    RR_RATIO,
    SL_ATR_MULT,
    LOOKAHEAD_BARS,
)

YEARS_OF_DATA = 5
TOTAL_HOURS = YEARS_OF_DATA * 365 * 24

# Our symbol name -> Binance pair
BINANCE_PAIRS = {
    "BTCUSD": "BTCUSDT",
    "ETHUSD": "ETHUSDT",
    "SOLUSD": "SOLUSDT",
}

BINANCE_KLINES = "https://api.binance.com/api/v3/klines"
BATCH = 1000  # Binance max per request


def fetch_binance_hourly(pair: str) -> pd.DataFrame | None:
    """Fetch `YEARS_OF_DATA` years of hourly klines from Binance (paginated)."""
    rows: list[list] = []
    end = None  # endTime in ms; None = newest
    fetched = 0
    while fetched < TOTAL_HOURS:
        params = [("symbol", pair), ("interval", "1h"), ("limit", str(BATCH))]
        if end is not None:
            params.append(("endTime", str(end)))
        query = "&".join(f"{k}={v}" for k, v in params)
        try:
            with urlopen(f"{BINANCE_KLINES}?{query}", timeout=30) as res:
                batch = json.loads(res.read())
        except Exception as exc:  # noqa: BLE001
            print(f"    Binance error: {exc}")
            break
        if not batch:
            break
        rows.extend(batch)
        fetched += len(batch)
        end = batch[0][0] - 1  # next batch ends before the oldest candle
        print(f"    Fetched {len(batch)} candles ({fetched:,}/{TOTAL_HOURS:,})...")
        time.sleep(0.15)
        if len(batch) < BATCH:
            break

    if not rows:
        return None
    df = pd.DataFrame(rows)
    # kline: [openTime, open, high, low, close, volume, ...]
    df = df.iloc[:, :6]
    df.columns = ["time", "open", "high", "low", "close", "volume"]
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(float)
    df["time"] = df["time"].astype(int) // 1000  # ms -> s (CryptoCompare format)
    df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
    df = df.sort_values("datetime").drop_duplicates(subset="time").reset_index(drop=True)
    df = df[(df["close"] > 0) & (df["volume"] > 0)]
    print(f"  ✓ {pair}: {len(df):,} candles ({len(df) / 24 / 365:.1f} years)")
    return df[["datetime", "time", "open", "high", "low", "close", "volume"]]


def main() -> bool:
    print("=" * 60)
    print("TRAINING CRYPTO MODEL (Binance data, wick-based targets)")
    print(f"DATA: {YEARS_OF_DATA} YEARS (~{TOTAL_HOURS:,} hours per symbol)")
    print("=" * 60)

    all_data = []
    for symbol_name in SYMBOLS:
        pair = BINANCE_PAIRS[symbol_name]
        print(f"\nFetching {pair} hourly data...")
        df = fetch_binance_hourly(pair)
        if df is None or len(df) < 5000:
            print(f"  Skipping {symbol_name}: insufficient data")
            continue
        df["symbol"] = symbol_name
        print(f"  Preparing features for {symbol_name}...")
        df = prepare_features(df)
        print(f"  Creating wick-based targets for {symbol_name}...")
        df["target"] = create_wick_based_target(df)
        all_data.append(df)

    if not all_data:
        print("ERROR: No data fetched!")
        return False

    combined = pd.concat(all_data, ignore_index=True)
    combined = combined.replace([np.inf, -np.inf], np.nan).dropna()
    print(f"\nTotal samples: {len(combined):,}")
    print(f"Target distribution:\n{combined['target'].value_counts()}")

    feature_cols = get_feature_cols()
    X = combined[feature_cols]
    y = combined["target"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=False
    )
    print(f"Train: {len(X_train):,}  Test: {len(X_test):,}")

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    print("\nTraining HistGradientBoostingClassifier...")
    model = HistGradientBoostingClassifier(
        max_iter=300, max_depth=10, learning_rate=0.05,
        min_samples_leaf=50, random_state=42,
    )
    model.fit(X_train_scaled, y_train)

    y_pred = model.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {accuracy:.2%}")
    print(classification_report(y_test, y_pred, target_names=["SHORT", "LONG"]))

    model_data = {
        "model": model,
        "scaler": scaler,
        "feature_cols": feature_cols,
        "n_samples": len(combined),
        "accuracy": accuracy,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "data_range": f"{combined['datetime'].min()} to {combined['datetime'].max()}",
        "config": {
            "rr_ratio": RR_RATIO,
            "sl_atr_mult": SL_ATR_MULT,
            "lookahead_bars": LOOKAHEAD_BARS,
            "years_of_data": YEARS_OF_DATA,
            "data_source": "binance",
        },
    }

    with open("crypto/trained_model.pkl", "wb") as f:
        pickle.dump(model_data, f)
    print("\n✓ Model saved to crypto/trained_model.pkl")
    return True


if __name__ == "__main__":
    main()
