FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (needed for some Python packages like numpy/pandas/xgboost on slim)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment variables should be passed at runtime, but we can default some
ENV PYTHONUNBUFFERED=1

CMD ["python", "live_trader.py"]
