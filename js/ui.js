import { gameState, leaderboard } from './gameState.js';
import { buildApiUrl } from './config.js';
import { getCurrentUser } from './auth.js';

// 作弊模式指示器
function updateCheatModeIndicator() {
    let cheatIndicator = document.getElementById('cheatModeIndicator');

    if (gameState.isCheatModeActive) {
        if (!cheatIndicator) {
            // 創建作弊模式指示器
            cheatIndicator = document.createElement('div');
            cheatIndicator.id = 'cheatModeIndicator';
            cheatIndicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background-color: rgba(255, 0, 0, 0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 5px;
                font-weight: bold;
                font-size: 14px;
                z-index: 2000;
                border: 2px solid #ff0000;
                animation: cheatBlink 2s infinite;
            `;
            cheatIndicator.textContent = '🚫 作弊模式 - 分數不計入排行榜';

            // 添加閃爍動畫
            if (!document.getElementById('cheatModeStyle')) {
                const style = document.createElement('style');
                style.id = 'cheatModeStyle';
                style.textContent = `
                    @keyframes cheatBlink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0.6; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(cheatIndicator);
        }
    } else if (cheatIndicator) {
        // 移除作弊模式指示器
        cheatIndicator.remove();
    }
}

// 輔助函數：獲取本地分數記錄
function getLocalScores() {
    try {
        const scores = localStorage.getItem('pac_map_local_scores');
        return scores ? JSON.parse(scores) : [];
    } catch (error) {
        console.error('讀取本地分數失敗:', error);
        return [];
    }
}

// 輔助函數：檢查用戶是否已登入
function isUserLoggedIn() {
    // 檢查是否有用戶資訊和 token
    const user = localStorage.getItem('pac_map_user');
    const token = localStorage.getItem('pac_map_token');
    return !!(user && token);
}

export function updateUI() {
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('level').textContent = gameState.level;
    const remainingItems = gameState.dots.length + gameState.powerPellets.length;
    document.getElementById('dotsLeft').textContent = remainingItems;
    document.getElementById('highScore').textContent = leaderboard.length > 0 ? Math.max(0, ...leaderboard.filter(s => typeof s === 'number').concat(0)) : 0;
    const minutes = Math.floor(gameState.gameTime / 60), seconds = gameState.gameTime % 60;
    document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    const hs = gameState.healthSystem;
    document.getElementById('lives').textContent = hs.lives;

    // 顯示作弊模式提示
    updateCheatModeIndicator();

    const healthBar = document.getElementById('healthBar');
    if (healthBar) {
        const healthPercent = hs.currentHealth;
        
        healthBar.style.width = `${healthPercent}%`;

        if (healthPercent > 50) {
            healthBar.style.backgroundColor = '#00ff00';
        } else if (healthPercent > 20) {
            healthBar.style.backgroundColor = '#ffff00';
        } else {
            healthBar.style.backgroundColor = '#ff0000';
        }
    }
     // --- *** 新的、更智能的任务 UI 更新逻辑 *** ---
    const questDescEl = document.getElementById('quest-description');
    const questProgEl = document.getElementById('quest-progress');
    const qs = gameState.questSystem; // 简写

    // 优先检查是否有临时完成消息
    if (qs.completionMessage) {
        // 如果有，就显示完成消息
        questDescEl.textContent = qs.completionMessage;
        questProgEl.textContent = "🎉 獎勵已發放！ 🎉"; // 进度条可以显示一些庆祝的表情
        questDescEl.parentElement.style.display = 'flex';
    } 
    // 检查是否有正在进行的任务
    else if (qs.activeQuest) {
        // 如果有，就显示任务描述和进度
        questDescEl.textContent = qs.activeQuest.description;
        questProgEl.textContent = `進度: ${qs.activeQuest.progress} / ${qs.activeQuest.targetCount}`;
        questDescEl.parentElement.style.display = 'flex';
    } 
    // 都没有，就显示默认信息
    else {
        questDescEl.textContent = '任務：自由探索地圖！';
        questProgEl.textContent = `已完成: ${qs.completedQuests}`;
        questDescEl.parentElement.style.display = 'flex';
    }
    
    const bp = gameState.backpack;
    for (let i = 0; i < bp.maxSize; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        const itemEl = slotEl.querySelector('.slot-item');
        const item = bp.items[i];

        if (item) {
            itemEl.textContent = item.icon; // 显示 emoji
            slotEl.classList.add('filled');
            slotEl.title = `${item.name}\n恢復 ${item.heal} 點生命`; // 鼠标悬停提示
        } else {
            itemEl.textContent = ''; // 清空内容
            slotEl.classList.remove('filled');
            slotEl.title = '空格';
        }
    }
    // 小地圖顯示地標
    const mm = gameState.minimap;
    const aq = gameState.questSystem.activeQuest;

    if (mm.map && mm.currentQuestPoiLayer) {
        
        // 1. 永远先清空旧的地标
        mm.currentQuestPoiLayer.clearLayers();

        // 2. 检查是否有激活的任务
        if (aq) {
            // --- *** 任务类型 A: 访问某一“类型”的地标 *** ---
            if (aq.type === 'visit_poi') {
                const targetPoiType = aq.poiType;
                
                gameState.pois.forEach(poi => {
                    // 条件: 类型匹配 且 未被访问
                    if (poi.type === targetPoiType && !aq.visitedPoiIds.has(poi.id)) {
                        // (创建并添加 Marker 的逻辑)
                        addPoiMarkerToMinimap(poi, true); // 使用辅助函数
                    }
                });
            } 
            // --- *** 新增：任务类型 B: 访问“特定”的地标 (例如台北 101) *** ---
            else if (aq.type === 'visit_specific_poi') {
                const targetPoiId = aq.poiId;

                // 遍历所有地标，找到那个特定的目标
                gameState.pois.forEach(poi => {
                    // 条件: ID 匹配 且 未被访问
                    if (poi.id === targetPoiId && !aq.visitedPoiIds.has(poi.id)) {
                        // (创建并添加 Marker 的逻辑)
                        addPoiMarkerToMinimap(poi, true); // 使用同一个辅助函数
                    }
                });
            }
        }
    }
}

function addPoiMarkerToMinimap(poi, isQuestTarget) {
    const mm = gameState.minimap;
    if (!mm.currentQuestPoiLayer) return;

    let iconClassName = `minimap-poi-icon ${poi.type}`;
    if (isQuestTarget) {
        iconClassName += ' quest-target';
    }
    if (poi.type === 'landmark-icon') {
        iconClassName += ' special';
    }

    const minimapPoiIcon = L.divIcon({
        className: iconClassName,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });

    const minimapMarker = L.marker(poi.marker.getLatLng(), { icon: minimapPoiIcon });

    mm.currentQuestPoiLayer.addLayer(minimapMarker);
}

export async function updateLeaderboardUI() {
    // 檢查是否有地圖選擇器，如果沒有則使用預設的概覽模式
    const mapSelect = document.getElementById('leaderboardMapSelect');
    const selectedMap = mapSelect ? mapSelect.value : 'all';

    await updateLeaderboardByMapSelection(selectedMap);
}

// 根據地圖選擇更新排行榜
async function updateLeaderboardByMapSelection(selectedMap) {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '<li>載入中...</li>';

    try {
        // 獲取當前用戶資訊
        const currentUser = getCurrentUser();

        // 獲取本地分數
        const localScores = getLocalScores();

        list.innerHTML = '';

        // 地圖配置
        const mapConfigs = [
            { index: 0, name: '台北市中心', emoji: '🏙️', color: '#ff6b6b' },
            { index: 1, name: '台中市區', emoji: '🌆', color: '#4ecdc4' },
            { index: 2, name: '高雄市區', emoji: '🌃', color: '#45b7d1' }
        ];

        if (selectedMap === 'all') {
            // 顯示所有地圖的概覽（前5名）
            for (const mapConfig of mapConfigs) {
                await displayMapLeaderboard(mapConfig, list, currentUser, localScores, 5);
            }
        } else {
            // 顯示特定地圖的完整排行榜
            const mapIndex = parseInt(selectedMap);
            const mapConfig = mapConfigs.find(config => config.index === mapIndex);

            if (mapConfig) {
                await displayMapLeaderboard(mapConfig, list, currentUser, localScores, 100, true);
            }
        }

        // 如果沒有任何記錄，顯示提示
        if (list.children.length === 0) {
            const noDataLi = document.createElement('li');
            noDataLi.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">暫無排行榜記錄</div>';
            list.appendChild(noDataLi);
        }



    } catch (error) {
        console.error('載入排行榜失敗:', error);

        // 如果後端不可用，只顯示本地排行榜
        const localScores = getLocalScores();
        list.innerHTML = '';

        if (localScores.length > 0) {
            const localHeader = document.createElement('li');
            localHeader.innerHTML = '<h4 style="color: #ff9500; margin: 10px 0;">📱 本地記錄</h4>';
            list.appendChild(localHeader);

            localScores.slice(0, 10).forEach((entry, index) => {
                const li = document.createElement('li');
                const mapNames = ["台北市中心", "台中市區", "高雄市區"];
                const mapName = mapNames[entry.map_index] || "未知地圖";

                li.innerHTML = `
                    <div class="leaderboard-entry local-entry">
                        <span class="rank">#${index + 1}</span>
                        <div class="player-info">
                            <span class="player-name">您</span>
                        </div>
                        <div class="score-info">
                            <span class="score">${entry.score} 分</span>
                            <span class="map-name">${mapName}</span>
                        </div>
                    </div>
                `;
                list.appendChild(li);
            });
        } else if (leaderboard.length > 0) {
            // 回退到舊的本地排行榜
            leaderboard.forEach(s => {
                const li = document.createElement('li');
                li.textContent = `${s} 分 (本地記錄)`;
                list.appendChild(li);
            });
        } else {
            list.innerHTML = '<li>載入失敗，請稍後再試</li>';
        }
    }
}

export function updatePacmanIconRotation() { 
    if (!gameState.pacman || !gameState.pacman.getElement()) return; 
    const pacmanElement = gameState.pacman.getElement(); 
    if (!pacmanElement) return;
    if (pacmanElement.classList.contains('hidden')) return; 
    pacmanElement.classList.remove('facing-true-left', 'facing-true-right', 'facing-true-up', 'facing-true-down');
    switch (gameState.pacmanMovement.currentFacingDirection) {
        case 'left': pacmanElement.classList.add('facing-true-left'); break;
        case 'right': pacmanElement.classList.add('facing-true-right'); break;
        case 'up': pacmanElement.classList.add('facing-true-up'); break;
        case 'down': pacmanElement.classList.add('facing-true-down'); break;
        default: pacmanElement.classList.add('facing-true-left'); break;
    }
}

export function showLoadingScreen(message) {
    let loadingScreen = document.getElementById('loadingScreen');
    if (!loadingScreen) {
        loadingScreen = document.createElement('div');
        loadingScreen.id = 'loadingScreen';
        loadingScreen.style.position = 'absolute';
        loadingScreen.style.top = '0';
        loadingScreen.style.left = '0';
        loadingScreen.style.width = '100%';
        loadingScreen.style.height = '100%';
        loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        loadingScreen.style.color = 'white';
        loadingScreen.style.fontSize = '1.5rem';
        loadingScreen.style.display = 'flex';
        loadingScreen.style.flexDirection = 'column';
        loadingScreen.style.justifyContent = 'center';
        loadingScreen.style.alignItems = 'center';
        loadingScreen.style.zIndex = '3000';
        loadingScreen.style.textAlign = 'center';
        document.body.appendChild(loadingScreen);
    }
    loadingScreen.innerHTML = `<h2>${message}</h2><p style="font-size: 1rem; margin-top: 10px;">請稍候...</p>`;
    loadingScreen.style.display = 'flex';
}

export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'none';
}

