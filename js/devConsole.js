import { gameState, NUMBER_OF_GHOSTS, gameLoopRequestId, ghostDecisionInterval, setGhostDecisionInterval } from './gameState.js';
import { pauseGame, resumeGame, endGame, createGhosts, startGhostDecisionMaking } from './game.js';
import { updateUI } from './ui.js';
import { findNearestRoadPositionGeneric } from './map.js';
import { positionsAreEqual } from './ai.js';

// 作弊模式狀態
let isCheatModeUnlocked = false;

const devConsole = document.getElementById('devConsole');
const devConsoleInput = document.getElementById('devConsoleInput');
const devConsoleOutput = document.getElementById('devConsoleOutput');

export function toggleDevConsole() {
    gameState.isDevConsoleOpen = !gameState.isDevConsoleOpen;
    devConsole.style.display = gameState.isDevConsoleOpen ? 'block' : 'none';
    if (gameState.isDevConsoleOpen) {
        devConsoleInput.focus();
        if (!gameState.isPaused && !gameState.isGameOver && !gameState.isLosingLife) { 
            pauseGame();
        }
    } else {
        if (gameState.isPaused && !gameState.isGameOver && !gameState.isLosingLife) { 
            resumeGame();
        }
    }
}

export function logToDevConsole(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `[${type.toUpperCase()}] ${message}`;
    if (type === 'error') p.style.color = '#f00'; 
    else if (type === 'warn') p.style.color = '#ff0'; 
    else if (type === 'success') p.style.color = '#0f0'; 
    else if (type === 'input') p.style.color = '#88f'; 
    else p.style.color = '#ccc'; 
    devConsoleOutput.appendChild(p);
    devConsoleOutput.scrollTop = devConsoleOutput.scrollHeight;
}

function showAllCommands() {
    logToDevConsole("🔓 作弊模式指令列表:", 'info');
    logToDevConsole("", 'info');
    logToDevConsole("遊戲控制:", 'info');
    logToDevConsole("  nl - 直接獲勝", 'info');
    logToDevConsole("  speed [倍數] - 調整小精靈速度 (預設1x/2x切換)", 'info');
    logToDevConsole("  godmode - 切換無敵模式", 'info');
    logToDevConsole("  noobmode - 移除所有鬼怪", 'info');
    logToDevConsole("", 'info');
    logToDevConsole("自動化:", 'info');
    logToDevConsole("  auto - 切換基本自動吃點", 'info');
    logToDevConsole("  clever - 切換聰明自動吃點 (避開鬼怪)", 'info');
    logToDevConsole("", 'info');
    logToDevConsole("遊戲資源:", 'info');
    logToDevConsole("  score [分數] - 增加分數 (預設+10000)", 'info');
    logToDevConsole("  filldots - 重新填滿所有豆子", 'info');
    logToDevConsole("", 'info');
    logToDevConsole("調試工具:", 'info');
    logToDevConsole("  ghosts - 觀察每個鬼怪的XY座標", 'info');
    logToDevConsole("  default - 重設所有指令效果", 'info');
    logToDevConsole("  help - 顯示此幫助訊息", 'info');
    logToDevConsole("", 'info');
    logToDevConsole("⚠️  注意：使用任何作弊指令後，分數將不會計入排行榜！", 'warn');
}

