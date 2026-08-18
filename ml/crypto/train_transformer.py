"""
Transformer Training Script for Crypto Trading.

Trains transformer models with Adam optimizer, early stopping, and learning rate scheduling.
Supports training multiple architectures for comparison.
"""

import os
import time
import argparse
import json
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import ReduceLROnPlateau
from pathlib import Path
from datetime import datetime
from typing import Dict, Tuple, Optional

from dataset import load_data, create_test_data, CryptoDataset, FEATURE_COLS
from models import get_architecture, get_all_architectures, count_parameters


# Configuration
DEFAULT_CONFIG = {
    'sequence_length': 60,  # 60 x 5min = 5 hours of history
    'd_model': 128,
    'num_heads': 4,
    'num_layers': 4,
    'd_ff': 512,
    'dropout': 0.1,
    'learning_rate': 1e-4,
    'batch_size': 64,
    'epochs': 100,
    'patience': 10,  # Early stopping patience
    'min_delta': 0.001,  # Minimum improvement for early stopping
}


class EarlyStopping:
    """Early stopping to prevent overfitting."""
    
    def __init__(self, patience: int = 10, min_delta: float = 0.001, mode: str = 'max'):
        self.patience = patience
        self.min_delta = min_delta
        self.mode = mode
        self.counter = 0
        self.best_score = None
        self.should_stop = False
    
    def __call__(self, score: float) -> bool:
        if self.best_score is None:
            self.best_score = score
            return False
        
        if self.mode == 'max':
            improved = score > self.best_score + self.min_delta
        else:
            improved = score < self.best_score - self.min_delta
        
        if improved:
            self.best_score = score
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True
        
        return self.should_stop


def train_epoch(
    model: nn.Module,
    train_loader,
    optimizer: optim.Optimizer,
    criterion: nn.Module,
    device: torch.device
) -> Tuple[float, float]:
    """Train for one epoch."""
    model.train()
    total_loss = 0
    correct = 0
    total = 0
    
    for batch_x, batch_y in train_loader:
        batch_x = batch_x.to(device)
        batch_y = batch_y.to(device)
        
        optimizer.zero_grad()
        outputs = model(batch_x)
        loss = criterion(outputs, batch_y)
        
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        
        total_loss += loss.item() * batch_x.size(0)
        _, predicted = outputs.max(1)
        correct += predicted.eq(batch_y).sum().item()
        total += batch_y.size(0)
    
    return total_loss / total, correct / total


def evaluate(
    model: nn.Module,
    data_loader,
    criterion: nn.Module,
    device: torch.device
) -> Tuple[float, float, Dict]:
    """Evaluate model and return loss, accuracy, and detailed metrics."""
    model.eval()
    total_loss = 0
    all_preds = []
    all_targets = []
    
    with torch.no_grad():
        for batch_x, batch_y in data_loader:
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)
            
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            
            total_loss += loss.item() * batch_x.size(0)
            _, predicted = outputs.max(1)
            
            all_preds.extend(predicted.cpu().numpy())
            all_targets.extend(batch_y.cpu().numpy())
    
    all_preds = np.array(all_preds)
    all_targets = np.array(all_targets)
    
    # Calculate metrics
    accuracy = (all_preds == all_targets).mean()
    
    # Per-class metrics
    metrics = {}
    for cls in [0, 1]:
        cls_mask = all_targets == cls
        cls_pred_mask = all_preds == cls
        
        tp = ((all_preds == cls) & (all_targets == cls)).sum()
        fp = ((all_preds == cls) & (all_targets != cls)).sum()
        fn = ((all_preds != cls) & (all_targets == cls)).sum()
        
        precision = tp / (tp + fp + 1e-8)
        recall = tp / (tp + fn + 1e-8)
        f1 = 2 * precision * recall / (precision + recall + 1e-8)
        
        cls_name = 'LONG' if cls == 1 else 'SHORT'
        metrics[f'{cls_name}_precision'] = precision
        metrics[f'{cls_name}_recall'] = recall
        metrics[f'{cls_name}_f1'] = f1
    
    metrics['accuracy'] = accuracy
    metrics['macro_f1'] = (metrics['LONG_f1'] + metrics['SHORT_f1']) / 2
    
    return total_loss / len(all_targets), accuracy, metrics


