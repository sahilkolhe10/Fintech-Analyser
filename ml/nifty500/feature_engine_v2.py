"""
feature_engine_v2.py
====================
Enhanced feature engineering with 30 technical indicators for 3-class
intraday XGBoost model (Buy / Hold / Short).

Indicators (pure NumPy — no TA-Lib dependency):
  Trend      : MACD Hist, ADX, EMA dist (5/10/25/50), EMA cross (5_10, 10_25)
  Momentum   : RSI, Stoch %K, Williams %R, CCI, ROC(12)
  Volatility : ATR_norm, BB_Pos, BB_Width, Keltner_Pos
  Volume     : RVOL, OBV_slope, MFI, VWAP_dist
  Time       : Hour, Minute_bucket
  Price Act. : Body_ratio, Upper_wick, Lower_wick
  Lagged     : RSI_lag3, MACD_lag3, Ret_lag1, Ret_lag3

Target:
  Class 1 (Buy)  : 30-min return > +0.2%
  Class 2 (Short): 30-min return < -0.2%
  Class 0 (Hold) : everything else

Usage:
    python feature_engine_v2.py
"""

import os, time
import numpy as np
import pandas as pd
from joblib import Parallel, delayed, cpu_count

INPUT_DIR  = os.path.join("data", "history")
OUTPUT_DIR = os.path.join("data", "processed_v2")

# ══════════════════════════════════════════════
# NUMPY HELPERS
# ══════════════════════════════════════════════

def _ema(arr, span):
    """EMA that handles leading NaNs."""
    alpha = 2.0 / (span + 1)
    n = len(arr)
    out = np.full(n, np.nan, dtype=np.float64)
    start = -1
    for i in range(n - span + 1):
        window = arr[i : i + span]
        if not np.any(np.isnan(window)):
            start = i + span - 1
            out[start] = np.mean(window)
            break
    if start == -1:
        return out
    for i in range(start + 1, n):
        if np.isnan(arr[i]):
            out[i] = out[i - 1]
        else:
            out[i] = alpha * arr[i] + (1 - alpha) * out[i - 1]
    return out


def _sma(arr, w):
    cs = np.cumsum(arr)
    cs = np.insert(cs, 0, 0.0)
    out = np.full(len(arr), np.nan)
    out[w - 1:] = (cs[w:] - cs[:len(arr) - w + 1]) / w
    return out


def _wilder(arr, length):
    alpha = 1.0 / length
    out = np.full(len(arr), np.nan)
    out[length - 1] = np.mean(arr[:length])
    for i in range(length, len(arr)):
        out[i] = alpha * arr[i] + (1 - alpha) * out[i - 1]
    return out


def _rolling_std(arr, w):
    n = len(arr)
    sq_cs = np.cumsum(arr ** 2); sq_cs = np.insert(sq_cs, 0, 0.0)
    cs    = np.cumsum(arr);      cs    = np.insert(cs, 0, 0.0)
    var   = np.full(n, np.nan)
    var[w-1:] = (sq_cs[w:] - sq_cs[:n-w+1]) / w - ((cs[w:] - cs[:n-w+1]) / w) ** 2
    return np.sqrt(np.maximum(var, 0))


# ══════════════════════════════════════════════
# INDICATOR FUNCTIONS
# ══════════════════════════════════════════════

# ── TREND ─────────────────────────────────────

def calc_macd_hist(close):
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    macd  = ema12 - ema26
    sig   = _ema(macd, 9)
    return macd - sig

