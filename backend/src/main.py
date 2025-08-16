"""
Pac-Map 後端 API
提供 Google 登入、排行榜、用戶管理等功能
"""

from datetime import timedelta
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import authenticate_google_user, create_access_token, generate_google_auth_url, get_current_user
from config import settings
from database import db
from map_service import map_service
from models import APIResponse, GameScore, LeaderboardEntry, LeaderboardResponse, ProcessedMapData, Token, User

# 建立 FastAPI 應用程式
app = FastAPI(title=settings.APP_NAME, description="Pac-Map 遊戲後端 API", version="1.0.0", debug=settings.DEBUG)

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === 請求模型 ===


class GoogleLoginRequest(BaseModel):
    """Google 登入請求"""

    id_token: str


class SubmitScoreRequest(BaseModel):
    """提交分數請求"""

    score: int
    level: int
    map_index: int
    survival_time: int
    dots_collected: int
    ghosts_eaten: int


# === API 路由 ===


@app.get("/")
async def root():
    """根路徑 - API 狀態檢查"""
    return {"message": "Pac-Map Backend API", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health_check():
    """健康檢查"""
    return {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z"}


# === 認證相關路由 ===


@app.get("/auth/google/url")
async def get_google_auth_url():
    """取得 Google OAuth 認證 URL"""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Google OAuth not configured")

    auth_url = generate_google_auth_url()
    return {"auth_url": auth_url}


@app.post("/auth/google/login", response_model=Token)
async def google_login(request: GoogleLoginRequest):
    """Google 登入"""
    try:
        # 認證 Google 用戶
        user = await authenticate_google_user(request.id_token)

        # 建立 JWT token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(data={"sub": user.id}, expires_delta=access_token_expires)

        return Token(access_token=access_token, token_type="bearer", user=User(**user.dict()))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Login failed: {e!s}")


@app.get("/auth/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """取得當前用戶資訊"""
    return current_user


# === 遊戲相關路由 ===


@app.post("/game/score", response_model=APIResponse)
async def submit_score(request: SubmitScoreRequest, current_user: User = Depends(get_current_user)):
    """提交遊戲分數"""
    try:
        game_score = GameScore(
            score=request.score,
            level=request.level,
            map_index=request.map_index,
            survival_time=request.survival_time,
            dots_collected=request.dots_collected,
            ghosts_eaten=request.ghosts_eaten,
        )

        # 儲存分數到資料庫
        score_record = db.create_score(current_user.id, game_score)

        return APIResponse(success=True, message="Score submitted successfully", data={"score_id": score_record.id})

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to submit score: {e!s}")


@app.get("/game/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(limit: int = 10, map_index: Optional[int] = None):
    """取得排行榜"""
    try:
        leaderboard_data = db.get_leaderboard(limit=limit, map_index=map_index)

        # 地圖名稱對應
        map_names = ["台北市中心", "台中市區", "高雄市區"]

        leaderboard_entries = []
        for entry in leaderboard_data:
            map_name = map_names[entry["map_index"]] if entry["map_index"] < len(map_names) else "未知地圖"

            # 處理 created_at 欄位 - 如果是字串則轉換為 datetime
            created_at = entry["created_at"]
            if isinstance(created_at, str):
                from datetime import datetime

                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))

            leaderboard_entries.append(
                LeaderboardEntry(
                    rank=entry["rank"],
                    user_name=entry["user_name"],
                    user_picture=entry["user_picture"],
                    score=entry["score"],
                    level=entry["level"],
                    map_name=map_name,
                    created_at=created_at,
                )
            )

        return LeaderboardResponse(success=True, data=leaderboard_entries, total_count=len(leaderboard_entries))

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to get leaderboard: {e!s}"
        )


@app.get("/game/my-scores")
async def get_my_scores(limit: int = 10, current_user: User = Depends(get_current_user)):
    """取得我的分數記錄"""
    try:
        scores = db.get_user_scores(current_user.id, limit=limit)
        return {"success": True, "data": [score.dict() for score in scores]}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to get user scores: {e!s}"
        )


# === 地圖相關路由 ===


@app.get("/maps/configs")
async def get_map_configs():
    """取得所有地圖配置"""
    try:
        configs = [
            {"index": i, "name": config.name, "center": config.center, "zoom": config.zoom}
            for i, config in enumerate(map_service.map_configs)
        ]
        return {"success": True, "data": configs}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to get map configs: {e!s}"
        ) from e


@app.get("/maps/{map_index}/data", response_model=ProcessedMapData)
async def get_map_data(map_index: int, force_refresh: bool = False):
    """取得處理後的地圖數據"""
    try:
        map_data = await map_service.get_processed_map_data(map_index, force_refresh)

        if not map_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Map with index {map_index} not found or failed to process",
            )

        return map_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to get map data: {e!s}"
        ) from e


@app.post("/maps/{map_index}/refresh")
async def refresh_map_data(map_index: int):
    """強制重新處理地圖數據"""
    try:
        map_data = await map_service.get_processed_map_data(map_index, force_refresh=True)

        if not map_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Map with index {map_index} not found or failed to process",
            )

        return {
            "success": True,
            "message": f"Map {map_index} data refreshed successfully",
            "processed_at": map_data.processed_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to refresh map data: {e!s}"
        ) from e


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
