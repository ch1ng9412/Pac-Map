"""
資料模型定義
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

# === 用戶相關模型 ===

class UserBase(BaseModel):
    """用戶基本資訊"""
    email: EmailStr
    name: str
    picture: Optional[str] = None

class UserCreate(UserBase):
    """創建用戶時的資料"""
    google_id: str

class UserInDB(UserBase):
    """資料庫中的用戶資料"""
    id: int
    google_id: str
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True

class User(UserInDB):
    """回傳給前端的用戶資料"""
    pass

# === 認證相關模型 ===

class Token(BaseModel):
    """JWT Token 回應"""
    access_token: str
    token_type: str = "bearer"
    user: User

class TokenData(BaseModel):
    """Token 中的資料"""
    user_id: Optional[int] = None

# === Google OAuth 相關模型 ===

class GoogleUserInfo(BaseModel):
    """從 Google 取得的用戶資訊"""
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    verified_email: bool

# === 遊戲相關模型 ===

class GameScore(BaseModel):
    """遊戲分數記錄"""
    score: int
    level: int
    map_index: int
    survival_time: int  # 存活時間（秒）
    dots_collected: int
    ghosts_eaten: int

class GameScoreInDB(GameScore):
    """資料庫中的分數記錄"""
    id: int
    user_id: int
    created_at: datetime

class LeaderboardEntry(BaseModel):
    """排行榜條目"""
    rank: int
    user_name: str
    user_picture: Optional[str]
    score: int
    level: int
    map_name: str
    created_at: datetime

# === API 回應模型 ===

class APIResponse(BaseModel):
    """標準 API 回應格式"""
    success: bool
    message: str
    data: Optional[dict] = None

class LeaderboardResponse(BaseModel):
    """排行榜回應"""
    success: bool
    data: list[LeaderboardEntry]
    total_count: int
