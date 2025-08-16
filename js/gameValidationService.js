/**
 * 遊戲驗證服務 - 向後端發送遊戲事件進行驗證
 */

import { authenticatedFetch } from './auth.js';

// 後端 API 基礎 URL
const API_BASE_URL = 'http://localhost:8000';

// 遊戲事件類型
export const GameEventType = {
    GAME_START: "game_start",
    DOT_COLLECTED: "dot_collected",
    POWER_PELLET_COLLECTED: "power_pellet_collected",
    GHOST_EATEN: "ghost_eaten",
    LIFE_LOST: "life_lost",
    LEVEL_COMPLETED: "level_completed",
    GAME_END: "game_end",
    HEALTH_CHANGED: "health_changed",
    BACKPACK_ITEM_USED: "backpack_item_used"
};

class GameValidationService {
    constructor() {
        this.currentSessionId = null;
        this.isValidationEnabled = true;
        this.validationQueue = [];
        this.isProcessingQueue = false;
        this.lastEventTime = 0;
        this.eventBuffer = [];
    }

    /**
     * 開始新的遊戲會話
     */
    async startGameSession(mapIndex, initialGameTime = 600) {
        try {
            console.log('🎮 開始新的遊戲驗證會話...');
            
            const response = await authenticatedFetch(`${API_BASE_URL}/game/session/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    map_index: mapIndex,
                    initial_game_time: initialGameTime
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success) {
                this.currentSessionId = result.session_id;
                console.log('✅ 遊戲驗證會話已開始:', this.currentSessionId);
                return this.currentSessionId;
            } else {
                throw new Error('後端返回錯誤');
            }
        } catch (error) {
            console.error('❌ 開始遊戲驗證會話失敗:', error);
            this.isValidationEnabled = false;
            return null;
        }
    }

    /**
     * 結束遊戲會話
     */
    async endGameSession(finalScore, victory, survivalTime, dotsCollected, ghostsEaten) {
        if (!this.currentSessionId || !this.isValidationEnabled) {
            return { success: false, message: '驗證未啟用' };
        }

        try {
            console.log('🏁 結束遊戲驗證會話...');
            
            const response = await authenticatedFetch(`${API_BASE_URL}/game/session/end`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSessionId,
                    final_score: finalScore,
                    victory: victory,
                    survival_time: survivalTime,
                    dots_collected: dotsCollected,
                    ghosts_eaten: ghostsEaten
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ 遊戲驗證會話已結束:', result);
            
            this.currentSessionId = null;
            return result;
        } catch (error) {
            console.error('❌ 結束遊戲驗證會話失敗:', error);
            return { success: false, message: '結束會話失敗' };
        }
    }

    /**
     * 報告遊戲事件
     */
    async reportGameEvent(eventType, gameState, scoreBefore = null, livesBefore = null, healthBefore = null, additionalData = null) {
        if (!this.currentSessionId || !this.isValidationEnabled) {
            return { success: false, message: '驗證未啟用' };
        }

        const now = performance.now();

        // 創建遊戲事件對象
        const event = {
            event_type: eventType,
            timestamp: now / 1000, // 轉換為秒
            game_time_remaining: gameState.gameTime,
            player_position: gameState.pacman ? [
                gameState.pacman.getLatLng().lat,
                gameState.pacman.getLatLng().lng
            ] : null,
            score_before: scoreBefore !== null ? scoreBefore : gameState.score,
            score_after: gameState.score,
            lives_before: livesBefore !== null ? livesBefore : gameState.healthSystem.lives,
            lives_after: gameState.healthSystem.lives,
            health_before: healthBefore !== null ? healthBefore : gameState.healthSystem.currentHealth,
            health_after: gameState.healthSystem.currentHealth,
            level: gameState.level,
            map_index: gameState.currentMapIndex,
            additional_data: additionalData
        };

        // 添加到緩衝區
        this.eventBuffer.push(event);
        this.lastEventTime = now;

        // 批量處理事件
        this._processBatchedEvents();

        return { success: true, message: '事件已記錄' };
    }

    /**
     * 批量處理事件
     */
    _processBatchedEvents() {
        if (this.isProcessingQueue || this.eventBuffer.length === 0) {
            return;
        }

        // 延遲處理，允許事件累積
        setTimeout(async () => {
            if (this.eventBuffer.length === 0) return;

            this.isProcessingQueue = true;
            const eventsToProcess = [...this.eventBuffer];
            this.eventBuffer = [];

            try {
                // 批量發送事件
                for (const event of eventsToProcess) {
                    await this._sendEventToBackend(event);
                }
            } catch (error) {
                console.error('批量處理事件失敗:', error);
            } finally {
                this.isProcessingQueue = false;
            }
        }, 500); // 500ms 延遲
    }

    /**
     * 發送事件到後端
     */
    async _sendEventToBackend(event) {
        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/game/event/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.currentSessionId,
                    event: event
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            // 處理驗證結果
            if (!result.is_valid) {
                console.warn('⚠️ 遊戲事件驗證失敗:', result.errors);
            }
            
            if (result.warnings && result.warnings.length > 0) {
                console.warn('⚠️ 遊戲事件警告:', result.warnings);
            }

            return result;
        } catch (error) {
            console.error('發送事件到後端失敗:', error);
            return { is_valid: false, errors: [error.message] };
        }
    }

    /**
     * 獲取會話統計
     */
    async getSessionStats() {
        if (!this.currentSessionId) {
            return null;
        }

        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/game/session/${this.currentSessionId}/stats`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            return result.success ? result.data : null;
        } catch (error) {
            console.error('獲取會話統計失敗:', error);
            return null;
        }
    }

    /**
     * 輔助方法：獲取事件前的分數
     */
    _getScoreBefore(gameState) {
        // 這裡可以根據事件類型計算事件前的分數
        // 暫時返回當前分數，實際使用時需要根據具體邏輯調整
        return gameState.score;
    }

    /**
     * 輔助方法：獲取事件前的生命值
     */
    _getLivesBefore(gameState) {
        return gameState.healthSystem.lives;
    }

    /**
     * 輔助方法：獲取事件前的血量
     */
    _getHealthBefore(gameState) {
        return gameState.healthSystem.currentHealth;
    }

    /**
     * 檢查驗證服務是否可用
     */
    isEnabled() {
        return this.isValidationEnabled && this.currentSessionId !== null;
    }

    /**
     * 禁用驗證（用於離線模式或錯誤恢復）
     */
    disable() {
        this.isValidationEnabled = false;
        console.log('🔒 遊戲驗證已禁用');
    }

    /**
     * 啟用驗證
     */
    enable() {
        this.isValidationEnabled = true;
        console.log('🔓 遊戲驗證已啟用');
    }
}

// 全域實例
export const gameValidationService = new GameValidationService();

// 便捷方法
export async function reportDotCollected(gameState, scoreBefore, dotPoints = 10) {
    return await gameValidationService.reportGameEvent(
        GameEventType.DOT_COLLECTED,
        gameState,
        scoreBefore,
        null,
        null,
        { points_gained: dotPoints }
    );
}

export async function reportPowerPelletCollected(gameState, scoreBefore, pelletPoints = 50) {
    return await gameValidationService.reportGameEvent(
        GameEventType.POWER_PELLET_COLLECTED,
        gameState,
        scoreBefore,
        null,
        null,
        { points_gained: pelletPoints }
    );
}

export async function reportGhostEaten(gameState, scoreBefore, ghostPoints = 150) {
    return await gameValidationService.reportGameEvent(
        GameEventType.GHOST_EATEN,
        gameState,
        scoreBefore,
        null,
        null,
        { points_gained: ghostPoints }
    );
}

export async function reportLifeLost(gameState, livesBefore, healthBefore) {
    return await gameValidationService.reportGameEvent(
        GameEventType.LIFE_LOST,
        gameState,
        null,
        livesBefore,
        healthBefore
    );
}

export async function reportGameStart(gameState) {
    return await gameValidationService.reportGameEvent(
        GameEventType.GAME_START,
        gameState,
        0, // 遊戲開始時分數為0
        3, // 遊戲開始時生命為3
        100 // 遊戲開始時血量為100
    );
}

export async function reportGameEnd(gameState, victory) {
    return await gameValidationService.reportGameEvent(
        GameEventType.GAME_END,
        gameState,
        null,
        null,
        null,
        { victory: victory }
    );
}
