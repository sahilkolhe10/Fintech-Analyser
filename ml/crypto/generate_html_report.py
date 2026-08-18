"""
Generate HTML Visualization for Backtest Results
Creates an interactive HTML report using Chart.js (no Python dependencies)
"""

import json
from pathlib import Path
from datetime import datetime

def load_data():
    """Load backtest plot data"""
    with open('backtest_plot_data.json', 'r') as f:
        return json.load(f)

def load_summary():
    """Load backtest summary"""
    with open('backtest_summary.json', 'r') as f:
        return json.load(f)

def generate_html_report(plot_data, summary):
    """Generate interactive HTML report"""

    thresholds = plot_data['thresholds']
    metrics = plot_data['metrics']
    equity_curves = plot_data['equity_curves']

    # Sample equity curves for performance (limit to 500 points each)
    sampled_equity = []
    for eq in equity_curves:
        step = max(1, len(eq) // 500)
        sampled = eq[::step][:500]
        sampled_equity.append(sampled)

    max_len = max(len(eq) for eq in sampled_equity)
    labels = list(range(0, max_len * 10, 10))[:max_len]

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto Trading Model - Backtest Results</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background: #f5f5f5; padding: 20px; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        h1 {{ color: #333; text-align: center; margin-bottom: 10px; }}
        h2 {{ color: #555; margin: 30px 0 15px; border-bottom: 2px solid #007bff; padding-bottom: 10px; }}
        .subtitle {{ text-align: center; color: #666; margin-bottom: 30px; }}
        .config-box {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }}
        .config-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }}
        .config-item {{ text-align: center; padding: 10px; background: #f8f9fa; border-radius: 5px; }}
        .config-item label {{ font-size: 12px; color: #666; display: block; }}
        .config-item span {{ font-size: 18px; font-weight: bold; color: #333; }}
        .chart-container {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }}
        .chart-row {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 20px; }}
        .metrics-table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .metrics-table th {{ background: #007bff; color: white; padding: 15px; text-align: left; }}
        .metrics-table td {{ padding: 12px 15px; border-bottom: 1px solid #eee; }}
        .metrics-table tr:hover {{ background: #f8f9fa; }}
        .positive {{ color: #28a745; font-weight: bold; }}
        .negative {{ color: #dc3545; font-weight: bold; }}
        .best {{ background: #d4edda !important; }}
        .footer {{ text-align: center; color: #666; margin-top: 30px; padding: 20px; }}
        @media (max-width: 768px) {{ .chart-row {{ grid-template-columns: 1fr; }} }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Crypto Trading Model - Backtest Results</h1>
        <p class="subtitle">Probability Threshold Optimization Analysis</p>

        <h2>📋 Configuration</h2>
        <div class="config-box">
            <div class="config-grid">
                <div class="config-item"><label>Initial Capital</label><span>${summary['backtest_config']['initial_capital']}</span></div>
                <div class="config-item"><label>Leverage</label><span>{summary['backtest_config']['leverage']}x</span></div>
                <div class="config-item"><label>Symbols</label><span>{', '.join(summary['backtest_config']['symbols'])}</span></div>
                <div class="config-item"><label>R:R Ratio</label><span>1:{summary['backtest_config']['rr_ratio']}</span></div>
                <div class="config-item"><label>Period</label><span>{summary['backtest_config']['backtest_months']} months</span></div>
                <div class="config-item"><label>Best Threshold</label><span>{summary['best_threshold']}</span></div>
            </div>
        </div>

        <h2>📊 Performance Metrics by Threshold</h2>
        <table class="metrics-table">
            <thead>
                <tr>
                    <th>Threshold</th>
                    <th>Total Trades</th>
                    <th>Win Rate</th>
                    <th>Total Return</th>
                    <th>Final Capital</th>
                    <th>Max Drawdown</th>
                    <th>Sharpe Ratio</th>
                </tr>
            </thead>
            <tbody>
'''

    best_threshold = summary['best_threshold']
    for r in summary['results']:
        is_best = r['prob_threshold'] == best_threshold and r['total_trades'] > 0
        row_class = 'class="best"' if is_best else ''
        return_class = 'positive' if r['total_return_pct'] > 0 else 'negative'
        dd_class = 'negative' if r['max_drawdown_pct'] < -10 else 'positive'

        html += f'''                <tr {row_class}>
                    <td><strong>{r['prob_threshold']:.2f}</strong></td>
                    <td>{r['total_trades']:,}</td>
                    <td>{r['win_rate']*100:.1f}%</td>
                    <td class="{return_class}">{r['total_return_pct']:+.2f}%</td>
                    <td class="{return_class}">${r['final_capital']:.2f}</td>
                    <td class="{dd_class}">{r['max_drawdown_pct']:.2f}%</td>
                    <td>{r['sharpe_ratio']:.2f}</td>
                </tr>
'''

    html += '''            </tbody>
        </table>

        <h2>📈 Equity Curves Comparison</h2>
        <div class="chart-container">
            <canvas id="equityChart"></canvas>
        </div>

        <h2>📊 Metrics Comparison</h2>
        <div class="chart-row">
            <div class="chart-container">
                <canvas id="tradesChart"></canvas>
            </div>
            <div class="chart-container">
                <canvas id="winRateChart"></canvas>
            </div>
        </div>
        <div class="chart-row">
            <div class="chart-container">
                <canvas id="returnChart"></canvas>
            </div>
            <div class="chart-container">
                <canvas id="sharpeChart"></canvas>
            </div>
        </div>

        <div class="footer">
            <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
            <p>Data files: backtest_summary.json, backtest_plot_data.json</p>
        </div>
    </div>

    <script>
        // Color scheme
        const colors = [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(153, 102, 255, 1)'
        ];
        const bgColors = [
            'rgba(255, 99, 132, 0.2)',
            'rgba(54, 162, 235, 0.2)',
            'rgba(255, 206, 86, 0.2)',
            'rgba(75, 192, 192, 0.2)',
            'rgba(153, 102, 255, 0.2)'
        ];

        const thresholds = {json.dumps(thresholds)};
        const equityData = {json.dumps(sampled_equity)};
        const labels = {json.dumps(labels[:max_len])};

        // Equity Chart
        const equityCtx = document.getElementById('equityChart').getContext('2d');
        const equityDatasets = thresholds.map((t, i) => ({
            label: `Threshold ${t.toFixed(2)} (${metrics['total_return_pct'][i].toFixed(1)}%)`,
            data: equityData[i],
            borderColor: colors[i % colors.length],
            backgroundColor: bgColors[i % bgColors.length],
            borderWidth: 2,
            fill: false,
            tension: 0.1
        }));

        new Chart(equityCtx, {
            type: 'line',
            data: { labels, datasets: equityDatasets },
            options: {
                responsive: true,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    title: { display: true, text: 'Equity Growth Over Time', font: { size: 16 } },
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Time (bars)' }, ticks: { maxTicksLimit: 10 } },
                    y: { title: { display: true, text: 'Equity ($)' } }
                }
            }
        });

        // Metrics data
        const tradesData = {json.dumps(metrics['total_trades'])};
        const winRateData = {json.dumps([w*100 for w in metrics['win_rate']])};
        const returnData = {json.dumps(metrics['total_return_pct'])};
        const sharpeData = {json.dumps(metrics['sharpe_ratio'])};

        // Trades Chart
        new Chart(document.getElementById('tradesChart'), {
            type: 'bar',
            data: {
                labels: thresholds.map(t => t.toFixed(2)),
                datasets: [{
                    label: 'Total Trades',
                    data: tradesData,
                    backgroundColor: bgColors,
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Total Trades by Threshold', font: { size: 16 } } },
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Trades' } } }
            }
        });

        // Win Rate Chart
        new Chart(document.getElementById('winRateChart'), {
            type: 'bar',
            data: {
                labels: thresholds.map(t => t.toFixed(2)),
                datasets: [{
                    label: 'Win Rate (%)',
                    data: winRateData,
                    backgroundColor: bgColors,
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Win Rate by Threshold', font: { size: 16 } } },
                scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Win Rate (%)' } } }
            }
        });

        // Return Chart
        new Chart(document.getElementById('returnChart'), {
            type: 'bar',
            data: {
                labels: thresholds.map(t => t.toFixed(2)),
                datasets: [{
                    label: 'Total Return (%)',
                    data: returnData,
                    backgroundColor: returnData.map(v => v >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)'),
                    borderColor: returnData.map(v => v >= 0 ? 'rgb(40, 167, 69)' : 'rgb(220, 53, 69)'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Total Return by Threshold', font: { size: 16 } } },
                scales: { y: { title: { display: true, text: 'Return (%)' } } }
            }
        });

        // Sharpe Chart
        new Chart(document.getElementById('sharpeChart'), {
            type: 'bar',
            data: {
                labels: thresholds.map(t => t.toFixed(2)),
                datasets: [{
                    label: 'Sharpe Ratio',
                    data: sharpeData,
                    backgroundColor: sharpeData.map(v => v >= 0 ? 'rgba(0, 123, 255, 0.7)' : 'rgba(220, 53, 69, 0.7)'),
                    borderColor: sharpeData.map(v => v >= 0 ? 'rgb(0, 123, 255)' : 'rgb(220, 53, 69)'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Sharpe Ratio by Threshold', font: { size: 16 } } },
                scales: { y: { title: { display: true, text: 'Sharpe Ratio' } } }
            }
        });
    </script>
</body>
</html>
'''

    return html


def main():
    """Main function"""
    print("="*60)
    print("GENERATING HTML BACKTEST REPORT")
    print("="*60)

    if not Path('backtest_plot_data.json').exists():
        print("Error: backtest_plot_data.json not found!")
        print("Run backtest_optimized.py first.")
        return

    if not Path('backtest_summary.json').exists():
        print("Error: backtest_summary.json not found!")
        return

    print("\n📥 Loading backtest data...")
    plot_data = load_data()
    summary = load_summary()

    print("\n📄 Generating HTML report...")
    html = generate_html_report(plot_data, summary)

    output_file = 'backtest_report.html'
    with open(output_file, 'w') as f:
        f.write(html)

    print(f"\n✅ Generated: {output_file}")
    print("\n🌐 Open this file in a web browser to view interactive charts!")


if __name__ == "__main__":
    main()
