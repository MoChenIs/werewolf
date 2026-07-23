// ========== AI 各角色夜间行动逻辑 ==========

const { getOrCreateAIState, logGame } = require('./AIState');
const { updateEmotion, getModifiedParams } = require('./emotion');
const { evaluateDisguise, getAliveWolfCount, isPlayerSuspected } = require('./disguise');
const { weightedRandomSelect, randomChoice, chance, jitter } = require('./utils');

// ==================== 狼人夜间行动 ====================

/**
 * 狼人决策
 * @param {object} engine - 游戏引擎
 * @param {object} player - AI 玩家
 * @returns {{ target: number }} 目标 seat
 */
function processWerewolf(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return { target: 0 };

  const p = state.personality;
  const mod = getModifiedParams(player);

  // 更新情绪、评估伪装
  updateEmotion(engine, player);
  evaluateDisguise(engine, player);

  // 获取可刀的目标
  const targets = getKillTargets(engine, player);

  if (!targets.length) return { target: 0 };

  // === 1. 伪装成预言家时 → 制造查杀应验 ===
  if (state.disguise.fakeRole === 'seer' && state.disguise.fakeKillTarget) {
    const fakeTarget = targets.find(t => t.seat === state.disguise.fakeKillTarget);
    if (fakeTarget && chance(0.55)) {
      logGame(player, `狼人跳预言家，刀自己"查杀"的 ${fakeTarget.seat} 号验证查杀`);
      return { target: fakeTarget.seat };
    }
  }

  // === 2. 刀已知威胁（预言家、女巫等） ===
  const threats = identifyThreats(engine, player);
  if (threats.length > 0 && chance(0.6)) {
    const selected = weightedRandomSelect(threats, threats.map(t => t.score));
    if (selected) {
      logGame(player, `狼人优先刀威胁目标 ${selected.seat} 号`);
      return { target: selected.seat };
    }
  }

  // === 3. 跟队友意见 ===
  const packTarget = getWolfPackTarget(engine);
  if (packTarget && p.aggression < 6 && chance(0.4)) {
    logGame(player, `狼人跟团队投票，刀 ${packTarget} 号`);
    return { target: packTarget };
  }

  // === 4. 情绪化：激动时激进刀 ===
  if (state.emotion === 'excited' || state.emotion === 'revenge') {
    const t = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)] : null;
    if (t) {
      logGame(player, `狼人情绪${state.emotion}，随机激进刀人`);
      return { target: t.seat };
    }
  }

  // === 5. 误刀队友（低概率，记性差时更高） ===
  const teammates = getAliveTeammates(engine, player);
  if (teammates.length > 0 && chance(0.06 * (1 - p.memory / 10))) {
    const mate = randomChoice(teammates);
    logGame(player, `狼人误刀队友 ${mate.seat} 号`);
    return { target: mate.seat };
  }

  // === 6. 随机 ===
  const t = randomChoice(targets);
  logGame(player, `狼人随机刀 ${t ? t.seat : '?'} 号`);
  return { target: t ? t.seat : 0 };
}

// ==================== 预言家夜间行动 ====================

/**
 * 预言家决策
 * @param {object} engine
 * @param {object} player
 * @returns {{ target: number }}
 */
function processSeer(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return { target: 0, isWerewolf: false };

  const p = state.personality;

  updateEmotion(engine, player);
  evaluateDisguise(engine, player);

  const targets = getInvestigateTargets(engine, player);
  if (!targets.length) return { target: 0, isWerewolf: false };

  let targetSeat = 0;

  // === 1. 跳平民时，优先查跳神职的人 ===
  if (state.disguise.fakeRole === 'villager') {
    const claimers = getClaimedPowerRoles(engine);
    if (claimers.length > 0 && chance(0.55)) {
      targetSeat = randomChoice(claimers);
      logGame(player, `预言家(跳平民)查验跳神职的 ${targetSeat} 号`);
    }
  }

  // === 2. 查自己怀疑的人 ===
  if (!targetSeat) {
    const suspects = getSuspiciousTargets(engine, player);
    if (suspects.length > 0 && chance(0.65)) {
      targetSeat = weightedRandomSelect(suspects, suspects.map(() => Math.random() * 5 + 1));
      logGame(player, `预言家查验怀疑目标 ${targetSeat} 号`);
    }
  }

  // === 3. 查平时不说话的人 ===
  if (!targetSeat) {
    const quiet = targets.filter(t => !isPlayerActive(engine, t));
    if (quiet.length > 0 && chance(0.4)) {
      targetSeat = randomChoice(quiet);
      logGame(player, `预言家查验沉默玩家 ${targetSeat} 号`);
    }
  }

  // === 4. 重复查验（记性差） ===
  if (!targetSeat && p.memory < 4 && chance(0.15 * (1 - p.memory / 10))) {
    const prevTarget = getPreviousInvestTargets(engine, player);
    if (prevTarget.length > 0) {
      targetSeat = randomChoice(prevTarget);
      logGame(player, `预言家(健忘)重复查验 ${targetSeat} 号`);
    }
  }

  // === 5. 随机 ===
  if (!targetSeat) {
    const t = randomChoice(targets);
    targetSeat = t || 0;
    logGame(player, `预言家随机查验`);
  }

  // 查找目标角色判断是否为狼人
  let isWerewolf = false;
  if (targetSeat > 0 && engine && engine.room) {
    const target = Array.from(engine.room.players.values()).find(p => p.seat === targetSeat);
    if (target) {
      isWerewolf = target.role === 'werewolf';
    }
  }

  return { target: targetSeat, isWerewolf };
}

