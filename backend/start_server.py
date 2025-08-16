#!/usr/bin/env python3
"""
啟動 Pac-Map 後端伺服器的腳本
"""
import sys
import os
import uvicorn

# 添加 src 目錄到 Python 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from config import settings

if __name__ == "__main__":
    print("🚀 啟動 Pac-Map 後端伺服器...")
    print(f"📍 伺服器位址: http://localhost:8000")
    print(f"📖 API 文件: http://localhost:8000/docs")
    print(f"🔧 除錯模式: {'開啟' if settings.DEBUG else '關閉'}")
    print("-" * 50)
    
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info" if not settings.DEBUG else "debug"
    )
