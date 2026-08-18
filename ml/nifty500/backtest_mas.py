"""
backtest_mas.py
===============
Backtests the pre-trained XGBoost v2 model (30 technical indicators)
on real Nifty 500 data via Shoonya API (5-minute candles, 3 months).

Architecture:  Data Agent (Shoonya) -> Strategy Agent (xgb_v2) -> Risk Agent -> DeepSeek Filter -> Judge
Capital:       ₹10,000 with 5x leverage

USAGE:
    python backtest_mas.py              # Use cached signals if available
    python backtest_mas.py --refresh    # Force re-download from Shoonya
"""

import os, sys, time, hashlib, warnings, io, zipfile
import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
import requests
from datetime import datetime, timedelta
from NorenRestApiPy.NorenApi import NorenApi
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
load_dotenv()

from feature_engine_v2 import calculate_features
from deepseek_filter import should_execute_trade
try:
    from data_loader import ALL_NIFTY_STOCKS
except ImportError:
    from data_loader import NIFTY_50, NIFTY_NEXT50
    ALL_NIFTY_STOCKS = NIFTY_50 + NIFTY_NEXT50

# ══════════════════════════════════════════════
# SHOONYA CONFIG
# ══════════════════════════════════════════════
SHOONYA_USER    = os.getenv("SHOONYA_USER")
SHOONYA_PWD     = os.getenv("SHOONYA_PWD")
SHOONYA_TOTP    = os.getenv("SHOONYA_TOTP")
SHOONYA_VC      = os.getenv("SHOONYA_VC")
SHOONYA_API_KEY = os.getenv("SHOONYA_API_KEY")
SHOONYA_IMEI    = os.getenv("SHOONYA_IMEI")

# ══════════════════════════════════════════════
# TRADING CONFIG  (tweak these freely!)
# ══════════════════════════════════════════════
CAPITAL            = 10_000
LEVERAGE           = 5.0
MAX_TRADES_PER_DAY = 2
MODEL_PATH         = "xgb_v2.json"
SCALER_PATH        = "scaler_v2.pkl"

BUY_THRESH         = 0.87
SHORT_THRESH       = 0.87      # ← RAISED to match BUY

HOLD_CANDLES       = 6         # 30 min hold (matches training target)
HISTORY_DAYS       = 90        # 3 months

# ── NEW RISK CONTROLS ──
STOP_LOSS          = 500       # ₹500 max loss per trade
TARGET_PCT         = 0.025     # 2.5% take-profit target
POSITION_PCT       = 0.50      # 50% of capital per trade
USE_DEEPSEEK       = True      # Toggle DeepSeek (set False for fast iteration)

# ── CACHING ──
SIGNALS_CACHE      = "signals_cache.csv"

FEATURE_COLS = [
    "MACD_Hist", "ADX",
    "Dist_EMA5", "Dist_EMA10", "Dist_EMA25", "Dist_EMA50",
    "Cross_5_10", "Cross_10_25",
    "RSI", "Stoch_K", "Williams_R", "CCI", "ROC",
    "ATR_norm", "BB_Pos", "BB_Width", "Keltner_Pos",
    "RVOL", "OBV_slope", "MFI", "VWAP_dist",
    "Hour", "Minute_bucket",
    "Body_ratio", "Upper_wick", "Lower_wick",
    "RSI_lag3", "MACD_lag3", "Ret_lag1", "Ret_lag3",
]


# ══════════════════════════════════════════════
# SHOONYA API
# ══════════════════════════════════════════════

class ShoonyaApiPy(NorenApi):
    def __init__(self):
        NorenApi.__init__(
            self,
            host='https://api.shoonya.com/NorenWClientTP/',
            websocket='wss://api.shoonya.com/NorenWSTP/'
        )


