"""
mega_stitcher.py
================
High-performance Polars-based data stitcher for creating a 7-year
Master Dataset from Kaggle 1-min CSVs + Angel One 5-min Parquets.

Inputs:
  KAGGLE_DIR  : Folder with Kaggle CSVs ({SYMBOL}_minute.csv)
  RECENT_DIR  : data/history/ (Angel One 5-min Parquets)
  OUTPUT_DIR  : data/master_7y/

Processing per stock:
  A) Load Kaggle 1-min CSV → resample to 5-min OHLCV
  B) Load Angel One 5-min Parquet → align columns
  C) Concatenate, deduplicate, cast to Float32, sort, save

Usage:
    python mega_stitcher.py
"""

import os
import sys
import logging
from pathlib import Path
from datetime import datetime

import pandas as pd
import polars as pl
from tqdm import tqdm

# Suppress Polars TZ warning for +05:30 offset format
os.environ["POLARS_IGNORE_TIMEZONE_PARSE_ERROR"] = "1"

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
KAGGLE_DIR = os.path.join("archive")
RECENT_DIR = os.path.join("data", "history")
OUTPUT_DIR = os.path.join("data", "master_7y")
ERROR_LOG  = "stitch_errors.log"

# Standard column names for output
COLS = ["Time", "Open", "High", "Low", "Close", "Volume"]


# ──────────────────────────────────────────────
# ERROR LOGGER
# ──────────────────────────────────────────────
logger = logging.getLogger("stitcher")
logger.setLevel(logging.WARNING)
fh = logging.FileHandler(ERROR_LOG, mode="w")
fh.setFormatter(logging.Formatter("%(asctime)s | %(message)s", datefmt="%H:%M:%S"))
logger.addHandler(fh)


# ──────────────────────────────────────────────
# STEP A: Load & Resample Kaggle 1-Min → 5-Min
# ──────────────────────────────────────────────
def load_kaggle(csv_path: str, symbol: str) -> pl.DataFrame:
    """
    Load a Kaggle 1-min CSV and resample to 5-min OHLCV candles.
    Kaggle format: date,open,high,low,close,volume
    """
    df = (
        pl.scan_csv(csv_path)
        .with_columns(
            pl.col("date").str.strptime(pl.Datetime, "%Y-%m-%d %H:%M:%S").alias("Time")
        )
        .drop("date")
        .collect()
    )

    if df.is_empty():
        return pl.DataFrame(schema={c: pl.Float32 if c != "Time" else pl.Datetime for c in COLS})

    # Resample 1-min → 5-min using group_by_dynamic
    # Truncate to 5-min intervals starting from market open
    resampled = (
        df.sort("Time")
        .group_by_dynamic("Time", every="5m", label="datapoint")
        .agg([
            pl.col("open").first().alias("Open"),
            pl.col("high").max().alias("High"),
            pl.col("low").min().alias("Low"),
            pl.col("close").last().alias("Close"),
            pl.col("volume").sum().alias("Volume"),
        ])
    )

    return resampled


# ──────────────────────────────────────────────
# STEP B: Load Angel One 5-Min Parquet
# ──────────────────────────────────────────────
def load_angel(parquet_path: str) -> pl.DataFrame:
    """
    Load an Angel One 5-min Parquet file.
    Uses pandas to safely strip the +05:30 fixed-offset timezone,
    then converts to Polars.
    """
    pdf = pd.read_parquet(parquet_path)

    # Rename 'Date' → 'Time'
    if "Date" in pdf.columns:
        pdf = pdf.rename(columns={"Date": "Time"})

    # Strip timezone (pandas handles +05:30 offset natively)
    if hasattr(pdf["Time"].dtype, "tz") and pdf["Time"].dtype.tz is not None:
        pdf["Time"] = pdf["Time"].dt.tz_localize(None)

    return pl.from_pandas(pdf)




