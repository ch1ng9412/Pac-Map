import { gameState } from './gameState.js';
import { findNearestRoadPositionGeneric } from './map.js';
import { logToDevConsole } from './devConsole.js';
import { updatePacmanIconRotation } from './ui.js';

// --- 通用輔助函數 ---
export function positionsAreEqual(p1, p2, tolerance = 0.000001) {
    if (!p1 || !p2 || p1.length !== 2 || p2.length !== 2) return false;
    return Math.abs(p1[0] - p2[0]) < tolerance && Math.abs(p1[1] - p2[1]) < tolerance;
}

function heuristic(nodeA, nodeB) { 
    if (!nodeA || !nodeB) return Infinity;
    return L.latLng(nodeA[0], nodeA[1]).distanceTo(L.latLng(nodeB[0], nodeB[1]));
}

function getNeighborsForAdjacencyList(node, adjacencyList) {
    const nodeStr = node.toString();

    // 首先嘗試精確匹配
    if (adjacencyList.has(nodeStr)) {
        return adjacencyList.get(nodeStr);
    }

    // 如果精確匹配失敗，使用容差匹配
    const tolerance = 0.000001;
    for (const key of adjacencyList.keys()) {
        const [lat, lng] = key.split(',').map(Number);
        if (Math.abs(lat - node[0]) < tolerance && Math.abs(lng - node[1]) < tolerance) {
            return adjacencyList.get(key) || [];
        }
    }

    return [];
}

export function getNeighbors(node) {
    return getNeighborsForAdjacencyList(node, gameState.adjacencyList);
}

export function aStarSearch(startNode, goalNode, validPositions, adjacencyList, ghostPositions = [], isCleverMode = false) {
    if (!startNode || !goalNode || !validPositions || !adjacencyList) return [];
    const openSet = [startNode];
    const cameFrom = new Map();
    const gScore = new Map();
    validPositions.forEach(node => gScore.set(node.toString(), Infinity));
    gScore.set(startNode.toString(), 0);
    const fScore = new Map();
    validPositions.forEach(node => fScore.set(node.toString(), Infinity));
    fScore.set(startNode.toString(), heuristic(startNode, goalNode));

    const GHOST_DANGER_RADIUS = 15; 
    const GHOST_PROXIMITY_PENALTY = 50000; 
    const GHOST_ON_NODE_PENALTY = 1000000; 

    while (openSet.length > 0) {
        let current = openSet[0];
        for (let i = 1; i < openSet.length; i++) {
            if (fScore.get(openSet[i].toString()) < fScore.get(current.toString())) {
                current = openSet[i];
            }
        }
        if (positionsAreEqual(current, goalNode)) {
            const path = [current];
            let temp = current;
            while (cameFrom.has(temp.toString())) {
                temp = cameFrom.get(temp.toString());
                path.unshift(temp);
            }
            return path;
        }
        const indexToRemove = openSet.findIndex(node => positionsAreEqual(node, current));
        if (indexToRemove > -1) openSet.splice(indexToRemove, 1);
        
        const neighbors = getNeighborsForAdjacencyList(current, adjacencyList);
        for (const neighbor of neighbors) {
            let costToNeighbor = L.latLng(current[0], current[1]).distanceTo(L.latLng(neighbor[0], neighbor[1]));
            
            if (isCleverMode && ghostPositions.length > 0) {
                for (const ghostPos of ghostPositions) {
                    if (positionsAreEqual(neighbor, ghostPos)) {
                        costToNeighbor += GHOST_ON_NODE_PENALTY; 
                        break; 
                    }
                    if (heuristic(neighbor, ghostPos) < GHOST_DANGER_RADIUS) {
                        costToNeighbor += GHOST_PROXIMITY_PENALTY; 
                    }
                }
            }

            const tentativeGScore = gScore.get(current.toString()) + costToNeighbor; 
            if (tentativeGScore < gScore.get(neighbor.toString())) {
                cameFrom.set(neighbor.toString(), current);
                gScore.set(neighbor.toString(), tentativeGScore);
                fScore.set(neighbor.toString(), tentativeGScore + heuristic(neighbor, goalNode));
                if (!openSet.find(node => positionsAreEqual(node, neighbor))) {
                    openSet.push(neighbor);
                }
            }
        }
    }
    return []; 
}

