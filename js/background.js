import { generateRoadNetworkGeneric } from './network.js';
import { positionsAreEqual, heuristic, aStarSearch, getNeighborsForAdjacencyList, findNearestRoadPositionGeneric } from './utils.js';

export const startScreenMapState = {
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

const BG_PACMAN_SPEED = 40;
const BG_GHOST_SPEED = 30;
const BG_NUMBER_OF_GHOSTS = 3;
const MAX_MAP_ZOOM = 18;

export const mapConfigs = [
    { name: "台北市中心", center: [25.0330, 121.5654], zoom: MAX_MAP_ZOOM },
    { name: "台中市區", center: [24.1477, 120.6736], zoom: MAX_MAP_ZOOM },
    { name: "高雄市區", center: [22.6273, 120.3014], zoom: MAX_MAP_ZOOM }
];

export async function initStartScreenBackground() {
    if (startScreenMapState.isLoading || startScreenMapState.isInitialized) return;
    startScreenMapState.isLoading = true;
    console.log("Initializing start screen background map...");

    const startScreenMapElement = document.getElementById('startScreenMap');
    if (!startScreenMapElement) {
        console.error("Start screen map container not found!");
        startScreenMapState.isLoading = false;
        return;
    }
    startScreenMapElement.style.opacity = '1';

    const bgMapConfig = mapConfigs[0];
    startScreenMapState.map = L.map('startScreenMap', {
        center: bgMapConfig.center,
        zoom: bgMapConfig.zoom,
        minZoom: bgMapConfig.zoom,
        maxZoom: bgMapConfig.zoom,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        keyboard: false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: MAX_MAP_ZOOM + 1
    }).addTo(startScreenMapState.map);

    startScreenMapState.map.invalidateSize();

    const bounds = startScreenMapState.map.getBounds();
    const roadData = await fetchRoadData(bounds);
    await generateRoadNetworkGeneric(bounds, roadData, startScreenMapState, 15);

    if (startScreenMapState.validPositions.length === 0) {
        console.warn("Background Map: Could not generate road network. Animated background entities will be disabled.");
        startScreenMapState.isLoading = false;
        startScreenMapState.isInitialized = true;
        return;
    }

    const pacmanIconBg = L.divIcon({ className: 'pacman-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
    const bgPacmanStartPos = startScreenMapState.validPositions[Math.floor(Math.random() * startScreenMapState.validPositions.length)];
    startScreenMapState.pacman = L.marker(bgPacmanStartPos, { icon: pacmanIconBg }).addTo(startScreenMapState.map);
    startScreenMapState.pacmanMovement.startPositionLatLng = L.latLng(bgPacmanStartPos[0], bgPacmanStartPos[1]);

    startScreenMapState.ghosts = [];
    startScreenMapState.ghostMovements = [];
    const bgGhostColors = ['red', 'pink', 'cyan'];
    for (let i = 0; i < BG_NUMBER_OF_GHOSTS; i++) {
        const colorName = bgGhostColors[i % bgGhostColors.length];
        const ghostIconBg = L.divIcon({
            className: `ghost-icon ghost-${colorName}`,
            iconSize: [20, 20], iconAnchor: [10, 16],
            html: '<div class="wave1"></div><div class="wave2"></div><div class="wave3"></div>'
        });
        const spawnIndex = Math.floor(Math.random() * startScreenMapState.validPositions.length);
        const ghostStartPos = startScreenMapState.validPositions[spawnIndex];
        if (ghostStartPos) {
            const ghostMarker = L.marker(ghostStartPos, { icon: ghostIconBg }).addTo(startScreenMapState.map);
            startScreenMapState.ghosts.push(ghostMarker);
            startScreenMapState.ghostMovements.push({
                isMoving: false, startPositionLatLng: L.latLng(ghostStartPos[0], ghostStartPos[1]),
                destinationNodeLatLng: null, totalDistanceToDestinationNode: 0,
                distanceTraveledThisSegment: 0, autoPilotPath: [], autoPilotTargetNode: null
            });
        }
    }

    startScreenMapState.isLoading = false;
    startScreenMapState.isInitialized = true;
    console.log("Start screen background map initialized with entities.");
    if (startScreenMapState.pacman && startScreenMapState.ghosts.length > 0) {
        startBackgroundAnimationLoop();
    } else {
        console.warn("Background animation loop not started as entities could not be created.");
    }
}

export function animateStartScreenBackground(timestamp) {
    if (!startScreenMapState.isInitialized || startScreenMapState.isLoading ||
        (document.getElementById('startScreen').style.display === 'none' && document.getElementById('mapSelectionScreen').style.display === 'none')) {
        if (startScreenMapState.animationId) cancelAnimationFrame(startScreenMapState.animationId);
        startScreenMapState.animationId = null;
        return;
    }
    if (!startScreenMapState.pacman) {
        startScreenMapState.animationId = requestAnimationFrame(animateStartScreenBackground);
        return;
    }

    if (!startScreenMapState.lastFrameTime) startScreenMapState.lastFrameTime = timestamp;
    let deltaTime = timestamp - startScreenMapState.lastFrameTime;
    if (deltaTime > 100) deltaTime = 100;
    startScreenMapState.lastFrameTime = timestamp;

    updateBackgroundPacman(deltaTime);
    startScreenMapState.ghosts.forEach((ghost, index) => {
        updateBackgroundGhost(ghost, startScreenMapState.ghostMovements[index], deltaTime);
    });

    startScreenMapState.animationId = requestAnimationFrame(animateStartScreenBackground);
}

function updateBackgroundPacman(deltaTime) {
    const pm = startScreenMapState.pacmanMovement;
    const pacmanObj = startScreenMapState.pacman;
    if (!pacmanObj || startScreenMapState.validPositions.length === 0) return;

    if (!pm.isMoving) {
        const currentPacmanNode = findNearestRoadPositionGeneric(pacmanObj.getLatLng().lat, pacmanObj.getLatLng().lng, startScreenMapState.validPositions);
        if (!pm.autoPilotTargetNode || positionsAreEqual(currentPacmanNode, pm.autoPilotTargetNode)) {
            let attempts = 0;
            do {
                pm.autoPilotTargetNode = startScreenMapState.validPositions[Math.floor(Math.random() * startScreenMapState.validPositions.length)];
                attempts++;
            } while (startScreenMapState.validPositions.length > 1 && positionsAreEqual(currentPacmanNode, pm.autoPilotTargetNode) && attempts < 10);
            if (startScreenMapState.validPositions.length === 1) pm.autoPilotTargetNode = currentPacmanNode;
        }

        pm.autoPilotPath = aStarSearch(currentPacmanNode, pm.autoPilotTargetNode, startScreenMapState.validPositions, startScreenMapState.adjacencyList);

        if (!pm.autoPilotPath || pm.autoPilotPath.length <= 1) {
            const neighbors = getNeighborsForAdjacencyList(currentPacmanNode, startScreenMapState.adjacencyList);
            if (neighbors.length > 0) {
                pm.autoPilotPath = [currentPacmanNode, neighbors[Math.floor(Math.random() * neighbors.length)]];
            } else {
                return;
            }
        }

        if (pm.autoPilotPath.length > 1) {
            pm.startPositionLatLng = L.latLng(pm.autoPilotPath[0][0], pm.autoPilotPath[0][1]);
            pm.destinationNodeLatLng = L.latLng(pm.autoPilotPath[1][0], pm.autoPilotPath[1][1]);
            pm.totalDistanceToDestinationNode = pm.startPositionLatLng.distanceTo(pm.destinationNodeLatLng);
            if (pm.totalDistanceToDestinationNode > 0.1) {
                pm.distanceTraveledThisSegment = 0;
                pm.isMoving = true;
                const dy = pm.destinationNodeLatLng.lat - pm.startPositionLatLng.lat;
                const dx = pm.destinationNodeLatLng.lng - pm.startPositionLatLng.lng;
                if (Math.abs(dx) > Math.abs(dy)) pm.currentFacingDirection = dx > 0 ? 'right' : 'left';
                else pm.currentFacingDirection = dy < 0 ? 'up' : 'down';
                updateBgPacmanIconRotation();
            }
        }
    }

    if (pm.isMoving) {
        const moveAmount = BG_PACMAN_SPEED * (deltaTime / 1000);
        pm.distanceTraveledThisSegment += moveAmount;
        if (pm.distanceTraveledThisSegment >= pm.totalDistanceToDestinationNode) {
            pacmanObj.setLatLng(pm.destinationNodeLatLng);
            pm.isMoving = false;
        } else {
            const fraction = pm.distanceTraveledThisSegment / pm.totalDistanceToDestinationNode;
            const newLat = pm.startPositionLatLng.lat + (pm.destinationNodeLatLng.lat - pm.startPositionLatLng.lat) * fraction;
            const newLng = pm.startPositionLatLng.lng + (pm.destinationNodeLatLng.lng - pm.startPositionLatLng.lng) * fraction;
            pacmanObj.setLatLng([newLat, newLng]);
        }
        if (startScreenMapState.map) startScreenMapState.map.setView(pacmanObj.getLatLng(), startScreenMapState.map.getZoom(), { animate: false });
    }
}

function updateBackgroundGhost(ghostObj, gm, deltaTime) {
    if (!ghostObj || !startScreenMapState.pacman || startScreenMapState.validPositions.length === 0) return;

    if (!gm.isMoving) {
        const currentGhostNode = findNearestRoadPositionGeneric(ghostObj.getLatLng().lat, ghostObj.getLatLng().lng, startScreenMapState.validPositions);
        const pacmanCurrentNode = findNearestRoadPositionGeneric(startScreenMapState.pacman.getLatLng().lat, startScreenMapState.pacman.getLatLng().lng, startScreenMapState.validPositions);
        gm.autoPilotPath = aStarSearch(currentGhostNode, pacmanCurrentNode, startScreenMapState.validPositions, startScreenMapState.adjacencyList);

        if (gm.autoPilotPath && gm.autoPilotPath.length > 1) {
            gm.startPositionLatLng = L.latLng(gm.autoPilotPath[0][0], gm.autoPilotPath[0][1]);
            gm.destinationNodeLatLng = L.latLng(gm.autoPilotPath[1][0], gm.autoPilotPath[1][1]);
            gm.totalDistanceToDestinationNode = gm.startPositionLatLng.distanceTo(gm.destinationNodeLatLng);
            if (gm.totalDistanceToDestinationNode > 0.1) {
                gm.distanceTraveledThisSegment = 0;
                gm.isMoving = true;
            }
        } else {
            const neighbors = getNeighborsForAdjacencyList(currentGhostNode, startScreenMapState.adjacencyList);
            if (neighbors.length > 0) {
                const randomNeighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
                gm.startPositionLatLng = L.latLng(currentGhostNode[0], currentGhostNode[1]);
                gm.destinationNodeLatLng = L.latLng(randomNeighbor[0], randomNeighbor[1]);
                gm.totalDistanceToDestinationNode = gm.startPositionLatLng.distanceTo(gm.destinationNodeLatLng);
                if (gm.totalDistanceToDestinationNode > 0.1) {
                    gm.distanceTraveledThisSegment = 0;
                    gm.isMoving = true;
                }
            }
        }
    }

    if (gm.isMoving) {
        const moveAmount = BG_GHOST_SPEED * (deltaTime / 1000);
        gm.distanceTraveledThisSegment += moveAmount;
        if (gm.distanceTraveledThisSegment >= gm.totalDistanceToDestinationNode) {
            ghostObj.setLatLng(gm.destinationNodeLatLng);
            gm.isMoving = false;
        } else {
            const fraction = gm.distanceTraveledThisSegment / gm.totalDistanceToDestinationNode;
            const newLat = gm.startPositionLatLng.lat + (gm.destinationNodeLatLng.lat - gm.startPositionLatLng.lat) * fraction;
            const newLng = gm.startPositionLatLng.lng + (gm.destinationNodeLatLng.lng - gm.startPositionLatLng.lng) * fraction;
            ghostObj.setLatLng([newLat, newLng]);
        }
    }
}

function updateBgPacmanIconRotation() {
    if (!startScreenMapState.pacman || !startScreenMapState.pacman.getElement()) return;
    const pacmanElement = startScreenMapState.pacman.getElement();
    pacmanElement.classList.remove('facing-true-left', 'facing-true-right', 'facing-true-up', 'facing-true-down');
    switch (startScreenMapState.pacmanMovement.currentFacingDirection) {
        case 'left': pacmanElement.classList.add('facing-true-left'); break;
        case 'right': pacmanElement.classList.add('facing-true-right'); break;
        case 'up': pacmanElement.classList.add('facing-true-up'); break;
        case 'down': pacmanElement.classList.add('facing-true-down'); break;
        default: pacmanElement.classList.add('facing-true-left'); break;
    }
}

export function startBackgroundAnimationLoop() {
    if (startScreenMapState.animationId) cancelAnimationFrame(startScreenMapState.animationId);
    startScreenMapState.lastFrameTime = 0;
    animateStartScreenBackground(performance.now());
    console.log("Background animation loop started.");
}

export function stopBackgroundAnimation() {
    if (startScreenMapState.animationId) {
        cancelAnimationFrame(startScreenMapState.animationId);
        startScreenMapState.animationId = null;
    }
    if (startScreenMapState.map) {
        startScreenMapState.map.remove();
        startScreenMapState.map = null;
    }
    startScreenMapState.pacman = null;
    startScreenMapState.ghosts = [];
    startScreenMapState.roadNetwork = [];
    startScreenMapState.validPositions = [];
    startScreenMapState.adjacencyList.clear();
    startScreenMapState.pacmanMovement = { isMoving: false, startPositionLatLng: null, destinationNodeLatLng: null, totalDistanceToDestinationNode: 0, distanceTraveledThisSegment: 0, currentFacingDirection: 'left', autoPilotPath: [], autoPilotTargetNode: null };
    startScreenMapState.ghostMovements = [];
    startScreenMapState.isInitialized = false;
    startScreenMapState.isLoading = false;

    const startScreenMapElement = document.getElementById('startScreenMap');
    if (startScreenMapElement) startScreenMapElement.style.opacity = '0';

    console.log("Background animation stopped and resources cleaned up.");
}