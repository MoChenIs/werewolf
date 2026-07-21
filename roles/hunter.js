// roles/hunter.js - 猎人开枪逻辑

function processHunterAction(engine, socketId, targetSeat) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'hunter') {
    return { error: '你不是猎人' };
  }
  if (player.isAlive) return { error: '猎人只有在出局时才能开枪' };

  const target = Array.from(engine.room.players.values())
    .find(p => p.seat === targetSeat);
  if (!target) return { error: '目标玩家不存在' };
  if (!target.isAlive) return { error: '目标玩家已死亡' };
  if (target.id === socketId) return { error: '不能带走自己' };

  target.isAlive = false;
  engine.addLog('night_action', `猎人开枪带走 ${targetSeat}号 ${target.name}`);

  return {
    success: true,
    target: { seat: target.seat, name: target.name },
    message: `猎人带走了 ${targetSeat}号 ${target.name}`
  };
}

function getHunterTargets(engine) {
  return Array.from(engine.room.players.values())
    .filter(p => p.isAlive)
    .map(p => ({ seat: p.seat, name: p.name }));
}

module.exports = { processHunterAction, getHunterTargets };