# ──────────────────────────────────────────────
# STEP C: Merge, Dedupe, Optimize, Save
# ──────────────────────────────────────────────
def stitch_and_save(
    kaggle_df: pl.DataFrame,
    angel_df: pl.DataFrame | None,
    symbol: str,
    output_dir: str,
) -> dict:
    """Concatenate, deduplicate, cast, sort, and save."""

    parts = []
    num_cols = ["Open", "High", "Low", "Close", "Volume"]
    if kaggle_df is not None and not kaggle_df.is_empty():
        p = kaggle_df.select(COLS)
        p = p.with_columns([pl.col(c).cast(pl.Float64) for c in num_cols if c in p.columns])
        parts.append(p)
    if angel_df is not None and not angel_df.is_empty():
        angel_cols = [c for c in COLS if c in angel_df.columns]
        if len(angel_cols) == len(COLS):
            p = angel_df.select(COLS)
            p = p.with_columns([pl.col(c).cast(pl.Float64) for c in num_cols if c in p.columns])
            parts.append(p)

    if not parts:
        return {"symbol": symbol, "status": "no_data", "rows": 0}

    merged = pl.concat(parts)

    # Deduplicate on Time (keep first occurrence = Kaggle history)
    merged = merged.unique(subset=["Time"], keep="last")

    # Cast floats to Float32 for RAM efficiency
    float_cols = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in merged.columns]
    merged = merged.with_columns([pl.col(c).cast(pl.Float32) for c in float_cols])

    # Sort chronologically
    merged = merged.sort("Time")

    # Save
    out_path = os.path.join(output_dir, f"{symbol}.parquet")
    merged.write_parquet(out_path, compression="zstd")

    date_min = merged["Time"].min()
    date_max = merged["Time"].max()
    return {
        "symbol": symbol,
        "status": "ok",
        "rows": len(merged),
        "start": str(date_min)[:10] if date_min else "?",
        "end":   str(date_max)[:10] if date_max else "?",
    }


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── Discover files ────────────────────────
    # Kaggle: {SYMBOL}_minute.csv
    kaggle_map: dict[str, str] = {}
    if os.path.isdir(KAGGLE_DIR):
        for f in os.listdir(KAGGLE_DIR):
            if f.endswith("_minute.csv"):
                sym = f.replace("_minute.csv", "")
                kaggle_map[sym] = os.path.join(KAGGLE_DIR, f)

    # Angel One: {SYMBOL}.parquet
    angel_map: dict[str, str] = {}
    if os.path.isdir(RECENT_DIR):
        for f in os.listdir(RECENT_DIR):
            if f.endswith(".parquet"):
                sym = f.replace(".parquet", "")
                angel_map[sym] = os.path.join(RECENT_DIR, f)

    # Union of all symbols
    all_symbols = sorted(set(kaggle_map.keys()) | set(angel_map.keys()))

    print("=" * 60)
    print("  Mega Stitcher  ·  7-Year Master Dataset")
    print("=" * 60)
    print(f"  Kaggle CSVs  : {len(kaggle_map):>4} files  ({KAGGLE_DIR}/)")
    print(f"  Angel One    : {len(angel_map):>4} files  ({RECENT_DIR}/)")
    print(f"  Total symbols: {len(all_symbols):>4}")
    print(f"  Output       : {os.path.abspath(OUTPUT_DIR)}/")
    print(f"  Error log    : {ERROR_LOG}")
    print("=" * 60 + "\n")

    # ── Process each stock ────────────────────
    stats = {"ok": 0, "errors": 0, "total_rows": 0}

    for sym in tqdm(all_symbols, desc="Stitching", unit="stock", ncols=80):
        try:
            kaggle_df = None
            angel_df  = None

            # Step A: Kaggle
            if sym in kaggle_map:
                kaggle_df = load_kaggle(kaggle_map[sym], sym)

            # Step B: Angel One
            if sym in angel_map:
                angel_df = load_angel(angel_map[sym])

            # Step C: Merge & Save
            result = stitch_and_save(kaggle_df, angel_df, sym, OUTPUT_DIR)

            if result["status"] == "ok":
                stats["ok"] += 1
                stats["total_rows"] += result["rows"]
            else:
                logger.warning(f"{sym}: {result['status']}")
                stats["errors"] += 1

        except Exception as exc:
            logger.error(f"{sym}: {exc}")
            stats["errors"] += 1

    # ── Summary ───────────────────────────────
    print(f"\n{'='*60}")
    print(f"  ✅  Stitched {stats['ok']}/{len(all_symbols)} stocks")
    print(f"  📊  Total rows: {stats['total_rows']:,}")
    if stats["errors"]:
        print(f"  ❌  Errors: {stats['errors']} (see {ERROR_LOG})")
    print(f"  📂  Output: {os.path.abspath(OUTPUT_DIR)}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
