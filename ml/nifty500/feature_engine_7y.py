"""
feature_engine_7y.py
====================
Memory-optimized feature engineering for the 83M-row 7-year master dataset.

ALL float columns are enforced as float32 (4 bytes) to keep RAM under control.
Raw columns (Open, High, Low, Volume, raw EMAs) are dropped immediately after use.

Features (20):
  Trend     : MACD Hist, Dist_EMA5/10/25, Cross_5_10, Cross_10_25
  Momentum  : RSI(14), Stoch %K(14)
  Volatility: ATR_norm, BB_Pos, BB_Width
  Volume    : RVOL
  Time      : Hour, Minute, DayOfWeek
  Target    : 3-class (Buy/Hold/Short)

Usage:
    python feature_engine_7y.py
"""

import os, time
import numpy as np
import pandas as pd
from joblib import Parallel, delayed, cpu_count

INPUT_DIR  = os.path.join("data", "master_7y")
OUTPUT_DIR = os.path.join("data", "processed_7y")

F32 = np.float32   # alias for brevity


# ══════════════════════════════════════════════
# NUMPY INDICATOR FUNCTIONS (float32-native)
# ══════════════════════════════════════════════

def _ema(arr, span):
    """EMA with leading-NaN handling. Returns float32."""
    alpha = F32(2.0 / (span + 1))
    n = len(arr)
    out = np.full(n, np.nan, dtype=F32)
    # Seed from first valid window
    start = -1
    for i in range(n - span + 1):
        w = arr[i:i + span]
        if not np.any(np.isnan(w)):
            start = i + span - 1
            out[start] = F32(np.mean(w))
            break
    if start == -1:
        return out
    for i in range(start + 1, n):
        if np.isnan(arr[i]):
            out[i] = out[i - 1]
        else:
            out[i] = alpha * arr[i] + (F32(1.0) - alpha) * out[i - 1]
    return out


def _sma(arr, w):
    """Simple Moving Average. Returns float32."""
    cs = np.cumsum(arr, dtype=F32)
    cs = np.insert(cs, 0, F32(0.0))
    out = np.full(len(arr), np.nan, dtype=F32)
    out[w - 1:] = (cs[w:] - cs[:len(arr) - w + 1]) / F32(w)
    return out


def _wilder(arr, length):
    """Wilder smoothing. Returns float32."""
    alpha = F32(1.0 / length)
    out = np.full(len(arr), np.nan, dtype=F32)
    out[length - 1] = F32(np.mean(arr[:length]))
    for i in range(length, len(arr)):
        out[i] = alpha * arr[i] + (F32(1.0) - alpha) * out[i - 1]
    return out


def _rolling_std(arr, w):
    """Rolling standard deviation. Returns float32."""
    n = len(arr)
    sq = np.cumsum(arr ** 2, dtype=F32); sq = np.insert(sq, 0, F32(0.0))
    cs = np.cumsum(arr, dtype=F32);      cs = np.insert(cs, 0, F32(0.0))
    var = np.full(n, np.nan, dtype=F32)
    var[w-1:] = (sq[w:] - sq[:n-w+1]) / F32(w) - ((cs[w:] - cs[:n-w+1]) / F32(w)) ** 2
    return np.sqrt(np.maximum(var, F32(0.0)))


def calc_rsi(close, length=14):
    delta = np.diff(close, prepend=close[0])
    gain = np.where(delta > 0, delta, F32(0.0)).astype(F32)
    loss = np.where(delta < 0, -delta, F32(0.0)).astype(F32)
    avg_g = _wilder(gain[1:], length)
    avg_l = _wilder(loss[1:], length)
    avg_g = np.insert(avg_g, 0, np.nan)
    avg_l = np.insert(avg_l, 0, np.nan)
    rs = avg_g / np.where(avg_l == 0, F32(1e-10), avg_l)
    return (F32(100.0) - F32(100.0) / (F32(1.0) + rs)).astype(F32)


