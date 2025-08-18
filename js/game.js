import { gameState, mapConfigs, MAX_MAP_ZOOM, NUMBER_OF_GHOSTS, PACMAN_BASE_SPEED, GHOST_MOVE_SPEED_METERS_PER_SECOND, MAX_DELTA_TIME, leaderboard, gameLoopRequestId, ghostDecisionInterval, lastFrameTime, setGameLoopRequestId, setGhostDecisionInterval, setLastFrameTime, foodDatabase } from './gameState.js';
import { soundsReady, setupSounds, playStartSound, playDotSound, playPowerPelletSound, playEatGhostSound, playDeathSound, playGameBGM, stopAllBGM, pauseCurrentBGM, resumeCurrentBGM, setCurrentBGMVolume, playSettlementBGM, playHomepageBGM } from './audio.js';
import { updateUI, updateLeaderboardUI, updatePacmanIconRotation, showLoadingScreen, hideLoadingScreen } from './ui.js';
import { stopBackgroundAnimation, initStartScreenBackground } from './backgroundAnimation.js';
import { isLoggedIn, authenticatedFetch } from './auth.js';
import { buildApiUrl } from './config.js';

// === 本地分數管理 ===

/**
 * 獲取本地分數記錄
 */
function getLocalScores() {
    try {
        const scores = localStorage.getItem('pac_map_local_scores');
        return scores ? JSON.parse(scores) : [];
    } catch (error) {
        console.error('讀取本地分數失敗:', error);
        return [];
    }
}

/**
 * 保存分數到本地
 */
function saveLocalScore(scoreData) {
    try {
        const scores = getLocalScores();
        const newScore = {
            ...scoreData,
            id: Date.now(), // 使用時間戳作為 ID
            created_at: new Date().toISOString(),
            is_local: true
        };

        scores.push(newScore);

        // 按分數排序，保留前 20 筆
        scores.sort((a, b) => b.score - a.score);
        if (scores.length > 20) {
            scores.splice(20);
        }

        localStorage.setItem('pac_map_local_scores', JSON.stringify(scores));
        console.log('本地分數已保存:', newScore);
        return newScore;
    } catch (error) {
        console.error('保存本地分數失敗:', error);
        return null;
    }
}

/**
 * 清除本地分數記錄
 */
function clearLocalScores() {
    try {
        localStorage.removeItem('pac_map_local_scores');
        console.log('本地分數記錄已清除');
    } catch (error) {
        console.error('清除本地分數失敗:', error);
    }
}

// === 後端分數提交 ===

/**
 * 提交分數到後端（使用 scoreData 物件）
 */
