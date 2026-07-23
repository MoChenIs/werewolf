// ========== AI 运行时状态管理 ==========

const { generatePersonality } = require('./personality');

// 全局 AI 状态池：keyed by player.seat
const _states = new Map();

/**
 * 获取或创建 AI 状态
 * @param {object} player - 玩家对象（必须有 .seat 属性）
 * @returns {object} AIState
 */
function getOrCreateAIState(player) {
  if (!player || player.seat == null) return null;
  const key = player.seat;
  if (_states.has(key)) {
    return _states.get(key);
  }
  const state = createDefaultState(player);
  _states.set(key, state);
  return state;
}

/**
 * 获取 AI 状态（不存在返回 null）
 */
function getAIState(player) {
  if (!player || player.seat == null) return null;
  return _states.get(player.seat) || null;
}

/**
 * 创建默认 AI 状态
 */
function createDefaultState(player) {
  return {
    // 基本
    playerId: player.id || '',
    seat: player.seat,
    realRole: player.role || '',

    // 人格（首次调用时生成）
    personality: generatePersonality(),

    // 情绪
    emotion: 'calm',

    // 伪装
    disguise: {
      fakeRole: null,       // null = 不伪装, 否则为 'villager'|'seer'|'witch'|'hunter'
      claimedRound: 0,      // 第几轮跳的身份
      fakeKillTarget: null, // 狼跳预言家时的查杀对象 seat
      fakeReason: '',       // 编造的跳身份理由
    },

    // 记忆
    memory: {
      round: 0,
      events: [],           // { type, seat, round, content, timestamp }
    },

    // 游戏记录
    gameLog: [],

    // 标记：本轮是否已经决策过伪装
    _disguiseEvaluated: false,
  };
}

/**
 * 重置所有 AI 状态（新游戏时调用）
 */
function resetAllAIStates() {
  _states.clear();
}

/**
 * 删除某个玩家的 AI 状态
 */
function removeAIState(player) {
  if (!player || player.seat == null) return;
  _states.delete(player.seat);
}

/**
 * 更新伪装身份
 */
function setDisguise(player, disguiseInfo) {
  const state = getOrCreateAIState(player);
  if (!state) return;
  state.disguise = {
    ...state.disguise,
    ...disguiseInfo,
    claimedRound: state.memory.round,
  };
  state._disguiseEvaluated = true;
}

/**
 * 更新情绪
 */
function setEmotion(player, emotion) {
  const state = getOrCreateAIState(player);
  if (!state) return;
  state.emotion = emotion;
}

/**
 * 记录事件到记忆
 */
function rememberEvent(player, event) {
  const state = getOrCreateAIState(player);
  if (!state) return;
  state.memory.events.push({
    ...event,
    timestamp: Date.now(),
  });
  // 限制记忆长度，防止内存泄漏
  if (state.memory.events.length > 200) {
    state.memory.events = state.memory.events.slice(-150);
  }
}

/**
 * 追加游戏日志
 */
function logGame(player, message) {
  const state = getOrCreateAIState(player);
  if (!state) return;
  state.gameLog.push({
    round: state.memory.round,
    message,
    timestamp: Date.now(),
  });
  if (state.gameLog.length > 100) {
    state.gameLog = state.gameLog.slice(-80);
  }
}

/**
 * 更新当前轮次
 */
function setRound(player, round) {
  const state = getOrCreateAIState(player);
  if (!state) return;
  state.memory.round = round;
  state._disguiseEvaluated = false;
}

/**
 * 获取所有 AI 状态（用于调试）
 */
function getAllAIStates() {
  const result = {};
  for (const [key, val] of _states) {
    result[key] = val;
  }
  return result;
}

module.exports = {
  getOrCreateAIState,
  getAIState,
  resetAllAIStates,
  removeAIState,
  setDisguise,
  setEmotion,
  rememberEvent,
  logGame,
  setRound,
  getAllAIStates,
};
