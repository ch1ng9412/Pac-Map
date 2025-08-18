/**
 * 手機觸控控制系統
 * 提供虛擬方向鍵、滑動手勢等手機專用控制方式
 */

import { gameState } from './gameState.js';
import { tryStartMovementInDirection, pauseGame, resumeGame } from './game.js';

// 設備檢測
let isMobileDevice = false;
let isTabletDevice = false;
let isTouchDevice = false;

// 觸控狀態
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isSwipeGesture = false;
let lastTouchDirection = null;

// 虛擬按鈕狀態
let virtualButtonsVisible = false;
let dpadContainer = null;

/**
 * 檢測設備類型
 */
export function detectDevice() {
    const userAgent = navigator.userAgent.toLowerCase();
    const touchPoints = navigator.maxTouchPoints || 0;
    
    // 檢測是否為觸控設備
    isTouchDevice = (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0
    );
    
    // 檢測手機
    isMobileDevice = /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    // 檢測平板
    isTabletDevice = (
        /ipad/i.test(userAgent) ||
        (/android/i.test(userAgent) && !/mobile/i.test(userAgent)) ||
        (touchPoints > 1 && window.innerWidth > 768)
    );
    
    console.log('🔍 設備檢測結果:', {
        isMobileDevice,
        isTabletDevice,
        isTouchDevice,
        touchPoints,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        userAgent: userAgent.substring(0, 50) + '...'
    });
    
    return {
        isMobileDevice,
        isTabletDevice,
        isTouchDevice,
        needsMobileControls: isMobileDevice || (isTouchDevice && window.innerWidth <= 768)
    };
}

/**
 * 初始化手機控制系統
 */
export function initMobileControls() {
    console.log('📱 初始化手機控制系統...');
    
    const deviceInfo = detectDevice();
    
    if (deviceInfo.needsMobileControls) {
        console.log('✅ 檢測到手機設備，啟用觸控控制');
        enableMobileControls();
    } else {
        console.log('💻 檢測到桌面設備，使用鍵盤控制');
        disableMobileControls();
    }
    
    // 監聽螢幕方向變化
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
    
    return deviceInfo;
}

/**
 * 啟用手機控制
 */
function enableMobileControls() {
    // 只設置觸控手勢和 UI，不立即顯示虛擬方向鍵
    setupTouchGestures();
    setupMobileUI();
    virtualButtonsVisible = true;
}

/**
 * 停用手機控制
 */
function disableMobileControls() {
    removeVirtualDPad();
    removeTouchGestures();
    virtualButtonsVisible = false;
}

/**
 * 創建虛擬方向鍵
 */
function createVirtualDPad() {
    // 移除現有的方向鍵
    removeVirtualDPad();
    
    // 創建方向鍵容器
    dpadContainer = document.createElement('div');
    dpadContainer.id = 'mobile-dpad';
    dpadContainer.className = 'mobile-dpad';
    
    // 創建方向按鈕
    const directions = [
        { key: 'KeyW', label: '↑', class: 'dpad-up' },
        { key: 'KeyA', label: '←', class: 'dpad-left' },
        { key: 'KeyD', label: '→', class: 'dpad-right' },
        { key: 'KeyS', label: '↓', class: 'dpad-down' }
    ];
    
    directions.forEach(dir => {
        const button = document.createElement('button');
        button.className = `dpad-button ${dir.class}`;
        button.textContent = dir.label;
        button.dataset.direction = dir.key;
        
        // 觸控事件
        button.addEventListener('touchstart', handleDPadTouchStart, { passive: false });
        button.addEventListener('touchend', handleDPadTouchEnd, { passive: false });
        button.addEventListener('touchcancel', handleDPadTouchEnd, { passive: false });
        
        // 滑鼠事件（用於測試）
        button.addEventListener('mousedown', handleDPadMouseDown);
        button.addEventListener('mouseup', handleDPadMouseUp);
        button.addEventListener('mouseleave', handleDPadMouseUp);
        
        dpadContainer.appendChild(button);
    });
    
    // 添加暫停按鈕
    const pauseButton = document.createElement('button');
    pauseButton.className = 'dpad-button dpad-center';
    pauseButton.textContent = '⏸';
    pauseButton.addEventListener('touchstart', handlePauseTouch, { passive: false });
    pauseButton.addEventListener('click', handlePauseClick);
    dpadContainer.appendChild(pauseButton);
    
    // 添加到頁面
    document.body.appendChild(dpadContainer);
    
    console.log('✅ 虛擬方向鍵已創建');
}

/**
 * 移除虛擬方向鍵
 */
function removeVirtualDPad() {
    if (dpadContainer) {
        dpadContainer.remove();
        dpadContainer = null;
    }
}

/**
 * 處理方向鍵觸控開始
 */
