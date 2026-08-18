"""
Transformer Architectures for Crypto Trading Classification.

Implements 4 different transformer variants for comparison:
1. VanillaTransformer - Standard encoder-only transformer
2. TCNTransformer - Temporal CNN + Transformer hybrid
3. LightweightTransformer - Efficient attention for faster training
4. InformerEncoder - ProbSparse attention for long sequences
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

from .transformer_base import (
    SinusoidalPositionalEncoding,
    LearnablePositionalEncoding,
    TransformerEncoderLayer,
    TemporalConvBlock,
    EfficientAttention,
    ProbSparseAttention,
    FeedForward
)


class VanillaTransformer(nn.Module):
    """
    Standard Encoder-Only Transformer for time series classification.
    
    Architecture:
    - Input projection
    - Positional encoding
    - N Transformer encoder layers
    - Global average pooling
    - Classification head
    """
    def __init__(
        self,
        input_dim: int,
        d_model: int = 128,
        num_heads: int = 4,
        num_layers: int = 4,
        d_ff: int = 512,
        max_seq_len: int = 128,
        num_classes: int = 2,
        dropout: float = 0.1
    ):
        super().__init__()
        
        self.name = "VanillaTransformer"
        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_encoder = SinusoidalPositionalEncoding(d_model, max_seq_len, dropout)
        
        self.encoder_layers = nn.ModuleList([
            TransformerEncoderLayer(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        
        self.norm = nn.LayerNorm(d_model)
        self.classifier = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes)
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch_size, seq_len, input_dim)
        Returns:
            logits: (batch_size, num_classes)
        """
        # Project input
        x = self.input_proj(x)
        x = self.pos_encoder(x)
        
        # Encode
        for layer in self.encoder_layers:
            x = layer(x)
        
        x = self.norm(x)
        
        # Global average pooling
        x = x.mean(dim=1)
        
        # Classify
        return self.classifier(x)


class TCNTransformer(nn.Module):
    """
    Temporal Convolutional Network + Transformer Hybrid.
    
    TCN extracts local patterns, Transformer captures global dependencies.
    Often better for time series with strong local patterns.
    """
    def __init__(
        self,
        input_dim: int,
        d_model: int = 128,
        num_heads: int = 4,
        num_encoder_layers: int = 2,
        num_tcn_layers: int = 3,
        d_ff: int = 512,
        max_seq_len: int = 128,
        num_classes: int = 2,
        dropout: float = 0.1
    ):
        super().__init__()
        
        self.name = "TCNTransformer"
        self.input_proj = nn.Linear(input_dim, d_model)
        
        # TCN layers with increasing dilation
        self.tcn_layers = nn.ModuleList([
            TemporalConvBlock(d_model, d_model, kernel_size=3, dilation=2**i, dropout=dropout)
            for i in range(num_tcn_layers)
        ])
        
        self.pos_encoder = LearnablePositionalEncoding(d_model, max_seq_len, dropout)
        
        # Transformer layers
        self.encoder_layers = nn.ModuleList([
            TransformerEncoderLayer(d_model, num_heads, d_ff, dropout)
            for _ in range(num_encoder_layers)
        ])
        
        self.norm = nn.LayerNorm(d_model)
        self.classifier = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes)
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Project input
        x = self.input_proj(x)
        
        # TCN: (batch, seq, dim) -> (batch, dim, seq) -> TCN -> (batch, seq, dim)
        x = x.transpose(1, 2)
        for tcn in self.tcn_layers:
            x = tcn(x)
        x = x.transpose(1, 2)
        
        # Positional encoding
        x = self.pos_encoder(x)
        
        # Transformer encoding
        for layer in self.encoder_layers:
            x = layer(x)
        
        x = self.norm(x)
        
        # Pool and classify
        x = x.mean(dim=1)
        return self.classifier(x)


class LightweightTransformer(nn.Module):
    """
    Lightweight Transformer with Efficient Linear Attention.
    
    Uses linear attention approximation for O(n) complexity instead of O(n^2).
    Much faster training and lower memory, with slightly reduced expressiveness.
    """
    def __init__(
        self,
        input_dim: int,
        d_model: int = 128,
        num_heads: int = 4,
        num_layers: int = 4,
        d_ff: int = 512,
        max_seq_len: int = 128,
        num_classes: int = 2,
        dropout: float = 0.1
    ):
        super().__init__()
        
        self.name = "LightweightTransformer"
        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_encoder = LearnablePositionalEncoding(d_model, max_seq_len, dropout)
        
        # Use efficient attention layers
        self.layers = nn.ModuleList([
            nn.ModuleDict({
                'attn': EfficientAttention(d_model, num_heads, dropout),
                'ff': FeedForward(d_model, d_ff, dropout),
                'norm1': nn.LayerNorm(d_model),
                'norm2': nn.LayerNorm(d_model),
            })
            for _ in range(num_layers)
        ])
        
        self.norm = nn.LayerNorm(d_model)
        self.classifier = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes)
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_proj(x)
        x = self.pos_encoder(x)
        
        for layer in self.layers:
            x = x + layer['attn'](layer['norm1'](x))
            x = x + layer['ff'](layer['norm2'](x))
        
        x = self.norm(x)
        x = x.mean(dim=1)
        return self.classifier(x)


