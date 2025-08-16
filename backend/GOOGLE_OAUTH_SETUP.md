# Google OAuth 設定詳細步驟

## 常見錯誤解決方案

### 錯誤 401: invalid_client
這個錯誤通常是因為 Google OAuth 設定不正確造成的。

### 錯誤: "The OAuth client was not found"
這個錯誤表示 Client ID 不正確或者 OAuth 應用程式設定有問題。

請按照以下步驟重新設定：

## 1. 建立 Google Cloud 專案

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 點擊右上角的「選取專案」
3. 點擊「新增專案」
4. 輸入專案名稱（例如：pac-map-game）
5. 點擊「建立」

## 2. 啟用必要的 API

1. 在左側選單中，點擊「API 和服務」→「程式庫」
2. 搜尋並啟用以下 API：
   - **Google+ API** (已棄用，但仍需要)
   - **Google Identity and Access Management (IAM) API**
   - **Google OAuth2 API**

## 3. 設定 OAuth 同意畫面

1. 在左側選單中，點擊「API 和服務」→「OAuth 同意畫面」
2. 選擇「外部」（除非您有 Google Workspace 帳戶）
3. 填寫必要資訊：
   - **應用程式名稱**：Pac-Map Game
   - **使用者支援電子郵件**：您的 Gmail 地址
   - **開發人員聯絡資訊**：您的 Gmail 地址
4. 點擊「儲存並繼續」
5. 在「範圍」頁面，點擊「新增或移除範圍」
6. 選擇以下範圍：
   - `../auth/userinfo.email`
   - `../auth/userinfo.profile`
   - `openid`
7. 點擊「儲存並繼續」
8. 在「測試使用者」頁面，新增您的 Gmail 地址作為測試使用者
9. 點擊「儲存並繼續」

## 4. 建立 OAuth 2.0 憑證

1. 在左側選單中，點擊「API 和服務」→「憑證」
2. 點擊「+ 建立憑證」→「OAuth 2.0 用戶端 ID」
3. 選擇應用程式類型：**網頁應用程式**
4. 輸入名稱：Pac-Map Web Client
5. 在「已授權的 JavaScript 來源」中新增：
   ```
   http://localhost:5500
   http://127.0.0.1:5500
   http://localhost:3000
   http://127.0.0.1:3000
   ```
6. 在「已授權的重新導向 URI」中新增：
   ```
   http://localhost:8000/auth/google/callback
   http://127.0.0.1:8000/auth/google/callback
   ```
7. 點擊「建立」
8. **重要**：複製顯示的 Client ID 和 Client Secret

## 5. 設定環境變數

1. 在 `backend` 資料夾中，複製 `.env.example` 為 `.env`：
   ```bash
   cd backend
   cp .env.example .env
   ```

2. 編輯 `.env` 檔案，填入您的 Google OAuth 憑證：
   ```env
   GOOGLE_CLIENT_ID=您的_CLIENT_ID.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=您的_CLIENT_SECRET
   GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback
   SECRET_KEY=請_更改_這個_密鑰_為_隨機_字串
   ```

## 6. 更新測試頁面

編輯 `google-auth-example.html`，將第 47 行的 `YOUR_GOOGLE_CLIENT_ID` 替換為您的實際 Client ID：

```html
<div id="g_id_onload"
     data-client_id="您的_CLIENT_ID.apps.googleusercontent.com"
     data-callback="handleCredentialResponse"
     data-auto_prompt="false">
</div>
```

## 7. 測試設定

1. 啟動後端伺服器：
   ```bash
   cd backend
   uv run start_server.py
   ```

2. 在瀏覽器中開啟 `google-auth-example.html`

3. 點擊 Google 登入按鈕進行測試

## 常見問題解決

### 錯誤：redirect_uri_mismatch
- 確保在 Google Cloud Console 中設定的重新導向 URI 與您使用的完全一致
- 注意 `http` vs `https` 和 `localhost` vs `127.0.0.1` 的差異

### 錯誤：access_denied
- 確保您的 Gmail 地址已加入測試使用者清單
- 檢查 OAuth 同意畫面是否正確設定

### 錯誤：invalid_client
- 確保 Client ID 和 Client Secret 正確複製到 `.env` 檔案
- 確保沒有多餘的空格或換行符號

## 安全提醒

- **絕對不要**將 `.env` 檔案提交到 Git 儲存庫
- Client Secret 應該保密，不要在前端程式碼中暴露
- 在生產環境中，請使用更安全的密鑰管理方案
