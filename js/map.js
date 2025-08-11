import { gameState } from './gameState.js';
import { positionsAreEqual, bfsDistance } from './ai.js';

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

export async function generateRoadNetworkGeneric(bounds, osmData, targetState, maxSegmentLength = 20) {
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
            // const roadTypes = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'pedestrian', 'road', 'path', 'footway', 'cycleway', 'track'];
            const roadTypes = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'road', 'path'];
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

        // 确保原始节点被记录
        if (!uniqueNodesMap.has(nodeA.toString())) uniqueNodesMap.set(nodeA.toString(), nodeA);
        if (!uniqueNodesMap.has(nodeB.toString())) uniqueNodesMap.set(nodeB.toString(), nodeB);

        // --- *** 使用新的辅助函数 *** ---
        const newSegments = subdivideSegment(nodeA, nodeB, maxSegmentLength);

        // 如果产生了新的细分节点，需要将它们也加入到 uniqueNodesMap 中
        if (newSegments.length > 1) {
            newSegments.forEach(newSeg => {
                const newMiddleNode = newSeg[1];
                if (!uniqueNodesMap.has(newMiddleNode.toString())) {
                    uniqueNodesMap.set(newMiddleNode.toString(), newMiddleNode);
                }
            });
        }
        
        // 将细分后的路段加入最终的路网列表
        subdividedRoadNetwork.push(...newSegments);
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

function subdivideSegment(nodeA, nodeB, maxSegmentLength) {
    const latLngA = L.latLng(nodeA[0], nodeA[1]);
    const latLngB = L.latLng(nodeB[0], nodeB[1]);
    const distance = latLngA.distanceTo(latLngB);

    if (distance > maxSegmentLength) {
        const numNewPoints = Math.ceil(distance / maxSegmentLength) - 1;
        const newSegments = [];
        let lastPoint = nodeA;

        for (let i = 1; i <= numNewPoints; i++) {
            const fraction = i / (numNewPoints + 1);
            const interpolatedLat = nodeA[0] + fraction * (nodeB[0] - nodeA[0]);
            const interpolatedLng = nodeA[1] + fraction * (nodeB[1] - nodeA[1]);
            const newNode = [interpolatedLat, interpolatedLng];
            
            newSegments.push([lastPoint, newNode]);
            lastPoint = newNode;
        }
        newSegments.push([lastPoint, nodeB]);
        return newSegments;
    } else {
        // 路段足够短，不需要细分
        return [[nodeA, nodeB]];
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
    const MAX_CONNECTION_DISTANCE_METERS = 200;
    const MAX_ITERATIONS = 500; // 设置一个上限防止意外的无限循环
    const MIN_BFS_DISTANCE_TO_CONNECT = 10;
    let totalFixed = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        // 1. 在每一轮迭代的开始，都重新获取最新的死胡同列表
        const deadEndNodes = Array.from(targetState.adjacencyList.entries())
            .filter(([_, neighbors]) => neighbors.length === 1)
            .map(([nodeStr, _]) => nodeStr.split(',').map(Number));
        
        // 如果没有死胡同了，或者只剩一个，就提前结束
        if (deadEndNodes.length < 1) {
            console.log(`已无死胡同可修复，总共修复了 ${totalFixed} 个。`);
            return;
        }

        let fixedInThisPass = 0;
        
        // 2. 遍历当前找到的死胡同
        for (const deadEndNode of deadEndNodes) {
            if (targetState.adjacencyList.get(deadEndNode.toString()).length > 1) {
                continue;
            }

            // 1. 找到所有候选节点并按物理距离排序
            let candidates = targetState.validPositions
                .map(p => {
                    const isSelf = positionsAreEqual(deadEndNode, p);
                    const isNeighbor = targetState.adjacencyList.get(deadEndNode.toString())
                                         .some(n => positionsAreEqual(n, p));
                    if (isSelf || isNeighbor) return null;

                    const dy = deadEndNode[0] - p[0];
                    const dx = deadEndNode[1] - p[1];
                    const distSq = dy * dy + dx * dx;
                    return { node: p, distSq: distSq };
                })
                .filter(c => c !== null) // 移除 null
                .sort((a, b) => a.distSq - b.distSq); // 按物理距离从小到大排序

            // 2. 依次检查候选者，直到找到第一个满足条件的
            let nodeToConnect = null;
            for (const candidate of candidates) {
                const distanceInMeters = Math.sqrt(candidate.distSq) * 111320;
                
                // 物理距离过远，后续的肯定也过远，直接跳出
                if (distanceInMeters > MAX_CONNECTION_DISTANCE_METERS) {
                    break;
                }

                // *** 核心检查：计算 BFS 距离 ***
                const pathDistance = bfsDistance(
                    deadEndNode, 
                    candidate.node, 
                    targetState.adjacencyList,
                    MIN_BFS_DISTANCE_TO_CONNECT + 5 // 搜索深度比阈值稍大即可
                );

                if (pathDistance > MIN_BFS_DISTANCE_TO_CONNECT) {
                    // 找到了！这个节点既物理距离近，又路径距离远
                    nodeToConnect = candidate.node;
                    break; // 停止搜索，就用这个了
                }
            }
            
            // 3. 如果找到了符合条件的节点，就执行连接
            const MAX_SEGMENT_LENGTH_FOR_NEW_ROADS = 20;
            if (nodeToConnect) {
                const nodeA = deadEndNode;
                const nodeB = nodeToConnect;

                // --- *** 关键修改：细分新创建的道路 *** ---

                // 1. 调用细分函数
                const newSegments = subdivideSegment(nodeA, nodeB, MAX_SEGMENT_LENGTH_FOR_NEW_ROADS);

                // 2. 处理细分后产生的新节点和新路段
                let previousNode = nodeA;
                newSegments.forEach((seg, index) => {
                    const currentNode = seg[1];

                    // a. 将新节点加入 validPositions 和 adjacencyList
                    if (!targetState.validPositions.some(p => positionsAreEqual(p, currentNode))) {
                        targetState.validPositions.push(currentNode);
                        targetState.adjacencyList.set(currentNode.toString(), []);
                    }
                    
                    // b. 将新路段加入 roadNetwork
                    targetState.roadNetwork.push([previousNode, currentNode]);

                    // c. 更新 adjacencyList 的连接
                    targetState.adjacencyList.get(previousNode.toString()).push(currentNode);
                    targetState.adjacencyList.get(currentNode.toString()).push(previousNode);

                    previousNode = currentNode;
                });

                fixedInThisPass++;
                totalFixed++;
            }

        }

        // 5. 如果这一整轮都没有修复任何死胡同，说明已经稳定，可以结束了
        if (fixedInThisPass === 0) {
            console.log(`本轮未修复任何死胡同，结构稳定。总共修复了 ${totalFixed} 个。`);
            return;
        }
    }

    console.warn(`连接死胡同达到最大迭代次数 ${MAX_ITERATIONS}。总共修复了 ${totalFixed} 个。`);
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

export function getRandomPointInCircle(center, radius) {
    // 将半径从米转换为经纬度的大致偏移量
    // 这是一个简化计算，在小范围内足够精确
    // 1度纬度约等于 111320 米
    const radiusInDegrees = radius / 111320;

    // 使用极坐标法生成随机点
    // r 是半径，theta 是角度
    const r = radiusInDegrees * Math.sqrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;

    const randomLat = center.lat + r * Math.cos(theta);
    // 修正经度偏移量，因为经度距离随纬度变化
    const randomLng = center.lng + (r * Math.sin(theta)) / Math.cos(center.lat * (Math.PI / 180));

    return L.latLng(randomLat, randomLng);
}