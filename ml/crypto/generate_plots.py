"""
Generate Backtest Visualization Charts
Run this script after backtest_optimized.py to create matplotlib charts.
"""

import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# =============================================================================
# CONFIGURATION
# =============================================================================
BACKTEST_MONTHS = 4
PROBABILITY_THRESHOLDS = [0.50, 0.60, 0.70, 0.80, 0.90]


def load_plot_data():
    """Load plot data from backtest results"""
    with open('backtest_plot_data.json', 'r') as f:
        return json.load(f)


def generate_charts(plot_data):
    """Generate all visualization charts"""
    plt.style.use('seaborn-v0_8-whitegrid')

    thresholds = plot_data['thresholds']
    equity_curves = plot_data['equity_curves']
    metrics = plot_data['metrics']
    trades_data = plot_data['trades_data']

    colors = plt.cm.viridis(np.linspace(0, 1, len(thresholds)))

    # 1. Equity Curves Comparison
    print("  Generating equity curves comparison...")
    fig, ax = plt.subplots(figsize=(14, 7))

    for i, (threshold, equity) in enumerate(zip(thresholds, equity_curves)):
        if len(equity) > 0:
            step = max(1, len(equity) // 1000)
            x = np.arange(0, len(equity), step)
            y = equity[::step]
            return_pct = metrics['total_return_pct'][i]
            ax.plot(x, y, color=colors[i], linewidth=1.5,
                   label=f"Threshold {threshold:.2f} (Return: {return_pct:.1f}%)")

    ax.set_xlabel('Time (bars)', fontsize=12)
    ax.set_ylabel('Equity ($)', fontsize=12)
    ax.set_title('Equity Curves Comparison - Different Probability Thresholds', fontsize=14, fontweight='bold')
    ax.legend(loc='best', fontsize=9)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('backtest_equity_comparison.png', dpi=150, bbox_inches='tight')
    plt.close()

    # 2. Performance Metrics Bar Chart
    print("  Generating metrics comparison...")
    fig, axes = plt.subplots(2, 3, figsize=(16, 10))
    metric_keys = ['total_trades', 'win_rate', 'total_return_pct', 'max_drawdown_pct', 'sharpe_ratio', 'avg_pnl']
    titles = ['Total Trades', 'Win Rate (%)', 'Total Return (%)', 'Max Drawdown (%)', 'Sharpe Ratio', 'Avg PnL/Trade ($)']
    multipliers = [1, 100, 1, 1, 1, 1]  # Multipliers for display

    for idx, (metric_key, title, mult) in enumerate(zip(metric_keys, titles, multipliers)):
        ax = axes[idx // 3, idx % 3]
        values = [v * mult for v in metrics[metric_key]]
        threshold_labels = [f"{t:.2f}" for t in thresholds]

        bars = ax.bar(threshold_labels, values, color=colors, edgecolor='black', linewidth=0.5)
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
    print("  Generating drawdown analysis...")
    fig, ax = plt.subplots(figsize=(14, 6))

    for i, (threshold, equity) in enumerate(zip(thresholds, equity_curves)):
        if len(equity) > 0:
            equity_arr = np.array(equity)
            peak = np.maximum.accumulate(equity_arr)
            drawdown = (equity_arr - peak) / peak * 100
            drawdown = np.nan_to_num(drawdown, nan=0)
            step = max(1, len(drawdown) // 1000)
            x = np.arange(0, len(drawdown), step)
            y = drawdown[::step]
            ax.fill_between(x, y, 0, color=colors[i], alpha=0.3,
                          label=f"Threshold {threshold:.2f}")

    ax.set_xlabel('Time (bars)', fontsize=12)
    ax.set_ylabel('Drawdown (%)', fontsize=12)
    ax.set_title('Drawdown Analysis - Different Probability Thresholds', fontsize=14, fontweight='bold')
    ax.legend(loc='best', fontsize=9)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('backtest_drawdown_analysis.png', dpi=150, bbox_inches='tight')
    plt.close()

    # 4. Win Rate vs Return Scatter
    print("  Generating risk-return profile...")
    fig, ax = plt.subplots(figsize=(10, 8))

    for i, threshold in enumerate(thresholds):
        win_rate = metrics['win_rate'][i] * 100
        return_pct = metrics['total_return_pct'][i]
        ax.scatter(win_rate, return_pct,
                  s=200, c=[colors[i]], edgecolors='black', linewidth=1.5,
                  label=f"Threshold {threshold:.2f}")
        ax.annotate(f"{threshold:.2f}",
                   (win_rate, return_pct),
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
    print("  Generating trade distribution...")
    best_idx = np.argmax(metrics['total_return_pct'])
    best_threshold = thresholds[best_idx]

    if trades_data[best_idx]:
        trades_df = pd.DataFrame(trades_data[best_idx])

        fig, axes = plt.subplots(1, 2, figsize=(14, 5))

        # PnL distribution
        ax = axes[0]
        colors_pnl = ['green' if x > 0 else 'red' for x in trades_df['net_pnl']]
        ax.hist(trades_df['net_pnl'], bins=30, color=colors_pnl, edgecolor='black', alpha=0.7)
        ax.set_xlabel('PnL ($)', fontsize=11)
        ax.set_ylabel('Frequency', fontsize=11)
        ax.set_title(f'Trade PnL Distribution (Threshold: {best_threshold:.2f})', fontsize=12, fontweight='bold')
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

    print("\n✅ Generated visualization files:")
    print("  - backtest_equity_comparison.png")
    print("  - backtest_metrics_comparison.png")
    print("  - backtest_drawdown_analysis.png")
    print("  - backtest_risk_return_profile.png")
    print("  - backtest_trade_distribution.png")


def main():
    """Main function"""
    print("="*60)
    print("GENERATING BACKTEST VISUALIZATION CHARTS")
    print("="*60)

    if not Path('backtest_plot_data.json').exists():
        print("Error: backtest_plot_data.json not found!")
        print("Run backtest_optimized.py first to generate backtest data.")
        return

    print("\n📥 Loading backtest data...")
    plot_data = load_plot_data()

    print("\n📈 Generating charts...\n")
    generate_charts(plot_data)

    print("\n✅ Chart generation completed!")


if __name__ == "__main__":
    main()
