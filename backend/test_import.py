#!/usr/bin/env python3
"""
測試模組導入
"""
import sys
import os

# 添加 src 目錄到 Python 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

try:
    print("測試導入模組...")
    
    print("1. 導入 config...")
    from config import settings
    print(f"   ✓ 成功，APP_NAME: {settings.APP_NAME}")
    
    print("2. 導入 models...")
    from models import User, Token
    print("   ✓ 成功")
    
    print("3. 導入 database...")
    from database import db
    print("   ✓ 成功")
    
    print("4. 導入 auth...")
    from auth import create_access_token
    print("   ✓ 成功")
    
    print("5. 導入 main...")
    from main import app
    print("   ✓ 成功")
    
    print("\n🎉 所有模組導入成功！")
    
except Exception as e:
    print(f"❌ 導入失敗: {e}")
    import traceback
    traceback.print_exc()