def login_shoonya():
    import pyotp, json
    api = ShoonyaApiPy()
    pwd_hash = hashlib.sha256(SHOONYA_PWD.encode()).hexdigest()
    appkey = hashlib.sha256(f"{SHOONYA_USER}|{SHOONYA_API_KEY}".encode()).hexdigest()
    totp = pyotp.TOTP(SHOONYA_TOTP).now()

    payload = {
        "source": "API", "apkversion": "1.0.0",
        "uid": SHOONYA_USER, "pwd": pwd_hash, "factor2": totp,
        "vc": SHOONYA_VC, "appkey": appkey, "imei": SHOONYA_IMEI,
    }
    resp = requests.post(
        "https://api.shoonya.com/NorenWClientTP/QuickAuth",
        data="jData=" + json.dumps(payload),
    )
    data = resp.json()
    if data.get("stat") != "Ok":
        print(f"  ❌ Shoonya login failed: {data}")
        sys.exit(1)

    api.set_session(userid=SHOONYA_USER, password=pwd_hash,
                    usertoken=data.get("susertoken", ""))
    print(f"  ✅ Logged in as {data.get('uname', SHOONYA_USER)}")
    return api


def download_scrip_master():
    print("  📥 Downloading NSE scrip master…")
    try:
        resp = requests.get("https://api.shoonya.com/NSE_symbols.txt.zip", timeout=30)
        resp.raise_for_status()
        z = zipfile.ZipFile(io.BytesIO(resp.content))
        df = pd.read_csv(z.open(z.namelist()[0]))
        print(f"  ✅ Loaded {len(df):,} instruments")
        return df
    except Exception as e:
        print(f"  ⚠️ Scrip download failed: {e}")
        return None


def build_token_map(scrip_df):
    if scrip_df is None:
        return {}
    eq = scrip_df[scrip_df["Instrument"].isin(["EQ", "BE"])].copy()
    token_map = {}
    for _, row in eq.iterrows():
        sym = str(row.get("Symbol", "")).strip()
        tok = str(row.get("Token", "")).strip()
        tsym = str(row.get("TradingSymbol", "")).strip()
        if sym and tok:
            token_map[sym] = {"token": tok, "tsym": tsym}
    return token_map


def fetch_stock_data(api, token, symbol, days=HISTORY_DAYS):
    now = datetime.now()
    start = now - timedelta(days=days)
    try:
        ret = api.get_time_price_series(
            exchange="NSE", token=str(token),
            starttime=start.timestamp(), endtime=now.timestamp(), interval=5,
        )
    except Exception:
        return pd.DataFrame()

    if ret is None or not isinstance(ret, list) or len(ret) == 0:
        return pd.DataFrame()

    records = []
    for c in ret:
        try:
            t = c.get("time", "")
            if not t and "ssboe" in c:
                t = datetime.fromtimestamp(int(c["ssboe"]))
            else:
                t = pd.to_datetime(t, dayfirst=True)
            records.append({
                "Date": t, "Open": float(c.get("into", 0)),
                "High": float(c.get("inth", 0)), "Low": float(c.get("intl", 0)),
                "Close": float(c.get("intc", 0)),
                "Volume": int(float(c.get("intv", c.get("v", 0)))),
            })
        except Exception:
            continue

    if not records:
        return pd.DataFrame()
    df = pd.DataFrame(records).sort_values("Date").reset_index(drop=True)
    return df


# ══════════════════════════════════════════════
# SIGNAL GENERATION (cached)
# ══════════════════════════════════════════════

