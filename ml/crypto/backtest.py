"""
Backtesting Script for Crypto ML Model
- Uses 3-6 months of historical data
- Tests with $10 initial capital and 5x leverage
- Applies realistic slippage and brokerage
- Tracks all trades and performance metrics
"""

import pandas as pd
import numpy as np
import pickle
import json
import logging
from datetime import datetime, timezone
from sklearn.preprocessing import StandardScaler
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s'
)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================
INITIAL_CAPITAL = 10.0
LEVERAGE = 5
SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD"]

# Trading Parameters (matching paper_trading_bot.py)
MAX_POSITIONS = 3
RR_RATIO = 3.0
SL_ATR_MULT = 1.5
SLIPPAGE_PCT = 0.05
BROKERAGE_PCT = 0.05
PROBABILITY_THRESHOLD = 0.55

# Backtest period (3-6 months)
BACKTEST_MONTHS = 4  # Adjust as needed

# =============================================================================
# FEATURE ENGINEERING (must match paper_trading_bot.py)
# =============================================================================
def compute_ema(series, span):
    return series.ewm(span=span, adjust=False).mean()


def prepare_features(df):
    """Prepare features for prediction"""
    df = df.copy()

    # EMAs
    df['ema_5'] = compute_ema(df['close'], 5)
    df['ema_15'] = compute_ema(df['close'], 15)
    df['ema_30'] = compute_ema(df['close'], 30)
    df['ema_50'] = compute_ema(df['close'], 50)

    # Volume
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
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))

    # MACD
    ema_12 = compute_ema(df['close'], 12)
    ema_26 = compute_ema(df['close'], 26)
    df['macd'] = ema_12 - ema_26
    df['macd_signal'] = compute_ema(df['macd'], 9)
    df['macd_hist'] = df['macd'] - df['macd_signal']

    # Bollinger Bands
    df['bb_middle'] = df['close'].rolling(window=20).mean()
    bb_std = df['close'].rolling(window=20).std()
    df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
    df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
    df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
    df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']

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
    df['atr_pct'] = df['atr'] / df['close']

    # Volume features
    df['volume_ema5'] = compute_ema(df['volume'], 5)
    df['volume_ema20'] = compute_ema(df['volume'], 20)
    df['volume_ratio'] = df['volume'] / df['volume_ema20']

    # Candle features - WICK ANALYSIS
    df['body_size'] = np.abs(df['close'] - df['open']) / df['open']
    df['upper_wick'] = (df['high'] - df[['close', 'open']].max(axis=1)) / df['open']
    df['lower_wick'] = (df[['close', 'open']].min(axis=1) - df['low']) / df['open']
    df['wick_ratio'] = df['upper_wick'] / (df['lower_wick'] + 0.0001)
    df['total_range'] = (df['high'] - df['low']) / df['close']
    df['body_to_range'] = df['body_size'] / (df['total_range'] + 0.0001)

    # Returns
    df['return_1'] = df['close'].pct_change(1)
    df['return_3'] = df['close'].pct_change(3)
    df['return_5'] = df['close'].pct_change(5)

    df = df.dropna()
    df = df.replace([np.inf, -np.inf], np.nan).dropna()

    return df


def get_feature_cols():
    return [
        'ema_5', 'ema_15', 'ema_30', 'ema_50', 'volume_log',
        'ema_5_15_ratio', 'ema_15_30_ratio', 'ema_5_30_ratio',
        'price_ema5_ratio', 'price_ema15_ratio', 'price_ema30_ratio',
        'rsi', 'macd', 'macd_signal', 'macd_hist',
        'bb_position', 'bb_width',
        'momentum_5', 'momentum_10', 'momentum_20',
        'atr_pct', 'volume_ratio',
        'body_size', 'upper_wick', 'lower_wick',
        'wick_ratio', 'total_range', 'body_to_range',
        'return_1', 'return_3', 'return_5'
    ]