export function decideNextGhostMoves() { 
    if (!gameState.pacman) return;
    const pacmanCurrentNode = findNearestRoadPositionGeneric(gameState.pacman.getLatLng().lat, gameState.pacman.getLatLng().lng, gameState.validPositions);

    gameState.ghosts.forEach(ghost => {
        if (!ghost.marker || (ghost.marker.getElement() && ghost.marker.getElement().classList.contains('ghost-eaten')) || ghost.movement.isMoving) {
            return;
        }

        let ghostCurrentLatLng = ghost.marker.getLatLng();
        let ghostCurrentNode = findNearestRoadPositionGeneric(ghostCurrentLatLng.lat, ghostCurrentLatLng.lng, gameState.validPositions);
        if (!positionsAreEqual([ghostCurrentLatLng.lat, ghostCurrentLatLng.lng], ghostCurrentNode)) {
            ghost.marker.setLatLng(ghostCurrentNode);
        }
        ghostCurrentLatLng = L.latLng(ghostCurrentNode[0], ghostCurrentNode[1]);

        const neighbors = getNeighbors(ghostCurrentNode); 
        if (neighbors.length === 0) {
            ghost.movement.isMoving = false;
            return;
        }
        
        const cameFromNode = ghost.movement.startPositionLatLng ? 
                             [ghost.movement.startPositionLatLng.lat, ghost.movement.startPositionLatLng.lng] : 
                             null;
        let bestNextNode = null;
        let targetNodeForThisGhost;
        let isFleeingFromTarget; 

        if (ghost.isScattering && ghost.scatterTargetNode) {
            if (heuristic(ghostCurrentNode, ghost.scatterTargetNode) < 10) { 
                ghost.isScattering = false;
                ghost.scatterTargetNode = null;
            } else {
                targetNodeForThisGhost = ghost.scatterTargetNode;
                isFleeingFromTarget = false; 
            }
        }

        if (!ghost.isScattering) { 
            targetNodeForThisGhost = pacmanCurrentNode;
            isFleeingFromTarget = ghost.isScared;
        }
        
        if (targetNodeForThisGhost) { 
            let bestScore = isFleeingFromTarget ? -Infinity : Infinity;

            for (const neighbor of neighbors) {
                if (neighbors.length > 1 && cameFromNode && positionsAreEqual(neighbor, cameFromNode)) {
                    continue;
                }
                const distanceToTarget = heuristic(neighbor, targetNodeForThisGhost);
                if (isFleeingFromTarget) { 
                    if (distanceToTarget > bestScore) {
                        bestScore = distanceToTarget;
                        bestNextNode = neighbor;
                    }
                } else { 
                    if (distanceToTarget < bestScore) {
                        bestScore = distanceToTarget;
                        bestNextNode = neighbor;
                    }
                }
            }

            if (bestNextNode) {
                const equallyGood = neighbors.filter(n => {
                    if (neighbors.length > 1 && cameFromNode && positionsAreEqual(n, cameFromNode)) return false;
                    const distance = heuristic(n, targetNodeForThisGhost);
                    return isFleeingFromTarget ? (distance === bestScore) : (distance === bestScore);
                });
                if (equallyGood.length > 0) {
                    bestNextNode = equallyGood[Math.floor(Math.random() * equallyGood.length)];
                }
            }
            
            if (!bestNextNode && neighbors.length > 0) {
                 const filteredNeighbors = neighbors.filter(n => !(neighbors.length > 1 && cameFromNode && positionsAreEqual(n, cameFromNode)));
                 bestNextNode = filteredNeighbors.length > 0 ? filteredNeighbors[Math.floor(Math.random() * filteredNeighbors.length)] : neighbors[Math.floor(Math.random() * neighbors.length)];
            }
        }


        if (bestNextNode) {
            const gm = ghost.movement;
            gm.startPositionLatLng = ghostCurrentLatLng;
            gm.destinationNodeLatLng = L.latLng(bestNextNode[0], bestNextNode[1]);
            gm.totalDistanceToDestinationNode = gm.startPositionLatLng.distanceTo(gm.destinationNodeLatLng);
            if (gm.totalDistanceToDestinationNode > 0.1) {
                gm.distanceTraveledThisSegment = 0;
                gm.isMoving = true;
            } else {
                gm.isMoving = false;
                if (ghost.isScattering && ghost.scatterTargetNode && positionsAreEqual(ghostCurrentNode, ghost.scatterTargetNode, 10)) {
                   ghost.isScattering = false;
                   ghost.scatterTargetNode = null;
                }
            }
        } else {
            ghost.movement.isMoving = false;
        }
    });
}

