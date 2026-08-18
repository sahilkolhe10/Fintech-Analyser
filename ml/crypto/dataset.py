"""
Dataset and DataLoader for Transformer Training.

Implements sliding window approach for time series classification.
"""

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
from typing import Tuple, List, Optional


# Feature columns (matching train_model.py)
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


class CryptoDataset(Dataset):
    """
    Sliding window dataset for cryptocurrency price prediction.
    
    Creates sequences of (seq_len) time steps for transformer input,
    with the target being the label at the last time step.
    """
    
    def __init__(
        self,
        data: pd.DataFrame,
        sequence_length: int = 60,
        feature_cols: List[str] = None,
        normalize: bool = True
    ):
        """
        Args:
            data: DataFrame with features and 'target' column
            sequence_length: Number of time steps per sequence
            feature_cols: List of feature column names
            normalize: Whether to normalize features
        """
        self.sequence_length = sequence_length
        self.feature_cols = feature_cols or FEATURE_COLS
        
        # Validate columns
        missing_cols = set(self.feature_cols) - set(data.columns)
        if missing_cols:
            raise ValueError(f"Missing feature columns: {missing_cols}")
        
        if 'target' not in data.columns:
            raise ValueError("Data must contain 'target' column")
        
        # Extract features and targets
        self.features = data[self.feature_cols].values.astype(np.float32)
        self.targets = data['target'].values.astype(np.int64)
        
        # Normalize features
        if normalize:
            self.mean = self.features.mean(axis=0)
            self.std = self.features.std(axis=0) + 1e-8
            self.features = (self.features - self.mean) / self.std
        else:
            self.mean = None
            self.std = None
        
        # Calculate valid indices (ensure we have enough history)
        self.valid_indices = list(range(sequence_length - 1, len(self.features)))
    
    def __len__(self) -> int:
        return len(self.valid_indices)
    
    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        # Get the actual index in the data
        actual_idx = self.valid_indices[idx]
        
        # Get sequence (seq_len time steps ending at actual_idx)
        start_idx = actual_idx - self.sequence_length + 1
        sequence = self.features[start_idx:actual_idx + 1]
        
        # Target is at the last position
        target = self.targets[actual_idx]
        
        return torch.tensor(sequence), torch.tensor(target)
    
    def get_normalization_params(self) -> Tuple[np.ndarray, np.ndarray]:
        """Return normalization parameters for inference."""
        return self.mean, self.std


def load_data(
    data_path: str = "data/combined_5m.parquet",
    sequence_length: int = 60,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    batch_size: int = 64,
    num_workers: int = 0
) -> Tuple[DataLoader, DataLoader, DataLoader, dict]:
    """
    Load data and create train/val/test DataLoaders.
    
    Uses time-based split (no shuffle) to preserve temporal ordering.
    
    Returns:
        train_loader, val_loader, test_loader, metadata
    """
    print(f"\nLoading data from {data_path}...")
    
    path = Path(data_path)
    if not path.exists():
        raise FileNotFoundError(f"Data file not found: {data_path}")
    
    df = pd.read_parquet(data_path)
    
    # Remove any NaN or inf values
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna()
    
    print(f"  Total samples: {len(df):,}")
    print(f"  Features: {len(FEATURE_COLS)}")
    print(f"  Sequence length: {sequence_length}")
    
    # Time-based split
    n = len(df)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))
    
    train_df = df.iloc[:train_end]
    val_df = df.iloc[train_end:val_end]
    test_df = df.iloc[val_end:]
    
    print(f"\n  Train: {len(train_df):,} samples")
    print(f"  Val:   {len(val_df):,} samples")
    print(f"  Test:  {len(test_df):,} samples")
    
    # Create datasets
    train_dataset = CryptoDataset(train_df, sequence_length, normalize=True)
    
    # Use train normalization params for val/test
    val_dataset = CryptoDataset(val_df, sequence_length, normalize=False)
    val_dataset.features = (val_dataset.features - train_dataset.mean) / train_dataset.std
    val_dataset.mean = train_dataset.mean
    val_dataset.std = train_dataset.std
    
    test_dataset = CryptoDataset(test_df, sequence_length, normalize=False)
    test_dataset.features = (test_dataset.features - train_dataset.mean) / train_dataset.std
    test_dataset.mean = train_dataset.mean
    test_dataset.std = train_dataset.std
    
    # Target distribution
    train_targets = train_df['target'].value_counts()
    print(f"\n  Train target distribution:")
    print(f"    LONG (buy):  {train_targets.get(1, 0):,}")
    print(f"    SHORT (sell): {train_targets.get(0, 0):,}")
    
    # Create data loaders
    # Disable pin_memory on MPS as it's not supported
    use_pin_memory = not torch.backends.mps.is_available()
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=use_pin_memory
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=use_pin_memory
    )
    
    test_loader = DataLoader(
        test_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=use_pin_memory
    )
    
    metadata = {
        'input_dim': len(FEATURE_COLS),
        'sequence_length': sequence_length,
        'num_classes': 2,
        'train_samples': len(train_dataset),
        'val_samples': len(val_dataset),
        'test_samples': len(test_dataset),
        'feature_cols': FEATURE_COLS,
        'normalization': {
            'mean': train_dataset.mean,
            'std': train_dataset.std
        }
    }
    
    return train_loader, val_loader, test_loader, metadata


def create_test_data(num_samples: int = 1000, sequence_length: int = 60) -> pd.DataFrame:
    """Create synthetic test data for debugging."""
    np.random.seed(42)
    
    data = {col: np.random.randn(num_samples) for col in FEATURE_COLS}
    data['target'] = np.random.randint(0, 2, num_samples)
    
    return pd.DataFrame(data)


if __name__ == "__main__":
    # Test with synthetic data
    print("Testing dataset with synthetic data...")
    
    df = create_test_data(1000)
    train_loader, val_loader, test_loader, metadata = load_data.__wrapped__(
        df, sequence_length=60, train_ratio=0.7, val_ratio=0.15, batch_size=32
    ) if hasattr(load_data, '__wrapped__') else None
    
    # Simpler test
    dataset = CryptoDataset(df, sequence_length=60)
    print(f"\nDataset length: {len(dataset)}")
    
    x, y = dataset[0]
    print(f"Sample shape: {x.shape}")
    print(f"Target: {y}")
    
    print("\n✓ Dataset test passed!")