def train_model(
    architecture: str,
    config: Dict,
    train_loader,
    val_loader,
    device: torch.device,
    save_path: Optional[str] = None,
    verbose: bool = True
) -> Tuple[nn.Module, Dict]:
    """
    Train a single model architecture.
    
    Returns:
        model: Trained model
        history: Training history with metrics
    """
    input_dim = len(FEATURE_COLS)
    
    # Create model
    model = get_architecture(
        architecture,
        input_dim=input_dim,
        d_model=config['d_model'],
        num_heads=config['num_heads'],
        num_layers=config['num_layers'],
        d_ff=config['d_ff'],
        max_seq_len=config['sequence_length'],
        num_classes=2,
        dropout=config['dropout']
    )
    model = model.to(device)
    
    # Setup training
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=config['learning_rate'])
    scheduler = ReduceLROnPlateau(
        optimizer, mode='max', factor=0.5, patience=5, min_lr=1e-6
    )
    early_stopping = EarlyStopping(
        patience=config['patience'], 
        min_delta=config['min_delta'],
        mode='max'
    )
    
    if verbose:
        print(f"\n{'='*60}")
        print(f"Training: {model.name}")
        print(f"{'='*60}")
        print(f"Parameters: {count_parameters(model):,}")
        print(f"Device: {device}")
    
    history = {
        'train_loss': [], 'train_acc': [],
        'val_loss': [], 'val_acc': [],
        'val_metrics': []
    }
    best_val_f1 = 0
    best_model_state = None
    start_time = time.time()
    
    for epoch in range(config['epochs']):
        epoch_start = time.time()
        
        # Training
        train_loss, train_acc = train_epoch(
            model, train_loader, optimizer, criterion, device
        )
        
        # Validation
        val_loss, val_acc, val_metrics = evaluate(
            model, val_loader, criterion, device
        )
        
        # Update history
        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        history['val_metrics'].append(val_metrics)
        
        # Learning rate scheduling
        scheduler.step(val_metrics['macro_f1'])
        
        # Save best model
        if val_metrics['macro_f1'] > best_val_f1:
            best_val_f1 = val_metrics['macro_f1']
            best_model_state = model.state_dict().copy()
        
        # Logging
        if verbose:
            lr = optimizer.param_groups[0]['lr']
            epoch_time = time.time() - epoch_start
            print(f"Epoch {epoch+1:3d}/{config['epochs']} | "
                  f"Loss: {train_loss:.4f}/{val_loss:.4f} | "
                  f"Acc: {train_acc:.4f}/{val_acc:.4f} | "
                  f"F1: {val_metrics['macro_f1']:.4f} | "
                  f"LR: {lr:.6f} | "
                  f"Time: {epoch_time:.1f}s")
        
        # Early stopping
        if early_stopping(val_metrics['macro_f1']):
            if verbose:
                print(f"\nEarly stopping at epoch {epoch+1}")
            break
    
    # Restore best model
    if best_model_state is not None:
        model.load_state_dict(best_model_state)
    
    total_time = time.time() - start_time
    history['training_time'] = total_time
    history['best_val_f1'] = best_val_f1
    
    if verbose:
        print(f"\nTraining completed in {total_time:.1f}s")
        print(f"Best validation F1: {best_val_f1:.4f}")
    
    # Save model
    if save_path:
        save_checkpoint(model, history, config, save_path)
    
    return model, history


def save_checkpoint(model: nn.Module, history: Dict, config: Dict, path: str):
    """Save model checkpoint."""
    checkpoint = {
        'model_state_dict': model.state_dict(),
        'config': config,
        'history': history,
        'architecture': model.name,
        'timestamp': datetime.now().isoformat()
    }
    torch.save(checkpoint, path)
    print(f"Saved checkpoint to {path}")


