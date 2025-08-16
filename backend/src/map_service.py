"""
地圖數據處理服務
負責從 OpenStreetMap 獲取數據、處理路網、生成遊戲元素
"""

import asyncio
import json
import math
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import aiohttp

from models import MapBounds, MapConfig, POIData, ProcessedMapData, RoadSegment


class MapService:
    """地圖數據處理服務"""

    def __init__(self):
        self.cache: Dict[int, ProcessedMapData] = {}
        self.cache_dir = Path("cache/maps")
        self.cache_expiry_hours = 24  # 快取過期時間（小時）

        # 確保快取目錄存在
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.map_configs = [
            MapConfig(
                name="台北市中心",
                center=[25.0330, 121.5654],
                zoom=18,
                bounds=MapBounds(south=25.025, west=121.555, north=25.041, east=121.575),
            ),
            MapConfig(
                name="台中市區",
                center=[24.1477, 120.6736],
                zoom=18,
                bounds=MapBounds(south=24.140, west=120.665, north=24.155, east=120.682),
            ),
            MapConfig(
                name="高雄市區",
                center=[22.6273, 120.3014],
                zoom=18,
                bounds=MapBounds(south=22.620, west=120.293, north=22.635, east=120.310),
            ),
        ]

    async def get_processed_map_data(self, map_index: int, force_refresh: bool = False) -> Optional[ProcessedMapData]:
        """獲取處理後的地圖數據"""
        if map_index < 0 or map_index >= len(self.map_configs):
            return None

        # 檢查記憶體快取
        if not force_refresh and map_index in self.cache:
            return self.cache[map_index]

        # 檢查磁碟快取
        if not force_refresh:
            cached_data = await self._load_from_cache(map_index)
            if cached_data:
                self.cache[map_index] = cached_data
                return cached_data

        # 處理地圖數據
        config = self.map_configs[map_index]
        processed_data = await self._process_map_data(map_index, config)

        if processed_data:
            self.cache[map_index] = processed_data
            # 保存到磁碟快取
            await self._save_to_cache(map_index, processed_data)

        return processed_data

    async def _load_from_cache(self, map_index: int) -> Optional[ProcessedMapData]:
        """從磁碟快取載入地圖數據"""
        cache_file = self.cache_dir / f"map_{map_index}.json"

        if not cache_file.exists():
            return None

        try:
            # 檢查快取是否過期
            file_time = datetime.fromtimestamp(cache_file.stat().st_mtime)
            if datetime.now() - file_time > timedelta(hours=self.cache_expiry_hours):
                # 快取過期，刪除檔案
                os.remove(cache_file)
                return None

            # 載入快取數據
            with open(cache_file, encoding="utf-8") as f:
                data = json.load(f)
                return ProcessedMapData(**data)

        except Exception as e:
            print(f"載入快取失敗: {e}")
            # 如果載入失敗，刪除損壞的快取檔案
            if cache_file.exists():
                os.remove(cache_file)
            return None

    async def _save_to_cache(self, map_index: int, data: ProcessedMapData) -> None:
        """保存地圖數據到磁碟快取"""
        cache_file = self.cache_dir / f"map_{map_index}.json"

        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                # 將 ProcessedMapData 轉換為字典並序列化
                json.dump(data.model_dump(), f, ensure_ascii=False, indent=2, default=str)

        except Exception as e:
            print(f"保存快取失敗: {e}")

    async def _process_map_data(self, map_index: int, config: MapConfig) -> Optional[ProcessedMapData]:
        """處理地圖數據"""
        try:
            # 並行獲取道路和 POI 數據
            road_data, poi_data = await asyncio.gather(
                self._fetch_road_data(config.bounds), self._fetch_poi_data(config.bounds)
            )

            if not road_data:
                return None

            # 生成路網
            road_network, valid_positions, adjacency_list = self._generate_road_network(road_data)

            # 處理 POI 數據
            pois = self._process_poi_data(poi_data) if poi_data else []

            # 生成遊戲元素位置
            ghost_spawn_points = self._generate_spawn_points(valid_positions, count=5)
            scatter_points = self._generate_spawn_points(valid_positions, count=3)

            return ProcessedMapData(
                map_index=map_index,
                map_name=config.name,
                center=config.center,
                zoom=config.zoom,
                bounds=config.bounds,
                road_network=road_network,
                valid_positions=valid_positions,
                adjacency_list=adjacency_list,
                pois=pois,
                ghost_spawn_points=ghost_spawn_points,
                scatter_points=scatter_points,
                processed_at=datetime.now(),
            )

        except Exception as e:
            print(f"處理地圖數據時發生錯誤: {e}")
            return None

    async def _fetch_road_data(self, bounds: MapBounds) -> Optional[dict]:
        """從 Overpass API 獲取道路數據"""
        query = f"""
        [out:json][timeout:25];
        (
          way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|razed|abandoned)$"]
             ["area"!~"yes"]["access"!~"private"]["service"!~"^(driveway|parking_aisle|alley)$"]
             ({bounds.south},{bounds.west},{bounds.north},{bounds.east});
        );
        out body;
        >;
        out skel qt;
        """

        url = "https://overpass-api.de/api/interpreter"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data={"data": query}) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        print(f"獲取道路數據失敗: HTTP {response.status}")
                        return None
        except Exception as e:
            print(f"獲取道路數據時發生錯誤: {e}")
            return None

    async def _fetch_poi_data(self, bounds: MapBounds) -> Optional[dict]:
        """從 Overpass API 獲取 POI 數據"""
        bbox = f"{bounds.south},{bounds.west},{bounds.north},{bounds.east}"

        query = f"""
        [out:json][timeout:25];
        (
          node["historic"~"^(monument)$"]({bbox});
          node["shop"~"^(convenience)$"]({bbox});
          node["leisure"~"^(park)$"]({bbox});
          node["tourism"~"^(hotel)$"]({bbox});
          node["amenity"~"^(bank|restaurant|cafe|bubble_tea|atm)$"]({bbox});
        );
        out body;
        >;
        out skel qt;
        """

        url = "https://overpass-api.de/api/interpreter"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data={"data": query}) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        print(f"獲取 POI 數據失敗: HTTP {response.status}")
                        return None
        except Exception as e:
            print(f"獲取 POI 數據時發生錯誤: {e}")
            return None

    def _generate_road_network(
        self, osm_data: dict, max_segment_length: float = 20.0
    ) -> Tuple[List[RoadSegment], List[List[float]], Dict[str, List[List[float]]]]:
        """生成路網數據"""
        if not osm_data or "elements" not in osm_data:
            return [], [], {}

        # 解析節點和路徑
        nodes = {}
        ways = []

        for element in osm_data["elements"]:
            if element["type"] == "node":
                nodes[element["id"]] = [element["lat"], element["lon"]]
            elif element["type"] == "way" and "nodes" in element:
                ways.append(element["nodes"])

        # 生成初始路網
        initial_segments = []
        unique_nodes = set()

        for node_ids in ways:
            way_points = []
            for node_id in node_ids:
                if node_id in nodes:
                    pos = nodes[node_id]
                    way_points.append(pos)
                    unique_nodes.add(tuple(pos))

            if len(way_points) > 1:
                for i in range(len(way_points) - 1):
                    initial_segments.append([way_points[i], way_points[i + 1]])

        # 細分長路段
        road_segments = []
        valid_positions = []

        for segment in initial_segments:
            subdivided = self._subdivide_segment(segment[0], segment[1], max_segment_length)
            road_segments.extend([RoadSegment(start=s[0], end=s[1]) for s in subdivided])

            # 收集所有節點
            for s in subdivided:
                if s[0] not in valid_positions:
                    valid_positions.append(s[0])
                if s[1] not in valid_positions:
                    valid_positions.append(s[1])

        # 生成鄰接表
        adjacency_list = self._build_adjacency_list(road_segments, valid_positions)

        return road_segments, valid_positions, adjacency_list

    def _subdivide_segment(self, start: List[float], end: List[float], max_length: float) -> List[List[List[float]]]:
        """細分路段"""
        distance = self._calculate_distance(start, end)

        if distance <= max_length:
            return [[start, end]]

        # 計算需要細分的段數
        num_segments = math.ceil(distance / max_length)
        segments = []

        for i in range(num_segments):
            t1 = i / num_segments
            t2 = (i + 1) / num_segments

            point1 = [start[0] + t1 * (end[0] - start[0]), start[1] + t1 * (end[1] - start[1])]
            point2 = [start[0] + t2 * (end[0] - start[0]), start[1] + t2 * (end[1] - start[1])]

            segments.append([point1, point2])

        return segments

    def _calculate_distance(self, pos1: List[float], pos2: List[float]) -> float:
        """計算兩點間距離（公尺）"""
        # 簡化的距離計算，適用於小範圍
        lat_diff = pos1[0] - pos2[0]
        lng_diff = pos1[1] - pos2[1]

        # 大約轉換為公尺
        lat_meters = lat_diff * 111000  # 1度緯度約111km
        lng_meters = lng_diff * 111000 * math.cos(math.radians(pos1[0]))  # 經度隨緯度變化

        return math.sqrt(lat_meters**2 + lng_meters**2)

    def _build_adjacency_list(
        self, road_segments: List[RoadSegment], valid_positions: List[List[float]]
    ) -> Dict[str, List[List[float]]]:
        """建立鄰接表"""
        adjacency = {}
        tolerance = 1e-6  # 位置比較容差

        for segment in road_segments:
            start_key = f"{segment.start[0]:.6f},{segment.start[1]:.6f}"
            end_key = f"{segment.end[0]:.6f},{segment.end[1]:.6f}"

            # 初始化鄰接表
            if start_key not in adjacency:
                adjacency[start_key] = []
            if end_key not in adjacency:
                adjacency[end_key] = []

            # 添加雙向連接
            if segment.end not in adjacency[start_key]:
                adjacency[start_key].append(segment.end)
            if segment.start not in adjacency[end_key]:
                adjacency[end_key].append(segment.start)

        return adjacency

    def _process_poi_data(self, poi_data: dict) -> List[POIData]:
        """處理 POI 數據"""
        if not poi_data or "elements" not in poi_data:
            return []

        pois = []
        for element in poi_data["elements"]:
            if element["type"] == "node" and "lat" in element and "lon" in element:
                tags = element.get("tags", {})

                # 確定 POI 類型
                poi_type = self._determine_poi_type(tags)
                if poi_type:
                    poi = POIData(
                        id=str(element["id"]),
                        type=poi_type,
                        name=tags.get("name"),
                        lat=element["lat"],
                        lng=element["lon"],
                        tags=tags,
                    )
                    pois.append(poi)

        return pois

    def _determine_poi_type(self, tags: dict) -> Optional[str]:
        """確定 POI 類型"""
        if "historic" in tags and tags["historic"] == "monument":
            return "monument"
        elif "shop" in tags and tags["shop"] == "convenience":
            return "store"
        elif "leisure" in tags and tags["leisure"] == "park":
            return "park"
        elif "tourism" in tags and tags["tourism"] == "hotel":
            return "hotel"
        elif "amenity" in tags:
            amenity = tags["amenity"]
            if amenity in ["bank", "atm"]:
                return "bank"
            elif amenity in ["restaurant", "cafe", "bubble_tea"]:
                return "restaurant"

        return None

    def _generate_spawn_points(self, valid_positions: List[List[float]], count: int) -> List[List[float]]:
        """生成生成點"""
        if len(valid_positions) < count:
            return valid_positions.copy()

        # 簡單的均勻分佈選擇
        step = len(valid_positions) // count
        spawn_points = []

        for i in range(count):
            index = i * step
            if index < len(valid_positions):
                spawn_points.append(valid_positions[index])

        return spawn_points


# 全域實例
map_service = MapService()
