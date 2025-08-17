#!/usr/bin/env python3
"""
啟動 Pac-Map 後端伺服器的腳本
"""

import os
import socket
import sys

import uvicorn

# 添加 src 目錄到 Python 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from config import settings


def get_local_ip():
    """獲取本機 IP 地址"""
    try:
        # 連接到一個遠程地址來獲取本機 IP
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    local_ip = get_local_ip()

    print("🚀 啟動 Pac-Map 後端伺服器...")
    print("📍 本機存取: http://localhost:8000")
    print(f"📱 手機存取: http://{local_ip}:8000")
    print("📖 API 文件: http://localhost:8000/docs")
    print(f"🔧 除錯模式: {'開啟' if settings.DEBUG else '關閉'}")
    print("-" * 50)
    print("💡 手機連線提示:")
    print("   1. 確保手機和電腦在同一個 WiFi 網路")
    print(f"   2. 在手機瀏覽器輸入: http://{local_ip}:8000")
    print("   3. 或掃描 QR Code (如果有的話)")
    print("-" * 50)

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info" if not settings.DEBUG else "debug",
    )
