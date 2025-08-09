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
    isGameOver: false,
    isRoundTransitioning: false,
    currentMapIndex: 0,
    gameTimer: null,
    powerMode: false,
    powerModeTimer: null,
    dotsCollected: 0,
    totalDots: 0,
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
        damageInterval: null,   // 在圈外時，扣血的計時器
        isShrinking: false,     // 標記是否正在縮小
        nextShrinkTime: 0,      // 下一次縮圈開始的時間戳
        damagePerTick: 0.01      // 每次扣血的量 (可以是小數)
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
export const mapConfigs = [
    { name: "台北市中心", center: [25.0330, 121.5654], zoom: MAX_MAP_ZOOM, bounds: L.latLngBounds(
            [25.0290, 121.5604], // 西南角 (SouthWest)
            [25.0370, 121.5704]  // 東北角 (NorthEast)
        )},
    { name: "台中市區", center: [24.1477, 120.6736], zoom: MAX_MAP_ZOOM },
    { name: "高雄市區", center: [22.6273, 120.3014], zoom: MAX_MAP_ZOOM }
];

// 排行榜資料
export let leaderboard = [];

// 全局迴圈 ID
export let gameLoopRequestId = null;
export let ghostDecisionInterval = null;
export let lastFrameTime = 0;

// Setter functions to update exported let variables
export function setGameLoopRequestId(id) { gameLoopRequestId = id; }
export function setGhostDecisionInterval(id) { ghostDecisionInterval = id; }
export function setLastFrameTime(time) { lastFrameTime = time; }