def calc_stoch_k(high, low, close, period=14):
    n = len(close)
    k = np.full(n, np.nan, dtype=F32)
    for i in range(period - 1, n):
        hh = np.max(high[i - period + 1:i + 1])
        ll = np.min(low[i - period + 1:i + 1])
        rng = hh - ll
        k[i] = F32((close[i] - ll) / rng * 100) if rng != 0 else F32(50.0)
    return k


def calc_atr_norm(high, low, close, length=14):
    prev = np.empty_like(close); prev[0] = close[0]; prev[1:] = close[:-1]
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev), np.abs(low - prev))).astype(F32)
    atr = _wilder(tr, length)
    with np.errstate(divide='ignore', invalid='ignore'):
        return (atr / np.where(close == 0, np.nan, close)).astype(F32)


def calc_bollinger(close, window=20):
    sma = _sma(close, window)
    std = _rolling_std(close, window)
    upper = sma + F32(2.0) * std
    lower = sma - F32(2.0) * std
    band = upper - lower
    with np.errstate(divide='ignore', invalid='ignore'):
        safe = np.where(band == 0, np.nan, band)
        bb_pos   = ((close - lower) / safe).astype(F32)
        bb_width = (band / np.where(sma == 0, np.nan, sma)).astype(F32)
    return bb_pos, bb_width


def calc_macd_hist(close):
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    macd  = ema12 - ema26
    sig   = _ema(macd, 9)
    return (macd - sig).astype(F32)


# ══════════════════════════════════════════════
# SINGLE-STOCK PROCESSOR
# ══════════════════════════════════════════════

