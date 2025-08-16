#!/usr/bin/env python3
"""
調試排行榜問題
"""
import sys
import os

# 添加 src 目錄到 Python 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from database import db

def debug_leaderboard():
    """調試排行榜功能"""
    print("🔍 調試排行榜功能")
    print("=" * 40)
    
    # 1. 檢查資料庫內容
    print("1. 檢查資料庫內容:")
    print(f"   用戶數量: {len(db.data['users'])}")
    print(f"   分數記錄數量: {len(db.data['scores'])}")
    
    # 2. 顯示所有用戶
    print("\n2. 所有用戶:")
    for user_data in db.data['users']:
        print(f"   ID: {user_data['id']}, 名稱: {user_data['name']}")
    
    # 3. 顯示所有分數
    print("\n3. 所有分數記錄:")
    for score_data in db.data['scores']:
        print(f"   分數: {score_data['score']}, 用戶ID: {score_data['user_id']}, 地圖: {score_data['map_index']}")
    
    # 4. 測試 get_user_by_id
    print("\n4. 測試 get_user_by_id:")
    for score_data in db.data['scores']:
        user_id = score_data['user_id']
        user = db.get_user_by_id(user_id)
        print(f"   用戶ID {user_id}: {user.name if user else 'None'}")
    
    # 5. 測試排行榜函數
    print("\n5. 測試排行榜函數:")
    leaderboard = db.get_leaderboard(limit=10)
    print(f"   排行榜條目數: {len(leaderboard)}")
    
    for entry in leaderboard:
        print(f"   排名 {entry['rank']}: {entry['user_name']} - {entry['score']} 分")
    
    # 6. 測試不同地圖的排行榜
    print("\n6. 測試各地圖排行榜:")
    for map_idx in range(3):
        map_leaderboard = db.get_leaderboard(limit=5, map_index=map_idx)
        map_names = ["台北市中心", "台中市區", "高雄市區"]
        print(f"   {map_names[map_idx]} 排行榜: {len(map_leaderboard)} 條目")

if __name__ == "__main__":
    debug_leaderboard()
