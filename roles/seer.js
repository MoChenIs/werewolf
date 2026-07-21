// roles/seer.js - 预言家查验逻辑

function processSeerAction(engine, socketId, targetSeat) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'seer') {
    return { error: '你不是预言家' };
  }
  if (engine.phase !== 'night_seer') {
    return { error: '当前不是预言家行动阶段' };
  }

  const target = Array.from(engine.room.players.values())
    .find(p => p.seat === targetSeat);
  if (!target) return { error: '目标玩家不存在' };
  if (!target.isAlive) return { error: '目标玩家已死亡' };

  const isWerewolf = target.role === 'werewolf';
  const resultText = isWerewolf ? '【狼人】' : '【好人】';

  engine.addLog('night_action', `预言家查验 ${targetSeat}号: ${resultText}`, targetSeat);

  return {
    success: true,
    target: { seat: target.seat, name: target.name },
    isWerewolf,
    resultText,
    message: `你查验了 ${targetSeat}号 ${target.name}，他的身份是${resultText}`
  };
}

function getSeerTargets(engine) {
  return Array.from(engine.room.players.values())
    .filter(p => p.isAlive)
    .map(p => ({ seat: p.seat, name: p.name }));
}

module.exports = { processSeerAction, getSeerTargets };
