import { gameState, gameLoopRequestId } from './gameState.js';
import { setupSounds, soundsReady } from './audio.js';
import { updateLeaderboardUI } from './ui.js';
import { initGame, pauseGame, resumeGame, tryStartMovementInDirection, restartGame, backToMenu, useBackpackItem} from './game.js';
import { initStartScreenBackground } from './backgroundAnimation.js';
import { toggleDevConsole, setupDevConsoleListeners } from './devConsole.js';
import { initAuth } from './auth.js';
import { initMobileControls, detectDevice, toggleControlMode, showVirtualDPad, hideVirtualDPad, showTouchIndicator, hideTouchIndicator, updateControlModeIndicator } from './mobileControls.js';
import { initSettings, showSettingsModal } from './settings.js';
import { checkBackendConnection, logConfigInfo } from './config.js';

/**
 * 清除測試數據
 */
function clearTestData() {
    // 清除可能的測試用戶本地存儲
    const keysToCheck = [
        'pac_map_local_scores',
        'pac_map_user',
        'pac_map_token',
        'pac_map_test_scores'
    ];

    keysToCheck.forEach(key => {
        const data = localStorage.getItem(key);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                // 檢查是否包含測試數據
                if (typeof parsed === 'object' && (
                    JSON.stringify(parsed).includes('測試用戶') ||
                    JSON.stringify(parsed).includes('test@example.com') ||
                    JSON.stringify(parsed).includes('test_user')
                )) {
                    localStorage.removeItem(key);
                    console.log(`🧹 已清除測試數據: ${key}`);
                }
            } catch (e) {
                // 如果不是 JSON，檢查字串內容
                if (data.includes('測試用戶') || data.includes('test@example.com')) {
                    localStorage.removeItem(key);
                    console.log(`🧹 已清除測試數據: ${key}`);
                }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM 載入完成，開始初始化...');

    // --- Initial Setup ---
    setupSounds();

    // 清除可能的測試數據
    clearTestData();

    updateLeaderboardUI();

    // 檢查後端連接狀態
    console.log('🔗 檢查後端連接狀態...');
    checkBackendConnection().then(isConnected => {
        if (isConnected) {
            console.log('✅ 後端連接正常');
        } else {
            console.warn('⚠️ 後端連接失敗，某些功能可能無法使用');
        }
    }).catch(error => {
        console.error('❌ 後端連接檢查失敗:', error);
    });

    // 初始化設定系統
    console.log('⚙️ 初始化設定系統...');
    initSettings();

    // 初始化手機控制系統
    console.log('📱 初始化手機控制系統...');
    const deviceInfo = initMobileControls();
    console.log('📱 設備資訊:', deviceInfo);

    // 在主畫面顯示觸控指示器
    showTouchIndicator();

    // 設定控制模式按鈕的初始文字並同步設定
    setTimeout(() => {
        const currentMode = window.mobileControls?.getCurrentControlMode();
        if (currentMode) {
            const buttonText = currentMode.controlMode === 'mobile' ? '⌨️ 切換到桌面模式' : '📱 切換到手機模式';
            document.getElementById('toggleControlBtn').textContent = buttonText;

            // 同步設定中的虛擬鍵盤選項
            if (typeof window.gameSettings?.setSetting === 'function') {
                const showVirtualKeyboard = currentMode.controlMode === 'mobile';
                window.gameSettings.setSetting('showVirtualKeyboard', showVirtualKeyboard);
            }
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

    // 初始化設定系統
    console.log('⚙️ 初始化設定系統...');
    initSettings();

    // 初始化認證系統
    console.log('🔐 初始化認證系統...');
    initAuth();

    // // 等待 Google Sign-In SDK 載入後再次初始化
    // setTimeout(() => {
    //     console.log('🔄 延遲重新初始化認證系統...');
    //     initAuth();

    //     // 檢查 handleGoogleLogin 是否可用
    //     if (typeof window.handleGoogleLogin === 'function') {
    //         console.log('✅ handleGoogleLogin 函數可用');
    //     } else {
    //         console.error('❌ handleGoogleLogin 函數不可用');
    //     }
    // }, 1000);
    
    // Set initial screen states
    document.getElementById('startScreen').style.display = 'flex';
    document.getElementById('mapSelectionScreen').style.display = 'none';
    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('gameUI').style.display = 'none';
    document.getElementById('instructionsContent').style.display = 'none';
    document.getElementById('leaderboardContent').style.display = 'none';

    // 初始化背景動畫
    console.log('🎬 正在初始化背景動畫...');
    initStartScreenBackground().catch(error => {
        console.error('❌ 背景動畫初始化失敗:', error);
    });
    setupDevConsoleListeners();

    // --- Event Listeners ---

    // Start Screen Buttons
    console.log('🔘 註冊開始遊戲按鈕事件監聽器...');
    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            console.log('🎮 開始遊戲按鈕被點擊');
            document.getElementById('startScreen').style.display = 'none';
            document.getElementById('instructionsContent').style.display = 'none';
            document.getElementById('leaderboardContent').style.display = 'none';
            document.getElementById('mapSelectionScreen').style.display = 'flex';
            // 進入地圖選擇畫面時隱藏觸控指示器
            hideTouchIndicator();
        });
        console.log('✅ 開始遊戲按鈕事件監聽器已註冊');
    } else {
        console.error('❌ 找不到開始遊戲按鈕元素');
    }

    console.log('🔘 註冊說明按鈕事件監聽器...');
    const instructionsBtn = document.getElementById('instructionsBtn');
    if (instructionsBtn) {
        instructionsBtn.addEventListener('click', () => {
            console.log('📖 說明按鈕被點擊');
            const instructionsContent = document.getElementById('instructionsContent');
            const isVisible = instructionsContent.style.display === 'block';
            instructionsContent.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) document.getElementById('leaderboardContent').style.display = 'none';
        });
        console.log('✅ 說明按鈕事件監聽器已註冊');
    } else {
        console.error('❌ 找不到說明按鈕元素');
    }

    console.log('🔘 註冊排行榜按鈕事件監聽器...');
    const leaderboardBtn = document.getElementById('leaderboardBtn');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            console.log('🏆 排行榜按鈕被點擊');
            const leaderboardContent = document.getElementById('leaderboardContent');
            const instructionsContent = document.getElementById('instructionsContent');
            const isVisible = leaderboardContent.style.display === 'block';

            if (isVisible) {
                // 如果排行榜已顯示，則隱藏
                leaderboardContent.style.display = 'none';
            } else {
                // 如果排行榜未顯示，則顯示並隱藏說明
                leaderboardContent.style.display = 'block';
                instructionsContent.style.display = 'none';

                // 更新排行榜數據
                updateLeaderboardUI();
            }
        });
        console.log('✅ 排行榜按鈕事件監聽器已註冊');
    } else {
        console.error('❌ 找不到排行榜按鈕元素');
    }

    // 控制模式切換按鈕
    document.getElementById('toggleControlBtn').addEventListener('click', () => {
        toggleControlMode();
        const currentMode = window.mobileControls?.getCurrentControlMode();
        if (currentMode) {
            const modeText = currentMode.controlMode === 'mobile' ? '手機' : '桌面';
            const buttonText = currentMode.controlMode === 'mobile' ? '⌨️ 切換到桌面模式' : '📱 切換到手機模式';
            document.getElementById('toggleControlBtn').textContent = buttonText;
            console.log(`🔄 已切換到${modeText}控制模式`);

            // 更新觸控指示器
            updateControlModeIndicator();

            // 同步更新設定中的虛擬鍵盤選項
            if (typeof window.gameSettings?.setSetting === 'function') {
                const showVirtualKeyboard = currentMode.controlMode === 'mobile';
                window.gameSettings.setSetting('showVirtualKeyboard', showVirtualKeyboard);
            }
        }
    });

    // 設定按鈕
    document.getElementById('settingsBtn').addEventListener('click', () => {
        showSettingsModal();
    });

    // 點擊外部區域關閉排行榜
    document.addEventListener('click', (event) => {
        const leaderboardContent = document.getElementById('leaderboardContent');
        const leaderboardBtn = document.getElementById('leaderboardBtn');

        // 如果排行榜顯示中，且點擊的不是排行榜內容或按鈕
        if (leaderboardContent.style.display === 'block' &&
            !leaderboardContent.contains(event.target) &&
            !leaderboardBtn.contains(event.target)) {
            leaderboardContent.style.display = 'none';
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
            initGame().catch(error => {
                console.error('遊戲初始化失敗:', error);
            });
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
    document.getElementById('pauseSettingsBtn').addEventListener('click', () => {
        showSettingsModal();
    });
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

        if (e.key === 'Escape') {
            e.preventDefault();
            // ESC 鍵暫停/恢復遊戲（只在遊戲進行中有效）
            if (!gameState.isGameOver && !gameState.isLosingLife && gameState.pacman) {
                if (gameState.isPaused) resumeGame();
                else pauseGame();
            }
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