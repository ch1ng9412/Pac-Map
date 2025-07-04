import { gameState, gameLoopRequestId } from './gameState.js';
import { setupSounds, soundsReady } from './audio.js';
import { updateLeaderboardUI } from './ui.js';
import { initGame, pauseGame, resumeGame, tryStartMovementInDirection, restartGame, backToMenu } from './game.js';
import { initStartScreenBackground } from './backgroundAnimation.js';
import { toggleDevConsole, setupDevConsoleListeners } from './devConsole.js';

document.addEventListener('DOMContentLoaded', () => { 
    // --- Initial Setup ---
    setupSounds();
    updateLeaderboardUI();
    
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
        
        if (e.code === 'Space') { 
            e.preventDefault(); 
            if (gameState.isPaused) resumeGame(); 
            else pauseGame(); 
            return; 
        } 
        
        if (gameState.isPaused || !gameState.pacman) return; 
        
        const validMoveKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']; 
        if (validMoveKeys.includes(e.code)) {
            // Map arrow keys to WASD for logic consistency
            const keyMap = {
                'ArrowUp': 'KeyW',
                'ArrowDown': 'KeyS',
                'ArrowLeft': 'KeyA',
                'ArrowRight': 'KeyD'
            };
            gameState.pacmanMovement.lastIntendedDirectionKey = keyMap[e.code] || e.code;
        } else {
            return; 
        }

        if (!gameState.pacmanMovement.isMoving) {
            tryStartMovementInDirection(gameState.pacmanMovement.lastIntendedDirectionKey); 
        }
    });

    console.log('OpenStreetMap 小精靈遊戲已載入完成！');
});