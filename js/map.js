import { gameState } from './gameState.js';
import { positionsAreEqual } from './ai.js';

export async function fetchRoadData(bounds) {
    const south = bounds.getSouth(), west = bounds.getWest(), north = bounds.getNorth(), east = bounds.getEast();
    const query = `[out:json][timeout:25];(way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|razed|abandoned)$"]["area"!~"yes"]["access"!~"private"]["service"!~"^(driveway|parking_aisle|alley)$"](${south},${west},${north},${east}););out body;>;out skel qt;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    console.log('正在從 Overpass API 獲取道路數據...', url);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}, message: ${await response.text()}`);
            return null;
        }
        const data = await response.json();
        console.log('成功獲取到道路數據：', data.elements.length, 'elements');
        return data;
    } catch (error) {
        console.error('獲取道路數據失敗：', error);
        return null;
    }
}

export async function generateRoadNetworkGeneric(bounds, osmData, targetState, maxSegmentLength = 25) {
    targetState.validPositions = []; 
    targetState.roadNetwork = []; 
    targetState.adjacencyList.clear();
    const MAX_SEGMENT_LENGTH_METERS = maxSegmentLength; 

    if (!osmData || !osmData.elements || osmData.elements.length === 0) {
        console.warn(`未獲取到有效的 OSM 數據或數據為空 (${targetState === gameState ? '主遊戲' : '背景'})。路網可能無法正常生成。`);
        return;
    }
    
    const nodes = {}; 
    const ways = [];
    osmData.elements.forEach(element => {
        if (element.type === 'node' && element.lat && element.lon) {
            nodes[element.id] = [element.lat, element.lon];
        } else if (element.type === 'way' && element.tags && element.tags.highway && element.nodes) {
            const roadTypes = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'pedestrian', 'road', 'path', 'footway', 'cycleway', 'track'];
            if (roadTypes.includes(element.tags.highway)) {
                ways.push(element.nodes);
            }
        }
    });

    const initialRoadNetwork = [];
    const uniqueNodesMap = new Map(); 

    ways.forEach(nodeIds => {
        const wayPoints = [];
        for (let i = 0; i < nodeIds.length; i++) {
            if (nodes[nodeIds[i]]) {
                const pos = nodes[nodeIds[i]];
                wayPoints.push(pos);
                if (!uniqueNodesMap.has(pos.toString())) {
                    uniqueNodesMap.set(pos.toString(), pos);
                }
            }
        }
        if (wayPoints.length > 1) {
            for (let i = 0; i < wayPoints.length - 1; i++) {
                initialRoadNetwork.push([wayPoints[i], wayPoints[i+1]]);
            }
        }
    });
    
    const subdividedRoadNetwork = [];
    initialRoadNetwork.forEach(segment => {
        const nodeA = segment[0];
        const nodeB = segment[1];

        if (!uniqueNodesMap.has(nodeA.toString())) uniqueNodesMap.set(nodeA.toString(), nodeA);
        if (!uniqueNodesMap.has(nodeB.toString())) uniqueNodesMap.set(nodeB.toString(), nodeB);

        const latLngA = L.latLng(nodeA[0], nodeA[1]);
        const latLngB = L.latLng(nodeB[0], nodeB[1]);
        const distance = latLngA.distanceTo(latLngB);

        if (distance > MAX_SEGMENT_LENGTH_METERS) {
            const numNewPoints = Math.ceil(distance / MAX_SEGMENT_LENGTH_METERS) - 1;
            let lastPoint = nodeA;
            for (let i = 1; i <= numNewPoints; i++) {
                const fraction = i / (numNewPoints + 1);
                const interpolatedLat = nodeA[0] + fraction * (nodeB[0] - nodeA[0]);
                const interpolatedLng = nodeA[1] + fraction * (nodeB[1] - nodeA[1]);
                const newNode = [interpolatedLat, interpolatedLng];
                
                if (!uniqueNodesMap.has(newNode.toString())) {
                    uniqueNodesMap.set(newNode.toString(), newNode);
                }
                subdividedRoadNetwork.push([lastPoint, newNode]);
                lastPoint = newNode;
            }
            subdividedRoadNetwork.push([lastPoint, nodeB]);
        } else {
            subdividedRoadNetwork.push(segment);
        }
    });

    targetState.roadNetwork = subdividedRoadNetwork;
    targetState.validPositions = Array.from(uniqueNodesMap.values());
    
    targetState.validPositions.forEach(node => {
        const nodeStr = node.toString();
        if (!targetState.adjacencyList.has(nodeStr)) {
            targetState.adjacencyList.set(nodeStr, []);
        }
    });

    targetState.roadNetwork.forEach(segment => {
        if (segment && segment.length === 2 && segment[0] && segment[1]) {
            const nodeA = segment[0];
            const nodeB = segment[1];
            const nodeAStr = nodeA.toString();
            const nodeBStr = nodeB.toString();

            if (!targetState.adjacencyList.has(nodeAStr)) targetState.adjacencyList.set(nodeAStr, []);
            if (!targetState.adjacencyList.has(nodeBStr)) targetState.adjacencyList.set(nodeBStr, []);
            
            if (!targetState.adjacencyList.get(nodeAStr).some(n => positionsAreEqual(n, nodeB))) {
                targetState.adjacencyList.get(nodeAStr).push(nodeB);
            }
            if (!targetState.adjacencyList.get(nodeBStr).some(n => positionsAreEqual(n, nodeA))) {
                targetState.adjacencyList.get(nodeBStr).push(nodeA);
            }
        }
    });

    if (targetState === gameState && targetState.validPositions.length > 0) { 
        connectDeadEnds(targetState);
        removeDisconnectedIslands(targetState);
    }
}

