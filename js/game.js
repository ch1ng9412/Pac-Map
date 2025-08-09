import { gameState, mapConfigs, MAX_MAP_ZOOM, NUMBER_OF_GHOSTS, PACMAN_BASE_SPEED, GHOST_MOVE_SPEED_METERS_PER_SECOND, MAX_DELTA_TIME, leaderboard, gameLoopRequestId, ghostDecisionInterval, lastFrameTime, setGameLoopRequestId, setGhostDecisionInterval, setLastFrameTime } from './gameState.js';
import { soundsReady, setupSounds, playStartSound, playDotSound, playPowerPelletSound, playEatGhostSound, playDeathSound } from './audio.js';
import { updateUI, updateLeaderboardUI, updatePacmanIconRotation, showLoadingScreen, hideLoadingScreen } from './ui.js';
import { stopBackgroundAnimation, initStartScreenBackground } from './backgroundAnimation.js';
import { fetchRoadData, generateRoadNetworkGeneric, findNearestRoadPositionGeneric, drawVisualRoads, getRandomPointInCircle } from './map.js';
import { decideNextGhostMoves, manageAutoPilot, getNeighbors, positionsAreEqual } from './ai.js';
import { logToDevConsole } from './devConsole.js';

const bgmAudio = document.getElementById('bgm');
if (bgmAudio) {
    bgmAudio.volume = 0.5; // 设定一个合适的初始音量 (0.0 到 1.0)
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

    if (gameState.map) gameState.map.invalidateSize();

    resetGameState(); 
    showLoadingScreen('正在獲取地圖資料...');

    const bounds = config.bounds; 
    const roadData = await fetchRoadData(bounds);
    await generateRoadNetworkGeneric(bounds, roadData, gameState); 

    setTimeout(() => {
        hideLoadingScreen();
        if (gameState.validPositions.length === 0) {
            showLoadingScreen('地圖數據載入失敗，請檢查網絡或稍後重試。');
            console.error('無法初始化遊戲元素，因為沒有有效的道路位置。');
            return;
        }
        initGameElements(); 
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
        // Mask defs 可以保留，或者也一并移除
    }
    poisonSvgElements = {};

    setGameLoopRequestId(null);
    setGhostDecisionInterval(null);
    setLastFrameTime(0);

    gameState.score = 0; gameState.lives = 3; gameState.gameTime = 600; 
    gameState.isPaused = false; gameState.isGameOver = false; gameState.isLosingLife = false; 
    gameState.powerMode = false; gameState.dotsCollected = 0;
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

function initGameElements() { 
    const center = gameState.map.getCenter();
    const bounds = gameState.map.getBounds();
    
    if (gameState.validPositions.length === 0) { console.error("No valid positions to place game elements."); return; }

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
    updateUI();
}

function createPacman(center) { 
    if (gameState.validPositions.length === 0) return;
    const pacmanCustomIcon = L.divIcon({ className: 'pacman-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
    const roadPos = findNearestRoadPositionGeneric(center.lat, center.lng, gameState.validPositions); 
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
    const baseGhostColors = ['red', 'pink', 'cyan', 'orange', 'purple', 'green', 'blue']; 
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
    countdown.style.display = 'block';
    let count = 3;
    gameState.canMove = false;
    const countInterval = setInterval(() => {
        countdown.textContent = count;
        count--;
        if (count < 0) {
            clearInterval(countInterval);
            countdown.style.display = 'none';
            gameState.canMove = true;
            startGame();
        }
    }, 1000);
}

async function startGame() { 
    document.getElementById('gameUI').style.display = 'block';
    
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
        await Tone.start();
        console.log("音訊內容已啟動");
    }
    if (!soundsReady) { 
        setupSounds();
    }
    playStartSound();

    if (bgmAudio && bgmAudio.paused) {
        // 使用 .play() 方法。它会返回一个 Promise。
        // 我们用 .catch() 来处理浏览器可能因为自动播放策略而阻止播放的错误。
        bgmAudio.play().catch(error => {
            console.warn("BGM 自动播放被浏览器阻止:", error);
            // 提示玩家手动开启声音
        });
    }

    gameState.gameStartTime = performance.now();
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
    if (gameState.isGameOver || gameState.isPaused) {
        setLastFrameTime(timestamp); 
        setGameLoopRequestId(requestAnimationFrame(gameLoop));
        return;
    }
    manageAutoPilot(); 

    let rawDeltaTime = timestamp - lastFrameTime;
    if (rawDeltaTime > MAX_DELTA_TIME) {
        rawDeltaTime = MAX_DELTA_TIME;
    }
    setLastFrameTime(timestamp);

    let deltaTime = rawDeltaTime * gameState.gameSpeedMultiplier; 
    
    const pc = gameState.poisonCircle;

    // 1. 检查是否到了该启动新一轮缩圈的时间
    if (!pc.isShrinking && timestamp > pc.nextShrinkTime) {
        startNextShrink();
    }

    // 2. 如果正在缩圈，就更新半径
    if (pc.isShrinking) {
        pc.currentRadius -= pc.shrinkSpeed * (deltaTime / 1000);
        
        // 检查是否已经到达目标
        if (pc.currentRadius <= pc.targetRadius) {
            pc.currentRadius = pc.targetRadius;
            pc.isShrinking = false; // 标记本轮缩小结束
            console.log("毒圈缩小完成！");

            // *** 关键逻辑：缩小完成后，立即准备下一轮 ***
            // 重新计算下一轮的目标，但不立即开始缩小
            const nextTargetRadius = pc.currentRadius * 0.8;
            pc.targetRadius = Math.max(nextTargetRadius, 50);

            const randomCenterRadius = pc.currentRadius - pc.targetRadius;
            if (randomCenterRadius > 0) {
                pc.center = getRandomPointInCircle(pc.center, randomCenterRadius);
            }
            
            // 设置下一次“开始缩小”的时间戳
            pc.nextShrinkTime = performance.now() + 30000; // 30秒后
            
            console.log(`下一轮预告已显示。将在 30 秒后开始缩小。`);
        }
    }
    
    updatePoisonCircleSVG();
    // 檢查玩家是否在圈外
    checkPlayerInPoison();

    updatePacmanSmoothMovement(deltaTime); 
    gameState.ghosts.forEach(ghost => {
        const ghostElement = ghost.marker ? ghost.marker.getElement() : null;
        if (!(ghostElement && ghostElement.classList.contains('ghost-eaten'))) {
            updateGhostSmoothMovement(ghost, deltaTime); 
        }
    });

    setGameLoopRequestId(requestAnimationFrame(gameLoop));
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
}

function collectItem(item) { 
    gameState.score += item.points;
    if(gameState.map.hasLayer(item)) gameState.map.removeLayer(item);
    let itemArray;
    if (item.type === 'dot') {
        itemArray = gameState.dots;
        playDotSound();
    } else if (item.type === 'power') {
        itemArray = gameState.powerPellets;
        activatePowerMode();
        playPowerPelletSound();
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
    gameState.score += 150;
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

function loseLife() {
    // 基础检查
    if (gameState.isGameOver || gameState.isRoundTransitioning) return;

    // 停止毒圈伤害
    if (gameState.poisonCircle.damageInterval) {
        clearInterval(gameState.poisonCircle.damageInterval);
        gameState.poisonCircle.damageInterval = null;
    }

    playDeathSound();

    // 数据处理
    gameState.healthSystem.currentHealth = 0;
    gameState.healthSystem.lives--;
    updateUI();

    if (gameState.healthSystem.lives <= 0) {
        gameState.healthSystem.lives = 0;
        updateUI();
        setTimeout(() => endGame(false), 1500);
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

    initGameElements(); 
    deactivatePowerMode();
    updateUI();
    if(gameState.pacman) updatePacmanIconRotation();
    startGameCountdown();
}

export function endGame(victory) { 
    gameState.isGameOver = true;
    gameState.canMove = false;
    stopBGM();
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
    updateLeaderboard(gameState.score);
    document.getElementById('finalScore').textContent = finalScore;
    document.getElementById('gameOverTitle').textContent = victory ? '🎉 過關成功!' : ' 遊戲結束';
    document.getElementById('newHighScore').style.display = isNewRecord(finalScore) ? 'block' : 'none';
    document.getElementById('gameOverScreen').style.display = 'flex';
}

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
    maskBg.setAttribute("x", "-100%");
    maskBg.setAttribute("y", "-100%");
    maskBg.setAttribute("width", "300%");
    maskBg.setAttribute("height", "300%");
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
    poisonRect.setAttribute("x", "-100%");
    poisonRect.setAttribute("y", "-100%");
    poisonRect.setAttribute("width", "300%");
    poisonRect.setAttribute("height", "300%");
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

function checkPlayerInPoison() {
    if (!gameState.pacman || gameState.isRoundTransitioning || gameState.isGameOver) return;

    const pc = gameState.poisonCircle;
    const pacmanPos = gameState.pacman.getLatLng();

    const distanceToCenter = pacmanPos.distanceTo(pc.center);

    if (distanceToCenter > pc.currentRadius) {
        // 玩家在圈外
        if (!pc.damageInterval) {
            pc.damageInterval = setInterval(() => {
                const hs = gameState.healthSystem;
                hs.currentHealth -= 5; // 每次扣 5 點血
                
                if (hs.currentHealth <= 0) {
                    hs.currentHealth = 0;
                    loseLife(); // 當前血條空了，觸發失命邏輯
                }
                
                updateUI();
            }, 500); // 每半秒扣一次
        }
    } else {
        // 玩家在圈內，停止扣血
        if (pc.damageInterval) {
            clearInterval(pc.damageInterval);
            pc.damageInterval = null;
        }
    }
}

function stopBGM() {
    if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio.currentTime = 0; // 将播放进度重置到 0
    }
}

export function pauseGame() { 
    if (gameState.isGameOver || gameState.isLosingLife) return; 

    if (bgmAudio) {
        bgmAudio.volume = 0.2;
    }

    gameState.isPaused = true; 
    if (ghostDecisionInterval) clearInterval(ghostDecisionInterval); 
    setGhostDecisionInterval(null); 
    document.getElementById('pauseScreen').style.display = 'flex'; 
}

export function resumeGame() { 
    if (bgmAudio) {
        bgmAudio.volume = 0.5;
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
    initGame();
}

export function backToMenu() { 
    document.getElementById('pauseScreen').style.display = 'none'; 
    document.getElementById('gameOverScreen').style.display = 'none'; 
    document.getElementById('gameUI').style.display = 'none'; 
    document.getElementById('mapSelectionScreen').style.display = 'none'; 
    document.getElementById('instructionsContent').style.display = 'none'; 
    document.getElementById('leaderboardContent').style.display = 'none';
    document.getElementById('startScreen').style.display = 'flex'; 

    stopBGM();
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

    initStartScreenBackground(); 
}