function processDevCommand(command) {
    logToDevConsole(`${command}`, 'input');
    const args = command.trim().split(' ');
    const cmd = args[0].toLowerCase();
    const param1 = args[1] ? args[1].toLowerCase() : null;

    // 檢查是否為 unlock 指令
    if (cmd === 'unlock') {
        isCheatModeUnlocked = true;
        gameState.isCheatModeActive = true; // 標記作弊模式已啟用
        logToDevConsole("🔓 作弊模式已解鎖！", 'success');
        logToDevConsole("⚠️  警告：使用作弊指令後分數將不會計入排行榜！", 'warn');
        logToDevConsole("輸入 'help' 查看可用指令。", 'info');
        return;
    }

    // 檢查是否為 help 指令（help 指令不需要解鎖）
    if (cmd === 'help') {
        if (!isCheatModeUnlocked) {
            logToDevConsole("可用指令:", 'info');
            logToDevConsole("  unlock - 解鎖作弊模式", 'info');
            logToDevConsole("  help - 顯示此幫助訊息", 'info');
            logToDevConsole("", 'info');
            logToDevConsole("⚠️  請先輸入 'unlock' 解鎖作弊模式才能使用其他指令", 'warn');
        } else {
            showAllCommands();
        }
        return;
    }

    // 檢查作弊模式是否已解鎖
    if (!isCheatModeUnlocked) {
        logToDevConsole("❌ 作弊模式未解鎖！請先輸入 'unlock' 解鎖作弊模式。", 'error');
        return;
    }

    switch(cmd) {
        case 'nl':
            if (gameState.isGameOver) { logToDevConsole("遊戲已經結束。", 'warn'); break; }
            logToDevConsole("執行指令: nl (直接獲勝)", 'success');
            endGame(true); 
            break;
        case 'speed':
            let newMultiplier = parseFloat(param1);
            if (isNaN(newMultiplier)) { 
                gameState.pacmanSpeedMultiplier = (gameState.pacmanSpeedMultiplier === 1.0) ? 2.0 : 1.0;
                logToDevConsole(`小精靈速度調整為 ${gameState.pacmanSpeedMultiplier}x`, "success");
            } else {
                if (newMultiplier >= 0.1 && newMultiplier <= 10) { 
                    gameState.pacmanSpeedMultiplier = newMultiplier;
                    logToDevConsole(`小精靈速度設定為 ${gameState.pacmanSpeedMultiplier}x`, "success");
                } else {
                    logToDevConsole("無效的速度倍率 (0.1 - 10)", "error");
                }
            }
            break;
        case 'godmode':
            gameState.godMode = !gameState.godMode;
            logToDevConsole(`無敵模式 ${gameState.godMode ? '已開啟' : '已關閉'}`, "success");
            break;
        case 'score':
            let amount = parseInt(param1);
            if (isNaN(amount) || amount <= 0)  amount = 10000; 
            gameState.score += amount; updateUI();
            logToDevConsole(`分數已增加 ${amount}。目前分數: ${gameState.score}`, "success");
            break;
        case 'noobmode':
            if (ghostDecisionInterval) clearInterval(ghostDecisionInterval);
            setGhostDecisionInterval(null);
            gameState.ghosts.forEach(ghost => { if (ghost.marker && gameState.map.hasLayer(ghost.marker)) gameState.map.removeLayer(ghost.marker); });
            gameState.ghosts = [];
            logToDevConsole("所有鬼怪已移除 (新手模式啟動！)", "success");
            break;
        case 'auto':
            gameState.cleverMode = false; 
            gameState.autoPilotMode = !gameState.autoPilotMode;
            if (gameState.autoPilotMode) {
                logToDevConsole("基本自動吃點模式已開啟。", "success");
                gameState.autoPilotPath = []; gameState.autoPilotTarget = null;
            } else {
                logToDevConsole("基本自動吃點模式已關閉。", "success");
                gameState.autoPilotPath = []; gameState.autoPilotTarget = null;
            }
            break;
        case 'clever':
            gameState.autoPilotMode = false; 
            gameState.cleverMode = !gameState.cleverMode;
             if (gameState.cleverMode) {
                gameState.autoPilotMode = true; 
                logToDevConsole("聰明自動吃點模式已開啟。", "success");
                gameState.autoPilotPath = []; gameState.autoPilotTarget = null;
            } else {
                gameState.autoPilotMode = false; 
                logToDevConsole("聰明自動吃點模式已關閉。", "success");
                gameState.autoPilotPath = []; gameState.autoPilotTarget = null;
            }
            break;
        case 'filldots':
            logToDevConsole("重新生成所有點數...", "info");
            gameState.dots.forEach(dot => {if(gameState.map.hasLayer(dot)) gameState.map.removeLayer(dot)}); 
            gameState.powerPellets.forEach(pellet => {if(gameState.map.hasLayer(pellet)) gameState.map.removeLayer(pellet)}); 
            gameState.dots = []; gameState.powerPellets = []; 
            let tempAvailablePositions = [...gameState.validPositions];
            const pacmanCurrentNode = findNearestRoadPositionGeneric(gameState.pacman.getLatLng().lat, gameState.pacman.getLatLng().lng, gameState.validPositions);
            tempAvailablePositions = tempAvailablePositions.filter(p => !positionsAreEqual(p, pacmanCurrentNode));
            gameState.ghostSpawnPoints.forEach(spawnPoint => { if(spawnPoint) tempAvailablePositions = tempAvailablePositions.filter(p => !positionsAreEqual(p, spawnPoint)); });
            
            const numPowerPelletsToFill = Math.min(Math.floor(tempAvailablePositions.length * 0.05), 8); 
            for (let i = 0; i < numPowerPelletsToFill; i++) { if (tempAvailablePositions.length === 0) break; const randomIndex = Math.floor(Math.random() * tempAvailablePositions.length); const position = tempAvailablePositions.splice(randomIndex, 1)[0]; const pelletIcon = L.divIcon({ className: 'power-pellet', iconSize: [12, 12], iconAnchor: [6, 6] }); const pellet = L.marker(position, { icon: pelletIcon }).addTo(gameState.map); pellet.type = 'power'; pellet.points = 50; gameState.powerPellets.push(pellet); }
            tempAvailablePositions.forEach(position => { const dotIcon = L.divIcon({ className: 'dot', iconSize: [4, 4], iconAnchor: [2, 2] }); const dot = L.marker(position, { icon: dotIcon }).addTo(gameState.map); dot.type = 'dot'; dot.points = 20; gameState.dots.push(dot); });
            gameState.totalDots = gameState.dots.length + gameState.powerPellets.length; 
            gameState.dotsCollected = 0; updateUI();
            logToDevConsole("地圖點數已重新填滿。", "success");
            break;
        case 'default':
            logToDevConsole("重設所有開發者指令效果...", "info");
            gameState.pacmanSpeedMultiplier = 1.0;
            gameState.godMode = false;
            gameState.autoPilotMode = false;
            gameState.cleverMode = false;
            gameState.autoPilotPath = [];
            gameState.autoPilotTarget = null;

            // 重設作弊模式狀態
            isCheatModeUnlocked = false;
            gameState.isCheatModeActive = false;

            logToDevConsole("速度、無敵、自動模式已重設。", "success");
            logToDevConsole("🔒 作弊模式已重新鎖定，分數將正常計入排行榜。", "success");

            if (gameState.ghosts.length === 0 && NUMBER_OF_GHOSTS > 0 && !gameState.isGameOver && !gameState.isLosingLife) {
                logToDevConsole("嘗試恢復鬼怪...", "info");
                createGhosts(); 
                startGhostDecisionMaking(); 
                logToDevConsole("鬼怪已恢復 (Noob模式效果已移除)。", "success");
            } else if (gameState.ghosts.length > 0 && !ghostDecisionInterval && !gameState.isGameOver && !gameState.isLosingLife) {
                startGhostDecisionMaking();
                logToDevConsole("鬼怪AI已重新啟動。", "success");
            }
            if (gameState.isPaused && devConsole.style.display === 'none' && !gameState.isGameOver && !gameState.isLosingLife) {
                resumeGame();
            }
            break;
        case 'ghosts':
            if (gameState.ghosts && gameState.ghosts.length > 0) {
                logToDevConsole("目前鬼怪狀態:", 'info');

                // 準備一個陣列來儲存要輸出的資訊
                const ghostInfo = gameState.ghosts.map((ghost, index) => {
                    if (!ghost.marker) {
                        return { index, color: ghost.color, error: "Marker not available" };
                    }
                    // 使用 getLatLng() 獲取鬼怪的即時位置
                    const position = ghost.marker.getLatLng();
                    return {
                        index: index,
                        color: ghost.color,
                        lat: position.lat, // 緯度 (通常對應 Y)
                        lng: position.lng, // 經度 (通常對應 X)
                        isScared: ghost.isScared
                    };
                });

                // 使用 console.table() 來生成一個漂亮的表格輸出
                // 這是比 console.log 更清晰的選擇
                console.table(ghostInfo);
                
                logToDevConsole("鬼怪狀態已打印至瀏覽器主控台。", 'success');
            } else {
                logToDevConsole("No ghosts are currently in the game.", 'warn');
            }
            break;

        default:
            logToDevConsole(`未知指令: ${cmd}`, 'error');
            break;
    }
}

export function setupDevConsoleListeners() {
    devConsoleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const command = devConsoleInput.value;
            if (command.trim() !== '') {
                processDevCommand(command);
            }
            devConsoleInput.value = ''; 
        } else if (e.key === '`') { 
            e.stopPropagation();
        }
    });
}