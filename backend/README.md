# Python 後端
Using a modern Python project template leveraging `uv` for dependency management and integrating various development tools for code quality assurance. source: [coke5151/python-project-template](https://github.com/coke5151/python-project-template)

## Features
- Fast and reliable package management with `uv`
- Integrated code quality tools settings:
  - Ruff for linting and formatting
  - Mypy for static type checking
  - VSCode integration
  - Jupyter notebook

## Project Structure
```
.
├── notebooks/         # Jupyter notebook files
├── .vscode/          # VSCode configuration
├── README.md         # Project documentation
├── LICENSE           # License
├── .gitignore       # Git ignore patterns
├── mypy.ini         # Mypy configuration
├── ruff.toml        # Ruff configuration
└── pyrightconfig.json # Pyright configuration
```

## 開發環境設定
1. Install `uv`:
   ```bash
   # macOS and Linux
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

   ```bash
   # Windows
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```
2. 同步虛擬環境:
   ```bash
   cd backend # 確保你在 backend 資料夾裡面
   uv sync
   ```
3. 安裝工具 (在電腦全域安裝)
   ```bash
   # Install development tools globally (each tool has its own venv)
   uv tool install mypy ruff
   ```
4. 如果你需要安裝套件的時候
   ```bash
   uv add <package_name>
   # Example: uv add pandas requests 可以安裝 pandas 和 requests 套件
   ```
5. 設定環境變數:
   ```bash
   # 複製環境變數範例檔案
   cp .env.example .env

   # 編輯 .env 檔案，填入你的 Google OAuth 設定
   # 請參考下方的 "Google OAuth 設定" 章節
   ```

6. Run Code:
   ```bash
   # 啟動後端伺服器
   uv run start_server.py

   # 或者直接執行 main.py
   uv run src/main.py

   # 執行 Jupyter Lab
   uv run jupyter lab
   ```

## Google OAuth 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 Google+ API 和 Google OAuth2 API
4. 建立 OAuth 2.0 憑證：
   - 前往「憑證」頁面
   - 點擊「建立憑證」→「OAuth 2.0 用戶端 ID」
   - 應用程式類型選擇「網頁應用程式」
   - 已授權的重新導向 URI 加入：
     - `http://localhost:8000/auth/google/callback`
     - `http://127.0.0.1:8000/auth/google/callback`
5. 複製 Client ID 和 Client Secret 到 `.env` 檔案

## API 端點

啟動伺服器後，可以在以下位址查看 API 文件：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 主要端點：
- `GET /` - API 狀態檢查
- `GET /health` - 健康檢查
- `GET /auth/google/url` - 取得 Google OAuth 認證 URL
- `POST /auth/google/login` - Google 登入
- `GET /auth/me` - 取得當前用戶資訊
- `POST /game/score` - 提交遊戲分數
- `GET /game/leaderboard` - 取得排行榜
- `GET /game/my-scores` - 取得我的分數記錄

## Recommanded VSCode/Cursor Extension
- Must-have
	- [Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
	- [Pylance](https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-pylance)
	- [Python Debugger](https://marketplace.visualstudio.com/items?itemName=ms-python.debugpy)
	- [Mypy Type Checker](https://marketplace.visualstudio.com/items?itemName=ms-python.mypy-type-checker)
	- [Ruff](https://marketplace.cursorapi.com/items?itemName=charliermarsh.ruff)
	- [Jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter)
- Nice to have:
	- [autoDocstring](https://marketplace.visualstudio.com/items?itemName=njpwerner.autodocstring)
	- [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens)
	- [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)
	- [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph)