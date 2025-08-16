"""
認證相關功能 - Google OAuth 和 JWT
"""
import json
from datetime import datetime, timedelta
from typing import Optional
import httpx
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import settings
from models import TokenData, UserInDB, GoogleUserInfo, UserCreate
from database import db

# JWT 相關
security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """建立 JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    """驗證 JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id)
    except JWTError:
        raise credentials_exception
    
    return token_data

def get_current_user(token_data: TokenData = Depends(verify_token)) -> UserInDB:
    """取得當前登入的用戶"""
    user = db.get_user_by_id(token_data.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return user

# Google OAuth 相關

async def verify_google_token(token: str) -> GoogleUserInfo:
    """驗證 Google ID token 並取得用戶資訊"""
    try:
        # 使用 Google 的 tokeninfo API 驗證 token
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid Google token"
                )
            
            token_info = response.json()
            
            # 驗證 audience (client_id)
            if token_info.get("aud") != settings.GOOGLE_CLIENT_ID:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token audience"
                )
            
            # 建立 GoogleUserInfo 物件
            return GoogleUserInfo(
                id=token_info["sub"],
                email=token_info["email"],
                name=token_info["name"],
                picture=token_info.get("picture"),
                verified_email=token_info.get("email_verified", False)
            )
            
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify Google token"
        )
    except KeyError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token format: missing {e}"
        )

async def authenticate_google_user(google_token: str) -> UserInDB:
    """使用 Google token 認證用戶"""
    # 驗證 Google token 並取得用戶資訊
    google_user = await verify_google_token(google_token)
    
    # 檢查用戶是否已存在
    user = db.get_user_by_google_id(google_user.id)
    
    if user is None:
        # 建立新用戶
        user_create = UserCreate(
            google_id=google_user.id,
            email=google_user.email,
            name=google_user.name,
            picture=google_user.picture
        )
        user = db.create_user(user_create)
    
    # 更新最後登入時間
    db.update_user_last_login(user.id)
    
    return user

def generate_google_auth_url() -> str:
    """產生 Google OAuth 認證 URL"""
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "scope": "openid email profile",
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent"
    }
    
    query_string = "&".join([f"{k}={v}" for k, v in params.items()])
    return f"{base_url}?{query_string}"