# =============================================================================
# BACKTESTING ENGINE
# =============================================================================
class Backtester:
    def __init__(self, initial_capital=INITIAL_CAPITAL, leverage=LEVERAGE):
        self.initial_capital = initial_capital
        self.capital = initial_capital
        self.leverage = leverage
        self.positions = {}
        self.trades = []
        self.equity_curve = []
        self.model = None
        self.scaler = None

    def load_model(self, model_path='trained_model.pkl'):
        """Load the trained model"""
        try:
            with open(model_path, 'rb') as f:
                saved = pickle.load(f)
                self.model = saved['model']
                self.scaler = saved['scaler']
                logger.info(f"Loaded model trained on {saved.get('n_samples', 'unknown'):,} samples")
                return True
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False

    def get_prediction(self, features):
        """Get model prediction with probability"""
        if self.model is None:
            return None, 0.0

        try:
            feature_cols = get_feature_cols()
            feature_values = features[feature_cols].values.reshape(1, -1)
            features_scaled = self.scaler.transform(feature_values)

            probas = self.model.predict_proba(features_scaled)[0]
            prob_short = probas[0]
            prob_long = probas[1]

            if prob_long >= PROBABILITY_THRESHOLD:
                return 'long', prob_long
            elif prob_short >= PROBABILITY_THRESHOLD:
                return 'short', prob_short
            else:
                return None, max(prob_long, prob_short)

        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return None, 0.0

    def open_position(self, symbol, direction, entry_price, atr, timestamp, confidence):
        """Open a new position"""
        sl_distance = atr * SL_ATR_MULT
        tp_distance = sl_distance * RR_RATIO

        if direction == 'long':
            entry_price *= (1 + SLIPPAGE_PCT / 100)
            sl = entry_price - sl_distance
            tp = entry_price + tp_distance
        else:
            entry_price *= (1 - SLIPPAGE_PCT / 100)
            sl = entry_price + sl_distance
            tp = entry_price - tp_distance

        # Position sizing
        available_capital = self.capital / MAX_POSITIONS
        position_value = min(available_capital * self.leverage, 200)
        quantity = position_value / entry_price

        self.positions[symbol] = {
            'direction': direction,
            'entry_price': entry_price,
            'sl': sl,
            'tp': tp,
            'quantity': quantity,
            'position_value': position_value,
            'confidence': confidence,
            'entry_time': timestamp,
            'entry_bar': len(self.equity_curve)
        }

        logger.info(f"📈 OPENED {direction.upper()} {symbol} @ ${entry_price:.2f} | "
                   f"SL: ${sl:.2f} | TP: ${tp:.2f} | Size: ${position_value:.2f}")

    def close_position(self, symbol, exit_price, timestamp, reason):
        """Close a position and calculate PnL"""
        if symbol not in self.positions:
            return

        position = self.positions[symbol]

        # Apply slippage on exit
        if position['direction'] == 'long':
            exit_price *= (1 - SLIPPAGE_PCT / 100)
            pnl = position['quantity'] * (exit_price - position['entry_price'])
        else:
            exit_price *= (1 + SLIPPAGE_PCT / 100)
            pnl = position['quantity'] * (position['entry_price'] - exit_price)

        # Subtract brokerage
        brokerage = position['position_value'] * (BROKERAGE_PCT / 100) * 2
        net_pnl = pnl - brokerage

        self.capital += net_pnl

        trade = {
            'symbol': symbol,
            'direction': position['direction'],
            'entry_time': position['entry_time'],
            'entry_price': position['entry_price'],
            'exit_time': timestamp,
            'exit_price': exit_price,
            'exit_reason': reason,
            'net_pnl': net_pnl,
            'capital_after': self.capital,
            'holding_period_bars': len(self.equity_curve) - position['entry_bar']
        }
        self.trades.append(trade)

        result_emoji = "✅" if net_pnl > 0 else "❌"
        logger.info(f"{result_emoji} CLOSED {position['direction'].upper()} {symbol} | "
                   f"PnL: ${net_pnl:.2f} | Capital: ${self.capital:.2f} | Reason: {reason}")

        del self.positions[symbol]

    def check_position_exits(self, symbol, bar_data, timestamp):
        """Check if position should be exited"""
        if symbol not in self.positions:
            return

        position = self.positions[symbol]
        high = bar_data['high']
        low = bar_data['low']

        if position['direction'] == 'long':
            if low <= position['sl']:
                self.close_position(symbol, position['sl'], timestamp, 'SL')
                return
            elif high >= position['tp']:
                self.close_position(symbol, position['tp'], timestamp, 'TP')
                return
        else:  # short
            if high >= position['sl']:
                self.close_position(symbol, position['sl'], timestamp, 'SL')
                return
            elif low <= position['tp']:
                self.close_position(symbol, position['tp'], timestamp, 'TP')
                return

    def run_backtest(self, data: pd.DataFrame):
        """Run backtest on historical data"""
        logger.info("="*60)
        logger.info("BACKTEST STARTED")
        logger.info(f"Initial Capital: ${self.initial_capital} | Leverage: {self.leverage}x")
        logger.info(f"Symbols: {SYMBOLS} | R:R: 1:{RR_RATIO}")
        logger.info(f"Data range: {data['datetime'].min()} to {data['datetime'].max()}")
        logger.info("="*60)

        if not self.load_model():
            return None

        # Data already has features computed
        data = data.copy()

        # Iterate through data
        for i in range(len(data)):
            bar = data.iloc[i]
            timestamp = bar['datetime']
            symbol = bar['symbol']

            # Check existing positions for exits
            if symbol in self.positions:
                self.check_position_exits(symbol, bar, timestamp)

            # Look for new entries
            can_open = (
                symbol not in self.positions and
                len(self.positions) < MAX_POSITIONS
            )

            if can_open:
                direction, confidence = self.get_prediction(bar)
                if direction is not None:
                    self.open_position(
                        symbol, direction, bar['close'],
                        bar['atr'], timestamp, confidence
                    )

            # Record equity
            self.equity_curve.append({
                'timestamp': timestamp,
                'capital': self.capital,
                'open_positions': len(self.positions)
            })

        # Close any remaining positions at the end
        for symbol in list(self.positions.keys()):
            last_bar = data.iloc[-1]
            self.close_position(symbol, last_bar['close'], last_bar['datetime'], 'END')

        return self.generate_results()

    def generate_results(self):
        """Generate backtest performance metrics"""
        if not self.trades:
            logger.warning("No trades executed during backtest!")
            return None

        trades_df = pd.DataFrame(self.trades)
        equity_df = pd.DataFrame(self.equity_curve)

        # Calculate metrics
        total_trades = len(trades_df)
        winning_trades = len(trades_df[trades_df['net_pnl'] > 0])
        losing_trades = len(trades_df[trades_df['net_pnl'] < 0])
        win_rate = winning_trades / total_trades if total_trades > 0 else 0

        total_pnl = trades_df['net_pnl'].sum()
        avg_pnl = trades_df['net_pnl'].mean()
        max_win = trades_df['net_pnl'].max()
        max_loss = trades_df['net_pnl'].min()

        # Calculate returns
        final_capital = self.capital
        total_return = ((final_capital - self.initial_capital) / self.initial_capital) * 100

        # Calculate drawdown
        equity_df['peak'] = equity_df['capital'].cummax()
        equity_df['drawdown'] = equity_df['capital'] - equity_df['peak']
        equity_df['drawdown_pct'] = (equity_df['drawdown'] / equity_df['peak']) * 100
        max_drawdown = equity_df['drawdown_pct'].min()

        # Calculate Sharpe ratio (simplified)
        equity_df['returns'] = equity_df['capital'].pct_change()
        sharpe_ratio = np.sqrt(252) * equity_df['returns'].mean() / equity_df['returns'].std() if equity_df['returns'].std() > 0 else 0

        results = {
            'total_trades': total_trades,
            'winning_trades': winning_trades,
            'losing_trades': losing_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'avg_pnl': avg_pnl,
            'max_win': max_win,
            'max_loss': max_loss,
            'final_capital': final_capital,
            'total_return_pct': total_return,
            'max_drawdown_pct': max_drawdown,
            'sharpe_ratio': sharpe_ratio,
            'trades': trades_df,
            'equity_curve': equity_df
        }

        return results