def load_checkpoint(path: str, device: torch.device) -> Tuple[nn.Module, Dict, Dict]:
    """Load model from checkpoint."""
    checkpoint = torch.load(path, map_location=device)
    
    config = checkpoint['config']
    input_dim = len(FEATURE_COLS)
    
    model = get_architecture(
        checkpoint['architecture'].lower().replace('transformer', '').replace('encoder', ''),
        input_dim=input_dim,
        d_model=config['d_model'],
        num_heads=config['num_heads'],
        num_layers=config['num_layers'],
        d_ff=config['d_ff'],
        max_seq_len=config['sequence_length'],
        num_classes=2,
        dropout=config['dropout']
    )
    model.load_state_dict(checkpoint['model_state_dict'])
    model = model.to(device)
    
    return model, config, checkpoint['history']


def main():
    parser = argparse.ArgumentParser(description='Train transformer for crypto trading')
    parser.add_argument('--architecture', type=str, default='vanilla',
                        choices=['vanilla', 'tcn', 'lightweight', 'informer'],
                        help='Architecture to train')
    parser.add_argument('--data', type=str, default='data/combined_5m.parquet',
                        help='Path to data file')
    parser.add_argument('--epochs', type=int, default=DEFAULT_CONFIG['epochs'],
                        help='Number of epochs')
    parser.add_argument('--batch-size', type=int, default=DEFAULT_CONFIG['batch_size'],
                        help='Batch size')
    parser.add_argument('--lr', type=float, default=DEFAULT_CONFIG['learning_rate'],
                        help='Learning rate')
    parser.add_argument('--test-mode', action='store_true',
                        help='Use synthetic data for testing')
    parser.add_argument('--output', type=str, default='transformer_model.pt',
                        help='Output model path')
    args = parser.parse_args()
    
    # Device setup - prefer MPS (Apple Silicon), then CUDA, then CPU
    if torch.backends.mps.is_available():
        device = torch.device('mps')
    elif torch.cuda.is_available():
        device = torch.device('cuda')
    else:
        device = torch.device('cpu')
    print(f"\n{'='*60}")
    print(f"TRANSFORMER TRAINING")
    print(f"{'='*60}")
    print(f"Device: {device}")
    print(f"Architecture: {args.architecture}")
    
    # Configuration
    config = DEFAULT_CONFIG.copy()
    config['epochs'] = args.epochs
    config['batch_size'] = args.batch_size
    config['learning_rate'] = args.lr
    
    # Load data
    if args.test_mode:
        print("\n[TEST MODE] Using synthetic data...")
        df = create_test_data(5000, config['sequence_length'])
        
        from torch.utils.data import DataLoader
        dataset = CryptoDataset(df, config['sequence_length'])
        n = len(dataset)
        train_size = int(0.7 * n)
        val_size = int(0.15 * n)
        
        from torch.utils.data import Subset
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
    
    # Train
    model, history = train_model(
        args.architecture,
        config,
        train_loader,
        val_loader,
        device,
        save_path=args.output
    )
    
    # Final evaluation on test set
    print(f"\n{'='*60}")
    print("TEST SET EVALUATION")
    print(f"{'='*60}")
    
    criterion = nn.CrossEntropyLoss()
    test_loss, test_acc, test_metrics = evaluate(model, test_loader, criterion, device)
    
    print(f"\nTest Accuracy: {test_acc:.4f}")
    print(f"Test F1 (macro): {test_metrics['macro_f1']:.4f}")
    print(f"\nPer-class metrics:")
    print(f"  LONG  - P: {test_metrics['LONG_precision']:.4f}, R: {test_metrics['LONG_recall']:.4f}, F1: {test_metrics['LONG_f1']:.4f}")
    print(f"  SHORT - P: {test_metrics['SHORT_precision']:.4f}, R: {test_metrics['SHORT_recall']:.4f}, F1: {test_metrics['SHORT_f1']:.4f}")
    
    print(f"\n✓ Model saved to {args.output}")


if __name__ == "__main__":
    main()
