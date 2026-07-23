// ========== AI 信息过滤与遗忘系统 ==========

const { getOrCreateAIState, rememberEvent } = require('./AIState');
const { chance } = require('./utils');

/**
 * 事件重要性权重
 * 权重越高，越不容易被遗忘
 */
const EVENT_IMPORTANCE = {
  speech: 0.6,       // 普通发言
  vote: 1.0,         // 投票
  death: 0.9,        // 死亡
  claim: 1.2,        // 跳身份
  self_claim: 1.5,   // 自己跳的身份（不容易忘）
  night_kill: 0.8,   // 夜间刀人
  night_action: 0.7, // 夜间行动
};

/**
 * 判断是否应该遗忘某个事件
 * @param {number} memoryScore - 记忆力 (0-10)
 * @param {string} eventType - 事件类型
 * @returns {boolean} true = 遗忘此事件
 */
function shouldForget(memoryScore, eventType) {
  const importance = EVENT_IMPORTANCE[eventType] || 0.5;
  const forgetChance = Math.max(0, (1 - memoryScore / 12) * (1 / importance));
  return chance(Math.min(forgetChance, 0.95)); // 最高遗忘 95%
}

/**
 * AI 记录一条事件（只有没被遗忘的才会被记录）
 * @param {object} player
 * @param {object} event - { type, seat, round, content }
 * @param {boolean} [forceRemember=false] - 是否强制记住（自己做的事情）
 */
function tryRemember(player, event, forceRemember = false) {
  const state = getOrCreateAIState(player);
  if (!state) return;

  const memoryScore = state.personality.memory;

  // 强制记住 或 未触发遗忘 → 记录
  if (forceRemember || !shouldForget(memoryScore, event.type)) {
    rememberEvent(player, event);
  }
}

/**
 * 获取 AI 记忆中的所有事件
 * @param {object} player
 * @returns {object[]}
 */
function getMemory(player) {
  const state = getOrCreateAIState(player);
  if (!state) return [];
  return state.memory.events || [];
}

/**
 * 获取 AI 对某个特定玩家的记忆摘要
 * @param {object} player
 * @param {number} targetSeat
 * @returns {object} { speeches, votes, claims }
 */
function getMemoryAbout(player, targetSeat) {
  const events = getMemory(player);
  const result = { speeches: [], votes: [], claims: [] };

  for (const evt of events) {
    if (evt.seat !== targetSeat) continue;
    if (evt.type === 'speech') result.speeches.push(evt);
    else if (evt.type === 'vote') result.votes.push(evt);
    else if (evt.type === 'claim') result.claims.push(evt);
  }

  return result;
}

/**
 * 获取所有被记住的活着的玩家 seat 列表
 */
function getRememberedAliveSeats(player, engine) {
  const events = getMemory(player);
  const seats = new Set();
  for (const evt of events) {
    if (evt.seat && evt.seat > 0) seats.add(evt.seat);
  }
  // 过滤出还活着的
  if (engine && engine.room) {
    const aliveSeats = new Set(
      Array.from(engine.room.players.values())
        .filter(p => p.isAlive)
        .map(p => p.seat)
    );
    return Array.from(seats).filter(s => aliveSeats.has(s));
  }
  return Array.from(seats);
}

/**
 * 清理老记忆（每轮结束调用）
 */
function cleanOldMemory(player, maxPerType = 30) {
  const state = getOrCreateAIState(player);
  if (!state) return;

  const events = state.memory.events;
  // 只保留最新的事件
  if (events.length > maxPerType * 5) {
    state.memory.events = events.slice(-maxPerType * 5);
  }
}

/**
 * 获取 AI 记忆中的跳身份信息
 * @returns {Array<{seat: number, claimedRole: string, round: number}>}
 */
function getRememberedClaims(player) {
  const events = getMemory(player);
  return events
    .filter(e => e.type === 'claim' || e.type === 'self_claim')
    .map(e => ({
      seat: e.seat,
      claimedRole: e.content,
      round: e.round,
    }));
}

module.exports = {
  tryRemember,
  getMemory,
  getMemoryAbout,
  getRememberedAliveSeats,
  cleanOldMemory,
  getRememberedClaims,
  EVENT_IMPORTANCE,
};