def load_data_for_backtest(months=BACKTEST_MONTHS):
    """Load and prepare data for backtesting"""
    data_dir = Path('data')

    all_data = []
    for symbol in SYMBOLS:
        file_path = data_dir / f"{symbol.split('USD')[0]}_5m_processed.parquet"
        if not file_path.exists():
            logger.warning(f"Data file not found: {file_path}")
            continue

        df = pd.read_parquet(file_path)
        # Data already has features, just rename timestamp to datetime
        df['datetime'] = df['timestamp']
        df['symbol'] = symbol

        # Filter to last N months
        df = df.sort_values('datetime')
        cutoff_date = df['datetime'].max() - pd.Timedelta(days=months * 30)
        df = df[df['datetime'] >= cutoff_date]

        all_data.append(df)
        logger.info(f"Loaded {symbol}: {len(df)} bars ({df['datetime'].min()} to {df['datetime'].max()})")

    if not all_data:
        raise FileNotFoundError("No data files found! Please ensure data/ folder contains processed parquet files.")

    combined = pd.concat(all_data, ignore_index=True)
    combined = combined.sort_values('datetime').reset_index(drop=True)

    return combined


def save_results(results, output_file='backtest_results.json'):
    """Save backtest results to file"""
    trades_df = results['trades']
    equity_df = results['equity_curve']

    # Save trades to CSV
    trades_df.to_csv('backtest_trades.csv', index=False)
    logger.info(f"Saved trades to backtest_trades.csv")

    # Save equity curve to CSV
    equity_df.to_csv('backtest_equity_curve.csv', index=False)
    logger.info(f"Saved equity curve to backtest_equity_curve.csv")

    # Save summary to JSON
    summary = {
        'backtest_config': {
            'initial_capital': INITIAL_CAPITAL,
            'leverage': LEVERAGE,
            'symbols': SYMBOLS,
            'rr_ratio': RR_RATIO,
            'sl_atr_mult': SL_ATR_MULT,
            'probability_threshold': PROBABILITY_THRESHOLD,
            'backtest_months': BACKTEST_MONTHS
        },
        'performance_metrics': {
            'total_trades': results['total_trades'],
            'winning_trades': results['winning_trades'],
            'losing_trades': results['losing_trades'],
            'win_rate': round(results['win_rate'], 4),
            'total_pnl': round(results['total_pnl'], 2),
            'avg_pnl': round(results['avg_pnl'], 2),
            'max_win': round(results['max_win'], 2),
            'max_loss': round(results['max_loss'], 2),
            'final_capital': round(results['final_capital'], 2),
            'total_return_pct': round(results['total_return_pct'], 2),
            'max_drawdown_pct': round(results['max_drawdown_pct'], 2),
            'sharpe_ratio': round(results['sharpe_ratio'], 2)
        },
        'generated_at': datetime.now(timezone.utc).isoformat()
    }

    with open(output_file, 'w') as f:
        json.dump(summary, f, indent=2)
    logger.info(f"Saved summary to {output_file}")

    return summary


