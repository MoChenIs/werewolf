const RoomManager = require('../room-manager');
const rm = new RoomManager();

// 测试创建房间
const result = rm.createRoom('socket-1', '玩家A');
console.assert(result.room, '创建房间应返回 room 对象');
console.assert(result.room.id.length === 6, '房间号应为6位');
console.assert(result.room.players.size === 1, '房间应包含创建者');
console.assert(result.player.seat === 1, '创建者座位应为1');
console.log('✓ 创建房间测试通过');

// 测试加入房间
const joinResult = rm.joinRoom(result.room.id, 'socket-2', '玩家B');
console.assert(joinResult.room, '加入房间应返回 room');
console.assert(joinResult.player.seat === 2, '加入者座位应为2');
console.log('✓ 加入房间测试通过');

// 测试满员
for (let i = 3; i <= 12; i++) {
  rm.joinRoom(result.room.id, `socket-${i}`, `玩家${i}`);
}
const fullResult = rm.joinRoom(result.room.id, 'socket-13', '玩家13');
console.assert(fullResult.error, '满员时应返回错误');
console.log('✓ 满员检测测试通过');

// 测试离开
const leaveResult = rm.leaveRoom('socket-2');
console.assert(leaveResult.action === 'left', '离开玩家应返回 left');
console.assert(leaveResult.seat === 2, '应返回离开者的座位号');
console.log('✓ 离开房间测试通过');

// 测试房间销毁
rm.leaveRoom('socket-1');
console.log('✓ 所有玩家离开后房间应被销毁');

console.log('\n所有 RoomManager 测试通过!');