/**
 * 顯示特定地圖的排行榜
 */
async function displayMapLeaderboard(mapConfig, list, currentUser, localScores, limit = 5, isFullView = false) {
    try {
        // 從後端 API 獲取特定地圖的排行榜數據
        const response = await fetch(buildApiUrl(`/game/leaderboard?map_index=${mapConfig.index}&limit=${limit}`));

        if (!response.ok) {
            console.warn(`獲取 ${mapConfig.name} 排行榜失敗: ${response.status}`);
            return;
        }

        const data = await response.json();
        const mapScores = data.success ? data.data : [];

        // 創建地圖標題
        const mapHeader = document.createElement('li');
        const titleText = isFullView ?
            `${mapConfig.emoji} ${mapConfig.name} - 完整排行榜` :
            `${mapConfig.emoji} ${mapConfig.name}`;

        mapHeader.innerHTML = `
            <h4 style="color: ${mapConfig.color}; margin: 20px 0 10px 0; border-bottom: 2px solid ${mapConfig.color}; padding-bottom: 5px;">
                ${titleText}
                ${isFullView ? `<span style="font-size: 12px; color: #888; font-weight: normal;"> (共 ${mapScores.length} 位玩家)</span>` : ''}
            </h4>
        `;
        list.appendChild(mapHeader);

        // 顯示該地圖的排行榜
        if (mapScores.length > 0) {
            mapScores.forEach((entry, index) => {
                const li = document.createElement('li');

                // 檢查是否為當前用戶的分數
                const isCurrentUser = currentUser && entry.user_name === currentUser.name;
                const entryClass = isCurrentUser ? 'leaderboard-entry current-user' : 'leaderboard-entry';

                li.innerHTML = `
                    <div class="${entryClass}" style="border-left: 3px solid ${mapConfig.color};">
                        <span class="rank">#${entry.rank}</span>
                        <div class="player-info">
                            ${entry.user_picture ? `<img src="${entry.user_picture}" alt="頭像" class="player-avatar">` : ''}
                            <span class="player-name">${entry.user_name}${isCurrentUser ? ' (您)' : ''}</span>
                        </div>
                        <div class="score-info">
                            <span class="score">${entry.score} 分</span>
                            <span class="level">等級 ${entry.level}</span>
                        </div>
                    </div>
                `;
                list.appendChild(li);
            });
        } else {
            // 如果該地圖沒有記錄，顯示提示
            const noDataLi = document.createElement('li');
            noDataLi.innerHTML = `
                <div style="text-align: center; color: #666; padding: 10px; font-style: italic;">
                    暫無 ${mapConfig.name} 的記錄
                </div>
            `;
            list.appendChild(noDataLi);
        }

        // 顯示該地圖的本地記錄（如果用戶未登入且有該地圖的本地記錄，且不是完整檢視模式）
        if (!currentUser && !isFullView) {
            const mapLocalScores = localScores.filter(score => score.map_index === mapConfig.index);
            if (mapLocalScores.length > 0) {
                const localHeader = document.createElement('li');
                localHeader.innerHTML = `
                    <h5 style="color: #ff9500; margin: 10px 0 5px 20px; font-size: 14px;">
                        📱 您的本地記錄
                    </h5>
                `;
                list.appendChild(localHeader);

                mapLocalScores.slice(0, 3).forEach((entry, index) => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div class="leaderboard-entry local-entry" style="border-left: 3px solid #ff9500; margin-left: 20px;">
                            <span class="rank">#${index + 1}</span>
                            <div class="player-info">
                                <span class="player-name">您 (本地)</span>
                            </div>
                            <div class="score-info">
                                <span class="score">${entry.score} 分</span>
                                <span class="level">等級 ${entry.level || 1}</span>
                            </div>
                        </div>
                    `;
                    list.appendChild(li);
                });
            }
        }

    } catch (error) {
        console.error(`載入 ${mapConfig.name} 排行榜失敗:`, error);

        // 顯示錯誤提示
        const errorLi = document.createElement('li');
        errorLi.innerHTML = `
            <div style="color: #ff6b6b; text-align: center; padding: 10px;">
                ${mapConfig.emoji} ${mapConfig.name} 排行榜載入失敗
            </div>
        `;
        list.appendChild(errorLi);
    }
}

// 暴露到全域範圍供 HTML 使用
if (typeof window !== 'undefined') {
    window.updateLeaderboardByMap = async function() {
        const mapSelect = document.getElementById('leaderboardMapSelect');
        if (mapSelect) {
            await updateLeaderboardByMapSelection(mapSelect.value);
        }
    };
}