// ==================== 女巫夜间行动 ====================

/**
 * 女巫决策
 * @param {object} engine
 * @param {object} player
 * @returns {{ action: string, target: number|null }}
 */
function processWitch(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return { action: 'pass', target: null };

  const p = state.personality;

  updateEmotion(engine, player);
  evaluateDisguise(engine, player);

  // 获取今晚被刀的人
  const killed = getTonightKilled(engine);
  const action = { save: false, kill: null };

  // ===== 解药决策 =====
  if (player.hasSave !== false && killed) {
    let saveChance = 50; // 基准 50%

    // 首夜高度倾向救人
    if (state.memory.round <= 1) saveChance += 30;

    // 被刀的人是自己已知的好人？
    if (isKnownGood(engine, player, killed)) saveChance += 20;

    // 被刀的人是自己的怀疑对象？
    if (isSuspectedByPlayer(engine, player, killed)) saveChance -= 30;

    // 想隐藏身份 → 降低救人概率
    if (state.disguise.fakeRole === 'villager') saveChance -= 15;

    // 人格影响
    saveChance += (p.stability - 5) * 2; // 稳定的更理性
    saveChance += (Math.random() - 0.5) * 25;

    action.save = saveChance > 50;
  }

  // ===== 毒药决策 =====
  if (player.hasKill !== false) {
    let killChance = 20; // 女巫通常不太敢用毒

    // 有明确的狼人目标？
    const wolfTarget = getConfirmedWolfTarget(engine, player);
    if (wolfTarget) killChance += 35;

    // 隐藏身份 → 用毒概率降低
    if (state.disguise.fakeRole === 'villager') killChance -= 10;

    // 激进程度
    killChance += p.aggression * 3;

    // 情绪化用毒
    if (state.emotion === 'excited') killChance += 15;
    if (state.emotion === 'revenge') killChance += 25;

    killChance += (Math.random() - 0.5) * 20;

    if (chance(killChance / 100)) {
      const targets = getAlivePlayers(engine).filter(p => p.seat !== player.seat);
      action.kill = wolfTarget ? wolfTarget.seat :
        (targets.length > 0 ? randomChoice(targets).seat : null);
    }
  }

  return action;
}

// ==================== 猎人夜间行动 ====================

/**
 * 猎人决策
 * @param {object} engine
 * @param {object} player
 * @returns {{ target: number }}
 */
function processHunter(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return { target: 0 };

  updateEmotion(engine, player);

  const targets = getAlivePlayers(engine).filter(p => p.isAlive && p.seat !== player.seat);
  if (!targets.length) return { target: 0 };

  // 报复心态（被投票出局时）
  if (state.emotion === 'revenge') {
    const voters = getMyVoters(engine, player);
    if (voters.length > 0 && chance(0.6)) {
      const target = randomChoice(voters);
      logGame(player, `猎人(报复)带投自己的 ${target} 号`);
      return { target };
    }
  }

  // 带自己最怀疑的人
  const suspects = getSuspiciousTargets(engine, player);
  if (suspects.length > 0 && chance(0.65)) {
    const target = weightedRandomSelect(suspects, suspects.map(() => Math.random() * 3 + 1));
    logGame(player, `猎人带怀疑目标 ${target} 号`);
    return { target };
  }

  // 随机带
  const t = randomChoice(targets);
  return { target: t ? t.seat : 0 };
}

// ==================== 辅助函数 ====================

function getKillTargets(engine, player) {
  if (!engine || !engine.room) return [];
  try {
    return Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.role !== 'werewolf' && p.seat !== player.seat);
  } catch (e) { return []; }
}

function getInvestigateTargets(engine, player) {
  if (!engine || !engine.room) return [];
  try {
    return Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.seat !== player.seat)
      .map(p => p.seat);
  } catch (e) { return []; }
}

