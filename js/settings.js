/**
 * 遊戲設定系統
 * 管理 FPS 顯示、音量等設定
 */

// 預設設定
const DEFAULT_SETTINGS = {
    showFPS: true,
    bgmVolume: 0.7,
    sfxVolume: 0.7,
    soundEnabled: true,
    showVirtualKeyboard: false
};

// 當前設定
let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * 載入設定
 */
export function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('pacMapSettings');
        if (savedSettings) {
            currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
        }
        console.log('✅ 設定已載入:', currentSettings);
    } catch (error) {
        console.warn('⚠️ 載入設定失敗，使用預設設定:', error);
        currentSettings = { ...DEFAULT_SETTINGS };
    }
    
    // 應用設定
    applySettings();
}

/**
 * 儲存設定
 */
export function saveSettings() {
    try {
        localStorage.setItem('pacMapSettings', JSON.stringify(currentSettings));
        console.log('✅ 設定已儲存:', currentSettings);
    } catch (error) {
        console.error('❌ 儲存設定失敗:', error);
    }
}

/**
 * 獲取設定值
 */
export function getSetting(key) {
    return currentSettings[key];
}

/**
 * 設定值
 */
export function setSetting(key, value) {
    currentSettings[key] = value;

    // 根據設定類型應用相應的設定
    switch(key) {
        case 'showFPS':
            applyFPSDisplay();
            break;
        case 'bgmVolume':
        case 'sfxVolume':
        case 'soundEnabled':
            applyVolumeSettings();
            break;
        case 'showVirtualKeyboard':
            applyVirtualKeyboardSettings();
            break;
        default:
            // 對於未知的設定，應用所有設定
            applySettings();
            break;
    }

    saveSettings();
}

/**
 * 應用設定
 */
function applySettings() {
    // 應用 FPS 顯示設定
    applyFPSDisplay();

    // 應用音量設定
    applyVolumeSettings();

    // 應用虛擬鍵盤設定
    applyVirtualKeyboardSettings();
}

/**
 * 應用 FPS 顯示設定
 */
function applyFPSDisplay() {
    const fpsDisplay = document.getElementById('fpsDisplay');
    if (fpsDisplay) {
        fpsDisplay.style.display = currentSettings.showFPS ? 'block' : 'none';
    }
}

/**
 * 應用音量設定
 */
function applyVolumeSettings() {
    // 設定 Tone.js 音量（音效）
    if (typeof Tone !== 'undefined' && Tone.Destination) {
        Tone.Destination.volume.value = currentSettings.soundEnabled ?
            20 * Math.log10(currentSettings.sfxVolume) : -Infinity;
    }

    // 設定 HTML5 音頻元素音量（舊的 BGM 系統）
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
        // 檢查是否為 BGM 且遊戲處於暫停狀態
        if (audio.id === 'bgm' && typeof gameState !== 'undefined' && gameState.isPaused) {
            // 如果是暫停狀態，保持暫停音量不變
            return;
        }
        audio.volume = currentSettings.soundEnabled ? currentSettings.bgmVolume : 0;
    });

    // 設定新的 BGM 系統音量
    if (typeof window.setBGMVolume === 'function') {
        const volume = currentSettings.soundEnabled ? currentSettings.bgmVolume : 0;
        window.setBGMVolume(volume);
    }
}

/**
 * 同步控制模式與設定狀態
 */
function syncControlModeWithSettings() {
    if (typeof window.mobileControls?.getCurrentControlMode === 'function') {
        const currentMode = window.mobileControls.getCurrentControlMode();
        const isMobileMode = currentMode.controlMode === 'mobile';

        // 更新設定以匹配當前控制模式
        currentSettings.showVirtualKeyboard = isMobileMode;
        saveSettings();
    }
}

/**
 * 應用虛擬鍵盤設定
 */
function applyVirtualKeyboardSettings() {
    // 虛擬鍵盤的顯示/隱藏只在遊戲中生效
    // 這裡只需要確保設定已保存，實際的顯示邏輯在遊戲開始時處理
    console.log('🎮 虛擬鍵盤設定已更新:', currentSettings.showVirtualKeyboard ? '顯示' : '隱藏');
}

/**
 * 顯示設定介面
 */
export function showSettingsModal() {
    // 檢查是否已存在設定介面
    let settingsModal = document.getElementById('settingsModal');

    if (!settingsModal) {
        createSettingsModal();
        settingsModal = document.getElementById('settingsModal');
    }

    // 更新設定介面的值（不改變設定，只更新 UI）
    updateSettingsUI();

    // 顯示設定介面
    settingsModal.style.display = 'flex';

    // 在設定畫面顯示觸控指示器
    if (typeof window.mobileControls?.showTouchIndicator === 'function') {
        window.mobileControls.showTouchIndicator();
    }

    console.log('⚙️ 設定介面已顯示');
}

