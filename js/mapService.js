/**
 * 地圖服務模組 - 使用後端 API 獲取預處理的地圖數據
 */

// 後端 API 基礎 URL
const API_BASE_URL = 'http://localhost:8000';

/**
 * 從後端獲取地圖配置列表
 */
export async function fetchMapConfigs() {
    try {
        console.log('正在從後端獲取地圖配置...');
        const response = await fetch(`${API_BASE_URL}/maps/configs`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
            console.log('成功獲取地圖配置:', result.data);
            return result.data;
        } else {
            throw new Error('後端返回錯誤');
        }
    } catch (error) {
        console.error('獲取地圖配置失敗:', error);
        return null;
    }
}

/**
 * 從後端獲取預處理的地圖數據
 * @param {number} mapIndex - 地圖索引
 * @param {boolean} forceRefresh - 是否強制重新處理
 */
export async function fetchProcessedMapData(mapIndex, forceRefresh = false) {
    try {
        console.log(`正在從後端獲取地圖 ${mapIndex} 的預處理數據...`);
        
        const url = `${API_BASE_URL}/maps/${mapIndex}/data${forceRefresh ? '?force_refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`地圖 ${mapIndex} 不存在或處理失敗`);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const mapData = await response.json();
        console.log(`成功獲取地圖 ${mapIndex} 數據:`, {
            name: mapData.map_name,
            roadSegments: mapData.road_network.length,
            validPositions: mapData.valid_positions.length,
            pois: mapData.pois.length,
            processedAt: mapData.processed_at
        });
        
        return mapData;
    } catch (error) {
        console.error(`獲取地圖 ${mapIndex} 數據失敗:`, error);
        return null;
    }
}

/**
 * 強制重新處理地圖數據
 * @param {number} mapIndex - 地圖索引
 */
export async function refreshMapData(mapIndex) {
    try {
        console.log(`正在強制重新處理地圖 ${mapIndex}...`);
        
        const response = await fetch(`${API_BASE_URL}/maps/${mapIndex}/refresh`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
            console.log(`地圖 ${mapIndex} 重新處理成功:`, result.message);
            return true;
        } else {
            throw new Error('後端返回錯誤');
        }
    } catch (error) {
        console.error(`重新處理地圖 ${mapIndex} 失敗:`, error);
        return false;
    }
}

/**
 * 將後端地圖數據轉換為前端遊戲狀態格式
 * @param {Object} backendMapData - 後端返回的地圖數據
 * @param {Object} targetState - 目標遊戲狀態對象
 */
export function convertBackendMapDataToGameState(backendMapData, targetState) {
    if (!backendMapData) {
        console.error('無效的後端地圖數據');
        return false;
    }

    try {
        // 清空現有數據
        targetState.validPositions = [];
        targetState.roadNetwork = [];
        targetState.adjacencyList.clear();

        // 轉換有效位置
        targetState.validPositions = backendMapData.valid_positions || [];

        // 轉換路網數據
        if (backendMapData.road_network) {
            targetState.roadNetwork = backendMapData.road_network.map(segment => [
                segment.start,
                segment.end
            ]);
        }

        // 轉換鄰接表
        if (backendMapData.adjacency_list) {
            for (const [nodeKey, neighbors] of Object.entries(backendMapData.adjacency_list)) {
                targetState.adjacencyList.set(nodeKey, neighbors);
            }
        }

        // 設置 POI 數據
        if (backendMapData.pois) {
            targetState.pois = backendMapData.pois.map(poi => ({
                id: poi.id,
                type: poi.type,
                name: poi.name,
                lat: poi.lat,
                lng: poi.lng,
                tags: poi.tags
            }));
        }

        // 設置生成點
        if (backendMapData.ghost_spawn_points) {
            targetState.ghostSpawnPoints = backendMapData.ghost_spawn_points;
        }

        if (backendMapData.scatter_points) {
            targetState.baseScatterPoints = backendMapData.scatter_points;
        }

        console.log('成功轉換後端地圖數據到遊戲狀態:', {
            validPositions: targetState.validPositions.length,
            roadNetwork: targetState.roadNetwork.length,
            adjacencyList: targetState.adjacencyList.size,
            pois: targetState.pois?.length || 0,
            ghostSpawnPoints: targetState.ghostSpawnPoints?.length || 0,
            scatterPoints: targetState.baseScatterPoints?.length || 0
        });

        return true;
    } catch (error) {
        console.error('轉換後端地圖數據時發生錯誤:', error);
        return false;
    }
}

/**
 * 使用後端 API 載入地圖數據的主要函數
 * @param {number} mapIndex - 地圖索引
 * @param {Object} targetState - 目標遊戲狀態對象
 * @param {boolean} forceRefresh - 是否強制重新處理
 */
export async function loadMapDataFromBackend(mapIndex, targetState, forceRefresh = false) {
    try {
        // 從後端獲取預處理的地圖數據
        const mapData = await fetchProcessedMapData(mapIndex, forceRefresh);
        
        if (!mapData) {
            console.error('無法從後端獲取地圖數據');
            return false;
        }

        // 轉換數據格式並設置到遊戲狀態
        const success = convertBackendMapDataToGameState(mapData, targetState);
        
        if (success) {
            console.log(`地圖 ${mapIndex} 載入成功`);
            return true;
        } else {
            console.error('轉換地圖數據失敗');
            return false;
        }
    } catch (error) {
        console.error('載入地圖數據時發生錯誤:', error);
        return false;
    }
}

/**
 * 檢查後端服務是否可用
 */
export async function checkBackendHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/maps/configs`);
        return response.ok;
    } catch (error) {
        console.error('後端服務不可用:', error);
        return false;
    }
}

/**
 * 獲取地圖數據的統計信息
 * @param {Object} mapData - 地圖數據
 */
export function getMapDataStats(mapData) {
    if (!mapData) return null;

    return {
        name: mapData.map_name,
        center: mapData.center,
        bounds: mapData.bounds,
        roadSegments: mapData.road_network?.length || 0,
        validPositions: mapData.valid_positions?.length || 0,
        pois: mapData.pois?.length || 0,
        ghostSpawnPoints: mapData.ghost_spawn_points?.length || 0,
        scatterPoints: mapData.scatter_points?.length || 0,
        processedAt: mapData.processed_at
    };
}
