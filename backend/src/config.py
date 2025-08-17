"""
配置檔案 - 管理應用程式的設定
"""

import os
from typing import Optional

from dotenv import load_dotenv

# 載入 .env 檔案
load_dotenv()


class Settings:
    """應用程式設定"""

    # Google OAuth 設定
    GOOGLE_CLIENT_ID: Optional[str] = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: Optional[str] = os.getenv("GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

    # JWT 設定
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # 資料庫設定 (暫時使用檔案，之後可以改為真實資料庫)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./pac_map.db")

    # CORS 設定
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5500",  # Live Server 預設埠
        "http://127.0.0.1:5500",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        # 允許本地網路存取
        "http://192.168.*",
        "http://10.*",
        "http://172.*",
        # 開發時允許任何來源 (生產環境應該移除)
        "*",
    ]

    # 應用程式設定
    APP_NAME: str = "Pac-Map Backend"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"


# 建立全域設定實例
settings = Settings()
