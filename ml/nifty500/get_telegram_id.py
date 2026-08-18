"""
get_telegram_id.py
==================
Helper script to fetch your Telegram Chat ID.

Usage:
    python get_telegram_id.py

Instructions:
    1. Send a message (e.g., /start) to your bot (@YourBotName).
    2. Run this script.
    3. Copy the 'Chat ID' it prints.
"""
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

import time

def get_chat_id():
    if not TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN not found in .env")
        return

    url = f"https://api.telegram.org/bot{TOKEN}/getUpdates"
    print(f"📡 Polling for messages (120s timeout)...")
    
    start_time = time.time()
    while time.time() - start_time < 120:
        try:
            resp = requests.get(url, timeout=5)
            data = resp.json()
            
            if data.get("ok") and data.get("result"):
                updates = data["result"]
                # Get last message
                last_update = updates[-1]
                chat_id = last_update["message"]["chat"]["id"]
                username = last_update["message"]["from"].get("username", "Unknown")
                
                print("\n✅ Found Chat ID!")
                print(f"   User: @{username}")
                print(f"   ID  : {chat_id}")
                
                # Append to .env automatically
                with open(".env", "a") as f:
                    f.write(f"\nTELEGRAM_CHAT_ID={chat_id}")
                print("   Saved to .env")
                return
            
        except Exception as e:
            print(f"❌ Error: {e}")
            
        time.sleep(2)
        print(".", end="", flush=True)

    print("\n⚠️  No message received within 30 seconds.")

if __name__ == "__main__":
    get_chat_id()
