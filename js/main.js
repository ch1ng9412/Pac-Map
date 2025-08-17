import { gameState, gameLoopRequestId } from './gameState.js';
import { setupSounds, soundsReady } from './audio.js';
import { updateLeaderboardUI } from './ui.js';
import { initGame, pauseGame, resumeGame, tryStartMovementInDirection, restartGame, backToMenu, useBackpackItem} from './game.js';
import { initStartScreenBackground } from './backgroundAnimation.js';
import { toggleDevConsole, setupDevConsoleListeners } from './devConsole.js';
import { initAuth } from './auth.js';
import { initMobileControls, detectDevice, toggleControlMode } from './mobileControls.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM 載入完成，開始初始化...');

    // --- Initial Setup ---
    setupSounds();
    updateLeaderboardUI();

    // 初始化手機控制系統
    console.log('📱 初始化手機控制系統...');
    const deviceInfo = initMobileControls();
    console.log('📱 設備資訊:', deviceInfo);

    // 設定控制模式按鈕的初始文字
    setTimeout(() => {
        const currentMode = window.mobileControls?.getCurrentControlMode();
        if (currentMode) {
            const buttonText = currentMode.controlMode === 'mobile' ? '🖱️ 切換到桌面模式' : '📱 切換到手機模式';
            document.getElementById('toggleControlBtn').textContent = buttonText;
        }
    }, 100);

    // 添加用戶互動來啟動音頻上下文
    document.addEventListener('click', async () => {
        if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
            try {
                await Tone.start();
                console.log('🔊 AudioContext 已通過用戶互動啟動');
            } catch (error) {
                console.warn('AudioContext 啟動失敗:', error);
            }
        }
    }, { once: true });

    // 初始化認證系統
    console.log('🔐 初始化認證系統...');
    initAuth();

    // 等待 Google Sign-In SDK 載入後再次初始化
    setTimeout(() => {
        console.log('🔄 延遲重新初始化認證系統...');
        initAuth();

        // 檢查 handleGoogleLogin 是否可用
        if (typeof window.handleGoogleLogin === 'function') {
            console.log('✅ handleGoogleLogin 函數可用');
        } else {
            console.error('❌ handleGoogleLogin 函數不可用');
        }
    }, 1000);
    
    // Set initial screen states
    document.getElementById('startScreen').style.display = 'flex';
    document.getElementById('mapSelectionScreen').style.display = 'none';
    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('gameUI').style.display = 'none';
    document.getElementById('instructionsContent').style.display = 'none';
    document.getElementById('leaderboardContent').style.display = 'none';

    initStartScreenBackground(); 
    setupDevConsoleListeners();

    // --- Event Listeners ---

    // Start Screen Buttons
    document.getElementById('startGameBtn').addEventListener('click', () => {
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('instructionsContent').style.display = 'none';
        document.getElementById('leaderboardContent').style.display = 'none';
        document.getElementById('mapSelectionScreen').style.display = 'flex';
    });

    document.getElementById('instructionsBtn').addEventListener('click', () => {
        const instructionsContent = document.getElementById('instructionsContent');
        const isVisible = instructionsContent.style.display === 'block';
        instructionsContent.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) document.getElementById('leaderboardContent').style.display = 'none';
    });

    document.getElementById('leaderboardBtn').addEventListener('click', () => {
        const leaderboardContent = document.getElementById('leaderboardContent');
        const isVisible = leaderboardContent.style.display === 'block';
        leaderboardContent.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) document.getElementById('instructionsContent').style.display = 'none';
    });

    // 控制模式切換按鈕
    document.getElementById('toggleControlBtn').addEventListener('click', () => {
        toggleControlMode();
        const currentMode = window.mobileControls?.getCurrentControlMode();
        if (currentMode) {
            const modeText = currentMode.controlMode === 'mobile' ? '手機' : '桌面';
            const buttonText = currentMode.controlMode === 'mobile' ? '🖱️ 切換到桌面模式' : '📱 切換到手機模式';
            document.getElementById('toggleControlBtn').textContent = buttonText;
            console.log(`🔄 已切換到${modeText}控制模式`);
        }
    });

    // Map Selection Screen Buttons
    document.querySelectorAll('#mapSelectionScreen .map-button').forEach(button => {
        button.addEventListener('click', async (e) => {
            document.querySelectorAll('#mapSelectionScreen .map-button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            gameState.currentMapIndex = parseInt(e.target.dataset.mapIndex); 
            
            document.getElementById('mapSelectionScreen').style.display = 'none';
            
            if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
                await Tone.start(); 
                console.log("音訊內容已由使用者互動啟動 (地圖選擇)");
            }
            if (!soundsReady) { 
                setupSounds();
            }
            initGame(); 
        });
    });
    
    document.getElementById('backToStartScreenBtn').addEventListener('click', () => {
        document.getElementById('mapSelectionScreen').style.display = 'none';
        document.getElementById('instructionsContent').style.display = 'none'; 
        document.getElementById('leaderboardContent').style.display = 'none';
        document.getElementById('startScreen').style.display = 'flex';
    });

    // Pause Screen Buttons
    document.getElementById('resumeGameBtn').addEventListener('click', resumeGame);
    document.getElementById('backToMenuBtnPause').addEventListener('click', backToMenu);

    // Game Over Screen Buttons
    document.getElementById('restartGameBtn').addEventListener('click', restartGame);
    document.getElementById('backToMenuBtnGameOver').addEventListener('click', backToMenu);

    // Keyboard controls
    document.addEventListener('keydown', (e) => { 
        if (e.key === '`') { 
            e.preventDefault();
            toggleDevConsole();
            return;
        }

        if (gameState.isDevConsoleOpen || gameState.autoPilotMode || gameState.cleverMode) return; 

        if (gameState.isGameOver || !gameState.canMove || gameState.isLosingLife) return; 
        
        const key = e.code;

        if (key === 'Space') { 
            e.preventDefault(); 
            if (gameState.isPaused) resumeGame(); 
            else pauseGame(); 
            return; 
        } 

        if (key === 'Digit1' || key === 'Digit2' || key === 'Digit3') {
            // Digit1 对应背包索引 0
            const slotIndex = parseInt(key.slice(-1)) - 1;
            useBackpackItem(slotIndex);
        }

        if (gameState.isPaused || !gameState.pacman) return; 
        
        const validMoveKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']; 
        if (validMoveKeys.includes(key)) {
            // Map arrow keys to WASD for logic consistency
            const keyMap = {
                'ArrowUp': 'KeyW',
                'ArrowDown': 'KeyS',
                'ArrowLeft': 'KeyA',
                'ArrowRight': 'KeyD'
            };
            gameState.pacmanMovement.lastIntendedDirectionKey = keyMap[key] || key;
        } else {
            return; 
        }

        if (!gameState.pacmanMovement.isMoving) {
            tryStartMovementInDirection(gameState.pacmanMovement.lastIntendedDirectionKey); 
        }
    });

    console.log('OpenStreetMap 小精靈遊戲已載入完成！');
});

let resizeTimeout;
window.addEventListener('resize', () => {
    // 使用 debounce 技术，避免在高频 resize 事件中频繁执行
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // 如果游戏正在进行中，就刷新主地图和子地图的尺寸
        if (gameState.map) {
            gameState.map.invalidateSize();
        }
        if (gameState.minimap.map) {
            gameState.minimap.map.invalidateSize();
        }
    }, 250); // 延迟 250ms 执行
});