export function manageAutoPilot() { 
    if (!gameState.autoPilotMode || gameState.pacmanMovement.isMoving || !gameState.pacman || gameState.isPaused || gameState.isGameOver || gameState.isLosingLife) {
        return;
    }

    if (gameState.cleverMode && gameState.autoPilotPath.length > 0) {
        const nextStepNode = gameState.autoPilotPath[0];
        const ghostPositions = gameState.ghosts
            .filter(g => !g.isScared && g.marker && gameState.map.hasLayer(g.marker) && !(g.marker.getElement() && g.marker.getElement().classList.contains('ghost-eaten')))
            .map(g => findNearestRoadPositionGeneric(g.marker.getLatLng().lat, g.marker.getLatLng().lng, gameState.validPositions));
        
        for (const ghostPos of ghostPositions) {
            if (heuristic(nextStepNode, ghostPos) < 15) { 
                logToDevConsole("聰明模式：偵測到路徑危險，重新規劃...", "warn");
                gameState.autoPilotPath = []; 
                gameState.autoPilotTarget = null;
                break;
            }
        }
    }

    if (!gameState.autoPilotPath || gameState.autoPilotPath.length === 0) {
        findNextAutoPilotTargetAndPath();
        if (gameState.autoPilotPath.length === 0 && gameState.autoPilotMode) { 
            logToDevConsole("自動模式：找不到有效路徑或目標，自動模式已暫時關閉以避免卡住。", "warn");
            gameState.autoPilotMode = false; 
            gameState.cleverMode = false; 
            return;
        }
    }

    if (gameState.autoPilotPath && gameState.autoPilotPath.length > 0) {
        const nextNode = gameState.autoPilotPath[0]; 
        let currentPacmanNode = findNearestRoadPositionGeneric(gameState.pacman.getLatLng().lat, gameState.pacman.getLatLng().lng, gameState.validPositions);

        const pm = gameState.pacmanMovement;
        pm.startPositionLatLng = L.latLng(currentPacmanNode[0], currentPacmanNode[1]);
        pm.destinationNodeLatLng = L.latLng(nextNode[0], nextNode[1]);
        pm.totalDistanceToDestinationNode = pm.startPositionLatLng.distanceTo(pm.destinationNodeLatLng);

        if (pm.totalDistanceToDestinationNode > 0.1) {
            pm.distanceTraveledThisSegment = 0;
            pm.isMoving = true;
            
            const dx = nextNode[1] - currentPacmanNode[1]; 
            const dy = nextNode[0] - currentPacmanNode[0]; 

            if (Math.abs(dx) > Math.abs(dy)) {
                pm.currentFacingDirection = dx > 0 ? 'right' : 'left';
            } else {
                pm.currentFacingDirection = dy > 0 ? 'up' : 'down'; 
            }
            updatePacmanIconRotation();
            gameState.autoPilotPath.shift(); 
        } else {
            gameState.autoPilotPath.shift(); 
        }
    }
}