function handleDPadTouchStart(event) {
    event.preventDefault();
    const button = event.target;
    const direction = button.dataset.direction;

    button.classList.add('active', 'pressed');

    if (direction && !gameState.isGameOver && gameState.canMove && !gameState.isPaused) {
        // 設定持續移動方向（與鍵盤控制一致）
        gameState.pacmanMovement.lastIntendedDirectionKey = direction;

        // 如果不在移動中，立即開始移動
        if (!gameState.pacmanMovement.isMoving) {
            tryStartMovementInDirection(direction);
        }

        // 觸覺回饋
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        // 更新觸控指示器
        updateTouchIndicator(`移動: ${getDirectionName(direction)}`);
    }
}

/**
 * 處理方向鍵觸控結束
 */
function handleDPadTouchEnd(event) {
    event.preventDefault();
    const button = event.target;
    button.classList.remove('active');

    // 移除按壓動畫類別
    setTimeout(() => {
        button.classList.remove('pressed');
    }, 100);

    // 重置觸控指示器
    setTimeout(() => {
        updateControlModeIndicator();
    }, 500);
}

/**
 * 處理方向鍵滑鼠按下（用於測試）
 */
function handleDPadMouseDown(event) {
    const button = event.target;
    const direction = button.dataset.direction;
    
    button.classList.add('active');
    
    if (direction && !gameState.isGameOver && gameState.canMove && !gameState.isPaused) {
        // 設定持續移動方向（與鍵盤控制一致）
        gameState.pacmanMovement.lastIntendedDirectionKey = direction;

        // 如果不在移動中，立即開始移動
        if (!gameState.pacmanMovement.isMoving) {
            tryStartMovementInDirection(direction);
        }
    }
}

/**
 * 處理方向鍵滑鼠釋放
 */
function handleDPadMouseUp(event) {
    const button = event.target;
    button.classList.remove('active');
}

/**
 * 處理暫停按鈕觸控
 */
function handlePauseTouch(event) {
    event.preventDefault();
    handlePauseClick();
}

/**
 * 處理暫停按鈕點擊
 */
function handlePauseClick() {
    if (gameState.isPaused) {
        resumeGame();
    } else {
        pauseGame();
    }
    
    // 觸覺回饋
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
}

/**
 * 設置觸控手勢
 */
function setupTouchGestures() {
    const gameArea = document.getElementById('map') || document.body;
    
    gameArea.addEventListener('touchstart', handleTouchStart, { passive: false });
    gameArea.addEventListener('touchmove', handleTouchMove, { passive: false });
    gameArea.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    console.log('✅ 觸控手勢已設置');
}

/**
 * 移除觸控手勢
 */
function removeTouchGestures() {
    const gameArea = document.getElementById('map') || document.body;
    
    gameArea.removeEventListener('touchstart', handleTouchStart);
    gameArea.removeEventListener('touchmove', handleTouchMove);
    gameArea.removeEventListener('touchend', handleTouchEnd);
}

/**
 * 處理觸控開始
 */
function handleTouchStart(event) {
    // 如果觸控在虛擬按鈕上，不處理手勢
    if (event.target.closest('.mobile-dpad')) {
        return;
    }
    
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isSwipeGesture = false;
    lastTouchDirection = null;
}

/**
 * 處理觸控移動
 */
function handleTouchMove(event) {
    if (!touchStartX || !touchStartY) return;
    
    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // 如果移動距離超過閾值，認為是滑動手勢
    if (distance > 30) {
        isSwipeGesture = true;
        
        // 計算滑動方向
        const direction = getSwipeDirection(deltaX, deltaY);
        
        // 避免重複觸發相同方向
        if (direction !== lastTouchDirection) {
            lastTouchDirection = direction;
            
            if (direction && !gameState.isGameOver && gameState.canMove && !gameState.isPaused) {
                // 設定持續移動方向（與鍵盤控制一致）
                gameState.pacmanMovement.lastIntendedDirectionKey = direction;

                // 如果不在移動中，立即開始移動
                if (!gameState.pacmanMovement.isMoving) {
                    tryStartMovementInDirection(direction);
                }

                // 觸覺回饋
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
            }
        }
    }
}

/**
 * 處理觸控結束
 */
function handleTouchEnd(event) {
    const touchDuration = Date.now() - touchStartTime;
    
    // 如果是短時間點擊且不是滑動，可以用作暫停
    if (!isSwipeGesture && touchDuration < 300) {
        // 短點擊暫停功能（可選）
        // handlePauseClick();
    }
    
    // 重置觸控狀態
    touchStartX = 0;
    touchStartY = 0;
    touchStartTime = 0;
    isSwipeGesture = false;
    lastTouchDirection = null;
}

/**
 * 計算滑動方向
 */
