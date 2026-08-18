"""
train_xgb_v2.py
===============
Enhanced 3-class XGBoost trainer with StandardScaler normalization.

Features:
  - Loads v2 processed data (30 indicators)
  - StandardScaler normalization (fit on train, transform test)
  - Sample weighting (Buy/Short = 5.0, Hold = 1.0)
  - Tuned hyperparameters with early stopping
  - Saves: model, scaler, feature importance plot

Usage:
    python train_xgb_v2.py
"""

import os, glob, time, joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from xgboost import XGBClassifier, plot_importance
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import confusion_matrix, classification_report

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
PROCESSED_DIR  = os.path.join("data", "processed_v2")
MODEL_PATH     = "xgb_v2.json"
SCALER_PATH    = "scaler_v2.pkl"
FIG_PATH       = "xgb_v2_importance.png"
TRAIN_RATIO    = 0.85
DROP_COLS      = ["Date", "Target_Class"]

# Sample weights
W_BUY   = 5.0
W_SHORT = 5.0
W_HOLD  = 1.0


# ──────────────────────────────────────────────
# 1. LOAD
# ──────────────────────────────────────────────
def load_all():
    files = sorted(glob.glob(os.path.join(PROCESSED_DIR, "*_v2.parquet")))
    if not files:
        raise FileNotFoundError(f"No v2 processed files in {PROCESSED_DIR}")

    frames = [pd.read_parquet(f) for f in files]
    full = pd.concat(frames, ignore_index=True)
    full["Date"] = pd.to_datetime(full["Date"])
    full.sort_values("Date", inplace=True)
    full.reset_index(drop=True, inplace=True)
    print(f"📂  Loaded {len(files)} files → {len(full):,} rows")
    return full


# ──────────────────────────────────────────────
# 2. PREPARE (with normalization)
# ──────────────────────────────────────────────
def prepare(df):
    y = df["Target_Class"].to_numpy(dtype=int)
    feat_cols = [c for c in df.columns if c not in DROP_COLS]
    X = df[feat_cols].to_numpy(dtype=np.float32)

    # Time-series split
    split = int(len(X) * TRAIN_RATIO)
    X_tr, X_te = X[:split], X[split:]
    y_tr, y_te = y[:split], y[split:]

    split_date = df["Date"].iloc[split]
    print(f"📅  Split  : {split_date.date()}")
    print(f"🔢  Train  : {len(X_tr):,}")
    print(f"🔢  Test   : {len(X_te):,}")

    # ── Normalize ─────────────────────────────
    scaler = StandardScaler()
    X_tr = scaler.fit_transform(X_tr)
    X_te = scaler.transform(X_te)
    joblib.dump(scaler, SCALER_PATH)
    print(f"📐  StandardScaler saved → {SCALER_PATH}")

    # ── Sample Weights ────────────────────────
    weights_tr = np.ones(len(y_tr), dtype=np.float32)
    weights_tr[y_tr == 1] = W_BUY
    weights_tr[y_tr == 2] = W_SHORT
    print(f"⚖️   Weights: Buy={W_BUY}, Short={W_SHORT}, Hold={W_HOLD}")

    return X_tr, X_te, y_tr, y_te, weights_tr, feat_cols


# ──────────────────────────────────────────────
# 3. TRAIN
# ──────────────────────────────────────────────
def train(X_tr, y_tr, X_te, y_te, weights_tr, feature_names):
    model = XGBClassifier(
        n_estimators=1500,
        max_depth=7,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        gamma=1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        min_child_weight=5,
        tree_method="hist",
        objective="multi:softprob",
        num_class=3,
        n_jobs=-1,
        random_state=42,
        early_stopping_rounds=50,
    )

    print("\n🚀  Training Enhanced 3-Class XGBoost …")
    t0 = time.perf_counter()

    model.fit(
        X_tr, y_tr,
        sample_weight=weights_tr,
        eval_set=[(X_tr, y_tr), (X_te, y_te)],
        verbose=50,
    )

    elapsed = time.perf_counter() - t0
    print(f"⏱   Training time: {elapsed:.1f}s  (Best iter: {model.best_iteration})")

    model.get_booster().feature_names = feature_names
    return model


# ──────────────────────────────────────────────
# 4. EVALUATE
# ──────────────────────────────────────────────
def evaluate(model, X_te, y_te, feat_names):
    y_pred = model.predict(X_te)
    labels = ["Hold (0)", "Buy (1)", "Short (2)"]

    cm = confusion_matrix(y_te, y_pred)
    print(f"\n{'='*55}")
    print("  📊  CONFUSION MATRIX")
    print(f"{'='*55}")
    header = "              " + "".join(f"Pred={i:<8}" for i in range(3))
    print(header)
    for i, row in enumerate(cm):
        vals = "".join(f"{v:>8,}" for v in row)
        print(f"  Actual={i}    {vals}")

    print(f"\n{'='*55}")
    print("  📊  CLASSIFICATION REPORT")
    print(f"{'='*55}")
    print(classification_report(y_te, y_pred, target_names=labels))

    # Feature importance
    fig, ax = plt.subplots(figsize=(12, 10))
    plot_importance(
        model.get_booster(), ax=ax,
        importance_type="gain",
        title="Enhanced XGBoost — Top 30 Feature Importance (Gain)",
        max_num_features=30, height=0.5, grid=False,
    )
    plt.tight_layout()
    plt.savefig(FIG_PATH, dpi=150)
    print(f"📈  Feature importance → {FIG_PATH}")


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  XGBoost v2 Trainer  ·  30 Features  ·  Normalized")
    print("=" * 60 + "\n")

    full_df = load_all()
    X_tr, X_te, y_tr, y_te, w_tr, feats = prepare(full_df)
    model = train(X_tr, y_tr, X_te, y_te, w_tr, feats)
    evaluate(model, X_te, y_te, feats)

    model.save_model(MODEL_PATH)
    print(f"💾  Model saved → {MODEL_PATH}")

    print(f"\n{'='*60}")
    print("  ✅  Enhanced training pipeline complete!")
    print("=" * 60)
