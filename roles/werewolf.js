// roles/werewolf.js - 狼人行动逻辑

function processWerewolfAction(engine, socketId, targetSeat) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'werewolf') {
    return { error: '你不是狼人' };
  }
  if (engine.phase !== 'night_werewolf') {
    return { error: '当前不是狼人行动阶段' };
  }

  // 记录狼人击杀目标
  engine.nightActions.werewolfKill = targetSeat;
  engine.addLog('night_action', `狼人选中击杀 ${targetSeat}号`, targetSeat);

  return {
    success: true,
    target: targetSeat,
    message: `狼人已选择击杀 ${targetSeat}号玩家`
  };
}

function getWerewolfTargets(engine) {
  return Array.from(engine.room.players.values())
    .filter(p => p.isAlive && p.role !== 'werewolf')
    .map(p => ({ seat: p.seat, name: p.name }));
}

module.exports = { processWerewolfAction, getWerewolfTargets };