def generate_all_signals(force_refresh=False):
    """Download data, compute features, predict, and CACHE all signals."""

    # ── Check cache ──
    if not force_refresh and os.path.exists(SIGNALS_CACHE):
        age_hrs = (time.time() - os.path.getmtime(SIGNALS_CACHE)) / 3600
        print(f"\n📂 Found cached signals ({age_hrs:.1f}h old)")
        df = pd.read_csv(SIGNALS_CACHE, parse_dates=["Date"])
        print(f"  ✅ Loaded {len(df):,} signals from cache")
        return df

    # ── Full pipeline ──
    print("\n🔑 [Data Agent] Logging into Shoonya…")
    api = login_shoonya()

    scrip_df = download_scrip_master()
    token_map = build_token_map(scrip_df)
    print(f"  ✅ Token map: {len(token_map)} NSE equities")

    model = xgb.XGBClassifier()
    model.load_model(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    print(f"  ✅ Loaded {MODEL_PATH} + {SCALER_PATH}")

    print(f"\n📡 Fetching {HISTORY_DAYS}d of 5-min data for {len(ALL_NIFTY_STOCKS)} stocks…")
    all_signals = []
    fetched = 0
    skipped = 0

    for i, sym in enumerate(ALL_NIFTY_STOCKS, 1):
        if sym not in token_map:
            skipped += 1
            continue

        tok = token_map[sym]["token"]
        df = fetch_stock_data(api, tok, sym, HISTORY_DAYS)
        if df.empty or len(df) < 200:
            skipped += 1
            time.sleep(0.15)
            continue

        try:
            df = calculate_features(df)
            df.dropna(subset=FEATURE_COLS, inplace=True)
            if len(df) < 100:
                skipped += 1
                continue

            X = df[FEATURE_COLS].astype(np.float32).values
            X_scaled = scaler.transform(X)
            probs = model.predict_proba(X_scaled)

            df["p_buy"]   = probs[:, 1]
            df["p_short"] = probs[:, 2]
            df["entry_price"] = df["Open"].shift(-1)
            df["exit_price"]  = df["Close"].shift(-HOLD_CANDLES)
            df["Symbol"] = sym

            # Save ALL signals where any probability > 0.40
            mask = (df["p_buy"] >= 0.40) | (df["p_short"] >= 0.40)
            mask &= df["entry_price"].notna() & df["exit_price"].notna()

            if mask.any():
                out = df.loc[mask, ["Date", "Symbol", "p_buy", "p_short",
                                     "entry_price", "exit_price",
                                     "Close", "High", "Low"]].copy()
                all_signals.append(out)

        except Exception:
            pass

        fetched += 1
        if fetched % 25 == 0:
            print(f"    [{fetched} fetched / {skipped} skipped / {i}/{len(ALL_NIFTY_STOCKS)}]")
        time.sleep(0.2)

    print(f"  ✅ Fetched {fetched} stocks | Skipped {skipped}")

    if not all_signals:
        print("  ⚠️ No signals generated!")
        return pd.DataFrame()

    signals = pd.concat(all_signals, ignore_index=True)
    signals = signals.sort_values("Date").reset_index(drop=True)

    # ── Save cache ──
    signals.to_csv(SIGNALS_CACHE, index=False)
    print(f"  💾 Cached {len(signals):,} signals → {SIGNALS_CACHE}")

    return signals


# ══════════════════════════════════════════════
# BACKTEST ENGINE (fast — works on cached signals)
# ══════════════════════════════════════════════

def run_backtest():
    print("=" * 65)
    print("  MAS BACKTEST — XGBoost v2 + DeepSeek + SL/TP")
    print(f"  Capital ₹{CAPITAL:,} | Lev {LEVERAGE}x | Pos {POSITION_PCT:.0%} | SL ₹{STOP_LOSS} | TP {TARGET_PCT:.1%}")
    print(f"  Thresholds: BUY ≥ {BUY_THRESH}  |  SHORT ≥ {SHORT_THRESH}")
    print("=" * 65)

    if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH):
        print("❌ Model/Scaler not found!")
        return

    # ── Load or generate signals ──
    force = "--refresh" in sys.argv
    raw_signals = generate_all_signals(force_refresh=force)

    if raw_signals.empty:
        return

    # ── Apply thresholds ──
    buy_mask   = (raw_signals["p_buy"]   >= BUY_THRESH)
    short_mask = (raw_signals["p_short"] >= SHORT_THRESH)

    buys   = raw_signals.loc[buy_mask].copy()
    shorts = raw_signals.loc[short_mask].copy()
    buys["signal"],   buys["conf"]   = "BUY",   buys["p_buy"]
    shorts["signal"], shorts["conf"] = "SHORT", shorts["p_short"]

    filtered = pd.concat([buys, shorts], ignore_index=True)
    filtered = filtered.sort_values("Date").reset_index(drop=True)
    filtered["trade_date"] = pd.to_datetime(filtered["Date"]).dt.date

    n_buy   = (filtered["signal"] == "BUY").sum()
    n_short = (filtered["signal"] == "SHORT").sum()
    print(f"\n  📊 Filtered signals: {len(filtered)} ({n_buy} BUY / {n_short} SHORT)")

    # ── Deduplicate: one signal per stock per day ──
    filtered = filtered.sort_values("conf", ascending=False)
    filtered = filtered.drop_duplicates(subset=["trade_date", "Symbol"], keep="first")
    filtered = filtered.sort_values(["trade_date", "conf"], ascending=[True, False])
    print(f"  📊 After dedup: {len(filtered)} unique stock-day signals")

    # ── DeepSeek cache ──
    deepseek_cache = {}
    ds_approved, ds_skipped = 0, 0

    # ── Backtest loop ──
    print(f"\n⚖️  [Judge] Running backtest…")
    capital = float(CAPITAL)
    trades  = []
    equity  = [capital]

    for date, day_sigs in filtered.groupby("trade_date"):
        day_sigs = day_sigs.sort_values("conf", ascending=False)
        day_count = 0

        for _, row in day_sigs.iterrows():
            if day_count >= MAX_TRADES_PER_DAY:
                break

            entry = row["entry_price"]
            exit_ = row["exit_price"]
            if pd.isna(entry) or pd.isna(exit_) or entry <= 0 or exit_ <= 0:
                continue

            # ── RISK AGENT: volatility gate ──
            micro_vol = (row["High"] / row["Low"]) - 1 if row["Low"] > 0 else 1
            if micro_vol > 0.04:
                continue

            # ── POSITION SIZING: 50% of capital ──
            trade_val = capital * POSITION_PCT * LEVERAGE
            qty = max(1, int(trade_val / entry))

            # ── DEEPSEEK GATEKEEPER (optional) ──
            sym = row["Symbol"]
            if USE_DEEPSEEK:
                cache_key = f"{sym}_{row['signal']}"
                if cache_key not in deepseek_cache:
                    verdict = should_execute_trade(sym, row["signal"], row["conf"], verbose=True)
                    deepseek_cache[cache_key] = verdict
                    time.sleep(0.5)
                else:
                    verdict = deepseek_cache[cache_key]

                if not verdict["execute"]:
                    ds_skipped += 1
                    continue
                ds_approved += 1

            # ── RAW P&L ──
            if row["signal"] == "BUY":
                raw_pnl = (exit_ - entry) * qty
            else:
                raw_pnl = (entry - exit_) * qty

            # ── STOP-LOSS: cap loss at ₹STOP_LOSS ──
            if raw_pnl < -STOP_LOSS:
                pnl = -STOP_LOSS
                exit_type = "SL"
            # ── TAKE-PROFIT: cap gain at TARGET_PCT ──
            elif raw_pnl > entry * TARGET_PCT * qty:
                pnl = entry * TARGET_PCT * qty
                exit_type = "TP"
            else:
                pnl = raw_pnl
                exit_type = "HOLD"

            capital += pnl
            day_count += 1

            trades.append({
                "date":      str(date),
                "time":      str(row["Date"]),
                "symbol":    sym,
                "signal":    row["signal"],
                "conf":      round(row["conf"], 3),
                "entry":     round(entry, 2),
                "exit":      round(exit_, 2),
                "qty":       qty,
                "raw_pnl":   round(raw_pnl, 2),
                "pnl":       round(pnl, 2),
                "exit_type": exit_type,
                "capital":   round(capital, 2),
            })

        equity.append(capital)

    # ── RESULTS ──
    tdf = pd.DataFrame(trades)

    print("\n" + "=" * 65)
    print("  📊  BACKTEST RESULTS — XGBoost v2 + SL/TP")
    print("=" * 65)

    if USE_DEEPSEEK:
        print(f"  🤖 DeepSeek: {ds_approved} approved / {ds_skipped} skipped")

    if tdf.empty:
        print("  ⚠️ No trades executed!")
        return

    total  = len(tdf)
    wins   = (tdf["pnl"] > 0).sum()
    losses = (tdf["pnl"] < 0).sum()
    wr     = wins / total * 100

    total_pnl = tdf["pnl"].sum()
    final_cap = CAPITAL + total_pnl
    roi       = (final_cap / CAPITAL - 1) * 100

    gp = tdf.loc[tdf["pnl"] > 0, "pnl"].sum()
    gl = abs(tdf.loc[tdf["pnl"] < 0, "pnl"].sum()) or 1
    pf = gp / gl

    aw = tdf.loc[tdf["pnl"] > 0, "pnl"].mean() if wins   else 0
    al = tdf.loc[tdf["pnl"] < 0, "pnl"].mean() if losses else 0

    daily    = tdf.groupby("date")["pnl"].sum()
    pd_count = (daily > 0).sum()

    eq   = np.array(equity)
    peak = np.maximum.accumulate(eq)
    dd   = (eq - peak) / np.where(peak == 0, 1, peak)

    # Exit type breakdown
    sl_count = (tdf["exit_type"] == "SL").sum()
    tp_count = (tdf["exit_type"] == "TP").sum()
    hd_count = (tdf["exit_type"] == "HOLD").sum()

    print(f"  Starting Capital   : ₹{CAPITAL:>10,}")
    print(f"  Final Capital      : ₹{final_cap:>10,.0f}")
    print(f"  Total P&L          : ₹{total_pnl:>+10,.0f}  ({roi:+.1f}%)")
    print(f"  Leverage           : {LEVERAGE}x  |  Position: {POSITION_PCT:.0%}")
    print()
    print(f"  Total Trades       : {total}")
    print(f"   ├─ Buys           : {(tdf['signal']=='BUY').sum()}")
    print(f"   └─ Shorts         : {(tdf['signal']=='SHORT').sum()}")
    print(f"  Win Rate           : {wr:.1f}%  ({wins}W / {losses}L)")
    print(f"  Profit Factor      : {pf:.2f}")
    print()
    print(f"  Exit Types:")
    print(f"   ├─ Stop-Loss (₹{STOP_LOSS}) : {sl_count}")
    print(f"   ├─ Take-Profit ({TARGET_PCT:.1%}) : {tp_count}")
    print(f"   └─ Full Hold       : {hd_count}")
    print()
    print(f"  Avg Win            : ₹{aw:>+,.1f}")
    print(f"  Avg Loss           : ₹{al:>+,.1f}")
    print(f"  Max Win            : ₹{tdf['pnl'].max():>+,.1f}")
    print(f"  Max Loss           : ₹{tdf['pnl'].min():>+,.1f}")
    print()
    print(f"  Trading Days       : {len(daily)}")
    print(f"  Profitable Days    : {pd_count}/{len(daily)}  ({pd_count/max(1,len(daily))*100:.0f}%)")
    print(f"  Max Drawdown       : {dd.min()*100:.1f}%")

    print(f"\n  📈 Top 5 Winners:")
    for _, t in tdf.nlargest(5, "pnl").iterrows():
        print(f"    {t['date']} | {t['symbol']:>12} | {t['signal']:>5} | ₹{t['pnl']:>+9.0f} | {t['exit_type']:>4} | Conf {t['conf']:.2f}")

    print(f"\n  📉 Top 5 Losers:")
    for _, t in tdf.nsmallest(5, "pnl").iterrows():
        print(f"    {t['date']} | {t['symbol']:>12} | {t['signal']:>5} | ₹{t['pnl']:>+9.0f} | {t['exit_type']:>4} | Conf {t['conf']:.2f}")

    tdf.to_csv("backtest_mas_trades.csv", index=False)
    print(f"\n  💾 Saved → backtest_mas_trades.csv ({total} trades)")
    print("=" * 65)


if __name__ == "__main__":
    run_backtest()
