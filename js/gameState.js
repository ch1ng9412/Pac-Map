// 遊戲常數
export const PACMAN_BASE_SPEED = 60; 
export const GHOST_MOVE_SPEED_METERS_PER_SECOND = 45;
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
    lives: 3,
    level: 1,
    gameTime: 600, 
    isPaused: false,
    isGameOver: false,
    isLosingLife: false, 
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
    autoPilotTarget: null 
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
    { name: "台北市中心", center: [25.0330, 121.5654], zoom: MAX_MAP_ZOOM },
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