export function findNearestRoadPositionGeneric(targetLat, targetLng, validPositionsList) {
    if (!validPositionsList || validPositionsList.length === 0) { 
        console.warn("findNearestRoadPositionGeneric with no valid positions."); 
        return [targetLat, targetLng]; 
    }
    let nearestPos = validPositionsList[0], minDistanceSq = Infinity;
    for (const pos of validPositionsList) { 
        const dy = pos[0] - targetLat, dx = pos[1] - targetLng, distanceSq = dy * dy + dx * dx; 
        if (distanceSq < minDistanceSq) { 
            minDistanceSq = distanceSq; 
            nearestPos = pos; 
        } 
    }
    return nearestPos;
}

export function drawVisualRoads() { 
    if (gameState.roadLayers) gameState.roadLayers.forEach(layer => {if(gameState.map && gameState.map.hasLayer(layer)) gameState.map.removeLayer(layer)}); 
    gameState.roadLayers = []; 
    gameState.roadNetwork.forEach(segment => { 
        if (segment && segment.length > 1 && gameState.map) { 
            const blueBorder = L.polyline(segment, { color: 'blue', weight: 14, opacity: 0.8 }); 
            gameState.roadLayers.push(blueBorder); 
            gameState.map.addLayer(blueBorder); 
            const blackRoad = L.polyline(segment, { color: 'black', weight: 10, opacity: 1 }); 
            gameState.roadLayers.push(blackRoad); 
            gameState.map.addLayer(blackRoad); 
            blueBorder.bringToBack(); 
            blackRoad.bringToFront(); 
        } 
    }); 
}