def calc_adx(high, low, close, period=14):
    n = len(close)
    prev_h = np.empty(n); prev_h[0] = high[0]; prev_h[1:] = high[:-1]
    prev_l = np.empty(n); prev_l[0] = low[0];  prev_l[1:] = low[:-1]
    prev_c = np.empty(n); prev_c[0] = close[0]; prev_c[1:] = close[:-1]

    tr = np.maximum(high - low, np.maximum(np.abs(high - prev_c), np.abs(low - prev_c)))
    dm_plus  = np.where((high - prev_h) > (prev_l - low), np.maximum(high - prev_h, 0), 0.0)
    dm_minus = np.where((prev_l - low) > (high - prev_h), np.maximum(prev_l - low, 0), 0.0)

    atr14    = _wilder(tr, period)
    sm_plus  = _wilder(dm_plus, period)
    sm_minus = _wilder(dm_minus, period)

    with np.errstate(divide='ignore', invalid='ignore'):
        di_plus  = 100.0 * sm_plus  / np.where(atr14 == 0, np.nan, atr14)
        di_minus = 100.0 * sm_minus / np.where(atr14 == 0, np.nan, atr14)
        di_sum   = di_plus + di_minus
        dx = np.where(di_sum == 0, 0.0, 100.0 * np.abs(di_plus - di_minus) / di_sum)

    # NaN-aware Wilder smoothing of DX → ADX
    adx = np.full(n, np.nan)
    # Find first window of `period` valid DX values
    valid = ~np.isnan(dx)
    count = 0; seed_end = -1
    for i in range(n):
        if valid[i]:
            count += 1
            if count >= period:
                seed_end = i; break
        else:
            count = 0
    if seed_end == -1:
        return adx
    adx[seed_end] = np.nanmean(dx[seed_end - period + 1 : seed_end + 1])
    alpha = 1.0 / period
    for i in range(seed_end + 1, n):
        if np.isnan(dx[i]):
            adx[i] = adx[i - 1]
        else:
            adx[i] = alpha * dx[i] + (1 - alpha) * adx[i - 1]
    return adx



# ── MOMENTUM ──────────────────────────────────

def calc_rsi(close, length=14):
    delta = np.diff(close, prepend=close[0])
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_g = _wilder(gain[1:], length)
    avg_l = _wilder(loss[1:], length)
    avg_g = np.insert(avg_g, 0, np.nan)
    avg_l = np.insert(avg_l, 0, np.nan)
    rs = avg_g / np.where(avg_l == 0, 1e-10, avg_l)
    return 100.0 - 100.0 / (1.0 + rs)

def calc_stochastic_k(high, low, close, period=14):
    n = len(close); k = np.full(n, np.nan)
    for i in range(period - 1, n):
        hh = np.max(high[i-period+1:i+1])
        ll = np.min(low[i-period+1:i+1])
        denom = hh - ll
        k[i] = ((close[i] - ll) / denom * 100) if denom != 0 else 50.0
    return k

def calc_williams_r(high, low, close, period=14):
    n = len(close); wr = np.full(n, np.nan)
    for i in range(period - 1, n):
        hh = np.max(high[i-period+1:i+1])
        ll = np.min(low[i-period+1:i+1])
        denom = hh - ll
        wr[i] = ((hh - close[i]) / denom * -100) if denom != 0 else -50.0
    return wr

def calc_cci(high, low, close, period=20):
    tp = (high + low + close) / 3.0
    sma_tp = _sma(tp, period)
    n = len(tp); mad = np.full(n, np.nan)
    for i in range(period - 1, n):
        mad[i] = np.mean(np.abs(tp[i-period+1:i+1] - sma_tp[i]))
    with np.errstate(divide='ignore', invalid='ignore'):
        return (tp - sma_tp) / np.where(mad == 0, np.nan, 0.015 * mad)

def calc_roc(close, period=12):
    out = np.full(len(close), np.nan)
    out[period:] = (close[period:] / close[:-period] - 1) * 100
    return out


# ── VOLATILITY ────────────────────────────────

def calc_atr(high, low, close, length=14):
    prev_c = np.empty_like(close); prev_c[0] = close[0]; prev_c[1:] = close[:-1]
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev_c), np.abs(low - prev_c)))
    return _wilder(tr, length)

def calc_bollinger(close, window=20, num_std=2):
    sma20 = _sma(close, window)
    std   = _rolling_std(close, window)
    upper = sma20 + num_std * std
    lower = sma20 - num_std * std
    band_range = upper - lower
    with np.errstate(divide='ignore', invalid='ignore'):
        bb_pos   = (close - lower) / np.where(band_range == 0, np.nan, band_range)
        bb_width = band_range / np.where(sma20 == 0, np.nan, sma20)
    return bb_pos, bb_width

def calc_keltner_pos(close, high, low, period=20, atr_mult=1.5):
    ema20 = _ema(close, period)
    atr   = calc_atr(high, low, close, period)
    upper = ema20 + atr_mult * atr
    lower = ema20 - atr_mult * atr
    band  = upper - lower
    with np.errstate(divide='ignore', invalid='ignore'):
        return (close - lower) / np.where(band == 0, np.nan, band)


# ── VOLUME ────────────────────────────────────

def calc_obv_slope(close, volume, period=10):
    direction = np.sign(np.diff(close, prepend=close[0]))
    obv = np.cumsum(direction * volume)
    slope = np.full(len(obv), np.nan)
    slope[period:] = (obv[period:] - obv[:-period]) / period
    # Normalize by average volume
    avg_vol = _sma(volume, period)
    with np.errstate(divide='ignore', invalid='ignore'):
        return slope / np.where(avg_vol == 0, np.nan, avg_vol)

