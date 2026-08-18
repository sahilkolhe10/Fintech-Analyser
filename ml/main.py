"""FinManage ML signals service.

Live trading signals consumed by the web app via GET /api/ml/signals
(which proxies to this service):

- GET /signals/nifty500         — Nifty 500 5-min strategy signal
- GET /signals/nifty500/history — recent bar summary for a symbol
- GET /signals/crypto           — hourly crypto classifier (Binance data)

Both models are trained/refreshed in-process on demand (scikit-learn /
optional xgboost). Deploy: Cloud Run — see ml/README.md.
"""

import asyncio
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATA_DIR = Path(os.environ.get("ML_DATA_DIR", "data"))
NIFTY_CSV = DATA_DIR / "NIFTY_500_minute_data.csv"
SYMBOLS_JSON = DATA_DIR / "nifty500_symbols.json"
CACHE_TTL = float(os.environ.get("ML_CACHE_TTL", "45"))

try:
    import xgboost as _xgb  # optional dependency

    _XGB = True
except Exception:  # noqa: BLE001
    _XGB = False

try:
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.preprocessing import MinMaxScaler

    _SKLEARN = True
except Exception:  # noqa: BLE001
    _SKLEARN = False

app = FastAPI(title="FinManage ML Signals", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DIRECTION_ORDER = ["BUY", "SHORT", "HOLD"]


# ---------------------------------------------------------------------------
# Nifty 500 strategy — XGBoost trained in-process on the symbol's own 5-min
# bars with a statistical fallback (RSI + EMA trend). Bars come from Yahoo
# Finance (live) or, when present, the local Kaggle NIFTY CSV.
# ---------------------------------------------------------------------------
class Nifty500TradingStrategy:
    def __init__(self, bars: int = 60, min_agreement: int = 4) -> None:
        self.bars = bars
        self.min_agreement = min_agreement
        self._nifty: Optional[pd.DataFrame] = None
        self._symbols: List[str] = []
        self._last_load: float = 0.0
        self._xgb_cache: Dict[str, tuple[float, Any]] = {}  # symbol -> (trained_at, model)

    # ------------------------------------------------------------------ data
    def _load_nifty(self) -> Optional[pd.DataFrame]:
        if NIFTY_CSV.exists() and (self._nifty is None or time.time() - self._last_load > CACHE_TTL):
            self._nifty = pd.read_csv(NIFTY_CSV)
            self._last_load = time.time()
        return self._nifty

    def _load_symbols(self) -> List[str]:
        if self._symbols or not SYMBOLS_JSON.exists():
            return self._symbols
        with open(SYMBOLS_JSON) as fh:
            self._symbols = [s["symbol"] for s in json.load(fh).get("symbols", [])]
        return self._symbols

    def _bars(self, symbol: str) -> Optional[pd.DataFrame]:
        """5-min OHLCV bars for a symbol, newest-last.

        Live source is Yahoo Finance ({symbol}.NS 5m); falls back to the
        local Kaggle CSV when the live fetch fails or is unavailable.
        """
        frame = self._bars_live(symbol)
        if frame is None or frame.empty:
            frame = self._bars_csv(symbol)
        return frame

    def _bars_live(self, symbol: str) -> Optional[pd.DataFrame]:
        try:
            import yfinance as yf

            ticker = yf.Ticker(f"{symbol}.NS")
            raw = ticker.history(period="5d", interval="5m", auto_adjust=False)
            if raw is None or raw.empty:
                return None
            raw = raw.reset_index()
            raw = raw.rename(columns=str.title)
            raw = raw.rename(columns={"Datetime": "timestamp", "Open": "open", "High": "high",
                                      "Low": "low", "Close": "close", "Volume": "volume"})
            raw["timestamp"] = pd.to_datetime(raw["timestamp"], errors="coerce", utc=True)
            raw = raw.dropna(subset=["timestamp"]).set_index("timestamp").sort_index()
            raw = raw[~raw.index.duplicated(keep="last")]
            cols = [c for c in ("open", "high", "low", "close", "volume") if c in raw.columns]
            raw = raw[cols].astype(float)
            if "close" not in raw.columns:
                return None
            return raw.tail(self.bars * 6)
        except Exception:  # noqa: BLE001
            return None

    def _bars_csv(self, symbol: str) -> Optional[pd.DataFrame]:
        """Resampled 5-min bars from the optional local Kaggle NIFTY CSV."""
        nifty = self._load_nifty()
        if nifty is None or nifty.empty:
            return None
        if "symbol" in nifty.columns:
            sub = nifty[nifty["symbol"] == symbol]
        else:
            sub = nifty
        if sub.empty:
            return None
        sub = sub.copy()
        sub["timestamp"] = pd.to_datetime(sub["timestamp"], errors="coerce")
        sub = sub.dropna(subset=["timestamp"]).set_index("timestamp").sort_index()
        sub = sub[~sub.index.duplicated(keep="last")]
        for col in ("open", "high", "low", "close", "volume"):
            if col in sub.columns:
                sub[col] = pd.to_numeric(sub[col], errors="coerce")
        if "close" not in sub.columns:
            return None
        if not {"open", "high", "low"}.issubset(sub.columns):
            grp = sub.groupby(pd.Grouper(freq="5min"))
            frame = grp["close"].agg(["first", "last", "max", "min"]).rename(
                columns={"first": "open", "last": "close", "max": "high", "min": "low"}
            )
            if "volume" in sub.columns:
                frame["volume"] = grp["volume"].sum()
            else:
                frame["volume"] = 0
            return frame.dropna(subset=["open", "close"]).tail(self.bars * 6)
        grp = sub.groupby(pd.Grouper(freq="5min"))
        frame = pd.DataFrame(
            {
                "open": grp["open"].first(),
                "high": grp["high"].max(),
                "low": grp["low"].min(),
                "close": grp["close"].last(),
                "volume": grp["volume"].sum() if "volume" in sub.columns else 0,
            }
        )
        return frame.dropna(subset=["open", "close", "high", "low"]).tail(self.bars * 6)

    # -------------------------------------------------------------- features
    @staticmethod
    def _features(df: pd.DataFrame) -> pd.DataFrame:
        f = pd.DataFrame(index=df.index)
        close = df["close"].astype(float)
        f["close"] = close
        f["sma10"] = close.rolling(10).mean()
        f["sma40"] = close.rolling(40).mean()
        f["ema12"] = close.ewm(span=12, adjust=False).mean()
        f["ema26"] = close.ewm(span=26, adjust=False).mean()
        f["close_sma10"] = close / f["sma10"] - 1
        f["close_sma40"] = close / f["sma40"] - 1
        f["macd"] = f["ema12"] - f["ema26"]
        f["macd_signal"] = f["macd"].ewm(span=9, adjust=False).mean()
        f["macd_hist"] = f["macd"] - f["macd_signal"]
        delta = close.diff()
        gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
        loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
        rs = gain / loss.replace(0, np.nan)
        f["rsi"] = 100 - 100 / (1 + rs)
        f["atr14"] = (df["high"] - df["low"]).rolling(14).mean()
        f["vol_ratio"] = df["volume"] / df["volume"].rolling(20).mean().replace(0, np.nan)
        f["pct"] = close.pct_change()
        f["signal"] = (f["pct"] > 0).astype(int)
        f["signal_frac"] = f["signal"].rolling(6).mean()
        f["over_time"] = f["signal_frac"] - 0.5
        return f.replace([np.inf, -np.inf], np.nan)

    # -------------------------------------------------------------- predict
    def predict(self, symbol: str) -> Dict[str, Any]:
        bars = self._bars(symbol)
        if bars is None or bars.empty:
            raise HTTPException(status_code=404, detail=f"Unknown Nifty 500 symbol: {symbol}")
        close = float(bars["close"].iloc[-1])
        direction, proba = self._classify(symbol, bars)
        probabilities = {d: (proba if d == direction else round((1 - proba) / 2, 4)) for d in DIRECTION_ORDER}
        # HOLD-shrink: if the model is unconvinced, fold toward HOLD
        if proba < 0.58:
            direction = "HOLD"
            probabilities = {"BUY": round((1 - proba) / 2, 4), "SHORT": round((1 - proba) / 2, 4), "HOLD": proba}
        return {
            "symbol": symbol,
            "market": "nifty500",
            "direction": direction,
            "probability": float(max(probabilities.values())),
            "probabilities": probabilities,
            "price": close,
            "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": "xgb v1" if (_XGB and self._xgb_cache.get(symbol)) else "stats v1",
            "bars": int(len(bars)),
        }

    def _classify(self, symbol: str, bars: pd.DataFrame) -> tuple[str, float]:
        feats = self._features(bars).dropna()
        if len(feats) < 30:
            return "HOLD", 0.5
        model = self._xgb_model(symbol, feats)
        labels = (feats["close"].shift(-1) > feats["close"]).astype(int)
        if model is not None and len(labels) > 20:
            x = feats.drop(columns=["close", "signal", "signal_frac", "over_time", "pct"])
            proba = float(model.predict_proba(x.tail(1).to_numpy())[0][1])
        else:
            x = feats.iloc[-20:]
            up = int((x["close"].shift(-1) > x["close"]).sum())
            proba = up / max(len(x), 1)
        proba = float(np.clip(proba, 0.4, 0.6) if proba in (0.5,) else proba)
        return ("BUY" if proba >= 0.5 else "SHORT"), proba

    def _xgb_model(self, symbol: str, feats: pd.DataFrame) -> Optional[Any]:
        cached = self._xgb_cache.get(symbol)
        if cached and time.time() - cached[0] < 300:
            return cached[1]
        if not _XGB:
            return None
        labels = (feats["close"].shift(-1) > feats["close"]).astype(int)
        x = feats.drop(columns=["close", "signal", "signal_frac", "over_time", "pct"])
        train_x, train_y = x.iloc[:-10], labels.iloc[:-10]
        train_x, train_y = train_x.dropna(), train_y.loc[train_x.index]
        if len(train_x) < 50 or train_y.nunique() < 2:
            return None
        try:
            model = _xgb.XGBClassifier(
                n_estimators=60, max_depth=3, learning_rate=0.1,
                subsample=0.8, objective="binary:logistic", n_jobs=1,
            )
            model.fit(train_x.to_numpy(), train_y.to_numpy())
            self._xgb_cache[symbol] = (time.time(), model)
            return model
        except Exception:  # noqa: BLE001
            return None

    def history(self, symbol: str, days: int = 2) -> Dict[str, Any]:
        bars = self._bars(symbol)
        if bars is None or bars.empty:
            return {"symbol": symbol, "market": "nifty500", "bars": 0}
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        if bars.index.tz is None:
            cutoff = cutoff.replace(tzinfo=None)
        recent = bars[bars.index >= cutoff]
        directions = [self._classify(symbol, bars.iloc[: i + 1])[0] for i in range(len(bars))]
        idx = len(bars) - len(recent)
        counts = {"HOLD": 0, "BUY": 0, "SHORT": 0}
        avg_prob = {"HOLD": 0.0, "BUY": 0.0, "SHORT": 0.0}
        for i, d in enumerate(directions[idx:], start=idx):
            counts[d] = counts.get(d, 0) + 1
        last_dir, last_prob = self._classify(symbol, bars)
        last = {
            "symbol": symbol,
            "market": "nifty500",
            "direction": last_dir,
            "probability": float(last_prob),
            "probabilities": {d: (last_prob if d == last_dir else (1 - last_prob) / 2) for d in DIRECTION_ORDER},
            "price": float(bars["close"].iloc[-1]),
            "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        return {
            "symbol": symbol,
            "market": "nifty500",
            "bars": int(len(recent)),
            "counts": counts,
            "avg_probability": avg_prob,
            "last": last,
        }


# ---------------------------------------------------------------------------
# Crypto strategy — hourly Binance klines + HistGradientBoosting classifier.
# ---------------------------------------------------------------------------
class BoostPredictor:
    def __init__(self) -> None:
        self.scaler = MinMaxScaler()
        self.models: Dict[str, tuple[float, Optional[Any], float]] = {}
        self._cache: Dict[str, tuple[float, pd.DataFrame]] = {}

    def _fetch_or_cache(self, symbol: str) -> Optional[pd.DataFrame]:
        now = time.time()
        cached = self._cache.get(symbol)
        if cached and now - cached[0] < 600:
            return cached[1]
        frame = self._from_binance(symbol)
        if frame is None or frame.empty:
            return cached[1] if cached else None
        path = DATA_DIR / f"binance_{symbol.lower().replace('/', '_')}.parquet"
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            frame.to_parquet(path)
        except Exception:  # noqa: BLE001
            pass
        self._cache[symbol] = (now, frame)
        return frame

    @staticmethod
    def _from_binance(symbol: str) -> Optional[pd.DataFrame]:
        try:
            from urllib.request import urlopen

            pair = symbol.replace("-", "")
            uri = f"https://api.binance.com/api/v3/klines?symbol={pair}&interval=1h&limit=1000"
            with urlopen(uri, timeout=10) as res:
                rows = json.loads(res.read())
            df = pd.DataFrame(rows)
            df = df.rename(columns={0: "ts", 4: "close", 5: "volume"})
            df["timestamp"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
            df["close"] = df["close"].astype(float)
            df["volume"] = df["volume"].astype(float)
            return df[["timestamp", "close", "volume"]].sort_values("timestamp")
        except Exception:  # noqa: BLE001
            return None

    @staticmethod
    def _features(df: pd.DataFrame) -> pd.DataFrame:
        f = pd.DataFrame(index=df.index)
        close = df["close"].astype(float)
        f["close"] = close
        f["sma7"] = close.rolling(7).mean()
        f["sma25"] = close.rolling(25).mean()
        f["close_sma7"] = close / f["sma7"] - 1
        f["close_sma25"] = close / f["sma25"] - 1
        delta = close.diff()
        gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
        loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
        rs = gain / loss.replace(0, np.nan)
        f["rsi"] = 100 - 100 / (1 + rs)
        f["vol_ratio"] = df["volume"] / df["volume"].rolling(20).mean().replace(0, np.nan)
        f["pct"] = close.pct_change()
        f["signal"] = (f["pct"] > 0).astype(int)
        f["signal_frac"] = f["signal"].rolling(6).mean()
        return f.replace([np.inf, -np.inf], np.nan)

    def classify_binance(self, symbol: str) -> Optional[Dict[str, Any]]:
        frame = self._fetch_or_cache(symbol)
        if frame is None or len(frame) < 60:
            return None
        feats = self._features(frame)
        latest = feats.dropna().tail(1)
        if latest.empty:
            return None

        now = time.time()
        model = self.models.get(symbol)
        if model is None or now - model[0] > 3600:
            self.models[symbol] = (now, self._fit(feats), len(feats))
            model = self.models[symbol]

        _, clf, n_train = model
        x_cols = ["close_sma7", "close_sma25", "rsi", "vol_ratio", "signal_frac"]
        if clf is not None and n_train >= 100:
            x = self.scaler.transform(latest[x_cols].to_numpy())
            proba = float(clf.predict_proba(x)[0][1])
        else:
            win = feats.dropna().tail(24)
            proba = float((win["close"].shift(-1) > win["close"]).sum() / len(win))

        direction = "BUY" if proba >= 0.5 else "SHORT"
        proba = float(np.clip(proba, 0.05, 0.95))
        return {
            "symbol": symbol,
            "market": "crypto",
            "direction": direction,
            "probability": proba,
            "probabilities": {"BUY": proba, "SHORT": round(1 - proba, 4)},
            "price": float(frame["close"].tail(1).iloc[0]),
            "time": frame["timestamp"].tail(1).iloc[0].isoformat(timespec="seconds"),
            "model": "hist-boost v1",
        }

    def _fit(self, feats: pd.DataFrame) -> Optional[Any]:
        if not _SKLEARN:
            return None
        labels = (feats["close"].shift(-1) > feats["close"]).astype(int)
        x_cols = ["close_sma7", "close_sma25", "rsi", "vol_ratio", "signal_frac"]
        train = feats[x_cols + ["close"]].dropna().iloc[:-10].copy()
        train["y"] = labels.loc[train.index]
        train = train.dropna(subset=["y"])
        if len(train) < 100 or train["y"].nunique() < 2:
            return None
        try:
            x = self.scaler.fit_transform(train[x_cols].to_numpy())
            clf = HistGradientBoostingClassifier(max_iter=80, learning_rate=0.08, random_state=42)
            clf.fit(x, train["y"].to_numpy().astype(int))
            return clf
        except Exception:  # noqa: BLE001
            return None


nifty = Nifty500TradingStrategy()
boost = BoostPredictor()
_fetch_lock = asyncio.Lock()


class SignalQuery(BaseModel):
    symbol: str


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "xgboost": str(_XGB), "sklearn": str(_SKLEARN)}


@app.get("/signals/nifty500")
async def signal_nifty500(symbol: str) -> Dict[str, Any]:
    return nifty.predict(symbol.strip().upper())


@app.get("/signals/nifty500/history")
async def signal_nifty500_history(symbol: str, days: int = 2) -> Dict[str, Any]:
    return nifty.history(symbol.strip().upper(), days=days)


@app.get("/signals/crypto")
async def signal_crypto(symbol: str) -> Dict[str, Any]:
    symbol = symbol.strip().upper()
    result = await asyncio.to_thread(boost.classify_binance, symbol)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Unknown crypto symbol: {symbol}")
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)