function findNextAutoPilotTargetAndPath() { 
    if (!gameState.pacman) return;
    const pacmanPos = gameState.pacman.getLatLng();
    const pacmanCurrentNode = findNearestRoadPositionGeneric(pacmanPos.lat, pacmanPos.lng, gameState.validPositions);
    
    let collectibles = [];
    gameState.dots.forEach(dot => { if(gameState.map.hasLayer(dot)) collectibles.push({item: dot, pos: dot.getLatLng()}); });
    gameState.powerPellets.forEach(pellet => { if(gameState.map.hasLayer(pellet)) collectibles.push({item: pellet, pos: pellet.getLatLng()}); });

    if (collectibles.length === 0) {
        logToDevConsole("自動模式：沒有可收集的物品了，自動模式已關閉。", "success");
        gameState.autoPilotMode = false;
        gameState.cleverMode = false;
        gameState.autoPilotPath = [];
        gameState.autoPilotTarget = null;
        return;
    }

    let closestItem = null;
    let minDistance = Infinity;

    collectibles.forEach(collectible => {
        const distance = pacmanPos.distanceTo(collectible.pos);
        if (distance < minDistance) {
            minDistance = distance;
            closestItem = collectible.item;
        }
    });

    if (closestItem) {
        const targetNode = findNearestRoadPositionGeneric(closestItem.getLatLng().lat, closestItem.getLatLng().lng, gameState.validPositions);
        gameState.autoPilotTarget = targetNode; 
        
        let ghostNodesForPathfinding = [];
        if (gameState.cleverMode) {
            ghostNodesForPathfinding = gameState.ghosts
                .filter(g => !g.isScared && g.marker && gameState.map.hasLayer(g.marker) && !(g.marker.getElement() && g.marker.getElement().classList.contains('ghost-eaten')))
                .map(g => findNearestRoadPositionGeneric(g.marker.getLatLng().lat, g.marker.getLatLng().lng, gameState.validPositions));
        }
        const path = aStarSearch(pacmanCurrentNode, targetNode, gameState.validPositions, gameState.adjacencyList, ghostNodesForPathfinding, gameState.cleverMode);

        if (path && path.length > 0) {
            path.shift(); 
            gameState.autoPilotPath = path;
            if (path.length > 0) {
                 logToDevConsole(`自動模式：前往 ${path.length} 步外的目標 (${targetNode.map(n => n.toFixed(4)).join(',')})`, "info");
            } else {
                 logToDevConsole(`自動模式：已在目標點或找不到路徑至 ${targetNode.map(n => n.toFixed(4)).join(',')}`, "info");
                 gameState.autoPilotPath = []; 
            }
        } else {
            logToDevConsole(`自動模式：找不到路徑至最近的物品 ${targetNode.map(n => n.toFixed(4)).join(',')}`, "warn");
            gameState.autoPilotPath = [];
            gameState.autoPilotTarget = null;
            if (gameState.cleverMode) { 
                logToDevConsole("聰明模式：由於找不到安全路徑，已暫時關閉聰明模式。", "warn");
                gameState.cleverMode = false;
            }
        }
    } else {
        logToDevConsole("自動模式：找不到最近的物品。", "warn");
        gameState.autoPilotMode = false; 
        gameState.cleverMode = false;
    }
}

export function bfsDistance(startNode, goalNode, adjacencyList, maxDepth = 100) {
    if (positionsAreEqual(startNode, goalNode)) {
        return 0;
    }

    const startNodeStr = startNode.toString();
    const goalNodeStr = goalNode.toString();

    let queue = [[startNodeStr, 0]]; // 队列中存储 [节点字符串, 距离]
    let visited = new Set([startNodeStr]); // 记录已访问的节点，防止循环

    while (queue.length > 0) {
        let [currentNodeStr, distance] = queue.shift(); // 从队列头部取出一个节点

        if (distance >= maxDepth) {
            continue; // 超过最大深度，停止这条路径的搜索
        }

        const neighbors = adjacencyList.get(currentNodeStr) || [];

        for (const neighbor of neighbors) {
            const neighborStr = neighbor.toString();

            if (neighborStr === goalNodeStr) {
                return distance + 1; // 找到了！返回距离
            }

            if (!visited.has(neighborStr)) {
                visited.add(neighborStr);
                queue.push([neighborStr, distance + 1]); // 将新节点加入队列尾部
            }
        }
    }

    return Infinity; // 如果队列为空还没找到，说明不可达
}