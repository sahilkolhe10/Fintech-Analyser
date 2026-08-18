FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the bot script and pre-trained model
COPY paper_trading_bot.py .
COPY trained_model.pkl .

# Run the bot
CMD ["python", "paper_trading_bot.py"]
