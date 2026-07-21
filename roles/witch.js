// roles/witch.js - 女巫行动逻辑

function processWitchAction(engine, socketId, { save, killTarget }) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'witch') {
    return { error: '你不是女巫' };
  }
  if (engine.phase !== 'night_witch') {
    return { error: '当前不是女巫行动阶段' };
  }

  const result = { success: true, messages: [] };

  // 不能同时使用两瓶药（如果都勾了，优先使用解药）
  const wantSave = save === true;
  const wantKill = killTarget !== undefined && killTarget !== null && killTarget > 0;

  // 使用解药
  if (wantSave && !wantKill) {
    if (engine.witchUsedSave) return { error: '你已使用过解药' };
    const killedSeat = engine.nightActions.werewolfKill;
    if (!killedSeat) return { error: '今晚无人被狼人击杀' };
    engine.nightActions.witchSave = killedSeat;
    engine.witchUsedSave = true;
    engine.addLog('night_action', `女巫使用解药救活 ${killedSeat}号`);
    result.messages.push(`你使用了解药，救活了 ${killedSeat}号玩家`);
  }

  // 使用毒药
  if (wantKill && !wantSave) {
    if (engine.witchUsedKill) return { error: '你已使用过毒药' };
    const target = Array.from(engine.room.players.values())
      .find(p => p.seat === killTarget);
    if (!target) return { error: '目标玩家不存在' };
    engine.nightActions.witchKill = killTarget;
    engine.witchUsedKill = true;
    engine.addLog('night_action', `女巫使用毒药毒杀 ${killTarget}号`);
    result.messages.push(`你使用了毒药，毒杀了 ${killTarget}号玩家`);
  }

  return {
    ...result,
    message: result.messages.join('；') || '你选择不使用任何药水'
  };
}

function getWitchInfo(engine, socketId) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'witch') return null;

  const killedSeat = engine.nightActions.werewolfKill;
  const killedPlayer = killedSeat
    ? Array.from(engine.room.players.values()).find(p => p.seat === killedSeat)
    : null;

  return {
    tonightKilled: killedPlayer ? { seat: killedPlayer.seat, name: killedPlayer.name } : null,
    hasSave: !engine.witchUsedSave,
    hasKill: !engine.witchUsedKill,
    aliveTargets: Array.from(engine.room.players.values())
      .filter(p => p.isAlive)
      .map(p => ({ seat: p.seat, name: p.name }))
  };
}

module.exports = { processWitchAction, getWitchInfo };
