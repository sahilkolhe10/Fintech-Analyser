"""
backtest_v2.py
==============
Realistic intraday backtest using XGBoost v2 model.

Rules:
  - Capital: ₹5,000 with 5x leverage (₹25,000 effective)
  - Max 2 trades per day
  - Entry: at Close of signal candle
  - Exit: at Close of candle 6 bars later (30 min)
  - Buy signal: prob >= BUY_THRESHOLD
  - Short signal: prob >= SHORT_THRESHOLD
  - Transaction cost: 0.05% round-trip (brokerage + STT + charges)

Usage:
    python backtest_v2.py
"""

import os, glob, joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from xgboost import XGBClassifier

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
MODEL_PATH     = "xgb_v2.json"
SCALER_PATH    = "scaler_v2.pkl"
HISTORY_DIR    = os.path.join("data", "history")
PROCESSED_DIR  = os.path.join("data", "processed_v2")
PLOT_PATH      = "backtest_equity_v2.png"

# Thresholds (from optimizer)
BUY_THRESHOLD   = 0.87
SHORT_THRESHOLD = 0.79

# Trading params
INITIAL_CAPITAL  = 5000.0     # ₹
LEVERAGE         = 5.0
MAX_TRADES_DAY   = 2
HOLD_BARS        = 6          # 30 min (6 x 5-min candles)
COST_PCT         = 0.0005     # 0.05% round-trip cost

DROP_COLS = ["Date", "Target_Class"]


