// test/game-engine.test.js
const { GameEngine, roles } = require('../game-engine');

function createMockRoom(playerCount) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(`socket-${i}`, {
      id: `socket-${i}`, name: `玩家${i}`, seat: i,
      isAlive: true, role: null, disconnected: false, warnings: 0
    });
  }
  return { id: '123456', players, config: { maxPlayers: 12, werewolfCount: 2 }, seatCount: playerCount };
}

// 测试角色分配
const room = createMockRoom(8);
const engine = new GameEngine(room);
const result = engine.assignRoles();

console.assert(result.roleList.length === 8, `应有8个角色，实际${result.roleList.length}`);
const roleCounts = {};
result.roleList.forEach(r => { roleCounts[r] = (roleCounts[r] || 0) + 1; });
console.assert(roleCounts[roles.WEREWOLF] === 2, `应有2个狼人，实际${roleCounts[roles.WEREWOLF]}`);
console.assert(roleCounts[roles.SEER] === 1, `应有1个预言家，实际${roleCounts[roles.SEER]}`);
console.assert(roleCounts[roles.WITCH] === 1, `应有1个女巫，实际${roleCounts[roles.WITCH]}`);
console.assert(roleCounts[roles.HUNTER] === 1, `应有1个猎人，实际${roleCounts[roles.HUNTER]}`);
const villagerCount = roleCounts[roles.VILLAGER] || 0;
console.assert(villagerCount === 3, `应有3个平民，实际${villagerCount}`);
console.log('✓ 角色分配数量测试通过');

// 测试检查胜负 - 未结束
const endResult1 = engine.checkGameEnd();
console.assert(endResult1.ended === false, '游戏开始时不应结束');
console.log('✓ 未结束状态测试通过');

// 模拟狼人全死
Array.from(room.players.values()).filter(p => p.role === roles.WEREWOLF).forEach(p => p.isAlive = false);
const endResult2 = engine.checkGameEnd();
console.assert(endResult2.ended === true, '狼人全灭应结束');
console.assert(endResult2.winner === 'good', '狼人全灭好人应获胜');
console.log('✓ 好人胜利判定测试通过');

// 重置
Array.from(room.players.values()).forEach(p => p.isAlive = true);
// 模拟好人都死光只剩狼人
Array.from(room.players.values()).filter(p => p.role !== roles.WEREWOLF).forEach(p => p.isAlive = false);
const endResult3 = engine.checkGameEnd();
console.assert(endResult3.ended === true, '好人与狼人人数均等应结束');
console.log('✓ 狼人胜利判定测试通过');

console.log('\n所有 GameEngine 测试通过!');
