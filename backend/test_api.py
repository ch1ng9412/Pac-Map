#!/usr/bin/env python3
"""
測試後端 API 的腳本（不需要 Google OAuth）
"""

import json
import os
import sys
from datetime import datetime

import requests

# 添加 src 目錄到 Python 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

API_BASE = "http://localhost:8001"


def test_api_endpoints():
    """測試所有 API 端點"""
    print("🧪 開始測試 Pac-Map 後端 API")
    print("=" * 50)

    # 1. 測試根端點
    print("1. 測試根端點 (GET /)")
    try:
        response = requests.get(f"{API_BASE}/")
        print(f"   狀態碼: {response.status_code}")
        print(f"   回應: {response.json()}")
        print("   ✅ 成功\n")
    except Exception as e:
        print(f"   ❌ 失敗: {e}\n")
        return False

    # 2. 測試健康檢查
    print("2. 測試健康檢查 (GET /health)")
    try:
        response = requests.get(f"{API_BASE}/health")
        print(f"   狀態碼: {response.status_code}")
        print(f"   回應: {response.json()}")
        print("   ✅ 成功\n")
    except Exception as e:
        print(f"   ❌ 失敗: {e}\n")

    # 3. 測試排行榜（不需要認證）
    print("3. 測試排行榜 (GET /game/leaderboard)")
    try:
        response = requests.get(f"{API_BASE}/game/leaderboard?limit=5")
        print(f"   狀態碼: {response.status_code}")
        data = response.json()
        print(f"   排行榜條目數: {len(data.get('data', []))}")
        print(f"   回應: {json.dumps(data, indent=2, ensure_ascii=False)}")
        print("   ✅ 成功\n")
    except Exception as e:
        print(f"   ❌ 失敗: {e}\n")

    # 4. 測試 Google Auth URL（不需要實際設定）
    print("4. 測試 Google Auth URL (GET /auth/google/url)")
    try:
        response = requests.get(f"{API_BASE}/auth/google/url")
        print(f"   狀態碼: {response.status_code}")
        if response.status_code == 500:
            print("   ⚠️  預期的錯誤：Google OAuth 尚未設定")
        else:
            print(f"   回應: {response.json()}")
        print("   ✅ 端點正常運作\n")
    except Exception as e:
        print(f"   ❌ 失敗: {e}\n")

    return True


def create_test_user_and_score():
    """創建測試用戶和分數（直接操作資料庫）"""
    print("5. 創建測試數據")
    try:
        from database import db
        from models import GameScore, UserCreate

        # 創建測試用戶
        test_user = UserCreate(
            google_id="test_user_123",
            email="test@example.com",
            name="測試用戶",
            picture="https://via.placeholder.com/50",
        )

        # 檢查用戶是否已存在
        existing_user = db.get_user_by_google_id("test_user_123")
        if not existing_user:
            user = db.create_user(test_user)
            print(f"   ✅ 創建測試用戶: {user.name} (ID: {user.id})")
        else:
            user = existing_user
            print(f"   ℹ️  使用現有測試用戶: {user.name} (ID: {user.id})")

        # 創建測試分數
        test_scores = [
            GameScore(score=8500, level=3, map_index=0, survival_time=450, dots_collected=85, ghosts_eaten=5),
            GameScore(score=7200, level=2, map_index=1, survival_time=380, dots_collected=72, ghosts_eaten=3),
            GameScore(score=9100, level=4, map_index=2, survival_time=520, dots_collected=91, ghosts_eaten=7),
        ]

        for i, score in enumerate(test_scores):
            score_record = db.create_score(user.id, score)
            print(f"   ✅ 創建測試分數 {i + 1}: {score.score} 分")

        print("   ✅ 測試數據創建完成\n")
        return True

    except Exception as e:
        print(f"   ❌ 創建測試數據失敗: {e}\n")
        return False


def test_leaderboard_with_data():
    """測試有數據的排行榜"""
    print("6. 測試排行榜（含測試數據）")
    try:
        response = requests.get(f"{API_BASE}/game/leaderboard?limit=10")
        print(f"   狀態碼: {response.status_code}")
        data = response.json()

        if data.get("success") and data.get("data"):
            print(f"   📊 排行榜條目數: {len(data['data'])}")
            print("   🏆 前三名:")
            for i, entry in enumerate(data["data"][:3]):
                print(f"      {i + 1}. {entry['user_name']} - {entry['score']} 分 ({entry['map_name']})")
        else:
            print("   ℹ️  排行榜暫無數據")

        print("   ✅ 成功\n")
        return True

    except Exception as e:
        print(f"   ❌ 失敗: {e}\n")
        return False


def main():
    """主測試函數"""
    print(f"🚀 開始測試時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🌐 API 基礎 URL: {API_BASE}")
    print()

    # 測試基本 API
    if not test_api_endpoints():
        print("❌ 基本 API 測試失敗，請檢查伺服器是否正在運行")
        return

    # 創建測試數據
    if create_test_user_and_score():
        # 測試有數據的排行榜
        test_leaderboard_with_data()

    print("🎉 API 測試完成！")
    print("\n📝 下一步:")
    print("1. 設定 Google OAuth 憑證（參考 GOOGLE_OAUTH_SETUP.md）")
    print("2. 測試完整的登入流程")
    print("3. 整合到前端遊戲中")


if __name__ == "__main__":
    main()
