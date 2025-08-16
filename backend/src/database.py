"""
資料庫操作 - 簡單的檔案型資料庫實作
之後可以替換為真實的資料庫（如 PostgreSQL）
"""

import json
import os
from datetime import datetime
from typing import List, Optional

from models import GameScore, GameScoreInDB, UserCreate, UserInDB


class SimpleFileDB:
    """簡單的檔案型資料庫"""

    def __init__(self, db_path: str = "pac_map_db.json"):
        self.db_path = db_path
        self.data = self._load_data()

    def _load_data(self) -> dict:
        """載入資料庫檔案"""
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                pass

        # 如果檔案不存在或損壞，建立預設結構
        return {"users": [], "scores": [], "next_user_id": 1, "next_score_id": 1}

    def _save_data(self):
        """儲存資料到檔案"""
        with open(self.db_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2, default=str)

    # === 用戶相關操作 ===

    def get_user_by_google_id(self, google_id: str) -> Optional[UserInDB]:
        """根據 Google ID 取得用戶"""
        for user_data in self.data["users"]:
            if user_data["google_id"] == google_id:
                return UserInDB(**user_data)
        return None

    def get_user_by_id(self, user_id: int) -> Optional[UserInDB]:
        """根據用戶 ID 取得用戶"""
        for user_data in self.data["users"]:
            if user_data["id"] == user_id:
                return UserInDB(**user_data)
        return None

    def create_user(self, user: UserCreate) -> UserInDB:
        """建立新用戶"""
        user_id = self.data["next_user_id"]
        self.data["next_user_id"] += 1

        user_data = {
            "id": user_id,
            "google_id": user.google_id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "created_at": datetime.now(),
            "last_login": None,
            "is_active": True,
        }

        self.data["users"].append(user_data)
        self._save_data()

        return UserInDB(**user_data)

    def update_user_last_login(self, user_id: int):
        """更新用戶最後登入時間"""
        for user_data in self.data["users"]:
            if user_data["id"] == user_id:
                user_data["last_login"] = datetime.now()
                self._save_data()
                break

    # === 分數相關操作 ===

    def create_score(self, user_id: int, score: GameScore) -> GameScoreInDB:
        """建立新的分數記錄"""
        score_id = self.data["next_score_id"]
        self.data["next_score_id"] += 1

        score_data = {
            "id": score_id,
            "user_id": user_id,
            "score": score.score,
            "level": score.level,
            "map_index": score.map_index,
            "survival_time": score.survival_time,
            "dots_collected": score.dots_collected,
            "ghosts_eaten": score.ghosts_eaten,
            "created_at": datetime.now(),
        }

        self.data["scores"].append(score_data)
        self._save_data()

        return GameScoreInDB(**score_data)

    def get_user_scores(self, user_id: int, limit: int = 10) -> List[GameScoreInDB]:
        """取得用戶的分數記錄"""
        user_scores = [
            GameScoreInDB(**score_data) for score_data in self.data["scores"] if score_data["user_id"] == user_id
        ]

        # 按分數排序，取前 N 筆
        user_scores.sort(key=lambda x: x.score, reverse=True)
        return user_scores[:limit]

    def get_leaderboard(self, limit: int = 10, map_index: Optional[int] = None) -> List[dict]:
        """取得排行榜"""
        scores = self.data["scores"]

        # 如果指定地圖，則過濾
        if map_index is not None:
            scores = [s for s in scores if s["map_index"] == map_index]

        # 按分數排序
        scores.sort(key=lambda x: x["score"], reverse=True)

        # 取前 N 筆並加上用戶資訊
        leaderboard = []
        for i, score_data in enumerate(scores[:limit]):
            user = self.get_user_by_id(score_data["user_id"])
            if user:
                leaderboard.append(
                    {
                        "rank": i + 1,
                        "user_name": user.name,
                        "user_picture": user.picture,
                        "score": score_data["score"],
                        "level": score_data["level"],
                        "map_index": score_data["map_index"],
                        "created_at": score_data["created_at"],
                    }
                )

        return leaderboard


# 建立全域資料庫實例
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "pac_map_db.json")
db = SimpleFileDB(db_path)