def print_results_summary(results):
    """Print formatted results summary"""
    print("\n" + "="*60)
    print("BACKTEST RESULTS SUMMARY")
    print("="*60)

    print(f"\n📊 PERFORMANCE METRICS:")
    print(f"  Total Trades:        {results['total_trades']}")
    print(f"  Winning Trades:      {results['winning_trades']} ({results['winning_trades']/results['total_trades']*100:.1f}%)")
    print(f"  Losing Trades:       {results['losing_trades']} ({results['losing_trades']/results['total_trades']*100:.1f}%)")
    print(f"  Win Rate:            {results['win_rate']*100:.1f}%")

    print(f"\n💰 PROFIT & LOSS:")
    print(f"  Total PnL:           ${results['total_pnl']:.2f}")
    print(f"  Average PnL/Trade:   ${results['avg_pnl']:.2f}")
    print(f"  Max Win:             ${results['max_win']:.2f}")
    print(f"  Max Loss:            ${results['max_loss']:.2f}")

    print(f"\n📈 CAPITAL:")
    print(f"  Initial Capital:     ${results['final_capital'] - results['total_pnl']:.2f}")
    print(f"  Final Capital:       ${results['final_capital']:.2f}")
    print(f"  Total Return:        {results['total_return_pct']:.2f}%")

    print(f"\n⚠️  RISK METRICS:")
    print(f"  Max Drawdown:        {results['max_drawdown_pct']:.2f}%")
    print(f"  Sharpe Ratio:        {results['sharpe_ratio']:.2f}")

    print("\n" + "="*60)


def main():
    """Main backtest function"""
    logger.info("Loading historical data...")
    data = load_data_for_backtest()

    if len(data) == 0:
        logger.error("No data available for backtesting!")
        return

    backtester = Backtester(initial_capital=INITIAL_CAPITAL, leverage=LEVERAGE)
    results = backtester.run_backtest(data)

    if results:
        print_results_summary(results)
        save_results(results)
        logger.info("\n✅ Backtest completed successfully!")
        logger.info("Output files:")
        logger.info("  - backtest_results.json (summary)")
        logger.info("  - backtest_trades.csv (all trades)")
        logger.info("  - backtest_equity_curve.csv (equity over time)")
    else:
        logger.error("Backtest failed!")


if __name__ == "__main__":
    main()
