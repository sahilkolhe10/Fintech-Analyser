"""
optimize_xgb_v2.py
==================
Threshold optimizer for v2 XGBoost model (30 features, normalized).
Sweeps probability thresholds for Buy and Short signals to find
the best precision while maintaining minimum trade count.

Usage:
    python optimize_xgb_v2.py
"""

import os, glob
import numpy as np
import pandas as pd
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from xgboost import XGBClassifier

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
PROCESSED_DIR = os.path.join("data", "processed_v2")
MODEL_PATH    = "xgb_v2.json"
SCALER_PATH   = "scaler_v2.pkl"
PLOT_PATH     = "threshold_curve_v2.png"
DROP_COLS     = ["Date", "Target_Class"]
TRAIN_RATIO   = 0.85
MIN_TRADES    = 50          # minimum trades for a threshold to be viable
LAST_N_MONTHS = 3           # evaluate on last 3 months of test data


def load_test_data():
    files = sorted(glob.glob(os.path.join(PROCESSED_DIR, "*_v2.parquet")))
    frames = [pd.read_parquet(f) for f in files]
    full = pd.concat(frames, ignore_index=True)
    full["Date"] = pd.to_datetime(full["Date"])
    full.sort_values("Date", inplace=True)
    full.reset_index(drop=True, inplace=True)

    split = int(len(full) * TRAIN_RATIO)
    test = full.iloc[split:].copy()

    # Keep only last N months
    cutoff = test["Date"].max() - pd.Timedelta(days=LAST_N_MONTHS * 30)
    test = test[test["Date"] >= cutoff].copy()
    print(f"📂  Test data: {len(test):,} rows  ({test['Date'].min().date()} → {test['Date'].max().date()})")
    return test


def sweep_thresholds(probs, y_true, cls):
    """Sweep thresholds 0.30 – 0.95 for a given class."""
    rows = []
    for t in np.arange(0.30, 0.96, 0.01):
        mask = probs[:, cls] >= t
        n_trades = mask.sum()
        if n_trades == 0:
            continue
        wins = (y_true[mask] == cls).sum()
        prec = wins / n_trades
        total_cls = (y_true == cls).sum()
        rec = wins / total_cls if total_cls > 0 else 0
        rows.append({"threshold": round(t, 2), "trades": n_trades,
                      "wins": wins, "precision": prec, "recall": rec})
    return pd.DataFrame(rows)


def plot_curves(res_buy, res_short):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    for ax, df, title, color in [
        (ax1, res_buy, "🟢 BUY (Class 1)", "#2ecc71"),
        (ax2, res_short, "🔴 SHORT (Class 2)", "#e74c3c"),
    ]:
        if df.empty:
            ax.set_title(f"{title} — No data"); continue
        ax.plot(df["threshold"], df["precision"], color=color, lw=2, label="Precision")
        ax.plot(df["threshold"], df["recall"], color=color, lw=1, ls="--", alpha=0.5, label="Recall")
        ax2_twin = ax.twinx()
        ax2_twin.bar(df["threshold"], df["trades"], alpha=0.15, color=color, width=0.008, label="Trades")
        ax2_twin.set_ylabel("Trades")
        ax.axhline(0.5, color="gray", ls=":", alpha=0.3)
        ax.set_xlabel("Threshold")
        ax.set_ylabel("Precision / Recall")
        ax.set_title(title)
        ax.legend(loc="upper left")
        ax.set_ylim(0, 1)

    plt.suptitle("XGBoost v2 — Precision vs Threshold (Last 3 Months)", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(PLOT_PATH, dpi=150)
    print(f"📈  Plot saved → {PLOT_PATH}")


if __name__ == "__main__":
    print("=" * 60)
    print("  XGBoost v2 Threshold Optimizer")
    print("=" * 60)

    # Load model + scaler
    model = XGBClassifier()
    model.load_model(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    print(f"🚀  Model: {MODEL_PATH}  |  Scaler: {SCALER_PATH}\n")

    # Load data
    test_df = load_test_data()
    y = test_df["Target_Class"].to_numpy(dtype=int)

    # Align features
    booster = model.get_booster()
    if hasattr(booster, "feature_names") and booster.feature_names:
        cols = booster.feature_names
    else:
        cols = [c for c in test_df.columns if c not in DROP_COLS]

    X = test_df[cols].to_numpy(dtype=np.float32)
    X = scaler.transform(X)  # Apply normalization

    print("🔮  Generating probabilities…")
    probs = model.predict_proba(X)

    # Sweep
    res_buy   = sweep_thresholds(probs, y, 1)
    res_short = sweep_thresholds(probs, y, 2)

    # Print tables
    def print_table(df, name):
        print(f"\n{'─'*60}")
        print(f"  {name} THRESHOLDS")
        print(f"{'─'*60}")
        print(" THRESHOLD |  TRADES |   WINS | PRECISION | RECALL")
        best = None
        for _, row in df.iterrows():
            marker = " ◀" if row["trades"] >= MIN_TRADES else ""
            print(f"   {row['threshold']:.2f}    | {int(row['trades']):>7,} | {int(row['wins']):>6,} |"
                  f"   {row['precision']:.1%}   |  {row['recall']:.1%}{marker}")
            if row["trades"] >= MIN_TRADES:
                if best is None or row["precision"] > best["precision"]:
                    best = row
        return best

    best_buy   = print_table(res_buy, "🟢 BUY")
    best_short = print_table(res_short, "🔴 SHORT")

    # Plot
    plot_curves(res_buy, res_short)

    # Summary
    print(f"\n{'='*60}")
    print(f"  🏆  RECOMMENDED THRESHOLDS (Min {MIN_TRADES} trades)")
    print(f"{'='*60}")

    if best_buy is not None:
        print(f"  🟢 BUY   Threshold : {best_buy['threshold']:.2f}")
        print(f"     Precision       : {best_buy['precision']:.1%}")
        print(f"     Trades (3mo)    : {int(best_buy['trades']):,}")
    else:
        print("  🟢 BUY   : No viable threshold found.")

    if best_short is not None:
        print(f"  🔴 SHORT Threshold : {best_short['threshold']:.2f}")
        print(f"     Precision       : {best_short['precision']:.1%}")
        print(f"     Trades (3mo)    : {int(best_short['trades']):,}")
    else:
        print("  🔴 SHORT : No viable threshold found.")
    print("=" * 60)
