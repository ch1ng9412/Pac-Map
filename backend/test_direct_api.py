#!/usr/bin/env python3
"""
直接測試 API 函數
"""
import sys
import os

# 添加 src 目錄到 Python 路徑
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

async def test_leaderboard_function():
    """直接測試排行榜函數"""
    from main import get_leaderboard
    
    print("🧪 直接測試排行榜函數")
    
    try:
        # 直接調用 API 函數
        result = await get_leaderboard(limit=10, map_index=None)
        print(f"結果類型: {type(result)}")
        print(f"成功: {result.success}")
        print(f"數據長度: {len(result.data)}")
        print(f"總數: {result.total_count}")
        
        for entry in result.data:
            print(f"  排名 {entry.rank}: {entry.user_name} - {entry.score} 分 ({entry.map_name})")
            
    except Exception as e:
        print(f"錯誤: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_leaderboard_function())
