// 遊戲常數
export const PACMAN_BASE_SPEED = 60; 
export const GHOST_MOVE_SPEED_METERS_PER_SECOND = 60;
export const MAX_MAP_ZOOM = 18;
export const MAX_DELTA_TIME = 100; 
export const NUMBER_OF_GHOSTS = 7;
export const BG_PACMAN_SPEED = 40;
export const BG_GHOST_SPEED = 30;
export const BG_NUMBER_OF_GHOSTS = 3;

// 遊戲狀態物件
export let gameState = {
    map: null, 
    pacman: null,
    pacmanLevelStartPoint: null,
    pacmanMovement: {
        isMoving: false,
        startPositionLatLng: null,
        destinationNodeLatLng: null,
        totalDistanceToDestinationNode: 0,
        distanceTraveledThisSegment: 0,
        lastIntendedDirectionKey: null,
        currentFacingDirection: 'left'
    },
    ghosts: [],
    dots: [],
    powerPellets: [],
    score: 0,
    healthSystem: {
        lives: 3,           // 總生命次數 (或復活次數)
        maxLives: 3,        // 最大生命次數
        currentHealth: 100, // 當前血條的血量 (0-100)
        maxHealth: 100      // 血條的最大血量
    },
    level: 1,
    gameTime: 600, 
    gameStartTime: 0,
    isPaused: false,
    pauseStartTime: null,
    isGameOver: false,
    isRoundTransitioning: false,
    currentMapIndex: 0,
    gameTimer: null,
    powerMode: false,
    powerModeTimer: null,
    dotsCollected: 0,
    totalDots: 0,
    ghostsEaten: 0,
    powerPelletsEaten: 0,
    canMove: false, 
    roadNetwork: [], 
    validPositions: [], 
    roadLayers: [], 
    adjacencyList: new Map(), 
    ghostSpawnPoints: [], 
    baseScatterPoints: [], 
    gameSpeedMultiplier: 1, 
    isDevConsoleOpen: false,
    pacmanSpeedMultiplier: 1.0, 
    godMode: false, 
    autoPilotMode: false, 
    cleverMode: false, 
    autoPilotPath: [],    
    autoPilotTarget: null,
    poisonCircle: {
        circleObject: null,     // Leaflet 的圓形物件
        center: null,           // 毒圈中心點的 LatLng 物件
        currentRadius: 2000,    // 當前半徑 (單位：公尺)
        targetRadius: 2000,     // 下一個階段的目標半徑
        shrinkSpeed: 0,         // 每秒縮小的速度
        isShrinking: false,     // 標記是否正在縮小
        nextShrinkTime: 0,      // 下一次縮圈開始的時間戳
        damagePerTick: 0.01,      // 每次扣血的量 (可以是小數)
        lastDamageTime: 0,      // <-- 新增：记录上次伤害的时间戳
        damagePerTick: 5,       // <-- 伤害值可以调高一点，因为现在不是固定间隔了
        damageCooldown: 500     // <-- 新增：伤害的冷却时间 (毫秒)
    },
    minimap: {
        map: null,                // 小地图的 Leaflet 实例
        playerMarker: null,       // 小地图上玩家的标记
        poisonCircle: null,       // 小地图上的毒圈
        nextPoisonCircle: null,    // 小地图上的下一圈预告
        currentQuestPoiLayer: null 
    },
    questSystem: {
        activeQuest: null,        // 当前激活的任务物件
        availableQuests: [],      // 一个任务池，存放所有可能的任务
        completedQuests: 0,        // 已完成任务的数量
        completionMessage: ""
    },
    pois: [],
    foodItems: [],
    backpack: {
        items: [null, null, null],
        maxSize: 3
    }
};

// 背景地圖相關狀態
export let startScreenMapState = {
    map: null,
    pacman: null,
    ghosts: [],
    roadNetwork: [],
    validPositions: [],
    adjacencyList: new Map(),
    animationId: null,
    lastFrameTime: 0,
    pacmanMovement: { isMoving: false, startPositionLatLng: null, destinationNodeLatLng: null, totalDistanceToDestinationNode: 0, distanceTraveledThisSegment: 0, currentFacingDirection: 'left', autoPilotPath: [], autoPilotTargetNode: null },
    ghostMovements: [], 
    isLoading: false, 
    isInitialized: false
};

// 地圖設定
// 地圖配置 - 使用函數來延遲 Leaflet 的使用
export function getMapConfigs() {
    return [
        {
            name: "台北市中心",
            center: [25.0330, 121.5654],
            zoom: MAX_MAP_ZOOM,
            getBounds: () => L.latLngBounds(
                [25.0290, 121.5604], // 西南角 (SouthWest)
                [25.0370, 121.5704]  // 東北角 (NorthEast)
            )
        },
        {
            name: "台中市區",
            center: [24.1477, 120.6736],
            zoom: MAX_MAP_ZOOM,
            getBounds: () => L.latLngBounds(
                [24.1437, 120.6686], // 西南角 (SouthWest)
                [24.1517, 120.6786]  // 東北角 (NorthEast)
            )
        },
        {
            name: "高雄市區",
            center: [22.6273, 120.3014],
            zoom: MAX_MAP_ZOOM,
            getBounds: () => L.latLngBounds(
                [22.6233, 120.2964], // 西南角 (SouthWest)
                [22.6313, 120.3064]  // 東北角 (NorthEast)
            )
        }
    ];
}

// 為了向後相容，提供一個 getter
export const mapConfigs = new Proxy({}, {
    get(target, prop) {
        if (typeof window !== 'undefined' && window.L) {
            return getMapConfigs()[prop];
        }
        // 如果 Leaflet 還沒載入，返回基本配置
        const basicConfigs = [
            { name: "台北市中心", center: [25.0330, 121.5654], zoom: MAX_MAP_ZOOM },
            { name: "台中市區", center: [24.1477, 120.6736], zoom: MAX_MAP_ZOOM },
            { name: "高雄市區", center: [22.6273, 120.3014], zoom: MAX_MAP_ZOOM }
        ];
        return basicConfigs[prop];
    }
});

export const foodDatabase = {
    'restaurant-icon': [
        { name: '牛肉麵', icon: '🍜', heal: 30 },
        { name: '水餃', icon: '🥟', heal: 20 },
        { name: '月餅', icon: '🥮', heal: 20 }
    ],
    'cafe-icon': [
        { name: '濃縮咖啡', icon: '☕', heal: 15 },
        { name: '甜甜圈', icon: '🍩', heal: 10 }
    ],
    'store-icon': [
        { name: '能量飲料', icon: '🥤', heal: 10 },
        { name: '三角飯糰', icon: '🍙', heal: 20 }
    ],
    'bubble-tea-icon': [
        { name: '冰淇淋', icon: '🍿', heal: 15 }
    ],
    'default': [
        { name: '珍珠奶茶', icon: '🧋', heal: 20 }
    ]
};

// 排行榜資料（清空所有測試數據）
export let leaderboard = [];

// 全局迴圈 ID
export let gameLoopRequestId = null;
export let ghostDecisionInterval = null;
export let lastFrameTime = 0;

// Setter functions to update exported let variables
export function setGameLoopRequestId(id) { gameLoopRequestId = id; }
export function setGhostDecisionInterval(id) { ghostDecisionInterval = id; }
export function setLastFrameTime(time) { lastFrameTime = time; }