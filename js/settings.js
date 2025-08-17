/**
 * 遊戲設定系統
 * 管理 FPS 顯示、音量等設定
 */

// 預設設定
const DEFAULT_SETTINGS = {
    showFPS: false,
    gameVolume: 0.7,
    soundEnabled: true
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
    applySettings();
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
    // 設定 Tone.js 音量
    if (typeof Tone !== 'undefined' && Tone.Destination) {
        Tone.Destination.volume.value = currentSettings.soundEnabled ? 
            20 * Math.log10(currentSettings.gameVolume) : -Infinity;
    }
    
    // 設定 HTML5 音頻元素音量
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
        audio.volume = currentSettings.soundEnabled ? currentSettings.gameVolume : 0;
    });
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
    
    // 更新設定介面的值
    updateSettingsUI();
    
    // 顯示設定介面
    settingsModal.style.display = 'flex';
    
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
                    
                    <!-- 音效開關 -->
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" id="soundEnabledCheckbox" onchange="window.gameSettings.toggleSound()">
                            <span class="checkmark"></span>
                            啟用音效
                        </label>
                        <div class="setting-description">開啟或關閉遊戲音效</div>
                    </div>
                    
                    <!-- 音量設定 -->
                    <div class="setting-item">
                        <label class="setting-label">遊戲音量</label>
                        <div class="volume-control">
                            <input type="range" id="volumeSlider" min="0" max="1" step="0.1" 
                                   onchange="window.gameSettings.setVolume(this.value)">
                            <span id="volumeValue">70%</span>
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
    
    // 更新音效開關勾選框
    const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox');
    if (soundEnabledCheckbox) {
        soundEnabledCheckbox.checked = currentSettings.soundEnabled;
    }
    
    // 更新音量滑桿
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    if (volumeSlider && volumeValue) {
        volumeSlider.value = currentSettings.gameVolume;
        volumeValue.textContent = Math.round(currentSettings.gameVolume * 100) + '%';
        volumeSlider.disabled = !currentSettings.soundEnabled;
    }
}

/**
 * 切換 FPS 顯示
 */
export function toggleFPS() {
    setSetting('showFPS', !currentSettings.showFPS);
    console.log('🔄 FPS 顯示:', currentSettings.showFPS ? '開啟' : '關閉');
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
 * 設定音量
 */
export function setVolume(volume) {
    const volumeValue = parseFloat(volume);
    setSetting('gameVolume', volumeValue);
    
    // 更新顯示
    const volumeValueSpan = document.getElementById('volumeValue');
    if (volumeValueSpan) {
        volumeValueSpan.textContent = Math.round(volumeValue * 100) + '%';
    }
    
    console.log('🔊 音量設定為:', Math.round(volumeValue * 100) + '%');
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
            toggleSound,
            setVolume,
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
