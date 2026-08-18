"""
optimize_7y.py
==============
Threshold optimizer for 7-Year XGBoost Model.
Evaluates on 2026 Out-of-Time Test Set.

Usage:
    python optimize_7y.py
"""

import os, glob
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from xgboost import XGBClassifier

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
INPUT_DIR   = os.path.join("data", "processed_7y")
MODEL_PATH  = "xgb_7y_model.json"
PLOT_PATH   = "threshold_curve_7y.png"
TEST_DATE   = "2026-01-01"
MIN_TRADES  = 50

# ──────────────────────────────────────────────
# LOAD TEST DATA (2026+)
# ──────────────────────────────────────────────
def load_test_data():
    files = sorted(glob.glob(os.path.join(INPUT_DIR, "*.parquet")))
    print(f"📂  Scanning {len(files)} files for 2026 data...")
    
    frames = []
    for f in files:
        df = pd.read_parquet(f)
        df["Time"] = pd.to_datetime(df["Time"])
        mask = df["Time"] >= TEST_DATE
        if mask.any():
            frames.append(df[mask])
    
    test = pd.concat(frames, ignore_index=True)
    test.sort_values("Time", inplace=True)
    test.reset_index(drop=True, inplace=True)
    
    # Float32
    fcols = test.select_dtypes(include="float64").columns
    if len(fcols) > 0:
        test[fcols] = test[fcols].astype(np.float32)
        
    print(f"📊  2026 Test Data: {len(test):,} rows")
    return test

# ──────────────────────────────────────────────
# SWEEP
# ──────────────────────────────────────────────
def sweep_thresholds(probs, y_true, cls):
    rows = []
    for t in np.arange(0.30, 0.98, 0.01):
        mask = probs[:, cls] >= t
        n_trades = mask.sum()
        if n_trades == 0: continue
        
        wins = (y_true[mask] == cls).sum()
        prec = wins / n_trades
        total_cls = (y_true == cls).sum()
        rec = wins / total_cls if total_cls > 0 else 0
        
        rows.append({
            "threshold": round(t, 2),
            "trades": n_trades,
            "wins": wins,
            "precision": prec,
            "recall": rec
        })
    return pd.DataFrame(rows)

def plot_curves(res_buy, res_short):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    for ax, df, title, color in [
        (ax1, res_buy, "🟢 BUY (Class 1)", "#2ecc71"),
        (ax2, res_short, "🔴 SHORT (Class 2)", "#e74c3c")
    ]:
        if df.empty: continue
        ax.plot(df["threshold"], df["precision"], color=color, lw=2, label="Precision")
        ax.plot(df["threshold"], df["recall"], color=color, lw=1, ls="--", alpha=0.5, label="Recall")
        
        ax2_twin = ax.twinx()
        ax2_twin.bar(df["threshold"], df["trades"], alpha=0.15, color=color, width=0.008, label="Trades")
        ax2_twin.set_ylabel("Trades")
        
        ax.set_title(title)
        ax.set_xlabel("Threshold")
        ax.set_ylabel("Precision / Recall")
        ax.legend(loc="upper left")
        ax.set_ylim(0, 1)
        ax.grid(alpha=0.3)
        
    plt.suptitle("7-Year XGBoost — 2026 Out-of-Time Performance", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(PLOT_PATH, dpi=150)
    print(f"📈  Plot saved to {PLOT_PATH}")

# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  7-Year XGBoost Optimizer (2026 Test Set)")
    print("=" * 60)
    
    model = XGBClassifier()
    model.load_model(MODEL_PATH)
    print(f"🚀  Model loaded: {MODEL_PATH}")
    
    df = load_test_data()
    y = df["Target_Class"].to_numpy(dtype=int)
    
    # Feature cols
    drop_cols = ["Time", "Target_Class"]
    feat_cols = [c for c in df.columns if c not in drop_cols]
    X = df[feat_cols].astype(np.float32)
    
    print("🔮  Generating probabilities...")
    probs = model.predict_proba(X)
    
    res_buy = sweep_thresholds(probs, y, 1)
    res_short = sweep_thresholds(probs, y, 2)
    
    plot_curves(res_buy, res_short)
    
    # Recommendations
    def recommend(df, label):
        valid = df[df["trades"] >= MIN_TRADES]
        if valid.empty:
            print(f"  {label}: No threshold found with >{MIN_TRADES} trades")
            return
        best = valid.loc[valid["precision"].idxmax()]
        print(f"  {label} Recommended: Threshold {best['threshold']:.2f}")
        print(f"     Precision: {best['precision']:.1%}")
        print(f"     Trades:    {int(best['trades']):,}")
        
    print("\n🏆  Optimization Results (Min 50 trades in 2026):")
    recommend(res_buy, "🟢 BUY")
    recommend(res_short, "🔴 SHORT")
    print("=" * 60)
