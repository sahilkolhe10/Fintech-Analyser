"""
Base Transformer Components for Time Series Classification.

Provides foundational building blocks:
- Positional Encoding (sinusoidal and learnable)
- Multi-Head Self-Attention
- Feed-Forward Network
- Transformer Encoder Layer
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class SinusoidalPositionalEncoding(nn.Module):
    """
    Sinusoidal positional encoding as described in "Attention Is All You Need".
    """
    def __init__(self, d_model: int, max_len: int = 5000, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        
        # Create positional encoding matrix
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        
        self.register_buffer('pe', pe)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Tensor of shape (batch_size, seq_len, d_model)
        Returns:
            Tensor with positional encoding added
        """
        x = x + self.pe[:, :x.size(1), :]
        return self.dropout(x)


class LearnablePositionalEncoding(nn.Module):
    """
    Learnable positional encoding - often works better for fixed-length sequences.
    """
    def __init__(self, d_model: int, max_len: int = 5000, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        self.pe = nn.Parameter(torch.randn(1, max_len, d_model) * 0.02)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.pe[:, :x.size(1), :]
        return self.dropout(x)


class MultiHeadSelfAttention(nn.Module):
    """
    Multi-Head Self-Attention mechanism.
    """
    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % num_heads == 0, "d_model must be divisible by num_heads"
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads
        self.scale = self.head_dim ** -0.5
        
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        """
        Args:
            x: (batch_size, seq_len, d_model)
            mask: Optional attention mask
        Returns:
            Output tensor of shape (batch_size, seq_len, d_model)
        """
        batch_size, seq_len, _ = x.shape
        
        # Project to Q, K, V
        q = self.q_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        
        # Compute attention scores
        attn = torch.matmul(q, k.transpose(-2, -1)) * self.scale
        
        if mask is not None:
            attn = attn.masked_fill(mask == 0, float('-inf'))
        
        attn = F.softmax(attn, dim=-1)
        attn = self.dropout(attn)
        
        # Apply attention to values
        out = torch.matmul(attn, v)
        out = out.transpose(1, 2).contiguous().view(batch_size, seq_len, self.d_model)
        
        return self.out_proj(out)


class FeedForward(nn.Module):
    """
    Position-wise Feed-Forward Network.
    """
    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
        self.activation = nn.GELU()
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.linear2(self.dropout(self.activation(self.linear1(x))))


class TransformerEncoderLayer(nn.Module):
    """
    Standard Transformer Encoder Layer with pre-norm architecture.
    """
    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.self_attn = MultiHeadSelfAttention(d_model, num_heads, dropout)
        self.ff = FeedForward(d_model, d_ff, dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        # Pre-norm architecture (better training stability)
        x = x + self.dropout(self.self_attn(self.norm1(x), mask))
        x = x + self.dropout(self.ff(self.norm2(x)))
        return x


class TemporalConvBlock(nn.Module):
    """
    Temporal Convolutional Block for local pattern extraction.
    Used in TCN-Transformer hybrid architecture.
    """
    def __init__(self, in_channels: int, out_channels: int, kernel_size: int = 3, 
                 dilation: int = 1, dropout: float = 0.1):
        super().__init__()
        padding = (kernel_size - 1) * dilation // 2
        
        self.conv = nn.Conv1d(in_channels, out_channels, kernel_size, 
                              padding=padding, dilation=dilation)
        self.norm = nn.BatchNorm1d(out_channels)
        self.activation = nn.GELU()
        self.dropout = nn.Dropout(dropout)
        
        # Residual connection
        self.residual = nn.Conv1d(in_channels, out_channels, 1) if in_channels != out_channels else nn.Identity()
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch_size, channels, seq_len)
        """
        residual = self.residual(x)
        x = self.conv(x)
        x = self.norm(x)
        x = self.activation(x)
        x = self.dropout(x)
        return x + residual


class EfficientAttention(nn.Module):
    """
    Efficient attention mechanism using linear complexity approximation.
    Based on linear attention concepts for faster training.
    """
    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % num_heads == 0
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads
        
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch_size, seq_len, _ = x.shape
        
        q = self.q_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        
        # Apply ELU + 1 feature map for linear attention
        q = F.elu(q) + 1
        k = F.elu(k) + 1
        
        # Linear attention: O(n) instead of O(n^2)
        kv = torch.matmul(k.transpose(-2, -1), v)  # (batch, heads, head_dim, head_dim)
        qkv = torch.matmul(q, kv)  # (batch, heads, seq_len, head_dim)
        
        # Normalize
        k_sum = k.sum(dim=-2, keepdim=True)  # (batch, heads, 1, head_dim)
        normalizer = torch.matmul(q, k_sum.transpose(-2, -1)) + 1e-6  # (batch, heads, seq_len, 1)
        out = qkv / normalizer
        
        out = out.transpose(1, 2).contiguous().view(batch_size, seq_len, self.d_model)
        return self.dropout(self.out_proj(out))


class ProbSparseAttention(nn.Module):
    """
    ProbSparse Self-Attention from Informer paper.
    Selects top-k queries based on sparsity measurement for efficiency.
    """
    def __init__(self, d_model: int, num_heads: int, factor: int = 5, dropout: float = 0.1):
        super().__init__()
        assert d_model % num_heads == 0
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads
        self.scale = self.head_dim ** -0.5
        self.factor = factor
        
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
    
    def _prob_QK(self, Q: torch.Tensor, K: torch.Tensor, sample_k: int) -> torch.Tensor:
        """Calculate sparsity measurement."""
        batch, heads, seq_len, head_dim = K.shape
        
        # Sample keys
        if sample_k < seq_len:
            idx = torch.randint(0, seq_len, (sample_k,), device=K.device)
            K_sample = K[:, :, idx, :]
        else:
            K_sample = K
        
        # Calculate attention scores for sampled keys
        Q_K_sample = torch.matmul(Q, K_sample.transpose(-2, -1)) * self.scale
        
        # Sparsity measurement: max - mean
        M = Q_K_sample.max(dim=-1)[0] - Q_K_sample.mean(dim=-1)
        
        return M
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch_size, seq_len, _ = x.shape
        
        Q = self.q_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        K = self.k_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        V = self.v_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        
        # Determine number of top queries
        u = min(self.factor * int(math.ceil(math.log(seq_len + 1))), seq_len)
        sample_k = min(self.factor * int(math.ceil(math.log(seq_len + 1))), seq_len)
        
        # Get sparsity measurement
        M = self._prob_QK(Q, K, sample_k)
        
        # Select top-u queries
        M_top = M.topk(u, dim=-1, sorted=False)[1]
        
        # Gather top queries
        Q_reduce = torch.gather(Q, 2, M_top.unsqueeze(-1).expand(-1, -1, -1, self.head_dim))
        
        # Standard attention for selected queries
        attn = torch.matmul(Q_reduce, K.transpose(-2, -1)) * self.scale
        attn = F.softmax(attn, dim=-1)
        attn = self.dropout(attn)
        
        # Output for selected queries
        out_reduce = torch.matmul(attn, V)
        
        # Scatter back to full sequence (use mean of V for unselected)
        out = V.mean(dim=2, keepdim=True).expand(-1, -1, seq_len, -1).clone()
        out = out.scatter(2, M_top.unsqueeze(-1).expand(-1, -1, -1, self.head_dim), out_reduce)
        
        out = out.transpose(1, 2).contiguous().view(batch_size, seq_len, self.d_model)
        return self.out_proj(out)


def test_all_components():
    """Test all transformer components."""
    print("Testing transformer components...")
    
    batch_size, seq_len, d_model = 4, 60, 64
    x = torch.randn(batch_size, seq_len, d_model)
    
    # Test positional encodings
    sin_pe = SinusoidalPositionalEncoding(d_model)
    assert sin_pe(x).shape == x.shape, "Sinusoidal PE failed"
    print("  ✓ SinusoidalPositionalEncoding")
    
    learn_pe = LearnablePositionalEncoding(d_model)
    assert learn_pe(x).shape == x.shape, "Learnable PE failed"
    print("  ✓ LearnablePositionalEncoding")
    
    # Test attention mechanisms
    mhsa = MultiHeadSelfAttention(d_model, num_heads=4)
    assert mhsa(x).shape == x.shape, "MHSA failed"
    print("  ✓ MultiHeadSelfAttention")
    
    eff_attn = EfficientAttention(d_model, num_heads=4)
    assert eff_attn(x).shape == x.shape, "Efficient attention failed"
    print("  ✓ EfficientAttention")
    
    prob_attn = ProbSparseAttention(d_model, num_heads=4)
    assert prob_attn(x).shape == x.shape, "ProbSparse attention failed"
    print("  ✓ ProbSparseAttention")
    
    # Test encoder layer
    enc_layer = TransformerEncoderLayer(d_model, num_heads=4, d_ff=256)
    assert enc_layer(x).shape == x.shape, "Encoder layer failed"
    print("  ✓ TransformerEncoderLayer")
    
    # Test temporal conv
    x_conv = x.transpose(1, 2)  # (batch, channels, seq)
    tcn = TemporalConvBlock(d_model, d_model)
    assert tcn(x_conv).shape == x_conv.shape, "TCN failed"
    print("  ✓ TemporalConvBlock")
    
    print("\nAll components passed!")


if __name__ == "__main__":
    test_all_components()