/**
 * 隱藏設定介面
 */
export function hideSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }

    // 檢查當前是否在主畫面，如果是則顯示觸控指示器，否則隱藏
    const startScreen = document.getElementById('startScreen');
    if (startScreen && startScreen.style.display !== 'none') {
        // 在主畫面，顯示觸控指示器
        if (typeof window.mobileControls?.showTouchIndicator === 'function') {
            window.mobileControls.showTouchIndicator();
        }
    } else {
        // 不在主畫面，隱藏觸控指示器
        if (typeof window.mobileControls?.hideTouchIndicator === 'function') {
            window.mobileControls.hideTouchIndicator();
        }
    }

    console.log('⚙️ 設定介面已隱藏');
}

/**
 * 創建設定介面
 */
function createSettingsModal() {
    const modalHTML = `
        <div id="settingsModal" class="settings-modal">
            <div class="settings-content">
                <div class="settings-header">
                    <h2>⚙️ 遊戲設定</h2>
                    <button class="close-btn" onclick="window.gameSettings.hideSettingsModal()">✕</button>
                </div>
                
                <div class="settings-body">
                    <!-- FPS 顯示設定 -->
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" id="showFPSCheckbox" onchange="window.gameSettings.toggleFPS()">
                            <span class="checkmark"></span>
                            顯示 FPS
                        </label>
                        <div class="setting-description">在遊戲畫面顯示每秒幀數</div>
                    </div>

                    <!-- 虛擬鍵盤設定 -->
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" id="showVirtualKeyboardCheckbox" onchange="window.gameSettings.toggleVirtualKeyboard()">
                            <span class="checkmark"></span>
                            顯示虛擬鍵盤
                        </label>
                        <div class="setting-description">在遊戲中顯示觸控方向鍵</div>
                    </div>
                    
                    <!-- 音效開關 -->
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" id="soundEnabledCheckbox" onchange="window.gameSettings.toggleSound()">
                            <span class="checkmark"></span>
                            啟用音效
                        </label>
                        <div class="setting-description">開啟或關閉遊戲音效</div>
                    </div>
                    
                    <!-- BGM 音量設定 -->
                    <div class="setting-item">
                        <label class="setting-label">背景音樂音量</label>
                        <div class="volume-control">
                            <input type="range" id="bgmVolumeSlider" min="0" max="1" step="0.1"
                                   onchange="window.gameSettings.setBGMVolume(this.value)">
                            <span id="bgmVolumeValue">70%</span>
                        </div>
                        <div class="setting-description">調整背景音樂音量</div>
                    </div>

                    <!-- 音效音量設定 -->
                    <div class="setting-item">
                        <label class="setting-label">音效音量</label>
                        <div class="volume-control">
                            <input type="range" id="sfxVolumeSlider" min="0" max="1" step="0.1"
                                   onchange="window.gameSettings.setSFXVolume(this.value)">
                            <span id="sfxVolumeValue">70%</span>
                        </div>
                        <div class="setting-description">調整遊戲音效音量</div>
                    </div>
                </div>
                
                <div class="settings-footer">
                    <button class="pacman-pixel-button" onclick="window.gameSettings.resetSettings()">
                        重置設定
                    </button>
                    <button class="pacman-pixel-button" onclick="window.gameSettings.hideSettingsModal()">
                        確定
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * 更新設定介面的值
 */
function updateSettingsUI() {
    // 更新 FPS 顯示勾選框
    const showFPSCheckbox = document.getElementById('showFPSCheckbox');
    if (showFPSCheckbox) {
        showFPSCheckbox.checked = currentSettings.showFPS;
    }

    // 更新虛擬鍵盤顯示勾選框（根據當前控制模式）
    const showVirtualKeyboardCheckbox = document.getElementById('showVirtualKeyboardCheckbox');
    if (showVirtualKeyboardCheckbox) {
        // 根據當前控制模式來設定勾選狀態
        if (typeof window.mobileControls?.getCurrentControlMode === 'function') {
            const currentMode = window.mobileControls.getCurrentControlMode();
            showVirtualKeyboardCheckbox.checked = currentMode.controlMode === 'mobile';
        } else {
            showVirtualKeyboardCheckbox.checked = currentSettings.showVirtualKeyboard;
        }
    }
    
    // 更新音效開關勾選框
    const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox');
    if (soundEnabledCheckbox) {
        soundEnabledCheckbox.checked = currentSettings.soundEnabled;
    }
    
    // 更新 BGM 音量滑桿
    const bgmVolumeSlider = document.getElementById('bgmVolumeSlider');
    const bgmVolumeValue = document.getElementById('bgmVolumeValue');
    if (bgmVolumeSlider && bgmVolumeValue) {
        bgmVolumeSlider.value = currentSettings.bgmVolume;
        bgmVolumeValue.textContent = Math.round(currentSettings.bgmVolume * 100) + '%';
        bgmVolumeSlider.disabled = !currentSettings.soundEnabled;
    }

    // 更新音效音量滑桿
    const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');
    const sfxVolumeValue = document.getElementById('sfxVolumeValue');
    if (sfxVolumeSlider && sfxVolumeValue) {
        sfxVolumeSlider.value = currentSettings.sfxVolume;
        sfxVolumeValue.textContent = Math.round(currentSettings.sfxVolume * 100) + '%';
        sfxVolumeSlider.disabled = !currentSettings.soundEnabled;
    }
}

/**
 * 切換 FPS 顯示
 */
export function toggleFPS() {
    // 直接更新設定，不調用 setSetting 避免重新應用音量設定
    currentSettings.showFPS = !currentSettings.showFPS;
    applyFPSDisplay();
    saveSettings();
    console.log('🔄 FPS 顯示:', currentSettings.showFPS ? '開啟' : '關閉');
}

/**
 * 切換虛擬鍵盤顯示
 */
export function toggleVirtualKeyboard() {
    const newValue = !currentSettings.showVirtualKeyboard;

    // 直接更新設定，不調用 setSetting 避免重新應用音量設定
    currentSettings.showVirtualKeyboard = newValue;
    applyVirtualKeyboardSettings();
    saveSettings();

    // 同步更新控制模式
    if (typeof window.mobileControls?.getCurrentControlMode === 'function') {
        const currentMode = window.mobileControls.getCurrentControlMode();
        const needsToggle = (newValue && currentMode.controlMode !== 'mobile') ||
                           (!newValue && currentMode.controlMode !== 'desktop');

        if (needsToggle && typeof window.mobileControls?.toggleControlMode === 'function') {
            window.mobileControls.toggleControlMode();

            // 更新主頁面的按鈕文字
            setTimeout(() => {
                const updatedMode = window.mobileControls.getCurrentControlMode();
                if (updatedMode) {
                    const buttonText = updatedMode.controlMode === 'mobile' ? '⌨️ 切換到桌面模式' : '📱 切換到手機模式';
                    const toggleBtn = document.getElementById('toggleControlBtn');
                    if (toggleBtn) {
                        toggleBtn.textContent = buttonText;
                    }

                    // 更新觸控指示器
                    if (typeof window.mobileControls?.updateControlModeIndicator === 'function') {
                        window.mobileControls.updateControlModeIndicator();
                    }
                }
            }, 100);
        }
    }

    console.log('🔄 虛擬鍵盤顯示:', newValue ? '開啟' : '關閉');
}

/**
 * 切換音效
 */
export function toggleSound() {
    setSetting('soundEnabled', !currentSettings.soundEnabled);
    updateSettingsUI(); // 更新音量滑桿狀態
    console.log('🔄 音效:', currentSettings.soundEnabled ? '開啟' : '關閉');
}

/**
 * 設定 BGM 音量
 */
export function setBGMVolume(volume) {
    const volumeValue = parseFloat(volume);
    setSetting('bgmVolume', volumeValue);

    // 更新顯示
    const volumeValueSpan = document.getElementById('bgmVolumeValue');
    if (volumeValueSpan) {
        volumeValueSpan.textContent = Math.round(volumeValue * 100) + '%';
    }

    console.log('🎵 BGM 音量設定為:', Math.round(volumeValue * 100) + '%');
}

/**
 * 設定音效音量
 */
export function setSFXVolume(volume) {
    const volumeValue = parseFloat(volume);
    setSetting('sfxVolume', volumeValue);

    // 更新顯示
    const volumeValueSpan = document.getElementById('sfxVolumeValue');
    if (volumeValueSpan) {
        volumeValueSpan.textContent = Math.round(volumeValue * 100) + '%';
    }

    console.log('🔊 音效音量設定為:', Math.round(volumeValue * 100) + '%');
}

/**
 * 重置設定
 */
export function resetSettings() {
    if (confirm('確定要重置所有設定嗎？')) {
        currentSettings = { ...DEFAULT_SETTINGS };
        applySettings();
        saveSettings();
        updateSettingsUI();
        console.log('🔄 設定已重置為預設值');
    }
}

/**
 * 初始化設定系統
 */
export function initSettings() {
    loadSettings();
    
    // 暴露到全域範圍
    if (typeof window !== 'undefined') {
        window.gameSettings = {
            showSettingsModal,
            hideSettingsModal,
            toggleFPS,
            toggleVirtualKeyboard,
            toggleSound,
            setBGMVolume,
            setSFXVolume,
            resetSettings,
            getSetting,
            setSetting
        };
    }
    
    console.log('⚙️ 設定系統已初始化');
}

// 監聽頁面載入
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        // 延遲初始化，確保其他系統已載入
        setTimeout(initSettings, 100);
    });
}
