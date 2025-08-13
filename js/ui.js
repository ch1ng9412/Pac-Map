import { gameState, leaderboard } from './gameState.js';

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
        questProgEl.textContent = "🎉🎉🎉"; // 进度条可以显示一些庆祝的表情
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
        questDescEl.textContent = '任務：探索地圖！';
        questProgEl.textContent = `已完成: ${qs.completedQuests}`;
        questDescEl.parentElement.style.display = 'flex';
    }
    // --- ****************************************** ---
}

export function updateLeaderboardUI() {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';
    if (leaderboard.length === 0) {
        list.innerHTML = '<li>暫無記錄</li>';
    } else {
        leaderboard.forEach(s => {
            const li = document.createElement('li');
            li.textContent = `${s} 分`;
            list.appendChild(li);
        });
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
