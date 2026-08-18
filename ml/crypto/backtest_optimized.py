"""
Optimized Backtesting Script for Crypto ML Model
- Tests multiple probability thresholds: 0.50, 0.60, 0.70, 0.80, 0.90
- Uses 3-6 months of historical data
- Tests with $10 initial capital and 5x leverage
- Generates matplotlib visualizations
- Optimized for speed with vectorized operations
"""

import pandas as pd
import numpy as np
import pickle
import json
import logging
import warnings
from datetime import datetime, timezone
from pathlib import Path
from sklearn.preprocessing import StandardScaler

# Suppress warnings
warnings.filterwarnings('ignore')
logging.basicConfig(level=logging.WARNING)

# Try to import matplotlib, make it optional
try:
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    print("Note: matplotlib not available. Charts will be generated separately.")

# =============================================================================
# CONFIGURATION
# =============================================================================
INITIAL_CAPITAL = 10.0
LEVERAGE = 5
SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD"]

# Trading Parameters
MAX_POSITIONS = 3
RR_RATIO = 3.0
SL_ATR_MULT = 1.5
SLIPPAGE_PCT = 0.05
BROKERAGE_PCT = 0.05

# Probability thresholds to test
PROBABILITY_THRESHOLDS = [0.50, 0.60, 0.70, 0.80, 0.90]

# Backtest period
BACKTEST_MONTHS = 4

