"""
資料模型定義
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

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


# === 遊戲事件驗證模型 ===


class GameEventType(str, Enum):
    """遊戲事件類型"""

    GAME_START = "game_start"
    DOT_COLLECTED = "dot_collected"
    POWER_PELLET_COLLECTED = "power_pellet_collected"
    GHOST_EATEN = "ghost_eaten"
    LIFE_LOST = "life_lost"
    LEVEL_COMPLETED = "level_completed"
    GAME_END = "game_end"
    HEALTH_CHANGED = "health_changed"
    BACKPACK_ITEM_USED = "backpack_item_used"


class GameEvent(BaseModel):
    """遊戲事件"""

    event_type: GameEventType
    timestamp: float  # 客戶端時間戳
    game_time_remaining: int  # 遊戲剩餘時間
    player_position: Optional[List[float]] = None  # [lat, lng]
    score_before: int
    score_after: int
    lives_before: int
    lives_after: int
    health_before: float
    health_after: float
    level: int
    map_index: int
    additional_data: Optional[Dict] = None  # 額外數據


class GameSession(BaseModel):
    """遊戲會話"""

    session_id: str
    user_id: int
    map_index: int
    start_time: datetime
    end_time: Optional[datetime] = None
    events: List[GameEvent] = []
    final_score: Optional[int] = None
    is_valid: bool = True
    validation_errors: List[str] = []


class GameEventValidationRequest(BaseModel):
    """遊戲事件驗證請求"""

    session_id: str
    event: GameEvent


class GameEventValidationResponse(BaseModel):
    """遊戲事件驗證回應"""

    is_valid: bool
    expected_score: Optional[int] = None
    score_difference: Optional[int] = None
    warnings: List[str] = []
    errors: List[str] = []


class GameSessionStartRequest(BaseModel):
    """遊戲會話開始請求"""

    map_index: int
    initial_game_time: int = 600


class GameSessionEndRequest(BaseModel):
    """遊戲會話結束請求"""

    session_id: str
    final_score: int
    victory: bool
    survival_time: int
    dots_collected: int
    ghosts_eaten: int


# === 地圖相關模型 ===


class MapBounds(BaseModel):
    """地圖邊界"""

    south: float
    west: float
    north: float
    east: float


class MapConfig(BaseModel):
    """地圖配置"""

    name: str
    center: list[float]  # [lat, lng]
    zoom: int
    bounds: MapBounds


class RoadSegment(BaseModel):
    """道路段"""

    start: list[float]  # [lat, lng]
    end: list[float]  # [lat, lng]


class POIData(BaseModel):
    """興趣點數據"""

    id: str
    type: str
    name: Optional[str] = None
    lat: float
    lng: float
    tags: Optional[dict] = None


class ProcessedMapData(BaseModel):
    """處理後的地圖數據"""

    map_index: int
    map_name: str
    center: list[float]
    zoom: int
    bounds: MapBounds
    road_network: list[RoadSegment]
    valid_positions: list[list[float]]  # [[lat, lng], ...]
    adjacency_list: dict[str, list[list[float]]]  # 鄰接表
    pois: list[POIData]
    ghost_spawn_points: list[list[float]]
    scatter_points: list[list[float]]
    processed_at: datetime


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