function getAlivePlayers(engine) {
  if (!engine || !engine.room) return [];
  try {
    return Array.from(engine.room.players.values()).filter(p => p.isAlive);
  } catch (e) { return []; }
}

function getAliveTeammates(engine, player) {
  if (!engine || !engine.room) return [];
  try {
    return Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.role === 'werewolf' && p.seat !== player.seat);
  } catch (e) { return []; }
}

function identifyThreats(engine, player) {
  // 目标是有角色的神职
  const threats = [];
  try {
    for (const p of engine.room.players.values()) {
      if (!p.isAlive || p.role === 'werewolf' || p.seat === player.seat) continue;
      let score = 5;

      if (p.role === 'seer') score += 15;    // 预言家最优先
      else if (p.role === 'witch') score += 12; // 女巫其次
      else if (p.role === 'hunter') score += 8; // 猎人再次

      // 活跃玩家更危险
      if (isPlayerActive(engine, p.seat)) score += 3;

      threats.push({ seat: p.seat, score });
    }
  } catch (e) { /* ignore */ }
  return threats;
}

function getWolfPackTarget(engine) {
  // 简单实现
  try {
    const nonWolves = Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.role !== 'werewolf');
    if (!nonWolves.length) return null;
    return nonWolves[Math.floor(Math.random() * nonWolves.length)].seat;
  } catch (e) { return null; }
}

function isPlayerActive(engine, targetSeat) {
  // 检查玩家是否活跃（在最近日志中有发言）
  if (!engine || !engine.getLogs) return Math.random() > 0.4;
  try {
    const logs = engine.getLogs();
    if (!logs) return Math.random() > 0.4;
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log.type === 'speech' && log.targetSeat === targetSeat) return true;
      if (log.seat === targetSeat && log.type === 'speech') return true;
    }
    return false;
  } catch (e) { return Math.random() > 0.4; }
}

function isKnownGood(engine, player, seat) {
  // 检查预言家是否查验过该玩家且是好人
  if (!engine || !engine.getLogs) return false;
  try {
    const logs = engine.getLogs();
    if (!logs) return false;
    for (const log of logs) {
      if (log.type === 'night_action' && log.content &&
          log.content.includes('预言家查验') &&
          log.content.includes(seat + '号') &&
          log.content.includes('【好人】')) {
        return true;
      }
    }
  } catch (e) { /* ignore */ }
  return false;
}

function isSuspectedByPlayer(engine, player, seat) {
  return Math.random() < 0.3;
}

function getClaimedPowerRoles(engine) {
  // 从 AI 状态中收集跳神职的玩家
  const claimers = [];
  try {
    for (const p of engine.room.players.values()) {
      const aiState = getOrCreateAIState(p);
      if (aiState && aiState.disguise &&
          (aiState.disguise.fakeRole === 'seer' ||
           aiState.disguise.fakeRole === 'witch' ||
           aiState.disguise.fakeRole === 'hunter')) {
        claimers.push(p.seat);
      }
    }
  } catch (e) { /* ignore */ }
  return claimers;
}

function getSuspiciousTargets(engine, player) {
  try {
    return Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.seat !== player.seat &&
        !(player.role === 'werewolf' && p.role === 'werewolf'))
      .map(p => p.seat);
  } catch (e) { return []; }
}

function getPreviousInvestTargets(engine, player) {
  // 从引擎日志中获取之前的查验目标
  const targets = [];
  if (!engine || !engine.getLogs) return targets;
  try {
    const logs = engine.getLogs();
    if (!logs) return targets;
    for (const log of logs) {
      if (log.type === 'night_action' && log.content &&
          log.content.includes('预言家AI选中查验')) {
        const match = log.content.match(/(d+)号/);
        if (match) targets.push(parseInt(match[1]));
      }
    }
  } catch (e) { /* ignore */ }
  return targets;
}

function getTonightKilled(engine) {
  // 从引擎获取今晚被狼人刀的目标
  if (!engine || !engine.nightActions) return null;
  return engine.nightActions.werewolfKill || null;
}

function getConfirmedWolfTarget(engine, player) {
  // 查找确认的狼人
  if (!engine || !engine.room) return null;
  try {
    for (const p of engine.room.players.values()) {
      if (p.isAlive && p.role === 'werewolf' && p.seat !== player.seat) {
        return p;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function getMyVoters(engine, player) {
  // 获取投票给该玩家的 seats
  const voters = [];
  if (!engine || !engine.votes) return voters;
  try {
    for (const [seat, target] of Object.entries(engine.votes)) {
      if (target === player.seat) {
        voters.push(seat);
      }
    }
  } catch (e) { /* ignore */ }
  return voters;
}

module.exports = {
  processWerewolf,
  processSeer,
  processWitch,
  processHunter,
};
