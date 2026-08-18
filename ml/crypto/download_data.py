"""
Download 5-minute historical cryptocurrency data for transformer training.

Uses Binance API for free 5-minute OHLCV data going back several years.
Data is saved in parquet format for efficient storage and loading.
"""

import os
import time
import argparse
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from pathlib import Path


# Configuration
DATA_DIR = Path(__file__).parent / "data"
BINANCE_API = "https://api.binance.com/api/v3/klines"

# Symbols to download
SYMBOLS = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
    "SOL": "SOLUSDT"
}

# 5 years of data
YEARS_OF_DATA = 5
INTERVAL = "5m"
CANDLES_PER_REQUEST = 1000  # Binance limit


def get_binance_klines(symbol: str, interval: str, start_time: int, end_time: int) -> list:
    """Fetch klines from Binance API."""
    params = {
        "symbol": symbol,
        "interval": interval,
        "startTime": start_time,
        "endTime": end_time,
        "limit": CANDLES_PER_REQUEST
    }
    
    try:
        response = requests.get(BINANCE_API, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"  Error fetching data: {e}")
        return []


def download_symbol(symbol_name: str, binance_symbol: str, years: int = YEARS_OF_DATA, 
                    test_mode: bool = False) -> pd.DataFrame:
    """
    Download historical 5-minute data for a symbol.
    
    Args:
        symbol_name: Display name (BTC, ETH, SOL)
        binance_symbol: Binance trading pair (BTCUSDT, etc.)
        years: Number of years of data to download
        test_mode: If True, only download 1 week of data
    
    Returns:
        DataFrame with OHLCV data
    """
    print(f"\n{'='*60}")
    print(f"Downloading {symbol_name} ({binance_symbol}) - {years} years of 5-min data")
    print(f"{'='*60}")
    
    # Calculate time range
    end_time = int(datetime.now(timezone.utc).timestamp() * 1000)
    
    if test_mode:
        # Only 1 week for testing
        start_time = end_time - (7 * 24 * 60 * 60 * 1000)
        print("  [TEST MODE] Downloading only 1 week of data")
    else:
        # Full history
        start_time = end_time - (years * 365 * 24 * 60 * 60 * 1000)
    
    all_candles = []
    current_start = start_time
    
    # Calculate expected number of candles
    total_minutes = (end_time - start_time) / (60 * 1000)
    expected_candles = int(total_minutes / 5)
    print(f"  Expected ~{expected_candles:,} candles")
    
    request_count = 0
    while current_start < end_time:
        klines = get_binance_klines(binance_symbol, INTERVAL, current_start, end_time)
        
        if not klines:
            break
        
        all_candles.extend(klines)
        request_count += 1
        
        # Update start time for next request
        last_timestamp = klines[-1][0]
        current_start = last_timestamp + 1
        
        # Progress update every 10 requests
        if request_count % 10 == 0:
            progress = len(all_candles) / expected_candles * 100
            print(f"    Fetched {len(all_candles):,} candles ({progress:.1f}%)...")
        
        # Rate limiting - Binance allows 1200 requests/min
        time.sleep(0.1)
    
    if not all_candles:
        print(f"  ERROR: No data fetched for {symbol_name}")
        return None
    
    # Convert to DataFrame
    df = pd.DataFrame(all_candles, columns=[
        'timestamp', 'open', 'high', 'low', 'close', 'volume',
        'close_time', 'quote_volume', 'trades', 'taker_buy_base',
        'taker_buy_quote', 'ignore'
    ])
    
    # Convert types
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
    df['open'] = df['open'].astype(float)
    df['high'] = df['high'].astype(float)
    df['low'] = df['low'].astype(float)
    df['close'] = df['close'].astype(float)
    df['volume'] = df['volume'].astype(float)
    
    # Keep only essential columns
    df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
    
    # Remove duplicates and sort
    df = df.drop_duplicates(subset='timestamp')
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    # Validate data
    df = df[df['close'] > 0]
    df = df[df['volume'] > 0]
    
    print(f"\n  ✓ Downloaded {len(df):,} candles")
    print(f"  ✓ Date range: {df['timestamp'].min()} to {df['timestamp'].max()}")
    
    return df


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute technical indicators and features for model training.
    Matches the features used in the existing train_model.py.
    """
    df = df.copy()
    
    # EMAs
    df['ema_5'] = df['close'].ewm(span=5, adjust=False).mean()
    df['ema_15'] = df['close'].ewm(span=15, adjust=False).mean()
    df['ema_30'] = df['close'].ewm(span=30, adjust=False).mean()
    df['ema_50'] = df['close'].ewm(span=50, adjust=False).mean()
    
    # Volume log
    df['volume_log'] = np.log1p(df['volume'])
    
    # EMA ratios
    df['ema_5_15_ratio'] = df['ema_5'] / df['ema_15']
    df['ema_15_30_ratio'] = df['ema_15'] / df['ema_30']
    df['ema_5_30_ratio'] = df['ema_5'] / df['ema_30']
    
    # Price position relative to EMAs
    df['price_ema5_ratio'] = df['close'] / df['ema_5']
    df['price_ema15_ratio'] = df['close'] / df['ema_15']
    df['price_ema30_ratio'] = df['close'] / df['ema_30']
    
    # RSI
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-10)
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # MACD
    ema_12 = df['close'].ewm(span=12, adjust=False).mean()
    ema_26 = df['close'].ewm(span=26, adjust=False).mean()
    df['macd'] = ema_12 - ema_26
    df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
    df['macd_hist'] = df['macd'] - df['macd_signal']
    
    # Bollinger Bands
    df['bb_middle'] = df['close'].rolling(window=20).mean()
    bb_std = df['close'].rolling(window=20).std()
    df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
    df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
    df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'] + 1e-10)
    df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / (df['bb_middle'] + 1e-10)
    
    # Momentum
    df['momentum_5'] = df['close'].pct_change(5)
    df['momentum_10'] = df['close'].pct_change(10)
    df['momentum_20'] = df['close'].pct_change(20)
    
    # ATR
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df['atr'] = true_range.rolling(window=14).mean()
    df['atr_pct'] = df['atr'] / (df['close'] + 1e-10)
    
    # Volume features
    df['volume_ema5'] = df['volume'].ewm(span=5, adjust=False).mean()
    df['volume_ema20'] = df['volume'].ewm(span=20, adjust=False).mean()
    df['volume_ratio'] = df['volume'] / (df['volume_ema20'] + 1e-10)
    
    # Candle features
    df['body_size'] = np.abs(df['close'] - df['open']) / (df['open'] + 1e-10)
    df['upper_wick'] = (df['high'] - df[['close', 'open']].max(axis=1)) / (df['open'] + 1e-10)
    df['lower_wick'] = (df[['close', 'open']].min(axis=1) - df['low']) / (df['open'] + 1e-10)
    df['wick_ratio'] = df['upper_wick'] / (df['lower_wick'] + 1e-10)
    df['total_range'] = (df['high'] - df['low']) / (df['close'] + 1e-10)
    df['body_to_range'] = df['body_size'] / (df['total_range'] + 1e-10)
    
    # Returns
    df['return_1'] = df['close'].pct_change(1)
    df['return_3'] = df['close'].pct_change(3)
    df['return_5'] = df['close'].pct_change(5)
    
    return df


def create_target(df: pd.DataFrame, lookahead: int = 24, rr_ratio: float = 3.0, 
                  sl_atr_mult: float = 1.5) -> pd.DataFrame:
    """
    Create target labels based on whether LONG or SHORT would be profitable.
    
    Uses actual highs and lows (wicks) to determine if TP would be hit before SL.
    
    Returns:
        1 = LONG (buy)
        0 = SHORT (sell)
    """
    df = df.copy()
    targets = []
    
    for i in range(len(df) - lookahead):
        entry_price = df.iloc[i]['close']
        atr = df.iloc[i]['atr']
        
        if pd.isna(atr) or atr == 0:
            targets.append(np.nan)
            continue
        
        sl_distance = atr * sl_atr_mult
        tp_distance = sl_distance * rr_ratio
        
        # LONG scenario
        long_tp = entry_price + tp_distance
        long_sl = entry_price - sl_distance
        
        # SHORT scenario
        short_tp = entry_price - tp_distance
        short_sl = entry_price + sl_distance
        
        long_result = None
        short_result = None
        
        # Check future bars using highs and lows
        for j in range(1, lookahead + 1):
            future_bar = df.iloc[i + j]
            future_high = future_bar['high']
            future_low = future_bar['low']
            
            # Check LONG outcome
            if long_result is None:
                if future_low <= long_sl:
                    long_result = 'loss'
                elif future_high >= long_tp:
                    long_result = 'win'
            
            # Check SHORT outcome
            if short_result is None:
                if future_high >= short_sl:
                    short_result = 'loss'
                elif future_low <= short_tp:
                    short_result = 'win'
            
            if long_result and short_result:
                break
        
        # Determine best direction
        if long_result == 'win' and short_result != 'win':
            targets.append(1)  # LONG
        elif short_result == 'win' and long_result != 'win':
            targets.append(0)  # SHORT
        elif long_result == 'win' and short_result == 'win':
            targets.append(1)  # Default to LONG
        else:
            # Use momentum as fallback
            if df.iloc[min(i + 1, len(df) - 1)]['close'] > entry_price:
                targets.append(1)
            else:
                targets.append(0)
    
    # Pad with NaN for last lookahead bars
    targets.extend([np.nan] * lookahead)
    df['target'] = targets
    
    return df


def main():
    parser = argparse.ArgumentParser(description='Download crypto historical data')
    parser.add_argument('--symbols', nargs='+', default=['BTC', 'ETH', 'SOL'],
                        help='Symbols to download')
    parser.add_argument('--years', type=int, default=YEARS_OF_DATA,
                        help='Years of data to download')
    parser.add_argument('--test-mode', action='store_true',
                        help='Download only 1 week for testing')
    parser.add_argument('--skip-features', action='store_true',
                        help='Skip feature computation (raw data only)')
    args = parser.parse_args()
    
    # Create data directory
    DATA_DIR.mkdir(exist_ok=True)
    
    print("\n" + "="*60)
    print("CRYPTO DATA DOWNLOADER")
    print("="*60)
    print(f"Symbols: {args.symbols}")
    print(f"Years: {args.years}")
    print(f"Interval: 5 minutes")
    print(f"Data directory: {DATA_DIR}")
    
    all_data = []
    
    for symbol in args.symbols:
        if symbol not in SYMBOLS:
            print(f"Unknown symbol: {symbol}")
            continue
        
        binance_symbol = SYMBOLS[symbol]
        df = download_symbol(symbol, binance_symbol, args.years, args.test_mode)
        
        if df is not None:
            # Save raw data
            raw_path = DATA_DIR / f"{symbol}_5m_raw.parquet"
            df.to_parquet(raw_path, index=False)
            print(f"  ✓ Saved raw data to {raw_path}")
            
            if not args.skip_features:
                # Compute features
                print(f"  Computing features for {symbol}...")
                df = compute_features(df)
                
                # Create targets
                print(f"  Creating targets for {symbol}...")
                df = create_target(df)
                
                # Add symbol column
                df['symbol'] = symbol
                
                # Save processed data
                processed_path = DATA_DIR / f"{symbol}_5m_processed.parquet"
                df.to_parquet(processed_path, index=False)
                print(f"  ✓ Saved processed data to {processed_path}")
                
                all_data.append(df)
    
    # Combine all data
    if all_data and not args.skip_features:
        combined = pd.concat(all_data, ignore_index=True)
        
        # Remove NaN rows
        combined = combined.dropna()
        combined = combined.replace([np.inf, -np.inf], np.nan).dropna()
        
        combined_path = DATA_DIR / "combined_5m.parquet"
        combined.to_parquet(combined_path, index=False)
        
        print("\n" + "="*60)
        print("DOWNLOAD COMPLETE")
        print("="*60)
        print(f"Total samples: {len(combined):,}")
        print(f"Target distribution:")
        print(combined['target'].value_counts())
        print(f"\nSaved to: {combined_path}")


if __name__ == "__main__":
    main()
