#!/usr/bin/env python3
"""
診斷 Google OAuth 設定問題
"""
import sys
import os
import re

# 添加 src 目錄到 Python 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def check_env_file():
    """檢查 .env 檔案"""
    print("🔍 檢查 .env 檔案設定")
    print("=" * 40)
    
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    
    if not os.path.exists(env_path):
        print("❌ .env 檔案不存在")
        print("📝 請執行以下步驟：")
        print("   1. 複製 .env.example 為 .env")
        print("   2. 填入您的 Google OAuth 設定")
        return False
    
    print("✅ .env 檔案存在")
    
    # 讀取 .env 檔案
    with open(env_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 檢查必要的設定
    required_vars = [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'SECRET_KEY'
    ]
    
    missing_vars = []
    for var in required_vars:
        if f"{var}=" not in content or f"{var}=your-" in content or f"{var}=" in content and content.split(f"{var}=")[1].split('\n')[0].strip() == "":
            missing_vars.append(var)
    
    if missing_vars:
        print(f"❌ 缺少或未設定的環境變數: {', '.join(missing_vars)}")
        return False
    else:
        print("✅ 所有必要的環境變數都已設定")
    
    # 檢查 Client ID 格式
    client_id_match = re.search(r'GOOGLE_CLIENT_ID=(.+)', content)
    if client_id_match:
        client_id = client_id_match.group(1).strip()
        if client_id.endswith('.apps.googleusercontent.com'):
            print("✅ Google Client ID 格式正確")
        else:
            print("⚠️  Google Client ID 格式可能不正確")
            print(f"   當前值: {client_id}")
            print("   正確格式應該以 .apps.googleusercontent.com 結尾")
    
    return True

def check_config_loading():
    """檢查配置載入"""
    print("\n🔍 檢查配置載入")
    print("=" * 40)
    
    try:
        from config import settings
        
        print(f"✅ 配置載入成功")
        print(f"   GOOGLE_CLIENT_ID: {settings.GOOGLE_CLIENT_ID[:20] + '...' if settings.GOOGLE_CLIENT_ID else 'None'}")
        print(f"   GOOGLE_CLIENT_SECRET: {'已設定' if settings.GOOGLE_CLIENT_SECRET else '未設定'}")
        print(f"   SECRET_KEY: {'已設定' if settings.SECRET_KEY != 'your-secret-key-change-this-in-production' else '使用預設值'}")
        
        if not settings.GOOGLE_CLIENT_ID:
            print("❌ GOOGLE_CLIENT_ID 未設定")
            return False
        
        if not settings.GOOGLE_CLIENT_SECRET:
            print("❌ GOOGLE_CLIENT_SECRET 未設定")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ 配置載入失敗: {e}")
        return False

def test_google_oauth_url():
    """測試 Google OAuth URL 生成"""
    print("\n🔍 測試 Google OAuth URL 生成")
    print("=" * 40)
    
    try:
        from auth import generate_google_auth_url
        
        url = generate_google_auth_url()
        print("✅ Google OAuth URL 生成成功")
        print(f"   URL: {url[:100]}...")
        
        # 檢查 URL 中的 client_id
        if "client_id=" in url:
            client_id_part = url.split("client_id=")[1].split("&")[0]
            print(f"   Client ID: {client_id_part}")
        
        return True
        
    except Exception as e:
        print(f"❌ Google OAuth URL 生成失敗: {e}")
        return False

def test_api_endpoint():
    """測試 API 端點"""
    print("\n🔍 測試 API 端點")
    print("=" * 40)
    
    try:
        import requests
        
        # 測試 Google Auth URL 端點
        response = requests.get("http://localhost:8000/auth/google/url")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ /auth/google/url 端點正常")
            print(f"   回應: {data}")
            return True
        else:
            print(f"❌ /auth/google/url 端點錯誤: {response.status_code}")
            print(f"   錯誤訊息: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ API 端點測試失敗: {e}")
        return False

def provide_solutions():
    """提供解決方案"""
    print("\n💡 解決方案")
    print("=" * 40)
    
    print("如果您遇到 'The OAuth client was not found' 錯誤，請檢查：")
    print()
    print("1. **Google Cloud Console 設定**")
    print("   - 確保您已建立 OAuth 2.0 用戶端 ID")
    print("   - 應用程式類型選擇「網頁應用程式」")
    print("   - 複製正確的 Client ID（以 .apps.googleusercontent.com 結尾）")
    print()
    print("2. **已授權的 JavaScript 來源**")
    print("   - http://localhost:5500")
    print("   - http://127.0.0.1:5500")
    print("   - 您實際使用的前端網址")
    print()
    print("3. **已授權的重新導向 URI**")
    print("   - http://localhost:8000/auth/google/callback")
    print("   - http://127.0.0.1:8000/auth/google/callback")
    print()
    print("4. **OAuth 同意畫面**")
    print("   - 確保已設定並發布（或加入測試使用者）")
    print("   - 範圍包含：email, profile, openid")
    print()
    print("5. **環境變數**")
    print("   - 確保 .env 檔案中的 GOOGLE_CLIENT_ID 正確")
    print("   - 確保沒有多餘的空格或換行符號")

def main():
    """主診斷函數"""
    print("🔧 Google OAuth 設定診斷工具")
    print("=" * 50)
    
    all_good = True
    
    # 1. 檢查 .env 檔案
    if not check_env_file():
        all_good = False
    
    # 2. 檢查配置載入
    if not check_config_loading():
        all_good = False
    
    # 3. 測試 OAuth URL 生成
    if not test_google_oauth_url():
        all_good = False
    
    # 4. 測試 API 端點
    if not test_api_endpoint():
        all_good = False
    
    # 5. 提供解決方案
    if not all_good:
        provide_solutions()
    else:
        print("\n🎉 所有檢查都通過！")
        print("如果仍有問題，請檢查 Google Cloud Console 的設定。")

if __name__ == "__main__":
    main()
