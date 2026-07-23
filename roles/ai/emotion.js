// ========== AI 情绪状态机 ==========

const { getOrCreateAIState, setEmotion } = require('./AIState');

/**
 * 情绪对参数的调节系数
 * speechLength: 发言长度倍率
 * disguiseAbility: 伪装能力倍率 (1=正常, <1=下降)
 * slipChance: 嘴瓢概率倍率
 * aggressionBonus: 激进加成（投票/决策时加）
 * revealChance: 亮身份概率 (0~1)
 */
const EMOTION_MODIFIERS = {
  calm:    { speechLength: 1.0, disguiseAbility: 1.0, slipChance: 1.0, aggressionBonus: 0, revealChance: 0.0 },
  nervous: { speechLength: 0.7, disguiseAbility: 0.7, slipChance: 2.0, aggressionBonus: 0, revealChance: 0.2 },
  excited: { speechLength: 0.5, disguiseAbility: 0.5, slipChance: 3.0, aggressionBonus: 3, revealChance: 0.6 },
  revenge: { speechLength: 2.0, disguiseAbility: 0.1, slipChance: 5.0, aggressionBonus: 5, revealChance: 1.0 },
};

/**
 * 获取情绪调节后的参数
 * @param {object} player
 * @returns {object} { speechLength, disguiseAbility, slipChance, aggressionBonus, revealChance }
 */
function getModifiedParams(player) {
  const state = getOrCreateAIState(player);
  if (!state) return EMOTION_MODIFIERS.calm;
  return EMOTION_MODIFIERS[state.emotion] || EMOTION_MODIFIERS.calm;
}

/**
 * 更新 AI 情绪
 * @param {object} engine - 游戏引擎
 * @param {object} player - 当前 AI 玩家
 * @returns {string} 更新后的情绪状态
 */
function updateEmotion(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return 'calm';

  const p = state.personality;
  let newEmotion = state.emotion || 'calm';

  // 1. 被投票出局且之前激动 → 报复
  if (wasJustVotedOut(engine, player.seat) && state.emotion === 'excited') {
    newEmotion = 'revenge';
    setEmotion(player, newEmotion);
    return newEmotion;
  }

  // 2. 计算被攻击次数
  const attackCount = countAttacksOnPlayer(engine, player.seat);

  // 3. 被揭穿伪装
  if (wasFakeExposed(engine, player)) {
    newEmotion = p.stability > 6 ? 'nervous' : 'excited';
    setEmotion(player, newEmotion);
    return newEmotion;
  }

  // 4. 根据攻击次数
  if (attackCount >= 3) {
    newEmotion = 'excited';
  } else if (attackCount >= 1) {
    newEmotion = p.stability > 7 ? 'calm' : 'nervous';
  } else {
    // 没有攻击，逐渐恢复平静
    newEmotion = 'calm';
  }

  setEmotion(player, newEmotion);
  return newEmotion;
}

/**
 * 检测玩家是否被投票出局
 */
function wasJustVotedOut(engine, seat) {
  if (!engine || !engine.getLogs) return false;
  try {
    const logs = engine.getLogs();
    if (!logs || !logs.length) return false;
    const lastLog = logs[logs.length - 1];
    return lastLog && lastLog.type === 'system' &&
      lastLog.content && lastLog.content.includes(`${seat}号`) &&
      lastLog.content.includes('离场');
  } catch (e) {
    return false;
  }
}

/**
 * 统计针对某玩家的攻击次数（最近 3 轮内的发言和投票）
 */
function countAttacksOnPlayer(engine, seat) {
  if (!engine || !engine.getLogs) return 0;
  try {
    const logs = engine.getLogs();
    if (!logs || !logs.length) return 0;
    const recentLogs = logs.slice(-20);
    let count = 0;
    for (const log of recentLogs) {
      if (!log.content) continue;
      // 发言中提到某 seat 号且态度负面
      if (log.content.includes(`${seat}号`) &&
        (log.content.includes('狼') || log.content.includes('可疑') ||
         log.content.includes('投票') || log.content.includes('出局'))) {
        count++;
      }
    }
    return count;
  } catch (e) {
    return 0;
  }
}

/**
 * 检测 AI 的伪装是否被揭穿
 */
function wasFakeExposed(engine, player) {
  if (!engine || !engine.getLogs) return false;
  const state = getOrCreateAIState(player);
  if (!state || !state.disguise || !state.disguise.fakeRole) return false;

  // 如果有其他玩家直接指出某 seat 是某个身份，且这个身份和伪装冲突
  try {
    const logs = engine.getLogs();
    if (!logs || !logs.length) return false;
    for (const log of logs.slice(-30)) {
      if (!log.content) continue;
      // 检测：有人声称该玩家是某个身份
      if (log.content.includes(`${player.seat}号`) &&
        (log.content.includes('是狼') || log.content.includes('是假的') ||
         log.content.includes('悍跳'))) {
        return true;
      }
    }
  } catch (e) { /* ignore */ }
  return false;
}

module.exports = {
  updateEmotion,
  getModifiedParams,
  EMOTION_MODIFIERS,
  wasJustVotedOut,
  countAttacksOnPlayer,
  wasFakeExposed,
};