# =============================================================================
# FEATURE COLUMNS
# =============================================================================
FEATURE_COLS = [
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
# OPTIMIZED BACKTESTING ENGINE
# =============================================================================
class OptimizedBacktester:
    def __init__(self, initial_capital=INITIAL_CAPITAL, leverage=LEVERAGE):
        self.initial_capital = initial_capital
        self.leverage = leverage

    def load_model(self, model_path='trained_model.pkl'):
        """Load the trained model"""
        with open(model_path, 'rb') as f:
            saved = pickle.load(f)
            self.model = saved['model']
            self.scaler = saved['scaler']
        return True

    def run_backtest_vectorized(self, data: pd.DataFrame, prob_threshold: float):
        """
        Optimized vectorized backtest - much faster than row-by-row iteration
        """
        # Pre-compute all predictions at once
        features = data[FEATURE_COLS].values
        features_scaled = self.scaler.transform(features)
        probas = self.model.predict_proba(features_scaled)

        # Get signals based on probability threshold
        prob_long = probas[:, 1]
        prob_short = probas[:, 0]

        signals = np.zeros(len(data), dtype=int)  # 0=none, 1=long, -1=short
        signal_probs = np.zeros(len(data))

        for i in range(len(data)):
            if prob_long[i] >= prob_threshold:
                signals[i] = 1
                signal_probs[i] = prob_long[i]
            elif prob_short[i] >= prob_threshold:
                signals[i] = -1
                signal_probs[i] = prob_short[i]

        # Initialize tracking arrays
        n = len(data)
        capital = np.zeros(n)
        equity = np.zeros(n)
        trades = []

        current_capital = self.initial_capital
        positions = {}  # symbol -> {direction, entry_price, sl, tp, quantity, entry_idx}

        prices = data[['open', 'high', 'low', 'close']].values
        atrs = data['atr'].values
        timestamps = data['datetime'].values
        symbols = data['symbol'].values

        for i in range(n):
            symbol = symbols[i]
            price_row = prices[i]
            open_p, high_p, low_p, close_p = price_row
            atr = atrs[i]

            # Check existing positions for exits
            if symbol in positions:
                pos = positions[symbol]
                direction = pos['direction']

                exited = False
                exit_price = None
                exit_reason = None

                if direction == 'long':
                    # Check SL first (low hit SL)
                    if low_p <= pos['sl']:
                        exit_price = pos['sl']
                        exit_reason = 'SL'
                        exited = True
                    # Check TP (high hit TP)
                    elif high_p >= pos['tp']:
                        exit_price = pos['tp']
                        exit_reason = 'TP'
                        exited = True
                else:  # short
                    if high_p >= pos['sl']:
                        exit_price = pos['sl']
                        exit_reason = 'SL'
                        exited = True
                    elif low_p <= pos['tp']:
                        exit_price = pos['tp']
                        exit_reason = 'TP'
                        exited = True

                if exited:
                    # Calculate PnL
                    if direction == 'long':
                        exit_price_adj = exit_price * (1 - SLIPPAGE_PCT / 100)
                        pnl = pos['quantity'] * (exit_price_adj - pos['entry_price'])
                    else:
                        exit_price_adj = exit_price * (1 + SLIPPAGE_PCT / 100)
                        pnl = pos['quantity'] * (pos['entry_price'] - exit_price_adj)

                    brokerage = pos['position_value'] * (BROKERAGE_PCT / 100) * 2
                    net_pnl = pnl - brokerage
                    current_capital += net_pnl

                    trades.append({
                        'symbol': symbol,
                        'direction': 'long' if direction == 1 else 'short',
                        'entry_time': pos['entry_time'],
                        'entry_price': pos['entry_price'],
                        'exit_time': timestamps[i],
                        'exit_price': exit_price_adj,
                        'exit_reason': exit_reason,
                        'net_pnl': net_pnl,
                        'capital_after': current_capital,
                        'holding_period_bars': i - pos['entry_idx']
                    })

                    del positions[symbol]

            # Check for new entry signals
            can_open = (
                symbol not in positions and
                len(positions) < MAX_POSITIONS and
                signals[i] != 0
            )

            if can_open:
                direction = signals[i]
                entry_price = close_p

                # Apply slippage on entry
                if direction == 1:  # long
                    entry_price_adj = entry_price * (1 + SLIPPAGE_PCT / 100)
                    sl = entry_price_adj - (atrs[i] * SL_ATR_MULT)
                    tp = entry_price_adj + (atrs[i] * SL_ATR_MULT * RR_RATIO)
                else:  # short
                    entry_price_adj = entry_price * (1 - SLIPPAGE_PCT / 100)
                    sl = entry_price_adj + (atrs[i] * SL_ATR_MULT)
                    tp = entry_price_adj - (atrs[i] * SL_ATR_MULT * RR_RATIO)

                # Position sizing
                available_capital = current_capital / MAX_POSITIONS
                position_value = min(available_capital * self.leverage, 200)
                quantity = position_value / entry_price_adj

                positions[symbol] = {
                    'direction': direction,
                    'entry_price': entry_price_adj,
                    'sl': sl,
                    'tp': tp,
                    'quantity': quantity,
                    'position_value': position_value,
                    'entry_time': timestamps[i],
                    'entry_idx': i
                }

            # Record equity
            capital[i] = current_capital

            # Add unrealized PnL to equity
            equity_val = current_capital
            for sym, pos in positions.items():
                if pos['direction'] == 1:  # long
                    unrealized = pos['quantity'] * (close_p - pos['entry_price'])
                else:
                    unrealized = pos['quantity'] * (pos['entry_price'] - close_p)
                equity_val += unrealized
            equity[i] = equity_val

        # Close remaining positions at end
        final_bar = data.iloc[-1]
        for symbol, pos in list(positions.items()):
            exit_price = final_bar['close']
            direction = pos['direction']

            if direction == 1:
                exit_price_adj = exit_price * (1 - SLIPPAGE_PCT / 100)
                pnl = pos['quantity'] * (exit_price_adj - pos['entry_price'])
            else:
                exit_price_adj = exit_price * (1 + SLIPPAGE_PCT / 100)
                pnl = pos['quantity'] * (pos['entry_price'] - exit_price_adj)

            brokerage = pos['position_value'] * (BROKERAGE_PCT / 100) * 2
            net_pnl = pnl - brokerage
            current_capital += net_pnl

            trades.append({
                'symbol': symbol,
                'direction': 'long' if direction == 1 else 'short',
                'entry_time': pos['entry_time'],
                'entry_price': pos['entry_price'],
                'exit_time': final_bar['datetime'],
                'exit_price': exit_price_adj,
                'exit_reason': 'END',
                'net_pnl': net_pnl,
                'capital_after': current_capital,
                'holding_period_bars': n - pos['entry_idx']
            })

        # Generate results
        return self._calculate_metrics(trades, capital, equity, prob_threshold)

    def _calculate_metrics(self, trades, capital, equity, prob_threshold):
        """Calculate performance metrics"""
        if not trades:
            return {
                'prob_threshold': prob_threshold,
                'total_trades': 0,
                'win_rate': 0,
                'total_return_pct': 0,
                'final_capital': self.initial_capital,
                'max_drawdown_pct': 0,
                'sharpe_ratio': 0,
                'trades': [],
                'equity_curve': equity,
                'capital_curve': capital
            }

        trades_df = pd.DataFrame(trades)

        total_trades = len(trades_df)
        winning_trades = len(trades_df[trades_df['net_pnl'] > 0])
        losing_trades = len(trades_df[trades_df['net_pnl'] < 0])
        win_rate = winning_trades / total_trades if total_trades > 0 else 0

        total_pnl = trades_df['net_pnl'].sum()
        avg_pnl = trades_df['net_pnl'].mean()
        max_win = trades_df['net_pnl'].max()
        max_loss = trades_df['net_pnl'].min()

        final_capital = capital[-1] if len(capital) > 0 else self.initial_capital
        total_return = ((final_capital - self.initial_capital) / self.initial_capital) * 100

        # Calculate drawdown
        peak = np.maximum.accumulate(equity)
        drawdown = (equity - peak) / peak * 100
        drawdown = np.nan_to_num(drawdown, nan=0)
        max_drawdown = np.min(drawdown) if len(drawdown) > 0 else 0

        # Calculate Sharpe ratio
        returns = np.diff(equity) / equity[:-1] if len(equity) > 1 else np.array([0])
        returns = np.nan_to_num(returns, nan=0)
        sharpe = np.sqrt(252) * np.mean(returns) / np.std(returns) if np.std(returns) > 0 else 0

        return {
            'prob_threshold': prob_threshold,
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
            'sharpe_ratio': sharpe,
            'trades': trades,
            'equity_curve': equity,
            'capital_curve': capital
        }


def load_data(months=BACKTEST_MONTHS):
    """Load and prepare data for backtesting"""
    data_dir = Path('data')
    all_data = []

    for symbol in SYMBOLS:
        file_path = data_dir / f"{symbol.split('USD')[0]}_5m_processed.parquet"
        if not file_path.exists():
            continue

        df = pd.read_parquet(file_path)
        df['datetime'] = df['timestamp']
        df['symbol'] = symbol

        df = df.sort_values('datetime')
        cutoff_date = df['datetime'].max() - pd.Timedelta(days=months * 30)
        df = df[df['datetime'] >= cutoff_date]

        all_data.append(df)

    combined = pd.concat(all_data, ignore_index=True)
    combined = combined.sort_values('datetime').reset_index(drop=True)
    return combined


def plot_results(all_results, data):
    """Generate and save matplotlib visualizations"""
    if not MATPLOTLIB_AVAILABLE:
        print("\n⚠️  matplotlib not available. Skipping chart generation.")
        print("   Run 'generate_plots.py' later to create charts from saved data.")
        return

    plt.style.use('seaborn-v0_8-whitegrid')

    # 1. Equity Curves Comparison
    fig, ax = plt.subplots(figsize=(14, 7))
    colors = plt.cm.viridis(np.linspace(0, 1, len(all_results)))

    for i, result in enumerate(all_results):
        equity = result['equity_curve']
        if len(equity) > 0:
            # Sample points for smoother plot
            step = max(1, len(equity) // 1000)
            x = np.arange(0, len(equity), step)
            y = equity[::step]
            ax.plot(x, y, color=colors[i], linewidth=1.5,
                   label=f"Threshold {result['prob_threshold']:.2f} (Return: {result['total_return_pct']:.1f}%)")

    ax.set_xlabel('Time (bars)', fontsize=12)
    ax.set_ylabel('Equity ($)', fontsize=12)
    ax.set_title('Equity Curves Comparison - Different Probability Thresholds', fontsize=14, fontweight='bold')
    ax.legend(loc='best', fontsize=9)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('backtest_equity_comparison.png', dpi=150, bbox_inches='tight')
    plt.close()

    # 2. Performance Metrics Bar Chart
    fig, axes = plt.subplots(2, 3, figsize=(16, 10))
    metrics = ['total_trades', 'win_rate', 'total_return_pct', 'max_drawdown_pct', 'sharpe_ratio', 'avg_pnl']
    titles = ['Total Trades', 'Win Rate (%)', 'Total Return (%)', 'Max Drawdown (%)', 'Sharpe Ratio', 'Avg PnL/Trade ($)']

    for idx, (metric, title) in enumerate(zip(metrics, titles)):
        ax = axes[idx // 3, idx % 3]
        values = [r[metric] * (100 if metric in ['win_rate'] else 1) for r in all_results]
        thresholds = [f"{r['prob_threshold']:.2f}" for r in all_results]

        bars = ax.bar(thresholds, values, color=colors, edgecolor='black', linewidth=0.5)
        ax.set_xlabel('Probability Threshold', fontsize=11)
        ax.set_ylabel(title, fontsize=11)
        ax.set_title(title, fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3, axis='y')

        # Add value labels
        for bar, val in zip(bars, values):
            height = bar.get_height()
            ax.annotate(f'{val:.2f}',
                       xy=(bar.get_x() + bar.get_width() / 2, height),
                       xytext=(0, 3),
                       textcoords="offset points",
                       ha='center', va='bottom', fontsize=9)

    plt.tight_layout()
    plt.savefig('backtest_metrics_comparison.png', dpi=150, bbox_inches='tight')
    plt.close()

    # 3. Drawdown Analysis
    fig, ax = plt.subplots(figsize=(14, 6))

    for i, result in enumerate(all_results):
        equity = result['equity_curve']
        if len(equity) > 0:
            peak = np.maximum.accumulate(equity)
            drawdown = (equity - peak) / peak * 100
            step = max(1, len(drawdown) // 1000)
            x = np.arange(0, len(drawdown), step)
            y = drawdown[::step]
            ax.fill_between(x, y, 0, color=colors[i], alpha=0.3,
                          label=f"Threshold {result['prob_threshold']:.2f}")

    ax.set_xlabel('Time (bars)', fontsize=12)
    ax.set_ylabel('Drawdown (%)', fontsize=12)
    ax.set_title('Drawdown Analysis - Different Probability Thresholds', fontsize=14, fontweight='bold')
    ax.legend(loc='best', fontsize=9)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('backtest_drawdown_analysis.png', dpi=150, bbox_inches='tight')
    plt.close()

    # 4. Win Rate vs Return Scatter
    fig, ax = plt.subplots(figsize=(10, 8))

    for i, result in enumerate(all_results):
        ax.scatter(result['win_rate'] * 100, result['total_return_pct'],
                  s=200, c=[colors[i]], edgecolors='black', linewidth=1.5,
                  label=f"Threshold {result['prob_threshold']:.2f}")
        ax.annotate(f"{result['prob_threshold']:.2f}",
                   (result['win_rate'] * 100, result['total_return_pct']),
                   fontsize=10, ha='center', va='bottom', fontweight='bold')

    ax.set_xlabel('Win Rate (%)', fontsize=12)
    ax.set_ylabel('Total Return (%)', fontsize=12)
    ax.set_title('Risk-Return Profile by Probability Threshold', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3)
    ax.axhline(y=0, color='red', linestyle='--', linewidth=1, alpha=0.5)
    plt.tight_layout()
    plt.savefig('backtest_risk_return_profile.png', dpi=150, bbox_inches='tight')
    plt.close()

    # 5. Trade Distribution for best threshold
    best_result = max(all_results, key=lambda x: x['total_return_pct'])
    if best_result['trades']:
        trades_df = pd.DataFrame(best_result['trades'])

        fig, axes = plt.subplots(1, 2, figsize=(14, 5))

        # PnL distribution
        ax = axes[0]
        colors_pnl = ['green' if x > 0 else 'red' for x in trades_df['net_pnl']]
        ax.hist(trades_df['net_pnl'], bins=30, color=colors_pnl, edgecolor='black', alpha=0.7)
        ax.set_xlabel('PnL ($)', fontsize=11)
        ax.set_ylabel('Frequency', fontsize=11)
        ax.set_title(f'Trade PnL Distribution (Threshold: {best_result["prob_threshold"]:.2f})', fontsize=12, fontweight='bold')
        ax.axvline(x=0, color='black', linestyle='-', linewidth=1)
        ax.grid(True, alpha=0.3)

        # Trade outcomes by symbol
        ax = axes[1]
        symbol_pnl = trades_df.groupby('symbol')['net_pnl'].sum()
        bars = ax.bar(symbol_pnl.index, symbol_pnl.values,
                     color=['green' if x > 0 else 'red' for x in symbol_pnl.values],
                     edgecolor='black', linewidth=0.5)
        ax.set_xlabel('Symbol', fontsize=11)
        ax.set_ylabel('Total PnL ($)', fontsize=11)
        ax.set_title('PnL by Symbol', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3, axis='y')

        for bar, val in zip(bars, symbol_pnl.values):
            height = bar.get_height()
            ax.annotate(f'${val:.2f}',
                       xy=(bar.get_x() + bar.get_width() / 2, height),
                       xytext=(0, 3 if height > 0 else -10),
                       textcoords="offset points",
                       ha='center', va='bottom' if height > 0 else 'top', fontsize=10)

        plt.tight_layout()
        plt.savefig('backtest_trade_distribution.png', dpi=150, bbox_inches='tight')
        plt.close()

    print("\n📊 Saved visualization files:")
    print("  - backtest_equity_comparison.png")
    print("  - backtest_metrics_comparison.png")
    print("  - backtest_drawdown_analysis.png")
    print("  - backtest_risk_return_profile.png")
    print("  - backtest_trade_distribution.png")


def save_results(all_results, data):
    """Save all results to files"""
    # Save detailed CSV for each threshold
    for result in all_results:
        if result['trades']:
            trades_df = pd.DataFrame(result['trades'])
            filename = f"backtest_trades_threshold_{result['prob_threshold']:.2f}.csv"
            trades_df.to_csv(filename, index=False)

            # Save equity curve
            equity_df = pd.DataFrame({
                'timestamp': data['datetime'].values[:len(result['equity_curve'])],
                'equity': result['equity_curve'],
                'capital': result['capital_curve']
            })
            equity_df.to_csv(f"backtest_equity_threshold_{result['prob_threshold']:.2f}.csv", index=False)

    # Save plot-ready data for all thresholds in one file
    # Convert trades data to JSON-serializable format
    def convert_trades(trades):
        if not trades:
            return []
        result = []
        for t in trades:
            t_copy = t.copy()
            # Convert timestamps to strings
            for key in ['entry_time', 'exit_time']:
                if key in t_copy:
                    val = t_copy[key]
                    if hasattr(val, 'isoformat'):
                        t_copy[key] = val.isoformat()
                    elif isinstance(val, pd.Timestamp):
                        t_copy[key] = str(val)
                    elif isinstance(val, np.datetime64):
                        t_copy[key] = str(val)
                    else:
                        t_copy[key] = str(val)
            result.append(t_copy)
        return result

    plot_data = {
        'thresholds': [r['prob_threshold'] for r in all_results],
        'equity_curves': [r['equity_curve'].tolist() for r in all_results],
        'capital_curves': [r['capital_curve'].tolist() for r in all_results],
        'metrics': {
            'total_trades': [r['total_trades'] for r in all_results],
            'win_rate': [r['win_rate'] for r in all_results],
            'total_return_pct': [r['total_return_pct'] for r in all_results],
            'max_drawdown_pct': [r['max_drawdown_pct'] for r in all_results],
            'sharpe_ratio': [r['sharpe_ratio'] for r in all_results],
            'avg_pnl': [float(r.get('avg_pnl', 0)) for r in all_results]
        },
        'trades_data': [convert_trades(r['trades']) for r in all_results]
    }

    with open('backtest_plot_data.json', 'w') as f:
        json.dump(plot_data, f, indent=2)

    # Save summary JSON
    summary = {
        'backtest_config': {
            'initial_capital': INITIAL_CAPITAL,
            'leverage': LEVERAGE,
            'symbols': SYMBOLS,
            'rr_ratio': RR_RATIO,
            'sl_atr_mult': SL_ATR_MULT,
            'backtest_months': BACKTEST_MONTHS,
            'probability_thresholds_tested': PROBABILITY_THRESHOLDS
        },
        'results': [
            {
                'prob_threshold': r['prob_threshold'],
                'total_trades': r.get('total_trades', 0),
                'winning_trades': r.get('winning_trades', 0),
                'losing_trades': r.get('losing_trades', 0),
                'win_rate': round(r.get('win_rate', 0), 4),
                'total_pnl': round(r.get('total_pnl', 0), 2),
                'avg_pnl': round(float(r.get('avg_pnl', 0)), 2),
                'max_win': round(float(r.get('max_win', 0)), 2),
                'max_loss': round(float(r.get('max_loss', 0)), 2),
                'final_capital': round(r.get('final_capital', INITIAL_CAPITAL), 2),
                'total_return_pct': round(r.get('total_return_pct', 0), 2),
                'max_drawdown_pct': round(r.get('max_drawdown_pct', 0), 2),
                'sharpe_ratio': round(float(r.get('sharpe_ratio', 0)), 2)
            }
            for r in all_results
        ],
        'best_threshold': max(all_results, key=lambda x: x.get('total_return_pct', 0))['prob_threshold'],
        'generated_at': datetime.now(timezone.utc).isoformat()
    }

    with open('backtest_summary.json', 'w') as f:
        json.dump(summary, f, indent=2)

    print("\n📁 Saved result files:")
    print("  - backtest_summary.json")
    print("  - backtest_plot_data.json (for generating charts)")
    for result in all_results:
        print(f"  - backtest_trades_threshold_{result['prob_threshold']:.2f}.csv")
        print(f"  - backtest_equity_threshold_{result['prob_threshold']:.2f}.csv")


def print_summary_table(all_results):
    """Print formatted summary table"""
    print("\n" + "="*100)
    print("BACKTEST RESULTS SUMMARY")
    print("="*100)
    print(f"{'Threshold':<12} {'Trades':<10} {'Win Rate':<12} {'Return %':<12} {'Final $':<12} {'Max DD %':<12} {'Sharpe':<10}")
    print("-"*100)

    for r in all_results:
        print(f"{r['prob_threshold']:<12.2f} {r['total_trades']:<10} {r['win_rate']*100:<12.1f} "
              f"{r['total_return_pct']:<12.2f} {r['final_capital']:<12.2f} {r['max_drawdown_pct']:<12.2f} {r['sharpe_ratio']:<10.2f}")

    print("-"*100)
    best = max(all_results, key=lambda x: x['total_return_pct'])
    print(f"\n🏆 Best Threshold: {best['prob_threshold']:.2f} with {best['total_return_pct']:.2f}% return")
    print("="*100)


def main():
    """Main backtest function"""
    print("="*60)
    print("OPTIMIZED BACKTEST - MULTIPLE THRESHOLDS")
    print("="*60)
    print(f"Initial Capital: ${INITIAL_CAPITAL} | Leverage: {LEVERAGE}x")
    print(f"Symbols: {SYMBOLS} | R:R: 1:{RR_RATIO}")
    print(f"Testing thresholds: {PROBABILITY_THRESHOLDS}")
    print(f"Backtest period: {BACKTEST_MONTHS} months")
    print("="*60)

    # Load data
    print("\n📥 Loading data...")
    data = load_data()
    print(f"  Loaded {len(data):,} bars from {data['datetime'].min()} to {data['datetime'].max()}")

    # Load model
    print("\n🤖 Loading model...")
    backtester = OptimizedBacktester(initial_capital=INITIAL_CAPITAL, leverage=LEVERAGE)
    backtester.load_model()

    # Run backtests for all thresholds
    all_results = []
    print("\n⚙️  Running backtests...\n")

    for threshold in PROBABILITY_THRESHOLDS:
        print(f"  Testing threshold {threshold:.2f}...", end=" ", flush=True)
        result = backtester.run_backtest_vectorized(data, threshold)
        all_results.append(result)
        print(f"✓ {result['total_trades']} trades, {result['total_return_pct']:.2f}% return")

    # Print summary
    print_summary_table(all_results)

    # Save results
    save_results(all_results, data)

    # Generate plots
    print("\n📈 Generating visualizations...")
    plot_results(all_results, data)

    print("\n✅ Backtest completed successfully!")


if __name__ == "__main__":
    main()