def calc_mfi(high, low, close, volume, period=14):
    tp = (high + low + close) / 3.0
    raw_mf = tp * volume
    delta_tp = np.diff(tp, prepend=tp[0])
    pos_mf = np.where(delta_tp > 0, raw_mf, 0.0)
    neg_mf = np.where(delta_tp < 0, raw_mf, 0.0)
    n = len(close); mfi = np.full(n, np.nan)
    for i in range(period, n):
        pmf = np.sum(pos_mf[i-period+1:i+1])
        nmf = np.sum(neg_mf[i-period+1:i+1])
        if nmf == 0:
            mfi[i] = 100.0
        else:
            mfi[i] = 100.0 - 100.0 / (1.0 + pmf / nmf)
    return mfi

def calc_vwap_dist(close, high, low, volume):
    tp = (high + low + close) / 3.0
    cum_tpv = np.cumsum(tp * volume)
    cum_vol = np.cumsum(volume)
    with np.errstate(divide='ignore', invalid='ignore'):
        vwap = cum_tpv / np.where(cum_vol == 0, np.nan, cum_vol)
        return (close - vwap) / np.where(vwap == 0, np.nan, vwap)



# ══════════════════════════════════════════════
# FEATURE CALCULATION API
# ══════════════════════════════════════════════

def calculate_features(df):
    """
    Compute 30 technical indicators on the DataFrame.
    Returns DataFrame with new feature columns added.
    """
    # Ensure sorted by Date
    if "Date" in df.columns:
        df.sort_values("Date", inplace=True)
        df.reset_index(drop=True, inplace=True)

    c = df["Close"].to_numpy(np.float64)
    h = df["High"].to_numpy(np.float64)
    l = df["Low"].to_numpy(np.float64)
    o = df["Open"].to_numpy(np.float64)
    v = df["Volume"].to_numpy(np.float64)

    # ── TREND (9) ──────────────────────────
    df["MACD_Hist"]   = calc_macd_hist(c)
    df["ADX"]         = calc_adx(h, l, c, 14)
    ema5  = _ema(c, 5);  ema10 = _ema(c, 10)
    ema25 = _ema(c, 25); ema50 = _ema(c, 50)
    df["Dist_EMA5"]   = c / ema5  - 1.0
    df["Dist_EMA10"]  = c / ema10 - 1.0
    df["Dist_EMA25"]  = c / ema25 - 1.0
    df["Dist_EMA50"]  = c / ema50 - 1.0
    with np.errstate(divide='ignore', invalid='ignore'):
        df["Cross_5_10"]  = ema5  / np.where(ema10 == 0, np.nan, ema10) - 1.0
        df["Cross_10_25"] = ema10 / np.where(ema25 == 0, np.nan, ema25) - 1.0

    # ── MOMENTUM (5) ───────────────────────
    df["RSI"]       = calc_rsi(c, 14)
    df["Stoch_K"]   = calc_stochastic_k(h, l, c, 14)
    df["Williams_R"] = calc_williams_r(h, l, c, 14)
    df["CCI"]       = calc_cci(h, l, c, 20)
    df["ROC"]       = calc_roc(c, 12)

    # ── VOLATILITY (4) ─────────────────────
    df["ATR_norm"]    = calc_atr(h, l, c, 14) / c
    bb_pos, bb_width  = calc_bollinger(c, 20, 2)
    df["BB_Pos"]      = bb_pos
    df["BB_Width"]    = bb_width
    df["Keltner_Pos"] = calc_keltner_pos(c, h, l, 20, 1.5)

    # ── VOLUME (4) ─────────────────────────
    vol_sma = _sma(v, 20)
    with np.errstate(divide='ignore', invalid='ignore'):
        df["RVOL"] = v / np.where(vol_sma == 0, np.nan, vol_sma)
    df["OBV_slope"]  = calc_obv_slope(c, v, 10)
    df["MFI"]        = calc_mfi(h, l, c, v, 14)
    df["VWAP_dist"]  = calc_vwap_dist(c, h, l, v)

    # ── TIME (2) ──────────────────────────
    if "Date" in df.columns:
        df["Hour"]          = df["Date"].dt.hour
        df["Minute_bucket"] = df["Date"].dt.minute // 15  # 0,1,2,3

    # ── PRICE ACTION (3) ──────────────────
    body     = np.abs(c - o)
    full_rng = h - l
    with np.errstate(divide='ignore', invalid='ignore'):
        safe_rng = np.where(full_rng == 0, np.nan, full_rng)
        df["Body_ratio"]  = body / safe_rng
        df["Upper_wick"]  = (h - np.maximum(c, o)) / safe_rng
        df["Lower_wick"]  = (np.minimum(c, o) - l) / safe_rng

    # ── LAGGED (4) ────────────────────────
    rsi_arr  = df["RSI"].to_numpy()
    macd_arr = df["MACD_Hist"].to_numpy()
    df["RSI_lag3"]  = np.roll(rsi_arr, 3);  df.loc[:2, "RSI_lag3"]  = np.nan
    df["MACD_lag3"] = np.roll(macd_arr, 3); df.loc[:2, "MACD_lag3"] = np.nan
    df["Ret_lag1"]  = np.roll(c, 1) / c - 1; df.loc[:0, "Ret_lag1"] = np.nan
    df["Ret_lag3"]  = np.roll(c, 3) / c - 1; df.loc[:2, "Ret_lag3"] = np.nan

    return df


