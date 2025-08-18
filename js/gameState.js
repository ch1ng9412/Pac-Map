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
        completionMessage: "",
        completedSpecialPoiIds: new Set()
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

function getMapConfigs() {
    // 确保 Leaflet (L) 已经加载，否则无法创建 L.latLngBounds
    if (typeof L === 'undefined') {
        console.error("Leaflet (L) is not loaded yet. Map configs cannot be fully initialized.");
        // 返回一个不包含 Leaflet 对象的简化版本，以避免崩溃
        return [
            { name: "台北市中心", center: [25.0330, 121.5654] },
            { name: "台中市區", center: [24.1477, 120.6736] },
            { name: "高雄市區", center: [22.6273, 120.3014] }
        ];
    }
    
    // Leaflet 已加载，返回完整的配置
    return [
        {
            name: "台北市中心",
            // 将中心点设为 101，并确保 bounds 包含它
            center: [25.033344, 121.564880], // 台北 101
            zoom: MAX_MAP_ZOOM,
            // 重新定义一个包含 101 的 bounds
            bounds: L.latLngBounds(
                [25.0290, 121.5604], // 西南角
                [25.0370, 121.5704]  // 东北角
            ),
            dotGeneration: { mode: 'fixed', value: 600 },
            specialPois: [
                {
                    id: 'special-taipei-101',
                    type: 'landmark-icon',
                    name: '台北 101',
                    letter: '★',
                    coords: [25.0333, 121.5648]
                },
                {
                    id: 'special-park',
                    type: 'landmark-icon',
                    name: '象山公園',
                    letter: '★',
                    coords: [25.0305, 121.5702]
                }
            ]
        },
        {
            name: "台中市區",
            center: [24.1477, 120.6736],
            zoom: MAX_MAP_ZOOM,
            // 注意：这里我们不再用 getBounds 函数，而是直接存储 bounds 对象
            bounds: L.latLngBounds(
                [24.1437, 120.6686],
                [24.1517, 120.6786]
            )
            // 台中地图没有 specialPois，所以不写这个属性
        },
        {
            name: "高雄市區",
            center: [22.6273, 120.3014],
            zoom: MAX_MAP_ZOOM,
            bounds: L.latLngBounds(
                [22.6233, 120.2964],
                [22.6313, 120.3064]
            )
        }
    ];
}

// 导出由函数生成的配置数组
export const mapConfigs = getMapConfigs();

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