function getSwipeDirection(deltaX, deltaY) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    // 判斷主要方向
    if (absX > absY) {
        // 水平滑動
        return deltaX > 0 ? 'KeyD' : 'KeyA'; // 右或左
    } else {
        // 垂直滑動
        return deltaY > 0 ? 'KeyS' : 'KeyW'; // 下或上
    }
}

/**
 * 設置手機 UI
 */
function setupMobileUI() {
    // 添加手機專用的 CSS 類
    document.body.classList.add('mobile-device');
    
    // 隱藏桌面專用的提示
    const keyboardHints = document.querySelectorAll('.keyboard-hint, .desktop-only');
    keyboardHints.forEach(hint => {
        hint.style.display = 'none';
    });
    
    console.log('✅ 手機 UI 已設置');
}

/**
 * 處理螢幕方向變化
 */
function handleOrientationChange() {
    setTimeout(() => {
        console.log('📱 螢幕方向已變化');
        // 重新檢測設備並調整控制
        const deviceInfo = detectDevice();
        if (deviceInfo.needsMobileControls !== virtualButtonsVisible) {
            if (deviceInfo.needsMobileControls) {
                enableMobileControls();
            } else {
                disableMobileControls();
            }
        }
    }, 100);
}

/**
 * 處理視窗大小變化
 */
function handleResize() {
    handleOrientationChange();
}

/**
 * 切換控制模式
 */
export function toggleControlMode() {
    if (virtualButtonsVisible) {
        disableMobileControls();
        console.log('🖱️ 已切換到桌面控制模式');
    } else {
        enableMobileControls();
        console.log('📱 已切換到手機控制模式');
    }

    // 更新觸控指示器顯示
    updateControlModeIndicator();
}

/**
 * 顯示虛擬方向鍵（遊戲開始時調用）
 */
export function showVirtualDPad() {
    if (virtualButtonsVisible && !dpadContainer) {
        createVirtualDPad();
        console.log('✅ 虛擬方向鍵已顯示');
    }
}

/**
 * 隱藏虛擬方向鍵（遊戲結束時調用）
 */
export function hideVirtualDPad() {
    removeVirtualDPad();
    console.log('✅ 虛擬方向鍵已隱藏');
}

/**
 * 獲取當前控制模式
 */
export function getCurrentControlMode() {
    return {
        isMobileDevice,
        isTabletDevice,
        isTouchDevice,
        virtualButtonsVisible,
        controlMode: virtualButtonsVisible ? 'mobile' : 'desktop'
    };
}

/**
 * 獲取方向名稱
 */
function getDirectionName(direction) {
    const names = {
        'KeyW': '上',
        'KeyS': '下',
        'KeyA': '左',
        'KeyD': '右'
    };
    return names[direction] || direction;
}

/**
 * 更新觸控指示器
 */
function updateTouchIndicator(message) {
    const indicator = document.getElementById('touchIndicator');
    if (indicator) {
        indicator.textContent = message;

        // 添加閃爍效果
        indicator.style.opacity = '0.5';
        setTimeout(() => {
            indicator.style.opacity = '1';
        }, 100);
    }
}

/**
 * 顯示觸控指示器
 */
export function showTouchIndicator() {
    const indicator = document.getElementById('touchIndicator');
    if (indicator) {
        if (virtualButtonsVisible) {
            indicator.textContent = '觸控模式';
            indicator.style.display = 'block';
        } else {
            indicator.textContent = '鍵盤模式';
            indicator.style.display = 'block';
        }
    }
}

/**
 * 隱藏觸控指示器
 */
export function hideTouchIndicator() {
    const indicator = document.getElementById('touchIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

/**
 * 更新控制模式指示器
 */
export function updateControlModeIndicator() {
    const indicator = document.getElementById('touchIndicator');
    if (indicator && indicator.style.display !== 'none') {
        // 只有在指示器可見時才更新文字
        if (virtualButtonsVisible) {
            indicator.textContent = '觸控模式';
        } else {
            indicator.textContent = '鍵盤模式';
        }
    }
}



/**
 * 檢查是否支援觸覺回饋
 */
function checkVibrationSupport() {
    const hasVibration = 'vibrate' in navigator;
    console.log('📳 觸覺回饋支援:', hasVibration ? '是' : '否');
    return hasVibration;
}

/**
 * 觸覺回饋
 */
function vibrate(pattern = 50) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// 暴露到全域範圍以便除錯
if (typeof window !== 'undefined') {
    window.mobileControls = {
        detectDevice,
        initMobileControls,
        toggleControlMode,
        getCurrentControlMode,
        showVirtualDPad,
        hideVirtualDPad,
        updateTouchIndicator,
        showTouchIndicator,
        hideTouchIndicator,
        updateControlModeIndicator,
        checkVibrationSupport,
        vibrate
    };
}