async function submitScoreDataToBackend(scoreData) {
    try {
        console.log('正在提交分數到後端...', scoreData);

        const response = await authenticatedFetch(buildApiUrl('/game/score'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scoreData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('分數提交成功:', result);

        // 提交成功後更新排行榜
        updateLeaderboardUI();

        return result;
    } catch (error) {
        console.error('提交分數失敗:', error);

        // 如果是網路錯誤，顯示友善的錯誤訊息
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showScoreSubmissionError('網路連線失敗，分數已保存在本地');
        } else if (error.message.includes('登入已過期')) {
            showScoreSubmissionError('登入已過期，請重新登入後分數將自動同步');
        } else {
            showScoreSubmissionError('分數提交失敗，已保存在本地');
        }

        throw error;
    }
}

/**
 * 顯示分數提交錯誤訊息
 */
function showScoreSubmissionError(message) {
    // 創建錯誤提示元素
    const errorDiv = document.createElement('div');
    errorDiv.className = 'score-submission-error';
    errorDiv.textContent = message;

    // 添加樣式
    errorDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 12px 20px;
        background-color: #ff6b6b;
        color: white;
        border-radius: 6px;
        font-weight: bold;
        z-index: 9999;
        transition: opacity 0.3s ease;
        max-width: 300px;
        font-size: 14px;
    `;

    document.body.appendChild(errorDiv);

    // 5秒後自動移除
    setTimeout(() => {
        errorDiv.style.opacity = '0';
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 300);
    }, 5000);
}
import { fetchRoadData, fetchPOIData, generateRoadNetworkGeneric, findNearestRoadPositionGeneric, drawVisualRoads, getRandomPointInCircle } from './map.js';
import { loadMapDataFromBackend, checkBackendHealth } from './mapService.js';
import { gameValidationService, reportGameStart, reportDotCollected, reportPowerPelletCollected, reportGhostEaten, reportLifeLost, reportGameEnd } from './gameValidationService.js';
import { decideNextGhostMoves, manageAutoPilot, getNeighbors, positionsAreEqual, bfsDistance} from './ai.js';
import { logToDevConsole } from './devConsole.js';

// FPS 計算相關變數
let fpsFrameTimes = [];
let lastFpsUpdate = 0;

const bgmAudio = document.getElementById('bgm');
if (bgmAudio) {
    bgmAudio.volume = 0.4; // 设定一个合适的初始音量 (0.0 到 1.0)
}

export async function initGame() {
    stopBackgroundAnimation();

    const config = mapConfigs[gameState.currentMapIndex];
    if (gameState.map) {
        gameState.map.remove();
        gameState.map = null;
    }

    gameState.map = L.map('map', {
        center: config.center,
        zoom: config.zoom,
        minZoom: MAX_MAP_ZOOM,
        maxZoom: MAX_MAP_ZOOM,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
         maxZoom: MAX_MAP_ZOOM + 1
    }).addTo(gameState.map);

    gameState.map.invalidateSize();

    resetGameState();
    showLoadingScreen('正在載入地圖資料...');

    let  poiElements = [];
    const center = config.center;

    // 嘗試使用後端 API 載入地圖數據
    const backendAvailable = await checkBackendHealth();
    let mapLoadSuccess = false;

    if (backendAvailable) {
        console.log('後端服務可用，使用預處理的地圖數據');
        showLoadingScreen('正在從後端載入預處理地圖數據...');
        mapLoadSuccess = await loadMapDataFromBackend(gameState.currentMapIndex, gameState);
    }

    // 如果後端不可用或載入失敗，回退到原始方法
    if (!mapLoadSuccess) {
        console.log('回退到原始地圖載入方法');
        showLoadingScreen('正在獲取地圖資料...');

        const bounds = config.getBounds ? config.getBounds() : gameState.map.getBounds();
        const [roadData, poiData] = await Promise.all([
            fetchRoadData(bounds),
            fetchPOIData(bounds, {
                "historic": "monument",
                "shop": "convenience",
                "leisure": "park",
                "tourism": "hotel",
                "amenity": "bank|restaurant|cafe|bubble_tea|atm"
            })
        ]);

        poiElements = poiData.elements;

        await generateRoadNetworkGeneric(bounds, roadData, gameState);

        // 設置 POI 數據（如果有的話）
        // if (poiData && poiData.elements) {
        //     gameState.pois = poiData.elements.filter(element =>
        //         element.type === 'node' && element.lat && element.lon
        //     ).map(element => ({
        //         id: element.id,
        //         type: element.tags?.amenity || element.tags?.shop || element.tags?.historic || element.tags?.leisure || element.tags?.tourism || 'unknown',
        //         name: element.tags?.name,
        //         lat: element.lat,
        //         lng: element.lon,
        //         tags: element.tags
        //     }));
        // }
    }

    setTimeout(() => {
        hideLoadingScreen();
        console.log('🔍 檢查有效位置數量:', gameState.validPositions.length);
        if (gameState.validPositions.length === 0) {
            showLoadingScreen('地圖數據載入失敗，請檢查網絡或稍後重試。');
            console.error('無法初始化遊戲元素，因為沒有有效的道路位置。');
            return;
        }
        const bounds = config.getBounds ? config.getBounds() : gameState.map.getBounds();
        initGameElements(poiElements, center, bounds);
        startGameCountdown();
    }, 1000);
}

function resetGameState() { 
    if (gameLoopRequestId) cancelAnimationFrame(gameLoopRequestId);
    if (gameState.gameTimer) clearInterval(gameState.gameTimer);
    if (ghostDecisionInterval) clearInterval(ghostDecisionInterval);
    if (gameState.powerModeTimer) clearTimeout(gameState.powerModeTimer);
    if (gameState.poisonCircle.damageInterval) clearInterval(gameState.poisonCircle.damageInterval);
    if (poisonSvgElements.poisonRect) {
        poisonSvgElements.poisonRect.remove();
        poisonSvgElements.nextCircleBorder.remove();
    }
    if (gameState.minimap.map) {
        gameState.minimap.map.remove();
        gameState.minimap.map = null;
        gameState.minimap.playerMarker = null;
        gameState.minimap.poisonCircle = null;
        gameState.minimap.nextPoisonCircle = null;
        gameState.minimap.currentQuestPoiLayer = null;
    }
    gameState.backpack = {
        items: [null, null, null],
        maxSize: 3
    };
    gameState.foodItems = [];
    gameState.pois = [];
    poisonSvgElements = {};

    setGameLoopRequestId(null);
    setGhostDecisionInterval(null);
    setLastFrameTime(0);

    gameState.healthSystem = {
        lives: 3,
        maxLives: 3,
        currentHealth: 100,
        maxHealth: 100
    };

    gameState.score = 0; gameState.gameTime = 600;
    gameState.isPaused = false; gameState.isGameOver = false; gameState.isLosingLife = false;
    gameState.powerMode = false; gameState.dotsCollected = 0;
    gameState.ghostsEaten = 0; gameState.powerPelletsEaten = 0;
    gameState.ghostSpawnPoints = []; gameState.pacmanLevelStartPoint = null;
    gameState.baseScatterPoints = []; 
    gameState.pacmanMovement = { isMoving: false, startPositionLatLng: null, destinationNodeLatLng: null, totalDistanceToDestinationNode: 0, distanceTraveledThisSegment: 0, lastIntendedDirectionKey: null, currentFacingDirection: 'left' };
    gameState.gameSpeedMultiplier = 1; 
    gameState.pacmanSpeedMultiplier = 1.0; 
    gameState.godMode = false; 
    gameState.autoPilotMode = false; 
    gameState.cleverMode = false; 
    gameState.autoPilotPath = [];
    gameState.autoPilotTarget = null;
    
    if (gameState.map) { 
        gameState.dots.forEach(dot => {if(gameState.map.hasLayer(dot)) gameState.map.removeLayer(dot)});
        gameState.powerPellets.forEach(pellet => {if(gameState.map.hasLayer(pellet)) gameState.map.removeLayer(pellet)});
        gameState.ghosts.forEach(ghostObj => { if (ghostObj.marker && gameState.map.hasLayer(ghostObj.marker)) gameState.map.removeLayer(ghostObj.marker); }); 
        if (gameState.pacman && gameState.map.hasLayer(gameState.pacman)) gameState.map.removeLayer(gameState.pacman);
    }
    gameState.dots = []; gameState.powerPellets = []; 
    gameState.ghosts = []; 
    gameState.pacman = null;

    const wastedScreen = document.getElementById('wastedScreenOverlay');
    const wastedBanner = document.getElementById('wastedBanner');
    if (wastedScreen) {
        wastedScreen.style.display = 'none';
        wastedScreen.classList.remove('active');
    }
    if (wastedBanner) wastedBanner.style.opacity = '0'; 
    const mapElement = document.getElementById('map'); 
    if (mapElement) {
         mapElement.classList.remove('fading-to-black');
    }
}

function initGameElements(poiElements, center, bounds) {
    // ---- 步骤 1: 清理旧的地标数据 ----
    gameState.pois = [];
    let elementsToDisplay = [];

    // ---- 步骤 2: 检查并筛选传入的地标元素数组 ----
    // *** 关键修正：直接检查 poiElements 数组本身 ***
    if (poiElements && poiElements.length > 0) {
        console.log(`步骤 1: 成功接收到 ${poiElements.length} 个原始地标。`);

        // 基于距离智能筛选地标
        const MIN_DISTANCE_BETWEEN_POIS = 70;
        const finalPois = [];
        const shuffledElements = [...poiElements].sort(() => 0.5 - Math.random()); // 直接使用 poiElements

        shuffledElements.forEach(element => {
            if (element.type !== 'node') return;
            const currentPos = L.latLng(element.lat, element.lon);
            let isTooClose = false;
            for (const finalPoi of finalPois) {
                const finalPoiPos = L.latLng(finalPoi.lat, finalPoi.lon);
                if (currentPos.distanceTo(finalPoiPos) < MIN_DISTANCE_BETWEEN_POIS) {
                    isTooClose = true;
                    break;
                }
            }
            if (!isTooClose) {
                finalPois.push(element);
            }
        });
        
        elementsToDisplay = finalPois;
        console.log(`步骤 2: 按距离筛选后，剩下 ${elementsToDisplay.length} 个地标准备显示。`);
    } else {
        console.log("步骤 1: 接收到的地标数组为空或无效，跳过地标处理。");
    }

    // ---- 步骤 3: 统计并输出筛选后的地标数量 ----
    if (elementsToDisplay.length > 0) {
        const poiCounts = {};
        elementsToDisplay.forEach(element => {
            const tags = element.tags;
            let poiType = null;

            if (tags.historic === 'monument') poiType = '纪念碑 (monument)';
            else if (tags.shop === 'convenience') poiType = '便利商店 (convenience)';
            else if (tags.leisure === 'park') poiType = '公园 (park)';
            else if (tags.tourism === 'hotel') poiType = '旅馆 (hotel)';
            else if (tags.amenity === 'bank') poiType = '银行 (bank)';
            else if (tags.amenity === 'restaurant') poiType = '餐厅 (restaurant)';
            else if (tags.amenity === 'cafe') poiType = '咖啡馆 (cafe)';
            else if (tags.amenity === 'bubble_tea') poiType = '手摇饮料 (bubble_tea)';
            else if (tags.amenity === 'atm') poiType = 'ATM';
            
            if (poiType) {
                poiCounts[poiType] = (poiCounts[poiType] || 0) + 1;
            }
        });

        const countArray = Object.keys(poiCounts).map(key => ({
            '地标类型 (Type)': key,
            '数量 (Count)': poiCounts[key]
        }));
        
        console.log("--- 地标数量统计 (筛选后) ---");
        console.table(countArray);
    }

    // ---- 步骤 4: 创建地标 Marker 并存储数据 ----
    elementsToDisplay.forEach(element => {
        // 这部分是你已经写好的，根据类型创建不同 poiConfig 的逻辑
        let poiConfig = null;
        const tags = element.tags;
        
        if (tags.historic === 'monument') poiConfig = { name: tags.name || '纪念碑', className: 'monument-icon', letter: 'M' };
        else if (tags.shop === 'convenience') poiConfig = { name: tags.name || '便利商店', className: 'store-icon', letter: 'S' };
        else if (tags.leisure === 'park') poiConfig = { name: tags.name || '公园', className: 'park-icon', letter: 'P' };
        else if (tags.tourism === 'hotel') poiConfig = { name: tags.name || '旅馆', className: 'hotel-icon', letter: 'H' };
        else if (tags.amenity === 'bank') poiConfig = { name: tags.name || '银行', className: 'bank-icon', letter: '$' };
        else if (tags.amenity === 'restaurant') poiConfig = { name: tags.name || '餐厅', className: 'restaurant-icon', letter: 'R' };
        else if (tags.amenity === 'cafe') poiConfig = { name: tags.name || '咖啡馆', className: 'cafe-icon', letter: 'C' };
        else if (tags.amenity === 'bubble_tea') poiConfig = { name: tags.name || '手摇饮', className: 'bubble-tea-icon', letter: 'B' };
        else if (tags.amenity === 'atm') poiConfig = { name: tags.name || 'ATM', className: 'atm-icon', letter: 'A' };
        
        if (poiConfig) {
            const poiIcon = L.divIcon({
                className: 'poi-icon-container',
                iconSize: [24, 38],
                iconAnchor: [12, 24],
                html: `<div class="poi-icon-wrapper"><div class="poi-icon ${poiConfig.className}"><span class="poi-letter">${poiConfig.letter}</span></div><div class="poi-title">${poiConfig.name}</div></div>`
            });

            const poiMarker = L.marker([element.lat, element.lon], { icon: poiIcon })
                .addTo(gameState.map)
                .bindPopup(`<b>${poiConfig.name}</b>`);

            gameState.pois.push({
                marker: poiMarker,
                type: poiConfig.className,
                name: poiConfig.name,
                id: `${element.type}-${element.id}`
            });
        }
    });

    generateFoodItems();
    initializeQuests();
    generateNewQuest();

    gameState.ghostSpawnPoints = [];
    const spawnPointCandidates = [ 
        [bounds.getNorthWest().lat, bounds.getNorthWest().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getSouthEast().lat, bounds.getSouthEast().lng],
        [bounds.getCenter().lat + (bounds.getNorth() - bounds.getCenter().lat) * 0.5, bounds.getCenter().lng], 
        [bounds.getCenter().lat - (bounds.getCenter().lat - bounds.getSouth()) * 0.5, bounds.getCenter().lng], 
        [bounds.getCenter().lat, bounds.getCenter().lng - (bounds.getCenter().lng - bounds.getWest()) * 0.5], 
        [bounds.getCenter().lat, bounds.getCenter().lng + (bounds.getEast() - bounds.getCenter().lng) * 0.5], 
    ];

    let uniqueSpawnPointsFound = 0;
    for (const coord of spawnPointCandidates) {
        if (uniqueSpawnPointsFound >= NUMBER_OF_GHOSTS) break;
        const roadPos = findNearestRoadPositionGeneric(coord[0], coord[1], gameState.validPositions); 
        if (roadPos && !gameState.ghostSpawnPoints.some(p => positionsAreEqual(p, roadPos))) {
            gameState.ghostSpawnPoints.push(roadPos);
            uniqueSpawnPointsFound++;
        }
    }
    let attempts = 0;
    while (gameState.ghostSpawnPoints.length < NUMBER_OF_GHOSTS && attempts < 50 && gameState.validPositions.length > gameState.ghostSpawnPoints.length) {
        const randomIndex = Math.floor(Math.random() * gameState.validPositions.length);
        const randomPos = gameState.validPositions[randomIndex];
        if (!gameState.ghostSpawnPoints.some(p => positionsAreEqual(p, randomPos))) {
            gameState.ghostSpawnPoints.push(randomPos);
        }
        attempts++;
    }
    if (gameState.ghostSpawnPoints.length === 0 && gameState.validPositions.length > 0) {
         gameState.ghostSpawnPoints.push(gameState.validPositions[0]); 
         console.warn("鬼怪出生點數量不足，將重複使用。")
    }

    gameState.baseScatterPoints = [];
    const midLat = (bounds.getNorth() + bounds.getSouth()) / 2;
    const midLng = (bounds.getEast() + bounds.getWest()) / 2;
    const latOffset = (bounds.getNorth() - bounds.getSouth()) * 0.25; 
    const lngOffset = (bounds.getEast() - bounds.getWest()) * 0.25;

    const potentialScatterCoords = [
        [bounds.getNorth() - latOffset, bounds.getWest() + lngOffset],   
        [bounds.getNorth() - latOffset, bounds.getEast() - lngOffset],  
        [bounds.getSouth() + latOffset, bounds.getWest() + lngOffset], 
        [bounds.getSouth() + latOffset, bounds.getEast() - lngOffset],  
        [midLat + latOffset * 0.5, midLng - lngOffset * 0.5],
        [midLat - latOffset * 0.5, midLng + lngOffset * 0.5],
        [midLat + latOffset * 0.5, midLng + lngOffset * 0.5],
        [midLat - latOffset * 0.5, midLng - lngOffset * 0.5],
    ];
    for (const coord of potentialScatterCoords) {
        const roadPos = findNearestRoadPositionGeneric(coord[0], coord[1], gameState.validPositions); 
        if (roadPos && 
            !gameState.baseScatterPoints.some(p => positionsAreEqual(p, roadPos)) &&
            !gameState.ghostSpawnPoints.some(sp => sp && positionsAreEqual(sp, roadPos, 0.0005))) { 
            gameState.baseScatterPoints.push(roadPos);
        }
    }
    attempts = 0;
    const desiredScatterPoints = Math.min(Math.max(4, NUMBER_OF_GHOSTS), gameState.validPositions.length, 8); 
    while (gameState.baseScatterPoints.length < desiredScatterPoints && attempts < 50 && gameState.validPositions.length > gameState.baseScatterPoints.length) {
        const randomIndex = Math.floor(Math.random() * gameState.validPositions.length);
        const randomPos = gameState.validPositions[randomIndex];
        if (!gameState.baseScatterPoints.some(p => positionsAreEqual(p, randomPos)) && 
            !gameState.ghostSpawnPoints.some(sp => sp && positionsAreEqual(sp, randomPos, 0.0005))) { 
            gameState.baseScatterPoints.push(randomPos);
        }
        attempts++;
    }
    if (gameState.baseScatterPoints.length === 0 && gameState.validPositions.length > 0) {
        let fallbackScatter = gameState.validPositions.find(vp => !gameState.ghostSpawnPoints.some(sp => sp && positionsAreEqual(sp, vp)));
        if (fallbackScatter) gameState.baseScatterPoints.push(fallbackScatter);
        else gameState.baseScatterPoints.push(gameState.validPositions[0]); 
    }

    drawVisualRoads();
    createPacman(center);
    createGhosts();
    generateDots(gameState.map.getBounds());
    initPoisonCircle();
    initMinimap();
    updateUI();

    console.log('✅ 遊戲初始化完成 - 道路:', gameState.roadNetwork.length, '豆子:', gameState.validPositions.length);
}

function generateFoodItems() {
    gameState.foodItems = []; // 清空旧的美食

    // 遍历所有已存在于地图上的地标
    gameState.pois.forEach(poi => {
        // 为每个地标，有一定几率在它附近的道路上生成一个美食
        if (Math.random() < 0.5) { // 50% 的几率生成
            
            // 1. 从数据库中选择一种美食
            const possibleFoods = foodDatabase[poi.type] || foodDatabase['default'];
            const foodTemplate = possibleFoods[Math.floor(Math.random() * possibleFoods.length)];

            // 2. 寻找生成位置
            //    在距离地标一定范围内的随机一个路网节点上
            const poiMarkerPos = poi.marker.getLatLng();
            const spawnRadius = 50; // 在地标周围 50 米内寻找
            
            // 筛选出在半径内的所有可用节点
            const nearbyNodes = gameState.validPositions.filter(nodePos => {
                return L.latLng(nodePos[0], nodePos[1]).distanceTo(poiMarkerPos) < spawnRadius;
            });

            if (nearbyNodes.length > 0) {
                // 从附近的节点中随机选一个作为生成点
                const spawnPos = nearbyNodes[Math.floor(Math.random() * nearbyNodes.length)];

                // 3. 创建美食的 L.divIcon
                const foodIcon = L.divIcon({
                    className: 'food-icon',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                    html: foodTemplate.icon // 直接使用 emoji 作为内容
                });

                // 4. 创建 Marker 并存入 gameState.foodItems
                const foodMarker = L.marker(spawnPos, { icon: foodIcon }).addTo(gameState.map);

                gameState.foodItems.push({
                    marker: foodMarker,
                    ...foodTemplate // 将美食的所有属性(name, icon, heal)复制过来
                });
            }
        }
    });
    console.log(`在地图上生成了 ${gameState.foodItems.length} 个美食。`);
}

function initializeQuests() {
    const qs = gameState.questSystem;
    qs.availableQuests = [];
    qs.completedQuests = 0;

    const existingPoiTypes = new Set(gameState.pois.map(p => p.type));

    if (existingPoiTypes.has('store-icon')) {
        qs.availableQuests.push({
            type: 'visit_poi',
            poiType: 'store-icon',
            targetCount: 5,
            description: '任務：抵達 5 家不同的便利商店',
            reward: 5000
        });
    }
    if (existingPoiTypes.has('cafe-icon')) {
        qs.availableQuests.push({
            type: 'visit_poi',
            poiType: 'cafe-icon',
            targetCount: 3,
            description: '任務：抵達 3 家咖啡館',
            reward: 3000
        });
    }
    // 你可以在这里为其他地标类型添加更多任务
}

function generateNewQuest() {
    const qs = gameState.questSystem;
    if (qs.availableQuests.length === 0) {
        qs.activeQuest = null;
        console.log("沒有更多可用任務了。");
        updateUI();
        return;
    }

    // 从任务池中随机选择一个任务
    const questIndex = Math.floor(Math.random() * qs.availableQuests.length);
    const newQuestTemplate = qs.availableQuests[questIndex];

    // 创建一个“激活”的任务实例
    qs.activeQuest = {
        ...newQuestTemplate, // 复制任务模板的所有属性
        progress: 0,         // 初始化进度
        visitedPoiIds: new Set() // 用来记录访问过的地标ID，防止重复计算
    };

    console.log(`新任务生成: ${qs.activeQuest.description}`);
    updateUI(); // 更新UI以显示新任务
}

function initMinimap() {
    const mm = gameState.minimap; // 简写

    // 如果已存在旧的小地图，先销毁
    if (mm.map) {
        mm.map.remove();
    }

    // 从主地图的配置中获取中心点
    const center = mapConfigs[gameState.currentMapIndex].center;
    
    // *** 关键：设置一个远低于主地图的缩放级别 ***
    const MINIMAP_ZOOM_LEVEL = 14; // 这个值需要你微调，以达到最佳视野

    mm.map = L.map('minimap', {
        center: center,
        zoom: MINIMAP_ZOOM_LEVEL,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        keyboard: false
    });

    if (mm.currentQuestPoiLayer) {
        mm.currentQuestPoiLayer.clearLayers();
    }
    mm.currentQuestPoiLayer = L.layerGroup().addTo(mm.map);

    // 为小地图添加地图图块
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: MAX_MAP_ZOOM + 1
    }).addTo(mm.map);

    // 在小地图上创建玩家标记
    const playerIcon = L.divIcon({
        className: 'minimap-player-icon', // 我们需要为它定义样式
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
    mm.playerMarker = L.marker(gameState.pacman.getLatLng(), { icon: playerIcon }).addTo(mm.map);

    // 在小地图上创建毒圈
    mm.poisonCircle = L.circle(gameState.poisonCircle.center, {
        radius: gameState.poisonCircle.currentRadius,
        color: 'red',
        fillColor: 'red',
        fillOpacity: 0.2
    }).addTo(mm.map);

    // 在小地图上创建下一圈预告
    mm.nextPoisonCircle = L.circle(gameState.poisonCircle.center, {
        radius: gameState.poisonCircle.targetRadius,
        color: 'green',
        weight: 2,
        fill: false // 不填充
    }).addTo(mm.map);
}

function createPacman(centerArray) { // <--- 将参数名改为 centerArray，更清晰
    // 安全检查
    if (!Array.isArray(centerArray) || centerArray.length !== 2) {
        console.error("createPacman 收到了无效的 centerArray 参数！将使用地图的当前中心作为备用。", centerArray);
        const fallbackCenter = gameState.map.getCenter();
        centerArray = [fallbackCenter.lat, fallbackCenter.lng]; // 备用方案也设为数组格式
    }
    
    if (gameState.validPositions.length === 0) return;
    
    const pacmanCustomIcon = L.divIcon({ className: 'pacman-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
    
    // *** 关键修正：直接使用索引 [0] 和 [1] 来访问经纬度 ***
    const roadPos = findNearestRoadPositionGeneric(centerArray[0], centerArray[1], gameState.validPositions); 
    
    gameState.pacman = L.marker(roadPos, { icon: pacmanCustomIcon }).addTo(gameState.map);
    gameState.pacmanLevelStartPoint = roadPos;
    gameState.pacmanMovement.currentFacingDirection = 'left';
    updatePacmanIconRotation();
}


function createGhostIcon(ghost, isScared = false) {
    // 根據是否害怕，組合不同的 CSS class
    let classNames = `ghost-icon ghost-${ghost.color}`;
    if (isScared) {
        classNames += ' ghost-scared';
    }

    // 返回一個統一結構和設定的 divIcon 物件
    return L.divIcon({
        className: 'ghost-icon-container', // 使用外層容器 class
        iconSize: [20, 20],
        iconAnchor: [10, 16], // 使用統一、正確的錨點
        html: `<div class="${classNames}">
                 <div class="wave1"></div>
                 <div class="wave2"></div>
                 <div class="wave3"></div>
               </div>`
    });
}

export function createGhosts() { 
    if (gameState.validPositions.length === 0 || gameState.ghostSpawnPoints.length === 0) {
        console.error("Cannot create ghosts: No valid positions or ghost spawn points defined.");
        return;
    }
    const baseGhostColors = ['red', 'pink', 'cyan', 'orange', 'purple', 'green']; 
    gameState.ghosts = []; 
    
    let assignedScatterIndices = new Set(); 

    for (let i = 0; i < NUMBER_OF_GHOSTS; i++) {
        const colorName = baseGhostColors[i % baseGhostColors.length];
        const tempGhostForIcon = { color: colorName };
        const ghostIcon = createGhostIcon(tempGhostForIcon);

        const spawnPointToUse = gameState.ghostSpawnPoints[i % gameState.ghostSpawnPoints.length];

        if (!spawnPointToUse || !Array.isArray(spawnPointToUse) || spawnPointToUse.length !== 2) {
            console.error(` 無效的鬼怪出生點索引 ${i}: `, spawnPointToUse, "將使用地圖中心作為備用方案");
            const mapCenter = gameState.map.getCenter();
            const fallbackSpawn = findNearestRoadPositionGeneric(mapCenter.lat, mapCenter.lng, gameState.validPositions); 
            if (!fallbackSpawn) { 
                 console.error("無法為鬼怪找到有效的出生點 " + i + "，跳過此鬼怪。");
                 continue; 
            }
            spawnPointToUse = fallbackSpawn;
        }
        const marker = L.marker(spawnPointToUse, { icon: ghostIcon }).addTo(gameState.map);
        
        let scatterTarget = null;
        if (gameState.baseScatterPoints.length > 0) {
            let scatterIndex = -1;
            let attempts = 0;
            const availableBasePoints = gameState.baseScatterPoints.length;
            
            if (assignedScatterIndices.size < availableBasePoints) { 
                do {
                    scatterIndex = Math.floor(Math.random() * availableBasePoints);
                    attempts++;
                } while (assignedScatterIndices.has(scatterIndex) && attempts < availableBasePoints * 2); 
                 if (!assignedScatterIndices.has(scatterIndex)) { 
                     assignedScatterIndices.add(scatterIndex);
                 } else { 
                     scatterIndex = Math.floor(Math.random() * availableBasePoints);
                 }
            } else { 
                scatterIndex = Math.floor(Math.random() * availableBasePoints);
            }
            
            if (scatterIndex !== -1 && gameState.baseScatterPoints[scatterIndex]) {
                 scatterTarget = gameState.baseScatterPoints[scatterIndex];
            } else { 
                scatterTarget = gameState.baseScatterPoints[i % availableBasePoints];
            }
        }

        gameState.ghosts.push({ 
            marker: marker,
            originalPos: [...spawnPointToUse], 
            color: colorName,
            isScared: false,
            isScattering: !!scatterTarget, 
            scatterTargetNode: scatterTarget ? [...scatterTarget] : null, 
            movement: { 
                isMoving: false,
                startPositionLatLng: L.latLng(spawnPointToUse[0], spawnPointToUse[1]), 
                destinationNodeLatLng: null,
                totalDistanceToDestinationNode: 0,
                distanceTraveledThisSegment: 0
            }
        });
    }
}

function generateDots(bounds) { 
    if (gameState.validPositions.length === 0) { 
        console.warn('沒有有效的道路位置，無法生成點數和道具。'); 
        gameState.totalDots = 0;
        updateUI(); 
        return; 
    }
    gameState.dots.forEach(dot => {if(gameState.map.hasLayer(dot)) gameState.map.removeLayer(dot)}); 
    gameState.powerPellets.forEach(pellet => {if(gameState.map.hasLayer(pellet)) gameState.map.removeLayer(pellet)}); 
    gameState.dots = []; 
    gameState.powerPellets = []; 

    let availablePositions = [...gameState.validPositions];
    if (gameState.pacman) {
        const pacmanCurrentNode = findNearestRoadPositionGeneric(gameState.pacman.getLatLng().lat, gameState.pacman.getLatLng().lng, gameState.validPositions);
        availablePositions = availablePositions.filter(p => !positionsAreEqual(p, pacmanCurrentNode));
    }
    gameState.ghostSpawnPoints.forEach(spawnPoint => { 
        if(spawnPoint) availablePositions = availablePositions.filter(p => !positionsAreEqual(p, spawnPoint)); 
    });

    const desiredItemDensityFactor = 0.70, maxTotalItems = 20000;
    let numTotalItemsToPlace = Math.min(Math.floor(availablePositions.length * desiredItemDensityFactor), maxTotalItems);
    if (availablePositions.length < numTotalItemsToPlace) numTotalItemsToPlace = availablePositions.length;

    const numPowerPellets = Math.min(Math.floor(numTotalItemsToPlace * 0.07), 10); 
    let numNormalDots = numTotalItemsToPlace - numPowerPellets; 
    if (numNormalDots < 0) numNormalDots = 0;

    for (let i = 0; i < numPowerPellets; i++) { 
        if (availablePositions.length === 0) break;
        const randomIndex = Math.floor(Math.random() * availablePositions.length);
        const position = availablePositions.splice(randomIndex, 1)[0];
        const pelletIcon = L.divIcon({ className: 'power-pellet', iconSize: [12, 12], iconAnchor: [6, 6] });
        const pellet = L.marker(position, { icon: pelletIcon }).addTo(gameState.map);
        pellet.type = 'power';
        pellet.points = 50;
        gameState.powerPellets.push(pellet);
    }
    for (let i = 0; i < numNormalDots; i++) { 
        if (availablePositions.length === 0) break;
        const randomIndex = Math.floor(Math.random() * availablePositions.length);
        const position = availablePositions.splice(randomIndex, 1)[0];
        const dotIcon = L.divIcon({ className: 'dot', iconSize: [4, 4], iconAnchor: [2, 2] });
        const dot = L.marker(position, { icon: dotIcon }).addTo(gameState.map);
        dot.type = 'dot';
        dot.points = 20;
        gameState.dots.push(dot);
    }
    gameState.totalDots = gameState.dots.length + gameState.powerPellets.length; 
    gameState.dotsCollected = 0;
    updateUI();
}

function startGameCountdown() {
    const countdown = document.getElementById('countdown');
    if (!countdown) {
        console.error('❌ 找不到倒數計時元素');
        return;
    }

    countdown.style.display = 'block';
    let count = 3;
    gameState.canMove = false;

    const countInterval = setInterval(async () => {
        countdown.textContent = count;
        count--;
        if (count < 0) {
            clearInterval(countInterval);
            countdown.style.display = 'none';
            gameState.canMove = true;
            await startGame();
        }
    }, 1000);
}

async function startGame() {
    document.getElementById('gameUI').style.display = 'block';

    const minimapContainer = document.getElementById('minimap-container');
    if (minimapContainer) {
        minimapContainer.style.display = 'block';
    }
    const backpackContainer = document.getElementById('backpack-ui');
    if (backpackContainer) {
        backpackContainer.style.display = 'flex'; // 因为它是 flex 布局，所以用 'flex'
    }

    // 根據設定決定是否顯示虛擬方向鍵
    if (typeof window.gameSettings?.getSetting === 'function') {
        const showVirtualKeyboard = window.gameSettings.getSetting('showVirtualKeyboard');
        if (showVirtualKeyboard && typeof window.mobileControls?.showVirtualDPad === 'function') {
            window.mobileControls.showVirtualDPad();
        }
    } else if (typeof window.mobileControls?.showVirtualDPad === 'function') {
        // 如果沒有設定系統，使用預設邏輯
        window.mobileControls.showVirtualDPad();
    }

    // 隱藏觸控指示器
    if (typeof window.mobileControls?.hideTouchIndicator === 'function') {
        window.mobileControls.hideTouchIndicator();
    }

    // 顯示遊戲暫停按鈕
    if (typeof window.mobileControls?.showGamePauseButton === 'function') {
        window.mobileControls.showGamePauseButton();
    }

    if (gameState.minimap.map) {
        setTimeout(() => {
            gameState.minimap.map.invalidateSize();
        }, 100);
    }
    
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
        await Tone.start();
        console.log("音訊內容已啟動");
    }
    if (!soundsReady) { 
        setupSounds();
    }
    playStartSound();

    // 播放遊戲 BGM
    playGameBGM();

    gameState.gameStartTime = performance.now();

    // 啟動遊戲驗證會話
    if (isLoggedIn()) {
        try {
            await gameValidationService.startGameSession(gameState.currentMapIndex, gameState.gameTime);
            await reportGameStart(gameState);
        } catch (error) {
            console.warn('遊戲驗證啟動失敗，繼續遊戲:', error);
        }
    }

    gameState.gameTimer = setInterval(() => {
        if (!gameState.isPaused && !gameState.isGameOver) {
            gameState.gameTime--;
            updateUI();
            if (gameState.gameTime <= 0) endGame(false);
        }
    }, 1000);
    startGhostDecisionMaking();
    setLastFrameTime(performance.now());
    if (gameLoopRequestId) cancelAnimationFrame(gameLoopRequestId);
    setGameLoopRequestId(requestAnimationFrame(gameLoop));
}

export function startGhostDecisionMaking() { 
    const decisionIntervalTime = 300; 
    if (ghostDecisionInterval) clearInterval(ghostDecisionInterval);
    setGhostDecisionInterval(setInterval(() => {
        if (!gameState.isPaused && !gameState.isGameOver && !gameState.isLosingLife && gameState.pacman) {
            decideNextGhostMoves();
        }
    }, decisionIntervalTime));
}

function gameLoop(timestamp) {
    // --- 步骤 1: 基础控制 (暂停/结束) ---
    if (gameState.isGameOver || gameState.isPaused) {
        setLastFrameTime(timestamp);
        setGameLoopRequestId(requestAnimationFrame(gameLoop));
        return;
    }
    
    // 立即请求下一帧，确保循环持续
    setGameLoopRequestId(requestAnimationFrame(gameLoop));

    // --- 步骤 2: 时间计算 ---
    let rawDeltaTime = timestamp - lastFrameTime;
    if (rawDeltaTime > MAX_DELTA_TIME) {
        rawDeltaTime = MAX_DELTA_TIME;
    }
    setLastFrameTime(timestamp);
    let deltaTime = rawDeltaTime * gameState.gameSpeedMultiplier;
    
    // --- 步骤 3: 游戏状态更新 (先计算，后渲染) ---
    const pc = gameState.poisonCircle;

    // a. 更新毒圈状态
    if (!pc.isShrinking && timestamp > pc.nextShrinkTime) {
        startNextShrink();
    }
    if (pc.isShrinking) {
        pc.currentRadius -= pc.shrinkSpeed * (deltaTime / 1000);
        if (pc.currentRadius <= pc.targetRadius) {
            pc.currentRadius = pc.targetRadius;
            pc.isShrinking = false;
            console.log("毒圈缩小完成！");

            const nextTargetRadius = pc.currentRadius * 0.8;
            pc.targetRadius = Math.max(nextTargetRadius, 50);

            const randomCenterRadius = pc.currentRadius - pc.targetRadius;
            if (randomCenterRadius > 0) {
                pc.center = getRandomPointInCircle(pc.center, randomCenterRadius);
            }
            
            pc.nextShrinkTime = performance.now() + 30000;
            console.log(`下一轮预告已显示。将在 30 秒后开始缩小。`);
        }
    }

    // b. 更新玩家与毒圈的关系
    checkPlayerInPoison(timestamp);
    
    // c. 更新 AI
    manageAutoPilot();

    // d. 更新角色位置
    updatePacmanSmoothMovement(deltaTime); 
    gameState.ghosts.forEach(ghost => {
        if (ghost.marker && !ghost.marker.getElement().classList.contains('ghost-eaten')) {
            updateGhostSmoothMovement(ghost, deltaTime); 
        }
    });

    // --- 步骤 4: UI 更新 (所有状态计算完毕后，最后执行) ---

    // a. 更新 FPS 顯示
    updateFPS(timestamp);

    // b. 更新主 UI
    updateUI();

    // c. 更新小地图
    updateMinimap();

    // d. 更新毒圈视觉
    updatePoisonCircleSVG();

    // d. 更新小地图倒计时
    const minimapOverlay = document.getElementById('minimap-timer-overlay');
    const countdownEl = document.getElementById('minimap-timer-countdown');

    if (minimapOverlay && countdownEl) {
        // 使用更新后的 pc 状态来判断
        if (!pc.isShrinking) {
            minimapOverlay.style.display = 'flex';
            const timeLeftMs = pc.nextShrinkTime - timestamp;
            if (timeLeftMs > 0) {
                const timeLeftSec = Math.ceil(timeLeftMs / 1000);
                const minutes = Math.floor(timeLeftSec / 60);
                const seconds = timeLeftSec % 60;
                countdownEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                countdownEl.textContent = "00:00";
            }
        } else {
            minimapOverlay.style.display = 'none';
        }
    }
}

function updateFPS(timestamp) {
    // 將當前時間戳加入陣列
    fpsFrameTimes.push(timestamp);

    // 移除超過 500ms 的舊時間戳
    const cutoffTime = timestamp - 500;
    while (fpsFrameTimes.length > 0 && fpsFrameTimes[0] < cutoffTime) {
        fpsFrameTimes.shift();
    }

    // 每 100ms 更新一次 FPS 顯示
    if (timestamp - lastFpsUpdate >= 100) {
        const fps = fpsFrameTimes.length > 1 ?
            Math.round((fpsFrameTimes.length - 1) * 1000 / (timestamp - fpsFrameTimes[0])) : 0;

        const fpsDisplay = document.getElementById('fpsDisplay');
        if (fpsDisplay) {
            fpsDisplay.textContent = `FPS: ${fps}`;
        }

        lastFpsUpdate = timestamp;
    }
}

function updateMinimap() {
    const mm = gameState.minimap;
    const pc = gameState.poisonCircle;

    if (!mm.map) return; // 如果小地图不存在，则不执行

    const pacmanPos = gameState.pacman.getLatLng();

    // 1. 同步小地图中心点和玩家位置
    mm.map.setView(pacmanPos, undefined, { animate: false }); // undefined 表示保持当前缩放级别

    // 2. 更新小地图上玩家标记的位置
    if (mm.playerMarker) {
        mm.playerMarker.setLatLng(pacmanPos);
    }

    // 3. 更新小地图上毒圈的位置和大小
    if (mm.poisonCircle) {
        mm.poisonCircle.setLatLng(pc.center);
        mm.poisonCircle.setRadius(pc.currentRadius);
    }

    // 4. 更新小地图上下一圈预告的位置和大小
    if (mm.nextPoisonCircle) {
        mm.nextPoisonCircle.setLatLng(pc.center);
        mm.nextPoisonCircle.setRadius(pc.targetRadius);
        
        // 根据主游戏逻辑决定是否显示
        if (pc.targetRadius < pc.currentRadius) {
            mm.map.addLayer(mm.nextPoisonCircle);
        } else {
            mm.map.removeLayer(mm.nextPoisonCircle);
        }
    }
}

function updateGhostSmoothMovement(ghost, deltaTime) { 
    const gm = ghost.movement;
    if (!gm.isMoving || !ghost.marker || deltaTime <= 0 || !gm.startPositionLatLng || !gm.destinationNodeLatLng) {
        if (gm.isMoving && (!gm.startPositionLatLng || !gm.destinationNodeLatLng)) {
            gm.isMoving = false;
        }
        return;
    }
    let currentGhostSpeed = GHOST_MOVE_SPEED_METERS_PER_SECOND;
    if (ghost.isScared) currentGhostSpeed *= 0.7;
    const moveAmountThisFrame = currentGhostSpeed * (deltaTime / 1000);
    gm.distanceTraveledThisSegment += moveAmountThisFrame;
    if (gm.distanceTraveledThisSegment >= gm.totalDistanceToDestinationNode || gm.totalDistanceToDestinationNode < 0.1) {
        ghost.marker.setLatLng(gm.destinationNodeLatLng);
        gm.isMoving = false;
        if (ghost.isScattering && ghost.scatterTargetNode && positionsAreEqual([gm.destinationNodeLatLng.lat, gm.destinationNodeLatLng.lng], ghost.scatterTargetNode, 10)) { 
            ghost.isScattering = false;
            ghost.scatterTargetNode = null;
        }
    } else {
        const fraction = gm.distanceTraveledThisSegment / gm.totalDistanceToDestinationNode;
        const newLat = gm.startPositionLatLng.lat + (gm.destinationNodeLatLng.lat - gm.startPositionLatLng.lat) * fraction;
        const newLng = gm.startPositionLatLng.lng + (gm.destinationNodeLatLng.lng - gm.startPositionLatLng.lng) * fraction;
        ghost.marker.setLatLng([newLat, newLng]);
    }
}

function updatePacmanSmoothMovement(deltaTime) { 
    const pm = gameState.pacmanMovement;
    if (!gameState.pacman) return;
    if (!pm.isMoving || deltaTime <= 0) { 
        if (!gameState.autoPilotMode && !pm.isMoving && pm.lastIntendedDirectionKey && gameState.canMove && !gameState.isPaused) {
             tryStartMovementInDirection(pm.lastIntendedDirectionKey);
        }
        if (gameState.pacman && gameState.map) gameState.map.setView(gameState.pacman.getLatLng(), MAX_MAP_ZOOM, { animate: false }); 
        return; 
    }
    const currentPacmanSpeed = PACMAN_BASE_SPEED * gameState.pacmanSpeedMultiplier;
    const moveAmountThisFrame = currentPacmanSpeed * (deltaTime / 1000); 
    pm.distanceTraveledThisSegment += moveAmountThisFrame; 
    let newPacmanLatLng;
    if (pm.distanceTraveledThisSegment >= pm.totalDistanceToDestinationNode || pm.totalDistanceToDestinationNode < 0.1) { 
        newPacmanLatLng = pm.destinationNodeLatLng; 
        gameState.pacman.setLatLng(newPacmanLatLng); 
        pm.isMoving = false; 
        if (!gameState.autoPilotMode && pm.lastIntendedDirectionKey && gameState.canMove && !gameState.isPaused) {
             tryStartMovementInDirection(pm.lastIntendedDirectionKey);
        }
    } else { 
        const fraction = pm.distanceTraveledThisSegment / pm.totalDistanceToDestinationNode; 
        const newLat = pm.startPositionLatLng.lat + (pm.destinationNodeLatLng.lat - pm.startPositionLatLng.lat) * fraction; 
        const newLng = pm.startPositionLatLng.lng + (pm.destinationNodeLatLng.lng - pm.startPositionLatLng.lng) * fraction; 
        newPacmanLatLng = L.latLng(newLat, newLng); 
        gameState.pacman.setLatLng(newPacmanLatLng); 
    }
    if (gameState.map && newPacmanLatLng) gameState.map.setView(newPacmanLatLng, MAX_MAP_ZOOM, { animate: false });
    checkCollisions();
}

export function tryStartMovementInDirection(directionKey) {
    if (!gameState.pacman || gameState.pacmanMovement.isMoving) return;

    let currentPacmanLatLng = gameState.pacman.getLatLng();
    let currentPacmanNode = findNearestRoadPositionGeneric(currentPacmanLatLng.lat, currentPacmanLatLng.lng, gameState.validPositions);

    if (!currentPacmanNode) return;

    gameState.pacman.setLatLng(currentPacmanNode);
    currentPacmanLatLng = L.latLng(currentPacmanNode[0], currentPacmanNode[1]);
    const stepDistanceForDirection = 0.0001;
    let desiredLat = currentPacmanNode[0], desiredLng = currentPacmanNode[1];
    switch(directionKey) {
        case 'KeyW': desiredLat += stepDistanceForDirection; break;
        case 'KeyS': desiredLat -= stepDistanceForDirection; break;
        case 'KeyA': desiredLng -= stepDistanceForDirection; break;
        case 'KeyD': desiredLng += stepDistanceForDirection; break;
        default: return;
    }

    let bestCandidateNode = null, minAngleDiff = Math.PI;
    const neighbors = getNeighbors(currentPacmanNode);
    for (const neighborNode of neighbors) { 
         if (positionsAreEqual(currentPacmanNode, neighborNode)) continue; 
         const vecToNeighborY = neighborNode[0] - currentPacmanNode[0], vecToNeighborX = neighborNode[1] - currentPacmanNode[1]; 
         const desiredVecY = desiredLat - currentPacmanNode[0], desiredVecX = desiredLng - currentPacmanNode[1]; 
         const angleToNeighbor = Math.atan2(vecToNeighborY, vecToNeighborX), angleDesired = Math.atan2(desiredVecY, desiredVecX); 
         let angleDifference = Math.abs(angleToNeighbor - angleDesired); 
         if (angleDifference > Math.PI) angleDifference = 2 * Math.PI - angleDifference; 
         if (angleDifference < minAngleDiff && angleDifference < (Math.PI / 2 + 0.1)) {
             minAngleDiff = angleDifference;
             bestCandidateNode = neighborNode;
         } 
    }

    let newFacingDirection = gameState.pacmanMovement.currentFacingDirection;
    if (bestCandidateNode) {
        const pm = gameState.pacmanMovement;
        pm.startPositionLatLng = currentPacmanLatLng;
        pm.destinationNodeLatLng = L.latLng(bestCandidateNode[0], bestCandidateNode[1]);
        pm.totalDistanceToDestinationNode = pm.startPositionLatLng.distanceTo(pm.destinationNodeLatLng);

        if (pm.totalDistanceToDestinationNode > 0.1) {
            pm.distanceTraveledThisSegment = 0;
            pm.isMoving = true;
            const dy = bestCandidateNode[0] - currentPacmanNode[0], dx = bestCandidateNode[1] - currentPacmanNode[1];
            if (Math.abs(dx) > Math.abs(dy)) newFacingDirection = dx > 0 ? 'right' : 'left';
            else newFacingDirection = dy > 0 ? 'up' : 'down';
        } else {
            pm.isMoving = false;
        }
    } else {
        switch(directionKey) {
            case 'KeyW': newFacingDirection = 'up'; break;
            case 'KeyS': newFacingDirection = 'down'; break;
            case 'KeyA': newFacingDirection = 'left'; break;
            case 'KeyD': newFacingDirection = 'right'; break;
        }
        gameState.pacmanMovement.isMoving = false;
    }
    if (newFacingDirection !== gameState.pacmanMovement.currentFacingDirection || !gameState.pacmanMovement.isMoving) {
        gameState.pacmanMovement.currentFacingDirection = newFacingDirection;
        updatePacmanIconRotation();
    }
}

function checkCollisions() { 
    if (!gameState.pacman || gameState.isLosingLife) return; 
    const pacmanPos = gameState.pacman.getLatLng();
    
    const allItems = [...gameState.dots, ...gameState.powerPellets]; 
    allItems.forEach((item) => { 
        if (!gameState.map.hasLayer(item)) return; 
        const itemPos = item.getLatLng();
        if (pacmanPos.distanceTo(itemPos) < 5) { 
            collectItem(item);
        }
    });
    
    gameState.ghosts.forEach(ghost => { 
        if (!ghost.marker || !gameState.map.hasLayer(ghost.marker)) return; 
        const ghostElement = ghost.marker.getElement();
        if (ghostElement && ghostElement.classList.contains('ghost-eaten')) return; 

        const ghostPos = ghost.marker.getLatLng();
        if (pacmanPos.distanceTo(ghostPos) < 3) { 
            if (gameState.powerMode && ghost.isScared) {
                eatGhost(ghost);
            } else if (!ghost.isScared && !gameState.isRoundTransitioning) {
                loseLife(); 
            }
        }
    });

    const aq = gameState.questSystem.activeQuest;
    if (aq && aq.type === 'visit_poi') {

        // 1. 首先，获取小精靈当前所在的最近路网节点
        const pacmanCurrentNode = findNearestRoadPositionGeneric(pacmanPos.lat, pacmanPos.lng, gameState.validPositions);

        gameState.pois.forEach(poi => {
            if (poi.type === aq.poiType && !aq.visitedPoiIds.has(poi.id)) {
                
                // 2. 获取这个地标 Marker 所在的最近路网节点
                const poiMarkerPos = poi.marker.getLatLng();
                const poiNode = findNearestRoadPositionGeneric(poiMarkerPos.lat, poiMarkerPos.lng, gameState.validPositions);

                // 3. **进行判定**
                //    判定条件：玩家所在的节点，就是地标所在的节点
                if (positionsAreEqual(pacmanCurrentNode, poiNode)) {
                    // 玩家抵达了一个任务目标！
                    handleQuestProgress(poi);
                }
            }
        });
    }
    for (let i = gameState.foodItems.length - 1; i >= 0; i--) {
        const food = gameState.foodItems[i];
        const foodPos = food.marker.getLatLng();
        
        if (pacmanPos.distanceTo(foodPos) < 10) {
            // 碰到了！尝试捡取
            pickupFood(food, i);
        }
    }
}

function pickupFood(foodItem, indexInWorld) {
    const bp = gameState.backpack;

    // 寻找背包里的一个空格子
    const emptySlotIndex = bp.items.findIndex(slot => slot === null);

    if (emptySlotIndex !== -1) {
        // --- 背包有空位 ---
        
        // 1. 将物品放入背包
        bp.items[emptySlotIndex] = foodItem;

        // 2. 从地图上移除物品
        foodItem.marker.remove(); // 从地图上移除 Marker
        gameState.foodItems.splice(indexInWorld, 1); // 从世界物品数组中移除

        console.log(`捡取了 ${foodItem.name}，放入背包第 ${emptySlotIndex + 1} 格。`);

        // 在这里可以播放一个捡到东西的音效
        updateUI(); // 更新UI以显示背包内容
    } else {
        // --- 背包已满 ---
        console.log("背包已满，无法捡取！");
        // 在这里可以显示一个“背包已满”的提示
        //showNotification("背包已满！", 2000);
    }
}

export function useBackpackItem(slotIndex) {
    // 安全检查
    if (gameState.isPaused || gameState.isGameOver || gameState.isLosingLife) return;
    
    const bp = gameState.backpack;
    const item = bp.items[slotIndex];

    if (item) {
        // --- 格子里有物品 ---
        const hs = gameState.healthSystem;
        
        // 1. 回血
        hs.currentHealth += item.heal;
        // 确保血量不超过上限
        if (hs.currentHealth > hs.maxHealth) {
            hs.currentHealth = hs.maxHealth;
        }

        console.log(`使用了 ${item.name}，恢复了 ${item.heal} 点生命！当前血量: ${hs.currentHealth.toFixed(0)}`);
        
        // 在这里可以播放一个吃东西/回血的音效

        // 2. 从背包中移除已使用的物品
        bp.items[slotIndex] = null;

        // 3. 更新 UI
        updateUI();
    } else {
        console.log(`背包第 ${slotIndex + 1} 格是空的。`);
        // 可以播放一个“无效操作”的音效
    }
}

function collectItem(item) {
    const scoreBefore = gameState.score;
    gameState.score += item.points;

    if(gameState.map.hasLayer(item)) gameState.map.removeLayer(item);
    let itemArray;
    if (item.type === 'dot') {
        itemArray = gameState.dots;
        playDotSound();
        // 報告豆子收集事件
        if (isLoggedIn()) {
            reportDotCollected(gameState, scoreBefore, item.points).catch(console.warn);
        }
    } else if (item.type === 'power') {
        itemArray = gameState.powerPellets;
        activatePowerMode();
        playPowerPelletSound();
        gameState.powerPelletsEaten++; // 統計能量豆數量
        // 報告能量豆收集事件
        if (isLoggedIn()) {
            reportPowerPelletCollected(gameState, scoreBefore, item.points).catch(console.warn);
        }
    }

    if (itemArray) {
        const indexInArray = itemArray.indexOf(item);
        if (indexInArray > -1) itemArray.splice(indexInArray, 1);
    }
    gameState.dotsCollected++;
    updateUI();
    if (gameState.dots.length === 0 && gameState.powerPellets.length === 0 ) {
         if (gameState.totalDots > 0) nextLevel();
    }
}

function activatePowerMode() { 
    gameState.powerMode = true;
    gameState.ghosts.forEach(ghost => { 
        if (!ghost.marker) return;
        const ghostElement = ghost.marker.getElement(); 
        if (ghostElement && ghostElement.classList.contains('ghost-eaten')) return; 
        ghost.isScared = true; 
        const scaredIcon = createGhostIcon(ghost, true);
        ghost.marker.setIcon(scaredIcon); 
    });
    if (gameState.powerModeTimer) clearTimeout(gameState.powerModeTimer);
    gameState.powerModeTimer = setTimeout(deactivatePowerMode, 10000);
}

function deactivatePowerMode() { 
    gameState.powerMode = false;
    gameState.ghosts.forEach(ghost => { 
        if (!ghost.marker) return;
        ghost.isScared = false; 
        const ghostElement = ghost.marker.getElement(); 
        if (ghostElement && ghostElement.classList.contains('ghost-eaten')) return; 
        const normalIcon = createGhostIcon(ghost, false);
        ghost.marker.setIcon(normalIcon); 
    });
}

function eatGhost(ghost) {
    if (!ghost || !ghost.marker) return;
    const ghostElement = ghost.marker.getElement();
    if (ghostElement && ghostElement.classList.contains('ghost-eaten')) return;

    playEatGhostSound();
    const scoreBefore = gameState.score;
    gameState.score += 150;
    gameState.ghostsEaten++; // 統計吃掉的鬼怪數量

    // 報告吃鬼事件
    if (isLoggedIn()) {
        reportGhostEaten(gameState, scoreBefore, 150).catch(console.warn);
    }
    if (ghostElement) ghostElement.classList.add('ghost-eaten');
    ghost.movement.isMoving = false;

    setTimeout(() => {
        if (ghostElement) ghostElement.classList.remove('ghost-eaten');
        if (ghost.marker && ghost.originalPos) {
            ghost.marker.setLatLng(ghost.originalPos);

            // 判斷應該恢復成害怕圖示還是正常圖示
            const iconToSet = createGhostIcon(ghost, gameState.powerMode); // <--- 使用新函數
            ghost.marker.setIcon(iconToSet);
        }
    }, 500);
    updateUI();
}

function handleQuestProgress(visitedPoi) {
    const aq = gameState.questSystem.activeQuest;
    if (!aq || aq.visitedPoiIds.has(visitedPoi.id)) return; // 双重检查

    // 记录这个地标已被访问
    aq.visitedPoiIds.add(visitedPoi.id);
    aq.progress++;

    console.log(`抵达 "${visitedPoi.name}"！任务进度: ${aq.progress}/${aq.targetCount}`);
    playPowerPelletSound();
    
    updateUI(); // 更新UI显示进度

    // 检查任务是否完成
    if (aq.progress >= aq.targetCount) {
        completeQuest();
    }
}

function completeQuest() {
    const aq = gameState.questSystem.activeQuest;
    if (!aq) return;

    console.log(`任务完成: ${aq.description}`);
    
    // 1. 给予分数奖励
    gameState.score += aq.reward;
    console.log(`获得奖励分数: ${aq.reward}！`);

    // 2. *** 设置临时完成消息 ***
    const qs = gameState.questSystem;
    qs.completionMessage = `任務完成！+${aq.reward} 分`;

    // 3. 更新已完成任务计数
    qs.completedQuests++;
    
    // 4. 移除已完成的任务
    qs.activeQuest = null;

    // 5. 立即更新一次 UI，显示“任务完成”的消息
    updateUI();

    // 6. 设置一个计时器，在几秒后清除消息并生成新任务
    setTimeout(() => {
        // a. 清除完成消息
        qs.completionMessage = "";
        
        // b. 生成新任务
        generateNewQuest();
        
        // c. 再次更新 UI，显示新任务
        //    (generateNewQuest 内部已经调用了 updateUI，所以这里可能不需要再调用)
    }, 4000); // 消息显示 4 秒
}

function loseLife() {
    // 基础检查
    if (gameState.isGameOver || gameState.isRoundTransitioning) return;

    // 停止毒圈伤害
    if (gameState.poisonCircle.damageInterval) {
        clearInterval(gameState.poisonCircle.damageInterval);
        gameState.poisonCircle.damageInterval = null;
    }

    playDeathSound();

    // 記錄事件前的狀態
    const livesBefore = gameState.healthSystem.lives;
    const healthBefore = gameState.healthSystem.currentHealth;

    // 数据处理
    gameState.healthSystem.currentHealth = 0;
    gameState.healthSystem.lives--;

    // 報告失去生命事件
    if (isLoggedIn()) {
        reportLifeLost(gameState, livesBefore, healthBefore).catch(console.warn);
    }

    updateUI();

    if (gameState.healthSystem.lives <= 0) {
        gameState.healthSystem.lives = 0;
        updateUI();
        endGame(false);
    } else {
        startRoundTransition();
    }
}

function startRoundTransition() {
    gameState.isRoundTransitioning = true; // 开启“回合过渡中”状态
    gameState.canMove = false;

    const pacmanElement = gameState.pacman ? gameState.pacman.getElement() : null;
    if (pacmanElement) pacmanElement.classList.add('hidden');
    
    // ... (这里放入所有 Wasted 动画显示的代码) ...
    const wastedScreen = document.getElementById('wastedScreenOverlay');
    const wastedBanner = document.getElementById('wastedBanner'); 
    wastedBanner.style.opacity = '0'; 
    wastedScreen.style.display = 'flex'; 
    setTimeout(() => { wastedScreen.classList.add('active'); }, 100); 
    setTimeout(() => { if (wastedBanner) wastedBanner.style.opacity = '1'; }, 1000); 

    const transitionDuration = 3000;

    setTimeout(() => {
        // --- 重置回合状态 ---
        gameState.healthSystem.currentHealth = gameState.healthSystem.maxHealth;
        
        // ... (这里放入所有 Wasted 动画隐藏和角色位置重置的代码) ...
        wastedScreen.style.display = 'none';
        wastedScreen.classList.remove('active');
        if(wastedBanner) wastedBanner.style.opacity = '0';
        if (pacmanElement) pacmanElement.classList.remove('hidden');

        if (gameState.pacman && gameState.pacmanLevelStartPoint) {
            gameState.pacman.setLatLng(gameState.pacmanLevelStartPoint);
        }
        gameState.ghosts.forEach(ghost => { 
            if (ghost.marker && ghost.originalPos) { 
                ghost.marker.setLatLng(ghost.originalPos); 
                ghost.isScared = false;
                ghost.movement.isMoving = false;
                const normalIcon = createGhostIcon(ghost, false);
                ghost.marker.setIcon(normalIcon);
            } 
        });

        setTimeout(() => { 
            gameState.canMove = true; 
            gameState.isRoundTransitioning = false; // <-- 关闭“回合过渡中”状态
            updateUI(); 
            if (!gameState.isGameOver) startGhostDecisionMaking();
        }, 500);
    }, transitionDuration);
}

function nextLevel() { 
    gameState.level++; 
    gameState.gameTime = 600; 
    gameState.canMove = false;
    gameState.pacmanMovement.isMoving = false;
    gameState.pacmanMovement.lastIntendedDirectionKey = null;
    gameState.pacmanMovement.currentFacingDirection = 'left';

    if (gameState.pacman && gameState.map.hasLayer(gameState.pacman)) { 
        gameState.map.removeLayer(gameState.pacman); 
        gameState.pacman = null; 
    }
    gameState.ghosts.forEach(ghostObj => { 
        if (ghostObj.marker && gameState.map.hasLayer(ghostObj.marker)) gameState.map.removeLayer(ghostObj.marker); 
    });
    gameState.ghosts = [];

    // 使用當前地圖配置重新初始化遊戲元素
    const config = mapConfigs[gameState.currentMapIndex];
    const bounds = config.getBounds ? config.getBounds() : gameState.map.getBounds();
    initGameElements(gameState.pois, config.center, bounds);
    deactivatePowerMode();
    updateUI();
    if(gameState.pacman) updatePacmanIconRotation();
    startGameCountdown();
}

export async function endGame(victory) {
    gameState.isGameOver = true;
    gameState.canMove = false;
    stopAllBGM();
    if (gameLoopRequestId) cancelAnimationFrame(gameLoopRequestId);
    setGameLoopRequestId(null);
    if(gameState.gameTimer) clearInterval(gameState.gameTimer);
    if (ghostDecisionInterval) clearInterval(ghostDecisionInterval);
    setGhostDecisionInterval(null);
    if(gameState.powerModeTimer) clearTimeout(gameState.powerModeTimer);
    if(gameState.poisonCircle.damageInterval) clearInterval(gameState.poisonCircle.damageInterval);

    gameState.pacmanMovement.isMoving = false;
    gameState.pacmanMovement.lastIntendedDirectionKey = null;
    gameState.ghosts.forEach(g => { if(g.movement) g.movement.isMoving = false; });

    gameState.autoPilotMode = false;
    gameState.cleverMode = false;
    gameState.autoPilotPath = [];
    gameState.autoPilotTarget = null;

    const finalScore = calculateFinalScore(gameState.score);

    // 準備分數資料
    const gameEndTime = performance.now();
    const totalSurvivalTimeMs = gameEndTime - gameState.gameStartTime;
    const totalSurvivalTimeSec = Math.floor(totalSurvivalTimeMs / 1000);

    const scoreData = {
        score: finalScore,
        level: gameState.level,
        map_index: gameState.currentMapIndex,
        survival_time: totalSurvivalTimeSec,
        dots_collected: gameState.dotsCollected,
        ghosts_eaten: gameState.ghostsEaten || 0
    };

    // 根據登入狀態處理分數
    if (isLoggedIn()) {
        console.log('用戶已登入，提交分數到後端');
        try {
            await submitScoreDataToBackend(scoreData);
            console.log('分數提交成功');
        } catch (error) {
            console.log('分數提交失敗，保存到本地作為備份');
            saveLocalScore(scoreData);
        }
    } else {
        console.log('用戶未登入，保存分數到本地');
        saveLocalScore(scoreData);

        // 顯示登入提示（如果是高分）
        if (isHighScore(finalScore)) {
            showLoginPromptAfterGame(finalScore);
        }
    }

    // 更新本地排行榜（向後兼容）
    updateLeaderboard(gameState.score);

    // 隱藏手機虛擬方向鍵和暫停按鈕
    if (typeof window.mobileControls?.hideVirtualDPad === 'function') {
        window.mobileControls.hideVirtualDPad();
    }
    if (typeof window.mobileControls?.hideGamePauseButton === 'function') {
        window.mobileControls.hideGamePauseButton();
    }
    // 報告遊戲結束事件並結束驗證會話
    if (isLoggedIn()) {
        try {
            await reportGameEnd(gameState, victory);
            const survivalTime = Math.max(0, 600 - gameState.gameTime);
            await gameValidationService.endGameSession(
                finalScore,
                victory,
                survivalTime,
                gameState.dotsCollected,
                gameState.ghostsEaten
            );
        } catch (error) {
            console.warn('遊戲驗證結束失敗:', error);
        }
    }

    // 分數提交已在上面處理，這裡不需要重複提交
    document.getElementById('finalScore').textContent = finalScore;
    document.getElementById('gameOverTitle').textContent = victory ? '🎉 過關成功!' : ' 遊戲結束';
    document.getElementById('newHighScore').style.display = isNewRecord(finalScore) ? 'block' : 'none';
    document.getElementById('gameOverScreen').style.display = 'flex';

    // 播放結算 BGM
    playSettlementBGM();
}

/**
 * 判斷是否為高分
 */
function isHighScore(score) {
    const localScores = getLocalScores();
    if (localScores.length === 0) return score > 1000; // 如果沒有記錄，1000分以上算高分

    const topScore = Math.max(...localScores.map(s => s.score));
    return score > topScore * 0.8; // 超過最高分的80%算高分
}

/**
 * 顯示遊戲結束後的登入提示
 */
function showLoginPromptAfterGame(score) {
    // 檢查是否已經有提示元素
    let promptDiv = document.getElementById('loginPromptAfterGame');

    if (!promptDiv) {
        // 創建登入提示元素
        promptDiv = document.createElement('div');
        promptDiv.id = 'loginPromptAfterGame';
        promptDiv.className = 'login-prompt-after-game';

        // 添加到遊戲結束畫面
        const gameOverScreen = document.getElementById('gameOverScreen');
        if (gameOverScreen) {
            gameOverScreen.appendChild(promptDiv);
        }
    }

    promptDiv.innerHTML = `
        <div class="high-score-login-prompt">
            <h3>🏆 恭喜獲得高分！</h3>
            <p>您的分數：<strong>${score}</strong> 分</p>
            <p>🌟 登入即可：</p>
            <ul>
                <li>保存分數到雲端</li>
                <li>參與全球排行榜</li>
                <li>查看詳細遊戲統計</li>
                <li>同步所有本地記錄</li>
            </ul>
            <button class="pacman-pixel-button" onclick="showLoginModal()">
                立即登入
            </button>
            <button class="pacman-pixel-button" onclick="hideLoginPromptAfterGame()" style="background-color: #666;">
                稍後再說
            </button>
        </div>
    `;

    // 添加樣式
    promptDiv.style.cssText = `
        margin-top: 20px;
        padding: 20px;
        background: rgba(255, 255, 0, 0.1);
        border: 2px solid #ffff00;
        border-radius: 10px;
        text-align: center;
        max-width: 400px;
    `;

    promptDiv.style.display = 'block';
}

/**
 * 隱藏登入提示
 */
function hideLoginPromptAfterGame() {
    const promptDiv = document.getElementById('loginPromptAfterGame');
    if (promptDiv) {
        promptDiv.style.display = 'none';
    }
}

/**
 * 顯示登入模態框（簡單實作）
 */
function showLoginModal() {
    // 隱藏遊戲結束畫面，顯示主畫面的登入區域
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('startScreen').style.display = 'flex';

    // 滾動到登入區域
    const loginSection = document.getElementById('userAuthSection');
    if (loginSection) {
        loginSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// 將函數暴露到全域範圍，供 HTML 中的 onclick 使用
window.showLoginModal = showLoginModal;
window.hideLoginPromptAfterGame = hideLoginPromptAfterGame;

function updateLeaderboard(score) {
    if (typeof score === 'number') {
        leaderboard.push(score);
        leaderboard.sort((a, b) => b - a);
        if (leaderboard.length > 5){
            leaderboard.splice(5);
        }
    }
    updateLeaderboardUI();
}

function isNewRecord(score) {
    if (leaderboard.length === 0 && score > 0) return true;
    return score > 0 && score > Math.max(...leaderboard.filter(s => typeof s === 'number').concat(0));
}

function calculateFinalScore(baseScore) {
    if (gameState.gameStartTime === 0) {
        return baseScore;
    }

    // 1. 计算总存活时间（秒）
    const gameEndTime = performance.now();
    const totalSurvivalTimeMs = gameEndTime - gameState.gameStartTime;
    const totalSurvivalTimeSec = Math.floor(totalSurvivalTimeMs / 1000);

    console.log(`总存活时间: ${totalSurvivalTimeSec} 秒`);

    // 2. 计算生存时间奖励分数
    const survivalBonus = totalSurvivalTimeSec * 10;
    
    // 3. 计算最终总分
    const finalScore = baseScore + survivalBonus;

    console.log(`基础分数: ${baseScore}, 生存奖励: ${survivalBonus}, 最终总分: ${finalScore}`);
    
    return finalScore;
}

function initPoisonCircle() {
    const mapCenter = gameState.map.getCenter();
    const pc = gameState.poisonCircle;

    pc.center = mapCenter;
    pc.currentRadius = 800;
    pc.targetRadius = 800;
    pc.isShrinking = false;

    // 移除旧的 circleObject (如果存在)
    if (pc.circleObject && gameState.map.hasLayer(pc.circleObject)) {
        gameState.map.removeLayer(pc.circleObject);
        pc.circleObject = null;
    }
    if(pc.damageInterval) clearInterval(pc.damageInterval);

    pc.nextShrinkTime = performance.now() + 30000;
    
    // 确保计时器在游戏刚开始时被隐藏
    const minimapOverlay = document.getElementById('minimap-timer-overlay');
    if (minimapOverlay) {
        minimapOverlay.style.display = 'none'; 
    }


    // *** 新逻辑：设置 SVG ***
    setupPoisonCircleSVG();
    
    // 首次更新 SVG 的位置
    updatePoisonCircleSVG();

    pc.nextShrinkTime = performance.now() + 30000;
}

// --- *** 新增：觸發縮圈的函數 *** ---
function startNextShrink() {
    const pc = gameState.poisonCircle;
    
    // --- *** 步骤 1: 计算新的目标半径 (保持不变) *** ---
    const newTargetRadius = pc.currentRadius * 0.8;
    pc.targetRadius = Math.max(newTargetRadius, 50);

    // --- *** 步骤 2: 计算新的随机中心点 *** ---
    // 下一个安全区的圆心，必须在当前安全区内
    // 为了确保新的安全区完全被旧的包裹，新圆心的随机范围不能是整个旧圆
    // 随机范围的半径 = 旧半径 - 新半径
    const randomCenterRadius = pc.currentRadius - pc.targetRadius;
    
    if (randomCenterRadius > 0) {
        // 在这个更小的同心圆内随机选择一个新的中心点
        pc.center = getRandomPointInCircle(pc.center, randomCenterRadius);
    }
    // 如果 randomCenterRadius <= 0，意味着圈已经很小了，中心点保持不变

    // --- *** 步骤 3: 计算缩圈速度等 (保持不变) *** ---
    const shrinkDuration = 20000;
    const distanceToShrink = pc.currentRadius - pc.targetRadius;
    pc.shrinkSpeed = distanceToShrink / (shrinkDuration / 1000);

    pc.isShrinking = true;
    console.log(`毒圈开始缩小！新中心: ${pc.center.lat.toFixed(4)}, ${pc.center.lng.toFixed(4)}, 目标半径: ${pc.targetRadius.toFixed(0)} 公尺`);
    
    updatePoisonCircleSVG(); 
}

// --- *** 新增：毒圈 SVG 效果的初始化与更新函数 *** ---

let poisonSvgElements = {}; // 用来存储我们创建的 SVG 元素

function setupPoisonCircleSVG() {
    // 获取 Leaflet 用来绘制矢量图形的 SVG 面板
    const svgPane = gameState.map.getPane('overlayPane').querySelector('svg');
    if (!svgPane) return;

    // 创建一个 <defs> 元素，用来存放我们的遮罩定义
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    
    // 创建遮罩 <mask>
    const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
    mask.setAttribute("id", "safe-zone-mask");

    // 遮罩的背景：一个巨大的白色矩形（代表默认所有地方都不透明）
    const maskBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    maskBg.setAttribute("x", "-200%");
    maskBg.setAttribute("y", "-200%");
    maskBg.setAttribute("width", "600%");
    maskBg.setAttribute("height", "600%");
    maskBg.setAttribute("fill", "white");
    
    // 遮罩的前景：一个黑色的圆形，它就是要被“挖掉”的部分
    // 在 SVG mask 中，黑色代表完全透明
    const maskCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    maskCircle.setAttribute("cx", "50%");
    maskCircle.setAttribute("cy", "50%");
    maskCircle.setAttribute("r", "0"); // 初始半径为0
    maskCircle.setAttribute("fill", "black");

    mask.appendChild(maskBg);
    mask.appendChild(maskCircle);
    defs.appendChild(mask);
    
    // 创建覆盖整个地图的红色半透明矩形
    const poisonRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    poisonRect.setAttribute("x", "-200%");
    poisonRect.setAttribute("y", "-200%");
    poisonRect.setAttribute("width", "600%");
    poisonRect.setAttribute("height", "600%");
    poisonRect.setAttribute("fill", "red");
    poisonRect.setAttribute("fill-opacity", "0.25");
    poisonRect.setAttribute("mask", "url(#safe-zone-mask)"); // 应用我们的遮罩！
    poisonRect.style.pointerEvents = 'none'; // 确保它不影响鼠标交互

    // 创建下一圈的绿色边框
    const nextCircleBorder = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    nextCircleBorder.setAttribute("cx", "50%");
    nextCircleBorder.setAttribute("cy", "50%");
    nextCircleBorder.setAttribute("r", "0");
    nextCircleBorder.setAttribute("fill", "none");
    nextCircleBorder.setAttribute("stroke", "#00ff00");
    nextCircleBorder.setAttribute("stroke-width", "3");
    nextCircleBorder.setAttribute("stroke-opacity", "0.8");
    nextCircleBorder.style.pointerEvents = 'none';

    // 将这些元素添加到 SVG 面板
    svgPane.appendChild(defs);
    svgPane.appendChild(poisonRect);
    svgPane.appendChild(nextCircleBorder);

    // 存储这些元素的引用，方便后续更新
    poisonSvgElements = {
        maskCircle,
        poisonRect,
        nextCircleBorder
    };
}


function updatePoisonCircleSVG() {
    if (!poisonSvgElements.maskCircle) return;
    
    const pc = gameState.poisonCircle;
    
    // 将地理坐标和半径，转换为屏幕上的像素坐标和半径
    const centerPoint = gameState.map.latLngToLayerPoint(pc.center);
    
    // 计算当前半径在屏幕上的像素大小
    const edgeLatLng = L.latLng(pc.center.lat + (pc.currentRadius / 111320), pc.center.lng); // 粗略计算
    const edgePoint = gameState.map.latLngToLayerPoint(edgeLatLng);
    const radiusInPixels = centerPoint.y - edgePoint.y;

    // 计算下一个目标半径在屏幕上的像素大小
    const nextEdgeLatLng = L.latLng(pc.center.lat + (pc.targetRadius / 111320), pc.center.lng);
    const nextEdgePoint = gameState.map.latLngToLayerPoint(nextEdgeLatLng);
    const nextRadiusInPixels = centerPoint.y - nextEdgePoint.y;

    // 更新 SVG 元素的位置和大小
    poisonSvgElements.maskCircle.setAttribute("cx", centerPoint.x);
    poisonSvgElements.maskCircle.setAttribute("cy", centerPoint.y);
    poisonSvgElements.maskCircle.setAttribute("r", radiusInPixels);

    const border = poisonSvgElements.nextCircleBorder;
    
    // 只要目标半径和当前半径不同，就意味着有一个“预告”存在
    if (pc.targetRadius < pc.currentRadius) {
        border.setAttribute("cx", centerPoint.x);
        border.setAttribute("cy", centerPoint.y);
        border.setAttribute("r", nextRadiusInPixels);
        border.style.display = 'block';
    } else {
        border.style.display = 'none';
    }
}

function checkPlayerInPoison(timestamp) { // <-- 接收当前的时间戳
    if (!gameState.pacman || gameState.isLosingLife || gameState.isGameOver || gameState.isRoundTransitioning) {
        return;
    }

    const pc = gameState.poisonCircle;
    const pacmanPos = gameState.pacman.getLatLng();
    const distanceToCenter = pacmanPos.distanceTo(pc.center);

    if (distanceToCenter > pc.currentRadius) {
        // --- *** 新的扣血逻辑 *** ---
        // 检查是否已经过了冷却时间
        if (timestamp - pc.lastDamageTime > pc.damageCooldown) {
            pc.lastDamageTime = timestamp; // 更新上次伤害的时间

            const hs = gameState.healthSystem;
            hs.currentHealth -= pc.damagePerTick;
            
            if (hs.currentHealth <= 0) {
                hs.currentHealth = 0;
                loseLife();
            }
            
            updateUI();
        }
    }
}



export function pauseGame() {
    if (gameState.isGameOver || gameState.isLosingLife) return;

    // 降低當前 BGM 音量（降到設定音量的一半）
    const bgmVolume = window.gameSettings?.getSetting('bgmVolume') || 0.7;
    setCurrentBGMVolume(bgmVolume * 0.5);

    // 記錄暫停時間，用於恢復時調整毒圈倒數
    gameState.pauseStartTime = performance.now();

    gameState.isPaused = true;
    if (ghostDecisionInterval) clearInterval(ghostDecisionInterval);
    setGhostDecisionInterval(null);
    document.getElementById('pauseScreen').style.display = 'flex';
}

// 暴露 pauseGame 到全域範圍
if (typeof window !== 'undefined') {
    window.pauseGame = pauseGame;
}

export function resumeGame() {
    // 恢復當前 BGM 音量到設定值
    const bgmVolume = window.gameSettings?.getSetting('bgmVolume') || 0.7;
    setCurrentBGMVolume(bgmVolume);

    // 計算暫停時間並調整毒圈倒數
    if (gameState.pauseStartTime) {
        const pauseDuration = performance.now() - gameState.pauseStartTime;
        gameState.poisonCircle.nextShrinkTime += pauseDuration;
        console.log('🔄 恢復遊戲，調整毒圈倒數時間:', pauseDuration, 'ms');
        gameState.pauseStartTime = null;
    }

    gameState.isPaused = false;
    setLastFrameTime(performance.now());
    if (!gameState.isGameOver && !gameState.isLosingLife) startGhostDecisionMaking();
    document.getElementById('pauseScreen').style.display = 'none';
}

export function restartGame() {
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('gameUI').style.display = 'none';
    gameState.level = 1;
    initGame().catch(error => {
        console.error('重新開始遊戲失敗:', error);
    });
}

export function backToMenu() { 
    document.getElementById('pauseScreen').style.display = 'none'; 
    document.getElementById('gameOverScreen').style.display = 'none'; 
    document.getElementById('gameUI').style.display = 'none'; 
    const minimapContainer = document.getElementById('minimap-container');
    if (minimapContainer) {
        minimapContainer.style.display = 'none';
    }
    const backpackContainer = document.getElementById('backpack-ui');
    if (backpackContainer) {
        backpackContainer.style.display = 'none';
    }
    document.getElementById('mapSelectionScreen').style.display = 'none'; 
    document.getElementById('instructionsContent').style.display = 'none'; 
    document.getElementById('leaderboardContent').style.display = 'none';
    document.getElementById('startScreen').style.display = 'flex';

    // 隱藏手機虛擬方向鍵和暫停按鈕
    if (typeof window.mobileControls?.hideVirtualDPad === 'function') {
        window.mobileControls.hideVirtualDPad();
    }
    if (typeof window.mobileControls?.hideGamePauseButton === 'function') {
        window.mobileControls.hideGamePauseButton();
    }

    // 回到主選單時顯示觸控指示器
    if (typeof window.mobileControls?.showTouchIndicator === 'function') {
        window.mobileControls.showTouchIndicator();
    }

    stopAllBGM();
    if (gameLoopRequestId) cancelAnimationFrame(gameLoopRequestId);
    setGameLoopRequestId(null);
    if(gameState.gameTimer) clearInterval(gameState.gameTimer);
    if (ghostDecisionInterval) clearInterval(ghostDecisionInterval);
    setGhostDecisionInterval(null);
    if(gameState.powerModeTimer) clearTimeout(gameState.powerModeTimer);
    if(gameState.poisonCircle.damageInterval) clearInterval(gameState.poisonCircle.damageInterval);
    
    gameState.pacmanMovement.isMoving = false;
    gameState.pacmanMovement.lastIntendedDirectionKey = null; 
    gameState.ghosts.forEach(g => {if(g.movement) g.movement.isMoving = false;}); 
    
    if (gameState.map) {
        gameState.map.remove();
        gameState.map = null;
    } 

    initStartScreenBackground().catch(error => {
        console.error('背景動畫重新初始化失敗:', error);
    });

    // 播放首頁 BGM
    playHomepageBGM();
}

/**
 * 提交分數到後端
 * @param {number} finalScore - 最終分數
 * @param {boolean} victory - 是否勝利
 */
async function submitScoreToBackend(finalScore, victory) {
    // 檢查用戶是否已登入
    if (!isLoggedIn()) {
        console.log('ℹ️ 用戶未登入，跳過分數提交');
        return;
    }

    try {
        console.log('📊 開始提交分數到後端...', {
            score: finalScore,
            victory: victory,
            level: gameState.level,
            mapIndex: gameState.currentMapIndex
        });

        // 計算遊戲統計數據
        const gameStats = calculateGameStats();

        // 準備分數數據
        const scoreData = {
            score: finalScore,
            level: gameState.level,
            map_index: gameState.currentMapIndex || 0,
            survival_time: Math.max(0, 600 - gameState.gameTime), // 存活時間（秒）
            dots_collected: gameState.dotsCollected || 0,
            ghosts_eaten: gameStats.ghostsEaten || 0
        };

        console.log('📤 提交分數數據:', scoreData);

        // 發送到後端
        const response = await authenticatedFetch('http://localhost:8000/game/score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(scoreData)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ 分數提交成功:', result);

        // 顯示成功訊息
        showScoreSubmissionMessage('分數已成功提交到排行榜！', 'success');

        // 更新排行榜 UI
        setTimeout(() => {
            updateLeaderboardUI();
        }, 1000);

    } catch (error) {
        console.error('❌ 分數提交失敗:', error);

        // 顯示錯誤訊息
        if (error.message.includes('登入已過期')) {
            showScoreSubmissionMessage('登入已過期，請重新登入後再試', 'error');
        } else {
            showScoreSubmissionMessage('分數提交失敗，但已保存到本地記錄', 'warning');
        }
    }
}

/**
 * 計算遊戲統計數據
 */
function calculateGameStats() {
    // 這裡可以添加更多統計數據的計算
    // 目前先返回基本數據
    return {
        ghostsEaten: gameState.ghostsEaten || 0,
        powerPelletsEaten: gameState.powerPelletsEaten || 0,
        totalGameTime: 600 - gameState.gameTime
    };
}

/**
 * 顯示分數提交訊息
 * @param {string} message - 訊息內容
 * @param {string} type - 訊息類型 ('success', 'error', 'warning')
 */
function showScoreSubmissionMessage(message, type = 'info') {
    // 創建訊息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `score-submission-message ${type}`;
    messageDiv.textContent = message;

    // 添加樣式
    messageDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        transition: opacity 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
        ${type === 'success' ? 'background-color: #28a745;' : ''}
        ${type === 'error' ? 'background-color: #dc3545;' : ''}
        ${type === 'warning' ? 'background-color: #ffc107; color: #212529;' : ''}
        ${type === 'info' ? 'background-color: #17a2b8;' : ''}
    `;

    document.body.appendChild(messageDiv);

    // 5秒後自動移除
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }, 5000);
}