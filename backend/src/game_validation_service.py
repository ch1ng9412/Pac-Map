"""
遊戲驗證服務
負責驗證遊戲事件的合理性，防止作弊
"""

import uuid
from datetime import datetime
from typing import Dict, Optional

from models import (
    GameEvent,
    GameEventType,
    GameEventValidationResponse,
    GameSession,
    GameSessionEndRequest,
    GameSessionStartRequest,
)


class GameValidationService:
    """遊戲驗證服務"""

    def __init__(self):
        self.active_sessions: Dict[str, GameSession] = {}
        self.completed_sessions: Dict[str, GameSession] = {}

        # 遊戲規則配置
        self.game_rules = {
            "dot_points": 10,
            "power_pellet_points": 50,
            "ghost_points": 150,
            "max_game_time": 600,
            "max_lives": 3,
            "max_health": 100,
            "survival_bonus_per_second": 10,
            "max_score_per_minute": 5000,  # 防止異常高分
            "min_time_between_events": 0.1,  # 最小事件間隔（秒）
        }

    def start_game_session(self, user_id: int, request: GameSessionStartRequest) -> str:
        """開始新的遊戲會話"""
        session_id = str(uuid.uuid4())

        session = GameSession(
            session_id=session_id,
            user_id=user_id,
            map_index=request.map_index,
            start_time=datetime.now(),
            events=[],
            is_valid=True,
            validation_errors=[],
        )

        self.active_sessions[session_id] = session

        print(f"開始新遊戲會話: {session_id}, 用戶: {user_id}, 地圖: {request.map_index}")
        return session_id

    def validate_game_event(self, session_id: str, event: GameEvent) -> GameEventValidationResponse:
        """驗證遊戲事件"""
        if session_id not in self.active_sessions:
            return GameEventValidationResponse(is_valid=False, errors=["遊戲會話不存在或已結束"])

        session = self.active_sessions[session_id]
        response = GameEventValidationResponse(is_valid=True, warnings=[], errors=[])

        # 基本驗證
        self._validate_basic_constraints(session, event, response)

        # 分數驗證
        self._validate_score_change(session, event, response)

        # 時間驗證
        self._validate_timing(session, event, response)

        # 生命值驗證
        self._validate_health_and_lives(session, event, response)

        # 事件特定驗證
        self._validate_event_specific(session, event, response)

        # 如果驗證通過，添加事件到會話
        if response.is_valid:
            session.events.append(event)
        else:
            session.is_valid = False
            session.validation_errors.extend(response.errors)

        return response

    def end_game_session(self, session_id: str, request: GameSessionEndRequest) -> bool:
        """結束遊戲會話並進行最終驗證"""
        if session_id not in self.active_sessions:
            return False

        session = self.active_sessions[session_id]
        session.end_time = datetime.now()
        session.final_score = request.final_score

        # 最終驗證
        self._validate_final_score(session, request)

        # 移動到已完成會話
        self.completed_sessions[session_id] = session
        del self.active_sessions[session_id]

        print(f"結束遊戲會話: {session_id}, 最終分數: {request.final_score}, 有效: {session.is_valid}")
        return session.is_valid

    def get_session_stats(self, session_id: str) -> Optional[Dict]:
        """獲取會話統計信息"""
        session = self.active_sessions.get(session_id) or self.completed_sessions.get(session_id)
        if not session:
            return None

        return {
            "session_id": session_id,
            "user_id": session.user_id,
            "map_index": session.map_index,
            "start_time": session.start_time.isoformat(),
            "end_time": session.end_time.isoformat() if session.end_time else None,
            "event_count": len(session.events),
            "final_score": session.final_score,
            "is_valid": session.is_valid,
            "validation_errors": session.validation_errors,
        }

    def _validate_basic_constraints(
        self, session: GameSession, event: GameEvent, response: GameEventValidationResponse
    ):
        """基本約束驗證"""
        # 檢查地圖索引
        if event.map_index != session.map_index:
            response.is_valid = False
            response.errors.append(f"地圖索引不匹配: 期望 {session.map_index}, 實際 {event.map_index}")

        # 檢查遊戲時間
        if event.game_time_remaining < 0 or event.game_time_remaining > self.game_rules["max_game_time"]:
            response.is_valid = False
            response.errors.append(f"遊戲時間異常: {event.game_time_remaining}")

        # 檢查生命值範圍
        if event.lives_after < 0 or event.lives_after > self.game_rules["max_lives"]:
            response.is_valid = False
            response.errors.append(f"生命值異常: {event.lives_after}")

        # 檢查血量範圍
        if event.health_after < 0 or event.health_after > self.game_rules["max_health"]:
            response.is_valid = False
            response.errors.append(f"血量異常: {event.health_after}")

    def _validate_score_change(self, session: GameSession, event: GameEvent, response: GameEventValidationResponse):
        """分數變化驗證"""
        score_change = event.score_after - event.score_before
        expected_score_change = 0

        # 根據事件類型計算期望的分數變化
        if event.event_type == GameEventType.DOT_COLLECTED:
            expected_score_change = self.game_rules["dot_points"]
        elif event.event_type == GameEventType.POWER_PELLET_COLLECTED:
            expected_score_change = self.game_rules["power_pellet_points"]
        elif event.event_type == GameEventType.GHOST_EATEN:
            expected_score_change = self.game_rules["ghost_points"]
        elif event.event_type in [
            GameEventType.LIFE_LOST,
            GameEventType.HEALTH_CHANGED,
            GameEventType.BACKPACK_ITEM_USED,
        ]:
            expected_score_change = 0

        # 驗證分數變化
        if score_change != expected_score_change:
            if abs(score_change - expected_score_change) > 10:  # 允許小幅誤差
                response.is_valid = False
                response.errors.append(f"分數變化異常: 期望 {expected_score_change}, 實際 {score_change}")
            else:
                response.warnings.append(f"分數變化輕微偏差: 期望 {expected_score_change}, 實際 {score_change}")

        # 檢查分數是否只增不減（除了特殊情況）
        if score_change < 0:
            response.is_valid = False
            response.errors.append(f"分數異常減少: {score_change}")

        # 檢查分數增長速度
        self._validate_score_growth_rate(session, event, response)

        response.expected_score = event.score_before + expected_score_change
        response.score_difference = score_change - expected_score_change

    def _validate_score_growth_rate(
        self, session: GameSession, event: GameEvent, response: GameEventValidationResponse
    ):
        """驗證分數增長速度"""
        if not session.events:
            return

        # 計算最近一段時間的分數增長
        recent_events = [
            e
            for e in session.events[-10:]
            if e.event_type
            in [GameEventType.DOT_COLLECTED, GameEventType.POWER_PELLET_COLLECTED, GameEventType.GHOST_EATEN]
        ]

        if len(recent_events) >= 5:
            time_span = event.timestamp - recent_events[0].timestamp
            if time_span > 0:
                total_score_gain = sum(e.score_after - e.score_before for e in recent_events) + (
                    event.score_after - event.score_before
                )

                score_per_second = total_score_gain / time_span
                max_reasonable_rate = self.game_rules["max_score_per_minute"] / 60

                if score_per_second > max_reasonable_rate:
                    response.warnings.append(
                        f"分數增長過快: {score_per_second:.1f} 分/秒 (最大合理值: {max_reasonable_rate:.1f})"
                    )

    def _validate_timing(self, session: GameSession, event: GameEvent, response: GameEventValidationResponse):
        """時間驗證"""
        if not session.events:
            return

        last_event = session.events[-1]
        time_diff = event.timestamp - last_event.timestamp

        # 檢查事件間隔
        if time_diff < self.game_rules["min_time_between_events"]:
            response.warnings.append(f"事件間隔過短: {time_diff:.3f}秒")

        # 檢查遊戲時間變化
        game_time_diff = last_event.game_time_remaining - event.game_time_remaining
        if game_time_diff < 0:
            response.is_valid = False
            response.errors.append("遊戲時間倒退")
        elif game_time_diff > time_diff + 2:  # 允許2秒誤差
            response.warnings.append(f"遊戲時間變化異常: {game_time_diff}")

    def _validate_health_and_lives(self, session: GameSession, event: GameEvent, response: GameEventValidationResponse):
        """生命值和血量驗證"""
        lives_change = event.lives_after - event.lives_before
        health_change = event.health_after - event.health_before

        # 生命值只能減少或保持不變
        if lives_change > 0:
            response.is_valid = False
            response.errors.append(f"生命值異常增加: {lives_change}")

        # 特定事件的生命值變化驗證
        if event.event_type == GameEventType.LIFE_LOST:
            if lives_change != -1:
                response.is_valid = False
                response.errors.append(f"失去生命事件中生命值變化錯誤: {lives_change}")
            if event.health_after != 0:
                response.warnings.append(f"失去生命後血量應為0: {event.health_after}")

        # 血量變化驗證
        if event.event_type == GameEventType.BACKPACK_ITEM_USED:
            if health_change <= 0:
                response.warnings.append("使用背包物品但血量未增加")
        elif event.event_type == GameEventType.HEALTH_CHANGED:
            if abs(health_change) < 0.1:
                response.warnings.append("血量變化事件但變化量很小")

    def _validate_event_specific(self, session: GameSession, event: GameEvent, response: GameEventValidationResponse):
        """事件特定驗證"""
        if event.event_type == GameEventType.GAME_START:
            self._validate_game_start(session, event, response)
        elif event.event_type == GameEventType.LEVEL_COMPLETED:
            self._validate_level_completion(session, event, response)
        elif event.event_type == GameEventType.GHOST_EATEN:
            self._validate_ghost_eaten(session, event, response)
        elif event.event_type == GameEventType.POWER_PELLET_COLLECTED:
            self._validate_power_pellet_collected(session, event, response)

    def _validate_game_start(self, session: GameSession, event: GameEvent, response: GameEventValidationResponse):
        """驗證遊戲開始事件"""
        if session.events:
            response.warnings.append("遊戲已經開始，重複的開始事件")

        if event.score_before != 0 or event.score_after != 0:
            response.is_valid = False
            response.errors.append("遊戲開始時分數應為0")

        if event.lives_before != 3 or event.lives_after != 3:
            response.warnings.append("遊戲開始時生命值異常")

        if event.health_before != 100 or event.health_after != 100:
            response.warnings.append("遊戲開始時血量異常")

    def _validate_level_completion(self, session: GameSession, event: GameEvent, response: GameEventValidationResponse):
        """驗證關卡完成事件"""
        if event.additional_data:
            dots_remaining = event.additional_data.get("dots_remaining", 0)
            if dots_remaining > 0:
                response.warnings.append(f"完成關卡但仍有 {dots_remaining} 個豆子")

            # 檢查關卡完成的合理性
            dots_collected_this_level = event.additional_data.get("dots_collected_this_level", 0)
            if dots_collected_this_level < 10:
                response.warnings.append(f"關卡完成但收集豆子數量過少: {dots_collected_this_level}")

    def _validate_ghost_eaten(self, session: GameSession, event: GameEvent, response: GameEventValidationResponse):
        """驗證吃鬼事件"""
        # 檢查是否在能量模式中
        recent_power_pellets = [e for e in session.events[-20:] if e.event_type == GameEventType.POWER_PELLET_COLLECTED]

        if not recent_power_pellets:
            response.warnings.append("吃鬼事件但最近沒有吃能量豆記錄")
        else:
            last_power_pellet = recent_power_pellets[-1]
            time_since_power = event.timestamp - last_power_pellet.timestamp
            if time_since_power > 10:  # 能量模式通常持續10秒
                response.warnings.append(f"吃鬼事件距離上次能量豆過久: {time_since_power:.1f}秒")

    def _validate_power_pellet_collected(
        self, session: GameSession, event: GameEvent, response: GameEventValidationResponse
    ):
        """驗證能量豆收集事件"""
        # 檢查能量豆收集頻率
        recent_power_pellets = [e for e in session.events[-10:] if e.event_type == GameEventType.POWER_PELLET_COLLECTED]

        if len(recent_power_pellets) >= 3:
            time_span = event.timestamp - recent_power_pellets[0].timestamp
            if time_span < 30:  # 30秒內收集3個能量豆可能異常
                response.warnings.append(f"能量豆收集過於頻繁: 30秒內收集{len(recent_power_pellets) + 1}個")

    def _validate_final_score(self, session: GameSession, request: GameSessionEndRequest):
        """最終分數驗證"""
        if not session.events:
            session.validation_errors.append("沒有遊戲事件記錄")
            session.is_valid = False
            return

        # 計算基於事件的期望分數
        expected_base_score = 0
        for event in session.events:
            if event.event_type == GameEventType.DOT_COLLECTED:
                expected_base_score += self.game_rules["dot_points"]
            elif event.event_type == GameEventType.POWER_PELLET_COLLECTED:
                expected_base_score += self.game_rules["power_pellet_points"]
            elif event.event_type == GameEventType.GHOST_EATEN:
                expected_base_score += self.game_rules["ghost_points"]

        # 計算生存獎勵
        survival_bonus = request.survival_time * self.game_rules["survival_bonus_per_second"]
        expected_total_score = expected_base_score + survival_bonus

        # 驗證最終分數
        score_difference = abs(request.final_score - expected_total_score)
        if score_difference > expected_total_score * 0.1:  # 允許10%誤差
            session.validation_errors.append(
                f"最終分數差異過大: 期望約 {expected_total_score}, 實際 {request.final_score}"
            )
            session.is_valid = False

        # 檢查分數是否過高
        if session.end_time:
            game_duration_minutes = (session.end_time - session.start_time).total_seconds() / 60
            max_possible_score = game_duration_minutes * self.game_rules["max_score_per_minute"]
            if request.final_score > max_possible_score:
                session.validation_errors.append(
                    f"分數過高，超出合理範圍: {request.final_score} > {max_possible_score}"
                )
                session.is_valid = False


# 全域實例
game_validation_service = GameValidationService()