def process_one(fname):
    symbol   = fname.replace(".parquet", "")
    in_path  = os.path.join(INPUT_DIR, fname)
    out_path = os.path.join(OUTPUT_DIR, f"{symbol}.parquet")

    try:
        df = pd.read_parquet(in_path)
        rows_raw = len(df)
        if rows_raw < 200:
            return {"symbol": symbol, "status": "too_short"}

        # Sort & ensure float32 inputs
        df.sort_values("Time", inplace=True)
        df.reset_index(drop=True, inplace=True)

        c = df["Close"].to_numpy(F32)
        h = df["High"].to_numpy(F32)
        l = df["Low"].to_numpy(F32)
        v = df["Volume"].to_numpy(F32)

        # ── TREND: EMA distances & crosses ────
        ema5  = _ema(c, 5)
        ema10 = _ema(c, 10)
        ema25 = _ema(c, 25)

        out = pd.DataFrame()
        out["Time"] = df["Time"]

        out["Dist_EMA5"]  = (c / ema5  - F32(1.0)).astype(F32)
        out["Dist_EMA10"] = (c / ema10 - F32(1.0)).astype(F32)
        out["Dist_EMA25"] = (c / ema25 - F32(1.0)).astype(F32)
        with np.errstate(divide='ignore', invalid='ignore'):
            out["Cross_5_10"]  = (ema5  / np.where(ema10 == 0, np.nan, ema10) - F32(1.0)).astype(F32)
            out["Cross_10_25"] = (ema10 / np.where(ema25 == 0, np.nan, ema25) - F32(1.0)).astype(F32)
        # EMAs no longer needed — free memory
        del ema5, ema10, ema25

        # ── TREND: MACD ───────────────────────
        out["MACD_Hist"] = calc_macd_hist(c)

        # ── MOMENTUM ──────────────────────────
        out["RSI"]     = calc_rsi(c, 14)
        out["Stoch_K"] = calc_stoch_k(h, l, c, 14)

        # ── VOLATILITY ────────────────────────
        out["ATR_norm"] = calc_atr_norm(h, l, c, 14)
        bb_pos, bb_w = calc_bollinger(c, 20)
        out["BB_Pos"]   = bb_pos
        out["BB_Width"] = bb_w
        del bb_pos, bb_w

        # Raw OHLV no longer needed
        del h, l

        # ── VOLUME ────────────────────────────
        vol_sma = _sma(v, 20)
        with np.errstate(divide='ignore', invalid='ignore'):
            out["RVOL"] = (v / np.where(vol_sma == 0, np.nan, vol_sma)).astype(F32)
        del v, vol_sma

        # ── TIME ──────────────────────────────
        dt = df["Time"]
        out["Hour"]      = dt.dt.hour.astype(np.int8)
        out["Minute"]    = dt.dt.minute.astype(np.int8)
        out["DayOfWeek"] = dt.dt.dayofweek.astype(np.int8)

        # ── 3-CLASS TARGET ────────────────────
        future_ret = (df["Close"].shift(-6).to_numpy(F32) / c - F32(1.0))
        target = np.where(future_ret > F32(0.002), 1,
                 np.where(future_ret < F32(-0.002), 2, 0)).astype(np.int8)
        out["Target_Class"] = target

        # Free original df
        del df, c

        # ── DROP NaN + SAVE ───────────────────
        out.dropna(inplace=True)
        out.reset_index(drop=True, inplace=True)

        # Final float32 enforcement (safety net)
        for col in out.columns:
            if out[col].dtype == np.float64:
                out[col] = out[col].astype(F32)

        out.to_parquet(out_path, index=False, engine="pyarrow")

        buys   = int((out["Target_Class"] == 1).sum())
        shorts = int((out["Target_Class"] == 2).sum())
        holds  = int((out["Target_Class"] == 0).sum())
        return {
            "symbol": symbol, "status": "ok",
            "rows_in": rows_raw, "rows_out": len(out),
            "buys": buys, "shorts": shorts, "holds": holds,
        }
    except Exception as exc:
        return {"symbol": symbol, "status": f"error: {exc}"}


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    files = sorted(f for f in os.listdir(INPUT_DIR) if f.endswith(".parquet"))
    total = len(files)
    if total == 0:
        print(f"❌  No files in {INPUT_DIR}/"); exit(1)

    n_jobs = cpu_count()
    print("=" * 60)
    print("  Feature Engine 7Y  ·  Float32  ·  Memory-Safe")
    print("=" * 60)
    print(f"  Input  : {os.path.abspath(INPUT_DIR)}  ({total} files)")
    print(f"  Output : {os.path.abspath(OUTPUT_DIR)}")
    print(f"  Workers: {n_jobs} CPU cores\n")

    t0 = time.perf_counter()
    results = Parallel(n_jobs=n_jobs, verbose=5)(
        delayed(process_one)(f) for f in files
    )
    elapsed = time.perf_counter() - t0

    ok     = [r for r in results if r.get("status") == "ok"]
    errors = [r for r in results if r.get("status", "").startswith("error")]
    short  = [r for r in results if r.get("status") == "too_short"]

    print(f"\n{'='*60}")
    print(f"  ✅  Processed {len(ok)}/{total} files in {elapsed:.1f}s")
    if short:
        print(f"  ⏭️   Skipped (too short): {len(short)}")
    if errors:
        print(f"  ❌  Errors: {len(errors)}")
        for e in errors[:10]:
            print(f"       {e['symbol']}: {e['status']}")
    if ok:
        tot  = sum(r["rows_out"] for r in ok)
        buys = sum(r["buys"] for r in ok)
        shrt = sum(r["shorts"] for r in ok)
        hold = sum(r["holds"] for r in ok)
        print(f"\n  📊  Total rows : {tot:,}")
        if tot > 0:
            print(f"  🟢  Buy  (1)   : {buys:,}  ({buys/tot*100:.1f}%)")
            print(f"  🔴  Short (2)  : {shrt:,}  ({shrt/tot*100:.1f}%)")
            print(f"  ⚪  Hold  (0)  : {hold:,}  ({hold/tot*100:.1f}%)")

        # Memory estimate
        n_cols = 16  # features + target + time
        mem_gb = tot * n_cols * 4 / 1e9
        print(f"\n  💾  Est. memory : {mem_gb:.1f} GB (float32)")
    print(f"  📂  Output: {os.path.abspath(OUTPUT_DIR)}")
    print("=" * 60)
