// room-manager.js
// 负责房间的创建、加入、离开、销毁

const crypto = require('crypto');

class RoomManager {
  constructor() {
    this.rooms = new Map();  // roomId -> Room
  }

  // 生成6位房间号
  generateRoomId() {
    let id;
    do {
      id = crypto.randomInt(100000, 999999).toString();
    } while (this.rooms.has(id));
    return id;
  }

  // 创建房间
  createRoom(socketId, playerName, config = {}) {
    const roomId = this.generateRoomId();
    const player = {
      id: socketId,
      name: playerName,
      seat: 1,
      isAlive: true,
      isSheriff: false,
      role: null,
      isAfk: false,
      disconnected: false,
      warnings: 0,
      hasVoted: false,
      voteTarget: null,
      isAi: false
    };
    const room = {
      id: roomId,
      players: new Map([[socketId, player]]),
      host: socketId,
      status: 'waiting',  // 'waiting' | 'playing' | 'ended'
      config: {
        maxPlayers: config.maxPlayers || 9,
        werewolfCount: config.werewolfCount || 3
      },
      game: null,
      seatCount: 1
    };
    this.rooms.set(roomId, room);
    return { room, player };
  }

  // 加入房间
  joinRoom(roomId, socketId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: '房间不存在' };
    if (room.status !== 'waiting') return { error: '游戏已开始，无法加入' };
    if (room.players.size >= room.config.maxPlayers) return { error: '房间已满' };

    const seat = room.seatCount + 1;
    room.seatCount = seat;
    const player = {
      id: socketId,
      name: playerName,
      seat,
      isAlive: true,
      isSheriff: false,
      role: null,
      isAfk: false,
      disconnected: false,
      warnings: 0,
      hasVoted: false,
      voteTarget: null,
      isAi: false
    };
    room.players.set(socketId, player);
    return { room, player };
  }

  // 添加 AI 玩家
  addAiPlayer(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: '房间不存在' };
    if (room.status !== 'waiting') return { error: '游戏已开始，无法添加AI' };
    if (room.players.size >= room.config.maxPlayers) return { error: '房间已满' };

    const seat = room.seatCount + 1;
    room.seatCount = seat;
    const aiId = `ai_${seat}`;
    const player = {
      id: aiId,
      name: `AI-${seat}号`,
      seat,
      isAlive: true,
      isSheriff: false,
      role: null,
      isAfk: false,
      disconnected: false,
      warnings: 0,
      hasVoted: false,
      voteTarget: null,
      isAi: true
    };
    room.players.set(aiId, player);
    return { room, player };
  }

  // 玩家离开
  leaveRoom(socketId) {
    for (const [roomId, room] of this.rooms) {
      if (room.players.has(socketId)) {
        const player = room.players.get(socketId);
        room.players.delete(socketId);

        if (room.players.size === 0) {
          this.rooms.delete(roomId);
          return { roomId, action: 'destroyed' };
        }

        // 房主离开，转让给第一个非 AI 玩家
        if (room.host === socketId) {
          const nextHost = Array.from(room.players.values()).find(p => !p.isAi);
          if (!nextHost) return { roomId, action: 'destroyed' };
          room.host = nextHost.id;
          return { roomId, action: 'left', newHost: nextHost, seat: player.seat };
        }

        return { roomId, action: 'left', seat: player.seat };
      }
    }
    return { error: '玩家不在任何房间中' };
  }

  // 根据 socketId 查找房间
  findRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return null;
  }

  // 获取房间公开信息（不含角色）
  getRoomInfo(room) {
    const players = Array.from(room.players.values()).map(p => ({
      seat: p.seat,
      name: p.name,
      isAlive: p.isAlive,
      disconnected: p.disconnected,
      isHost: room.host === p.id,
      isAi: p.isAi || false
    }));
    players.sort((a, b) => a.seat - b.seat);
    return {
      id: room.id,
      host: room.host,
      status: room.status,
      config: room.config,
      players,
      playerCount: room.players.size
    };
  }
}

module.exports = RoomManager;