class InformerEncoder(nn.Module):
    """
    Informer-style Encoder with ProbSparse Attention.
    
    Based on the Informer paper, uses ProbSparse self-attention which
    has O(L log L) complexity. Better for longer sequences.
    """
    def __init__(
        self,
        input_dim: int,
        d_model: int = 128,
        num_heads: int = 4,
        num_layers: int = 4,
        d_ff: int = 512,
        factor: int = 5,
        max_seq_len: int = 128,
        num_classes: int = 2,
        dropout: float = 0.1
    ):
        super().__init__()
        
        self.name = "InformerEncoder"
        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_encoder = SinusoidalPositionalEncoding(d_model, max_seq_len, dropout)
        
        # ProbSparse attention layers
        self.layers = nn.ModuleList([
            nn.ModuleDict({
                'attn': ProbSparseAttention(d_model, num_heads, factor, dropout),
                'ff': FeedForward(d_model, d_ff, dropout),
                'norm1': nn.LayerNorm(d_model),
                'norm2': nn.LayerNorm(d_model),
            })
            for _ in range(num_layers)
        ])
        
        self.norm = nn.LayerNorm(d_model)
        
        # Distilling layers (from Informer) - reduce sequence length
        self.conv_layers = nn.ModuleList([
            nn.Conv1d(d_model, d_model, kernel_size=3, padding=1)
            for _ in range(num_layers - 1)
        ])
        self.pool = nn.MaxPool1d(kernel_size=2, stride=2)
        
        self.classifier = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, num_classes)
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_proj(x)
        x = self.pos_encoder(x)
        
        for i, layer in enumerate(self.layers):
            x = x + layer['attn'](layer['norm1'](x))
            x = x + layer['ff'](layer['norm2'](x))
            
            # Distilling - reduce sequence length (except for last layer)
            if i < len(self.conv_layers):
                x = x.transpose(1, 2)  # (batch, d_model, seq)
                x = self.conv_layers[i](x)
                x = self.pool(x)
                x = x.transpose(1, 2)  # (batch, seq//2, d_model)
        
        x = self.norm(x)
        x = x.mean(dim=1)
        return self.classifier(x)


def get_architecture(name: str, input_dim: int, **kwargs) -> nn.Module:
    """Factory function to get architecture by name."""
    architectures = {
        'vanilla': VanillaTransformer,
        'tcn': TCNTransformer,
        'lightweight': LightweightTransformer,
        'informer': InformerEncoder
    }
    
    if name.lower() not in architectures:
        raise ValueError(f"Unknown architecture: {name}. Available: {list(architectures.keys())}")
    
    return architectures[name.lower()](input_dim, **kwargs)


def get_all_architectures(input_dim: int, **kwargs) -> dict:
    """Get all architectures as a dictionary."""
    return {
        'vanilla': VanillaTransformer(input_dim, **kwargs),
        'tcn': TCNTransformer(input_dim, **kwargs),
        'lightweight': LightweightTransformer(input_dim, **kwargs),
        'informer': InformerEncoder(input_dim, **kwargs)
    }


def count_parameters(model: nn.Module) -> int:
    """Count trainable parameters."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def test_all_architectures():
    """Test all architectures with dummy data."""
    print("\nTesting all transformer architectures...")
    print("="*60)
    
    batch_size = 4
    seq_len = 60
    input_dim = 32
    num_classes = 2
    
    x = torch.randn(batch_size, seq_len, input_dim)
    
    architectures = get_all_architectures(input_dim, d_model=64, num_heads=4, num_layers=2, d_ff=128)
    
    for name, model in architectures.items():
        try:
            output = model(x)
            params = count_parameters(model)
            assert output.shape == (batch_size, num_classes), f"{name}: Wrong output shape"
            print(f"  ✓ {model.name:25s} | Params: {params:,}")
        except Exception as e:
            print(f"  ✗ {name}: {e}")
    
    print("="*60)
    print("All architectures passed!")


if __name__ == "__main__":
    test_all_architectures()