# ──────────────────────────────────────────────
# 1. LOAD DATA
# ──────────────────────────────────────────────
def load_data():
    """Load processed features + raw prices, merge on Date."""
    proc_files = sorted(glob.glob(os.path.join(PROCESSED_DIR, "*_v2.parquet")))
    hist_files = sorted(glob.glob(os.path.join(HISTORY_DIR, "*.parquet")))

    # Build symbol map for history
    hist_map = {}
    for f in hist_files:
        sym = os.path.basename(f).replace(".parquet", "")
        hist_map[sym] = f

    all_rows = []
    for pf in proc_files:
        sym = os.path.basename(pf).replace("_v2.parquet", "")
        if sym not in hist_map:
            continue

        proc = pd.read_parquet(pf)
        hist = pd.read_parquet(hist_map[sym])[["Date", "Close"]].rename(columns={"Close": "Price"})

        proc["Date"] = pd.to_datetime(proc["Date"])
        hist["Date"] = pd.to_datetime(hist["Date"])

        # Merge to get actual price at each feature row
        merged = proc.merge(hist, on="Date", how="left")

        # Also get the price 6 bars ahead for exit
        hist_sorted = hist.sort_values("Date").reset_index(drop=True)
        hist_sorted["Price_Exit"] = hist_sorted["Price"].shift(-HOLD_BARS)
        merged = merged.merge(hist_sorted[["Date", "Price_Exit"]], on="Date", how="left")

        merged["Symbol"] = sym
        all_rows.append(merged)

    df = pd.concat(all_rows, ignore_index=True)
    df.sort_values("Date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# ──────────────────────────────────────────────
# 2. GENERATE SIGNALS
# ──────────────────────────────────────────────
def generate_signals(df, model, scaler, feat_cols):
    """Add Buy/Short signal columns based on model predictions."""
    X = df[feat_cols].to_numpy(dtype=np.float32)
    X_scaled = scaler.transform(X)
    probs = model.predict_proba(X_scaled)

    df["prob_buy"]   = probs[:, 1]
    df["prob_short"] = probs[:, 2]
    df["signal"] = "none"
    df.loc[df["prob_buy"]   >= BUY_THRESHOLD,   "signal"] = "buy"
    df.loc[df["prob_short"] >= SHORT_THRESHOLD,  "signal"] = "short"

    # If both triggered, pick higher probability
    both_mask = (df["prob_buy"] >= BUY_THRESHOLD) & (df["prob_short"] >= SHORT_THRESHOLD)
    df.loc[both_mask & (df["prob_buy"] >= df["prob_short"]), "signal"] = "buy"
    df.loc[both_mask & (df["prob_short"] > df["prob_buy"]), "signal"] = "short"

    return df


# ──────────────────────────────────────────────
# 3. SIMULATE
# ──────────────────────────────────────────────
def simulate(df):
    """Run the backtest simulation."""
    capital = INITIAL_CAPITAL
    equity_curve = []
    trades = []
    daily_trade_count = {}

    # Only use test period (last 15% sorted by date)
    dates = df["Date"].unique()
    cutoff_idx = int(len(dates) * 0.85)
    test_start = dates[cutoff_idx]
    df_test = df[df["Date"] >= test_start].copy()

    # Further filter to rows with valid signals and exit prices
    signals = df_test[
        (df_test["signal"].isin(["buy", "short"])) &
        (df_test["Price"].notna()) &
        (df_test["Price_Exit"].notna())
    ].copy()

    print(f"📊  Test period: {pd.Timestamp(test_start).date()} → {df_test['Date'].max().date()}")
    print(f"📊  Total signals: {len(signals):,}")
    print(f"     Buy signals:   {(signals['signal'] == 'buy').sum():,}")
    print(f"     Short signals: {(signals['signal'] == 'short').sum():,}")

    # Sort by date, then by probability (highest first)
    signals["max_prob"] = signals[["prob_buy", "prob_short"]].max(axis=1)
    signals.sort_values(["Date", "max_prob"], ascending=[True, False], inplace=True)

    for _, row in signals.iterrows():
        date_key = row["Date"].date()

        # Check daily limit
        if daily_trade_count.get(date_key, 0) >= MAX_TRADES_DAY:
            continue

        entry_price = row["Price"]
        exit_price  = row["Price_Exit"]
        signal_type = row["signal"]

        # Position size: use all capital with leverage
        position_value = capital * LEVERAGE
        qty = position_value / entry_price

        # P&L
        if signal_type == "buy":
            raw_pnl = (exit_price - entry_price) * qty
        else:  # short
            raw_pnl = (entry_price - exit_price) * qty

        # Transaction costs
        cost = position_value * COST_PCT * 2  # entry + exit
        net_pnl = raw_pnl - cost
        pnl_pct = net_pnl / capital * 100

        capital += net_pnl
        daily_trade_count[date_key] = daily_trade_count.get(date_key, 0) + 1

        trades.append({
            "date": row["Date"],
            "symbol": row["Symbol"],
            "signal": signal_type,
            "entry": round(entry_price, 2),
            "exit": round(exit_price, 2),
            "qty": round(qty, 2),
            "pnl": round(net_pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "capital": round(capital, 2),
            "prob": round(row["max_prob"], 4),
        })

        equity_curve.append({"date": row["Date"], "capital": capital})

        if capital <= 0:
            print("💀  Capital wiped out!")
            break

    return trades, equity_curve


# ──────────────────────────────────────────────
# 4. REPORT
# ──────────────────────────────────────────────
def print_report(trades):
    if not trades:
        print("❌  No trades executed."); return

    df = pd.DataFrame(trades)
    total = len(df)
    wins = (df["pnl"] > 0).sum()
    losses = (df["pnl"] <= 0).sum()
    win_rate = wins / total * 100

    total_pnl   = df["pnl"].sum()
    avg_pnl     = df["pnl"].mean()
    max_win     = df["pnl"].max()
    max_loss    = df["pnl"].min()
    final_cap   = df["capital"].iloc[-1]
    total_return = (final_cap / INITIAL_CAPITAL - 1) * 100

    # Buy vs Short breakdown
    buys   = df[df["signal"] == "buy"]
    shorts = df[df["signal"] == "short"]

    # Sharpe-like ratio (daily returns)
    df["date_only"] = df["date"].dt.date
    daily_pnl = df.groupby("date_only")["pnl"].sum()
    sharpe = daily_pnl.mean() / daily_pnl.std() * np.sqrt(252) if daily_pnl.std() > 0 else 0

    # Max drawdown
    capitals = [INITIAL_CAPITAL] + df["capital"].tolist()
    peak = capitals[0]
    max_dd = 0
    for c in capitals:
        if c > peak: peak = c
        dd = (peak - c) / peak * 100
        if dd > max_dd: max_dd = dd

    print(f"\n{'='*60}")
    print("  📊  BACKTEST RESULTS")
    print(f"{'='*60}")
    print(f"  💰  Initial Capital  : ₹{INITIAL_CAPITAL:,.0f}")
    print(f"  💰  Final Capital    : ₹{final_cap:,.2f}")
    print(f"  📈  Total Return     : {total_return:+.1f}%")
    print(f"  📈  Total P&L        : ₹{total_pnl:+,.2f}")
    print(f"  🏦  Leverage         : {LEVERAGE}x")
    print(f"")
    print(f"  📋  Total Trades     : {total}")
    print(f"  ✅  Wins             : {wins} ({win_rate:.1f}%)")
    print(f"  ❌  Losses           : {losses} ({100-win_rate:.1f}%)")
    print(f"  📊  Avg P&L/trade    : ₹{avg_pnl:+,.2f}")
    print(f"  🏆  Best Trade       : ₹{max_win:+,.2f}")
    print(f"  💀  Worst Trade      : ₹{max_loss:+,.2f}")
    print(f"  📉  Max Drawdown     : {max_dd:.1f}%")
    print(f"  📊  Sharpe Ratio     : {sharpe:.2f}")
    print(f"")
    print(f"  🟢  Buy trades       : {len(buys)}  |  Win rate: {(buys['pnl']>0).mean()*100:.1f}%  |  Avg P&L: ₹{buys['pnl'].mean():+,.2f}" if len(buys) > 0 else "  🟢  Buy trades: 0")
    print(f"  🔴  Short trades     : {len(shorts)}  |  Win rate: {(shorts['pnl']>0).mean()*100:.1f}%  |  Avg P&L: ₹{shorts['pnl'].mean():+,.2f}" if len(shorts) > 0 else "  🔴  Short trades: 0")
    print(f"{'='*60}")

    # Top 5 trades
    print(f"\n  📋  TOP 5 WINNING TRADES")
    print(f"  {'Date':<20} {'Symbol':<12} {'Signal':<6} {'P&L':>10} {'Prob':>8}")
    for _, r in df.nlargest(5, "pnl").iterrows():
        print(f"  {str(r['date'])[:19]:<20} {r['symbol']:<12} {r['signal']:<6} ₹{r['pnl']:>+8.2f} {r['prob']:.4f}")

    # Last 10 trades
    print(f"\n  📋  LAST 10 TRADES")
    print(f"  {'Date':<20} {'Symbol':<12} {'Signal':<6} {'Entry':>8} {'Exit':>8} {'P&L':>10} {'Capital':>10}")
    for _, r in df.tail(10).iterrows():
        print(f"  {str(r['date'])[:19]:<20} {r['symbol']:<12} {r['signal']:<6} {r['entry']:>8.2f} {r['exit']:>8.2f} ₹{r['pnl']:>+8.2f} ₹{r['capital']:>9.2f}")

    return df


def plot_equity(equity_curve, trades_df):
    if not equity_curve:
        return

    eq = pd.DataFrame(equity_curve)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), gridspec_kw={"height_ratios": [3, 1]})

    # Equity curve
    ax1.plot(eq["date"], eq["capital"], color="#2ecc71", lw=1.5)
    ax1.axhline(INITIAL_CAPITAL, color="gray", ls="--", alpha=0.5, label=f"Start ₹{INITIAL_CAPITAL:,.0f}")
    ax1.fill_between(eq["date"], INITIAL_CAPITAL, eq["capital"],
                     where=eq["capital"] >= INITIAL_CAPITAL, alpha=0.2, color="#2ecc71")
    ax1.fill_between(eq["date"], INITIAL_CAPITAL, eq["capital"],
                     where=eq["capital"] < INITIAL_CAPITAL, alpha=0.2, color="#e74c3c")
    ax1.set_ylabel("Capital (₹)")
    ax1.set_title(f"XGBoost v2 Backtest — ₹{INITIAL_CAPITAL:,.0f} × {LEVERAGE:.0f}x Leverage", fontsize=14, fontweight="bold")
    ax1.legend()
    ax1.grid(alpha=0.3)

    # Daily P&L bar chart
    if trades_df is not None and len(trades_df) > 0:
        trades_df["date_only"] = pd.to_datetime(trades_df["date"]).dt.date
        daily = trades_df.groupby("date_only")["pnl"].sum()
        colors = ["#2ecc71" if v > 0 else "#e74c3c" for v in daily.values]
        ax2.bar(daily.index, daily.values, color=colors, alpha=0.7)
        ax2.axhline(0, color="gray", ls="-", alpha=0.3)
        ax2.set_ylabel("Daily P&L (₹)")
        ax2.set_xlabel("Date")
        ax2.grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(PLOT_PATH, dpi=150)
    print(f"📈  Equity curve → {PLOT_PATH}")


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  XGBoost v2 Backtest Simulation")
    print("=" * 60)
    print(f"  Capital: ₹{INITIAL_CAPITAL:,.0f}  |  Leverage: {LEVERAGE}x  |  Max trades/day: {MAX_TRADES_DAY}")
    print(f"  Buy threshold: {BUY_THRESHOLD}  |  Short threshold: {SHORT_THRESHOLD}")
    print()

    # Load model + scaler
    model = XGBClassifier()
    model.load_model(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    print(f"🚀  Model: {MODEL_PATH}  |  Scaler: {SCALER_PATH}")

    # Get feature columns
    booster = model.get_booster()
    feat_cols = booster.feature_names if hasattr(booster, "feature_names") and booster.feature_names else None
    if feat_cols is None:
        raise ValueError("Model has no feature names stored")
    print(f"📊  Features: {len(feat_cols)}")

    # Load data
    print("\n📂  Loading & merging data...")
    df = load_data()
    print(f"📊  Total merged rows: {len(df):,}")

    # Generate signals
    print("🔮  Generating predictions...")
    df = generate_signals(df, model, scaler, feat_cols)

    # Simulate
    print("\n🎲  Running simulation...")
    trades, equity_curve = simulate(df)

    # Report
    trades_df = print_report(trades)
    plot_equity(equity_curve, trades_df)

    # Save trades to CSV
    if trades:
        csv_path = "backtest_trades_v2.csv"
        pd.DataFrame(trades).to_csv(csv_path, index=False)
        print(f"💾  Trade log → {csv_path}")

    print(f"\n{'='*60}")
    print("  ✅  Backtest complete!")
    print("=" * 60)
