// test/roles.test.js
const { GameEngine } = require('../game-engine');
const { processWerewolfAction } = require('../roles/werewolf');
const { processSeerAction } = require('../roles/seer');
const { processWitchAction } = require('../roles/witch');

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

// 测试狼人行动
const room1 = createMockRoom(6);
const engine1 = new GameEngine(room1);
engine1.assignRoles();
engine1.phase = 'night_werewolf';

const werewolf = Array.from(room1.players.values()).find(p => p.role === 'werewolf');
const result1 = processWerewolfAction(engine1, werewolf.id, 3);
console.assert(result1.success === true, '狼人行动应成功');
console.assert(engine1.nightActions.werewolfKill === 3, '击杀目标应为3号');
console.log('✓ 狼人行动测试通过');

// 测试预言家查验
const room2 = createMockRoom(6);
const engine2 = new GameEngine(room2);
engine2.assignRoles();
engine2.phase = 'night_seer';

const seer = Array.from(room2.players.values()).find(p => p.role === 'seer');
const nonSeer = Array.from(room2.players.values()).find(p => p.role !== 'seer');
const result2 = processSeerAction(engine2, seer.id, nonSeer.seat);
console.assert(result2.success === true, '预言家查验应成功');
console.assert(result2.target.seat === nonSeer.seat, '查验目标应为指定玩家');
console.assert(result2.isWerewolf === (nonSeer.role === 'werewolf'), '查验结果应正确');
console.log('✓ 预言家查验测试通过');

// 测试女巫解药
const room3 = createMockRoom(6);
const engine3 = new GameEngine(room3);
engine3.assignRoles();
engine3.phase = 'night_witch';
engine3.nightActions.werewolfKill = 5;
const witch = Array.from(room3.players.values()).find(p => p.role === 'witch');
const result3 = processWitchAction(engine3, witch.id, { save: true });
console.assert(result3.success === true, '女巫使用解药应成功');
console.assert(engine3.nightActions.witchSave === 5, '解救目标应为5号');
console.assert(engine3.witchUsedSave === true, '解药应标记已使用');
console.log('✓ 女巫解药测试通过');

// 测试女巫毒药（新场景）
const room3c = createMockRoom(6);
const engine3c = new GameEngine(room3c);
engine3c.assignRoles();
engine3c.phase = 'night_witch';
const witch3c = Array.from(room3c.players.values()).find(p => p.role === 'witch');
const result3c = processWitchAction(engine3c, witch3c.id, { killTarget: 4 });
console.assert(result3c.success === true, '女巫使用毒药应成功');
console.assert(engine3c.nightActions.witchKill === 4, '毒杀目标应为4号');
console.log('✓ 女巫毒药测试通过');

console.log('\n所有角色技能测试通过!');
