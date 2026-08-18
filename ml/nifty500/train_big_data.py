"""
train_big_data.py
=================
Training script for 7-Year XGBoost Model (43M rows).

Features:
  - Loads data from data/processed_7y/
  - Enforces float32 to save RAM
  - Train/Test split: Pre-2026 vs Post-2026
  - Recency Weighting: Year >= 2024 gets 2x weight
  - Class Weighting: Hold (0) gets 0.5x weight
  - XGBoost: 'hist' tree method for speed

Usage:
    python train_big_data.py
"""

import os, glob, time
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from xgboost import XGBClassifier, plot_importance
from sklearn.metrics import classification_report, confusion_matrix

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
INPUT_DIR   = os.path.join("data", "processed_7y")
MODEL_PATH  = "xgb_7y_model.json"
FIG_PATH    = "xgb_7y_importance.png"
TEST_DATE   = "2026-01-01"

# ──────────────────────────────────────────────
# 1. LOAD DATA
# ──────────────────────────────────────────────
def load_data():
    files = sorted(glob.glob(os.path.join(INPUT_DIR, "*.parquet")))
    if not files:
        raise FileNotFoundError(f"No files in {INPUT_DIR}")
    
    print(f"📂  Loading {len(files)} files...")
    # Read in parallel or just loop (pandas read_parquet is fast)
    frames = []
    for f in files:
        df = pd.read_parquet(f)
        frames.append(df)
    
    full = pd.concat(frames, ignore_index=True)
    
    # Sort by Time
    full["Time"] = pd.to_datetime(full["Time"])
    full.sort_values("Time", inplace=True)
    full.reset_index(drop=True, inplace=True)
    
    # Downcast floats to float32
    fcols = full.select_dtypes(include="float64").columns
    if len(fcols) > 0:
        full[fcols] = full[fcols].astype(np.float32)
        
    print(f"📊  Total Data: {len(full):,} rows")
    return full

# ──────────────────────────────────────────────
# 2. PREPARE WITH WEIGHTING
# ──────────────────────────────────────────────
def prepare_splits(df):
    # Create sample weights
    # Base = 1.0
    # Year >= 2024 -> * 2.0
    # Class == 0 (Hold) -> * 0.5
    
    years = df["Time"].dt.year
    classes = df["Target_Class"]
    
    weights = np.ones(len(df), dtype=np.float32)
    
    # Recency
    weights[years >= 2024] *= 2.0
    # Class balance (down-weight Hold)
    weights[classes == 0] *= 0.5
    
    print("⚖️   Sample Weights Created:")
    print(f"     Pre-2024 Hold   (0.5): {(weights == 0.5).sum():,}")
    print(f"     Pre-2024 Action (1.0): {((weights == 1.0) & (years < 2024)).sum():,}")
    print(f"     Post-2024 Hold  (1.0): {((weights == 1.0) & (years >= 2024)).sum():,}")
    print(f"     Post-2024 Action (2.0): {(weights == 2.0).sum():,}")
    
    # Feature columns (exclude Time, Target_Class)
    drop_cols = ["Time", "Target_Class"]
    feat_cols = [c for c in df.columns if c not in drop_cols]
    
    print(f"🔍  Features ({len(feat_cols)}): {feat_cols}")
    
    # Split
    split_idx = df[df["Time"] >= TEST_DATE].index.min()
    if pd.isna(split_idx):
        raise ValueError(f"No data found after {TEST_DATE}")
        
    X = df[feat_cols].astype(np.float32)
    y = df["Target_Class"].astype(int)
    
    X_tr, X_te = X.iloc[:split_idx], X.iloc[split_idx:]
    y_tr, y_te = y.iloc[:split_idx], y.iloc[split_idx:]
    w_tr, w_te = weights[:split_idx], weights[split_idx:]
    
    print(f"📅  Train: {df['Time'].min().date()} → {df['Time'].iloc[split_idx-1].date()} ({len(X_tr):,} rows)")
    print(f"📅  Test : {df['Time'].iloc[split_idx].date()} → {df['Time'].max().date()} ({len(X_te):,} rows)")
    
    return X_tr, y_tr, w_tr, X_te, y_te, w_te, feat_cols

# ──────────────────────────────────────────────
# 3. TRAIN
# ──────────────────────────────────────────────
def train_model(X_tr, y_tr, w_tr, X_te, y_te, w_te):
    print("\n🚀  Training XGBoost (Tree Method: hist)...")
    clf = XGBClassifier(
        n_estimators=2000,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="multi:softprob",
        num_class=3,
        tree_method="hist",  # FAST
        n_jobs=-1,
        random_state=42,
        early_stopping_rounds=50
    )
    
    t0 = time.time()
    clf.fit(
        X_tr, y_tr,
        sample_weight=w_tr,
        # Using unweighted test set for validation metric, or weighted? 
        # Usually validation metric should reflect business goal. 
        # Let's pass weights to eval_set too to be consistent with training loss
        eval_set=[(X_tr, y_tr), (X_te, y_te)],
        sample_weight_eval_set=[w_tr, w_te],
        verbose=100
    )
    print(f"⏱   Training Time: {time.time() - t0:.1f}s")
    return clf

# ──────────────────────────────────────────────
# 4. EVALUATE
# ──────────────────────────────────────────────
def evaluate(model, X_te, y_te):
    print("\n📊  Evaluation on 2026 Test Set")
    preds = model.predict(X_te)
    
    print(classification_report(y_te, preds, target_names=["Hold", "Buy", "Short"]))
    
    cm = confusion_matrix(y_te, preds)
    print("Confusion Matrix:")
    print(cm)
    
    # Feature Importance
    plt.figure(figsize=(10, 8))
    plot_importance(model, max_num_features=20, height=0.5)
    plt.title("XGBoost 7-Year Feature Importance")
    plt.tight_layout()
    plt.savefig(FIG_PATH)
    print(f"📈  Feature importance saved to {FIG_PATH}")
    
    model.save_model(MODEL_PATH)
    print(f"💾  Model saved to {MODEL_PATH}")

# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
if __name__ == "__main__":
    df = load_data()
    X_tr, y_tr, w_tr, X_te, y_te, w_te, feats = prepare_splits(df)
    model = train_model(X_tr, y_tr, w_tr, X_te, y_te, w_te)
    evaluate(model, X_te, y_te)