# ══════════════════════════════════════════════
# SINGLE-FILE PROCESSOR
# ══════════════════════════════════════════════

def process_one(fname):
    symbol   = fname.replace(".parquet", "")
    in_path  = os.path.join(INPUT_DIR, fname)
    out_path = os.path.join(OUTPUT_DIR, f"{symbol}_v2.parquet")

    try:
        df = pd.read_parquet(in_path)
        rows_raw = len(df)
        if rows_raw < 100:
            return {"symbol": symbol, "status": "too_short"}

        # Use shared function
        df = calculate_features(df)
        c = df["Close"].to_numpy(np.float64)

        # ── 3-CLASS TARGET (Only for training) ────────────────
        future_ret = df["Close"].shift(-6) / c - 1
        target = np.where(future_ret > 0.002, 1,
                 np.where(future_ret < -0.002, 2, 0))
        df["Target_Class"] = target

        # ── KEEP ONLY FEATURES + TARGET ───────
        FEATURES = [
            "Date",
            # Trend
            "MACD_Hist", "ADX",
            "Dist_EMA5", "Dist_EMA10", "Dist_EMA25", "Dist_EMA50",
            "Cross_5_10", "Cross_10_25",
            # Momentum
            "RSI", "Stoch_K", "Williams_R", "CCI", "ROC",
            # Volatility
            "ATR_norm", "BB_Pos", "BB_Width", "Keltner_Pos",
            # Volume
            "RVOL", "OBV_slope", "MFI", "VWAP_dist",
            # Time
            "Hour", "Minute_bucket",
            # Price Action
            "Body_ratio", "Upper_wick", "Lower_wick",
            # Lagged
            "RSI_lag3", "MACD_lag3", "Ret_lag1", "Ret_lag3",
            # Target
            "Target_Class",
        ]
        df = df[FEATURES].dropna().reset_index(drop=True)
        df.to_parquet(out_path, index=False)

        buys   = int((df["Target_Class"] == 1).sum())
        shorts = int((df["Target_Class"] == 2).sum())
        holds  = int((df["Target_Class"] == 0).sum())
        return {
            "symbol": symbol, "status": "ok",
            "rows_in": rows_raw, "rows_out": len(df),
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
    print("  Feature Engine v2  ·  30 Indicators  ·  3-Class")
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

    print(f"\n{'='*60}")
    print(f"  ✅  Processed {len(ok)}/{total} files in {elapsed:.1f}s")
    if errors:
        print(f"  ❌  Errors: {len(errors)}")
        for e in errors[:10]:
            print(f"       {e['symbol']}: {e['status']}")
    if ok:
        tot  = sum(r["rows_out"] for r in ok)
        buys = sum(r["buys"] for r in ok)
        shrt = sum(r["shorts"] for r in ok)
        hold = sum(r["holds"] for r in ok)
        print(f"  📊  Total rows : {tot:,}")
        if tot > 0:
            print(f"  🟢  Buy  (1)   : {buys:,}  ({buys/tot*100:.1f}%)")
            print(f"  🔴  Short (2)  : {shrt:,}  ({shrt/tot*100:.1f}%)")
            print(f"  ⚪  Hold  (0)  : {hold:,}  ({hold/tot*100:.1f}%)")
    print(f"  📂  Output: {os.path.abspath(OUTPUT_DIR)}")
    print("=" * 60)
