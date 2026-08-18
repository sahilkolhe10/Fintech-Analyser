"""
Compare Multiple Transformer Architectures for Crypto Trading.

Trains all architectures on the same dataset and generates a comparison report.
Auto-selects the best performing model based on validation F1 score.
"""

import os
import time
import argparse
import json
import torch
import torch.nn as nn
from pathlib import Path
from datetime import datetime
from tabulate import tabulate

from dataset import load_data, create_test_data, CryptoDataset, FEATURE_COLS
from train_transformer import (
    train_model, evaluate, DEFAULT_CONFIG, 
    save_checkpoint, load_checkpoint
)
from models import get_all_architectures, count_parameters


def compare_architectures(
    train_loader,
    val_loader,
    test_loader,
    config: dict,
    device: torch.device,
    output_dir: str = "model_comparison"
) -> dict:
    """
    Train and compare all architectures.
    
    Returns:
        Dictionary with results for each architecture
    """
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    
    architectures = ['vanilla', 'tcn', 'lightweight', 'informer']
    results = {}
    
    print(f"\n{'='*70}")
    print("ARCHITECTURE COMPARISON")
    print(f"{'='*70}")
    print(f"Training {len(architectures)} architectures...")
    print(f"Epochs: {config['epochs']}, Batch size: {config['batch_size']}")
    print(f"Device: {device}")
    
    criterion = nn.CrossEntropyLoss()
    
    for arch_name in architectures:
        print(f"\n{'='*70}")
        print(f"Training: {arch_name.upper()}")
        print(f"{'='*70}")
        
        save_path = output_path / f"{arch_name}_model.pt"
        start_time = time.time()
        
        try:
            # Train model
            model, history = train_model(
                arch_name,
                config,
                train_loader,
                val_loader,
                device,
                save_path=str(save_path),
                verbose=True
            )
            
            # Evaluate on test set
            test_loss, test_acc, test_metrics = evaluate(
                model, test_loader, criterion, device
            )
            
            training_time = time.time() - start_time
            
            results[arch_name] = {
                'architecture': model.name,
                'parameters': count_parameters(model),
                'training_time': training_time,
                'best_val_f1': history['best_val_f1'],
                'test_accuracy': test_acc,
                'test_f1': test_metrics['macro_f1'],
                'test_metrics': test_metrics,
                'epochs_trained': len(history['train_loss']),
                'model_path': str(save_path)
            }
            
            print(f"\n✓ {arch_name} completed in {training_time:.1f}s")
            print(f"  Test Accuracy: {test_acc:.4f}")
            print(f"  Test F1: {test_metrics['macro_f1']:.4f}")
            
        except Exception as e:
            print(f"\n✗ {arch_name} failed: {e}")
            results[arch_name] = {'error': str(e)}
    
    return results


def generate_report(results: dict, output_path: str = "comparison_report.json"):
    """Generate comparison report."""
    
    # Prepare table data
    table_data = []
    for arch_name, result in results.items():
        if 'error' in result:
            table_data.append([
                arch_name, 'ERROR', '-', '-', '-', '-', result['error'][:50]
            ])
        else:
            table_data.append([
                result['architecture'],
                f"{result['parameters']:,}",
                f"{result['training_time']:.1f}s",
                f"{result['test_accuracy']:.4f}",
                f"{result['test_f1']:.4f}",
                result['epochs_trained'],
                '✓'
            ])
    
    # Print comparison table
    print(f"\n{'='*70}")
    print("COMPARISON RESULTS")
    print(f"{'='*70}")
    
    headers = ['Architecture', 'Params', 'Time', 'Test Acc', 'Test F1', 'Epochs', 'Status']
    print(tabulate(table_data, headers=headers, tablefmt='grid'))
    
    # Find best model
    valid_results = {k: v for k, v in results.items() if 'error' not in v}
    if valid_results:
        best_arch = max(valid_results.keys(), key=lambda x: valid_results[x]['test_f1'])
        best_result = valid_results[best_arch]
        
        print(f"\n{'='*70}")
        print(f"BEST MODEL: {best_result['architecture']}")
        print(f"{'='*70}")
        print(f"Test F1 Score: {best_result['test_f1']:.4f}")
        print(f"Test Accuracy: {best_result['test_accuracy']:.4f}")
        print(f"Parameters: {best_result['parameters']:,}")
        print(f"Training Time: {best_result['training_time']:.1f}s")
        print(f"Model saved at: {best_result['model_path']}")
        
        # Create symlink to best model
        best_model_link = Path("best_transformer_model.pt")
        if best_model_link.exists():
            best_model_link.unlink()
        
        import shutil
        shutil.copy(best_result['model_path'], str(best_model_link))
        print(f"\nCopied best model to: {best_model_link}")
    
    # Save full report
    with open(output_path, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'results': results,
            'best_architecture': best_arch if valid_results else None
        }, f, indent=2, default=str)
    
    print(f"\nFull report saved to: {output_path}")
    
    return best_arch if valid_results else None


def main():
    parser = argparse.ArgumentParser(description='Compare transformer architectures')
    parser.add_argument('--data', type=str, default='data/combined_5m.parquet',
                        help='Path to data file')
    parser.add_argument('--epochs', type=int, default=50,
                        help='Number of epochs per architecture')
    parser.add_argument('--batch-size', type=int, default=64,
                        help='Batch size')
    parser.add_argument('--test-mode', action='store_true',
                        help='Use synthetic data for testing')
    parser.add_argument('--output-dir', type=str, default='model_comparison',
                        help='Output directory for models')
    args = parser.parse_args()
    
    # Device setup - prefer MPS (Apple Silicon), then CUDA, then CPU
    if torch.backends.mps.is_available():
        device = torch.device('mps')
    elif torch.cuda.is_available():
        device = torch.device('cuda')
    else:
        device = torch.device('cpu')
    
    # Configuration
    config = DEFAULT_CONFIG.copy()
    config['epochs'] = args.epochs
    config['batch_size'] = args.batch_size
    
    # Load data
    if args.test_mode:
        print("\n[TEST MODE] Using synthetic data...")
        from torch.utils.data import DataLoader, Subset
        
        df = create_test_data(3000, config['sequence_length'])
        dataset = CryptoDataset(df, config['sequence_length'])
        n = len(dataset)
        train_size = int(0.7 * n)
        val_size = int(0.15 * n)
        
        train_dataset = Subset(dataset, range(train_size))
        val_dataset = Subset(dataset, range(train_size, train_size + val_size))
        test_dataset = Subset(dataset, range(train_size + val_size, n))
        
        train_loader = DataLoader(train_dataset, batch_size=config['batch_size'], shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=config['batch_size'])
        test_loader = DataLoader(test_dataset, batch_size=config['batch_size'])
    else:
        train_loader, val_loader, test_loader, metadata = load_data(
            args.data,
            sequence_length=config['sequence_length'],
            batch_size=config['batch_size']
        )
    
    # Compare architectures
    results = compare_architectures(
        train_loader, val_loader, test_loader,
        config, device, args.output_dir
    )
    
    # Generate report
    best_arch = generate_report(results, f"{args.output_dir}/comparison_report.json")
    
    if best_arch:
        print(f"\n✓ Best architecture: {best_arch.upper()}")
        print("Run with this architecture for production:")
        print(f"  python train_transformer.py --architecture {best_arch} --epochs 100")


if __name__ == "__main__":
    main()
