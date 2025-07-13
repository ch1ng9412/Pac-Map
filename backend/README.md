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
5. Run Code:
   ```bash
   uv run src/main.py      # 使用虛擬環境執行 src/main.py
   uv run jupyter lab      # 使用虛擬環境執行 Jupyterlab
   ```

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