function connectDeadEnds(targetState) {
    console.log('Attempting to connect dead ends for main game...');
    let deadEndsFixedInIterationTotal = 0;
    let iterations = 0;
    const maxIterations = Math.max(15, Math.floor(targetState.adjacencyList.size / 10));
    let deadEndsFixedInThisPass = 0;

    do {
        deadEndsFixedInThisPass = 0;
        iterations++;
        if (iterations > maxIterations && maxIterations > 0) {
            console.warn("Max iterations reached for connecting dead ends. Breaking.");
            break;
        }
        while (true) {
            // 取得所有 degree == 1 的節點
            const deadEndNodes = Array.from(targetState.adjacencyList.entries())
                .filter(([_, neighbors]) => neighbors.length === 1)
                .map(([nodeStr]) => nodeStr.split(',').map(Number));

            if (deadEndNodes.length < 2) break; // 沒有足夠的死路節點來對接

            let foundConnection = false;

            // 嘗試找出最近的一對死路節點
            let minDistanceSq = Infinity;
            let pairToConnect = null;

            for (let i = 0; i < deadEndNodes.length; i++) {
                for (let j = i + 1; j < deadEndNodes.length; j++) {
                    const a = deadEndNodes[i];
                    const b = deadEndNodes[j];

                    // 確保這兩節點目前還沒連接
                    const alreadyConnected = targetState.roadNetwork.some(
                        segment =>
                            (positionsAreEqual(segment[0], a) && positionsAreEqual(segment[1], b)) ||
                            (positionsAreEqual(segment[0], b) && positionsAreEqual(segment[1], a))
                    );
                    if (alreadyConnected) continue;

                    const dy = a[0] - b[0];
                    const dx = a[1] - b[1];
                    const distSq = dy * dy + dx * dx;

                    if (distSq < minDistanceSq) {
                        minDistanceSq = distSq;
                        pairToConnect = [a, b];
                    }
                }
            }

            if (pairToConnect) {
                const [a, b] = pairToConnect;

                // 建立連線
                targetState.roadNetwork.push([a, b]);

                // 更新 a 的鄰居
                const aKey = a.toString();
                let aNeighbors = targetState.adjacencyList.get(aKey);
                if (!aNeighbors) {
                    aNeighbors = [];
                    targetState.adjacencyList.set(aKey, aNeighbors);
                }
                if (!aNeighbors.some(n => positionsAreEqual(n, b))) {
                    aNeighbors.push(b);
                }

                // 更新 b 的鄰居
                const bKey = b.toString();
                let bNeighbors = targetState.adjacencyList.get(bKey);
                if (!bNeighbors) {
                    bNeighbors = [];
                    targetState.adjacencyList.set(bKey, bNeighbors);
                }
                if (!bNeighbors.some(n => positionsAreEqual(n, a))) {
                    bNeighbors.push(a);
                }

                deadEndsFixedInIterationTotal++;
                foundConnection = true;
            }

            if (!foundConnection) break; // 無法再連任何死路

        }
        if (deadEndsFixedInThisPass === 0 && iterations > 1) break;
    } while (iterations < maxIterations && (deadEndsFixedInThisPass > 0 || iterations === 1));

    if (iterations >= maxIterations && maxIterations > 0) console.warn("Main game dead end fixing reached max iterations.");
}

export function removeDisconnectedIslands(targetState) {
    const visited = new Set();
    const components = [];

    for (const nodeStr of targetState.adjacencyList.keys()) {
        if (visited.has(nodeStr)) continue;

        const component = [];
        const queue = [nodeStr];
        visited.add(nodeStr);

        while (queue.length > 0) {
            const current = queue.shift();
            component.push(current);

            const neighbors = targetState.adjacencyList.get(current) || [];
            for (const neighbor of neighbors) {
                const neighborStr = neighbor.toString();
                if (!visited.has(neighborStr)) {
                    visited.add(neighborStr);
                    queue.push(neighborStr);
                }
            }
        }

        components.push(component);
    }

    if (components.length <= 1) return; // 沒有孤島

    // 找出節點數最多的 component
    const largestComponent = components.reduce((a, b) => (a.length > b.length ? a : b));
    const validKeys = new Set(largestComponent);

    console.log(`共找到 ${components.length} 個連通區，保留最大區塊 (${largestComponent.length} 節點)，刪除其餘孤島。`);

    // 濾掉非最大區塊的節點
    targetState.validPositions = targetState.validPositions.filter(pos => validKeys.has(pos.toString()));

    // 重建 adjacencyList
    const newAdjacencyList = new Map();
    for (const key of validKeys) {
        const neighbors = targetState.adjacencyList.get(key) || [];
        const filteredNeighbors = neighbors.filter(n => validKeys.has(n.toString()));
        newAdjacencyList.set(key, filteredNeighbors);
    }
    targetState.adjacencyList = newAdjacencyList;

    // 濾掉 roadNetwork 中無效連線
    targetState.roadNetwork = targetState.roadNetwork.filter(([a, b]) =>
        validKeys.has(a.toString()) && validKeys.has(b.toString())
    );
}
