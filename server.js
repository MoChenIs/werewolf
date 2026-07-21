const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./room-manager');
const { GameEngine } = require('./game-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const roomManager = new RoomManager();

const PORT = process.env.PORT || 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io 连接
io.on('connection', (socket) => {
  console.log(`[连接] 玩家连接: ${socket.id}`);

  // 创建房间
  socket.on('create_room', ({ playerName, config }) => {
    const { room, player } = roomManager.createRoom(socket.id, playerName, config);
    socket.join(room.id);
    socket.emit('room_joined', roomManager.getRoomInfo(room));
    socket.emit('your_info', { seat: player.seat, playerId: socket.id });
  });

  // 加入房间
  socket.on('join_room', ({ roomId, playerName }) => {
    const result = roomManager.joinRoom(roomId, socket.id, playerName);
    if (result.error) {
      return socket.emit('error', { code: 'JOIN_FAILED', message: result.error });
    }
    socket.join(roomId);
    socket.emit('room_joined', roomManager.getRoomInfo(result.room));
    socket.emit('your_info', { seat: result.player.seat, playerId: socket.id });
    // 通知房间其他人
    socket.to(roomId).emit('player_joined', { seat: result.player.seat, name: result.player.name });
  });

  // 玩家离开
  socket.on('leave_room', () => {
    const result = roomManager.leaveRoom(socket.id);
    if (result.action === 'left') {
      socket.to(result.roomId).emit('player_left', { seat: result.seat });
      if (result.newHost) {
        io.to(result.roomId).emit('host_changed', { newHost: result.newHost });
      }
    }
  });

  // 开始游戏
  socket.on('start_game', () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return socket.emit('error', { code: 'NO_ROOM', message: '你不在房间中' });
    if (room.host !== socket.id) return socket.emit('error', { code: 'NOT_HOST', message: '只有房主可以开始游戏' });
    if (room.players.size < 4) return socket.emit('error', { code: 'NOT_ENOUGH', message: '至少需要4名玩家' });

    const engine = new GameEngine(room);
    room.game = engine;
    room.status = 'playing';
    engine.startGame();

    // 私密发送身份
    room.players.forEach((player) => {
      io.to(player.id).emit('game_started', { role: player.role });
    });

    // 广播游戏开始
    io.to(room.id).emit('phase_change', {
      phase: 'night_werewolf',
      message: '天黑请闭眼，狼人请行动...'
    });

    // 告知狼人队友
    const werewolves = engine.getWerewolves();
    const werewolfSeats = werewolves.map(w => ({ seat: w.seat, name: w.name }));
    werewolves.forEach(w => {
      io.to(w.id).emit('night_teammates', { teammates: werewolfSeats.filter(t => t.seat !== w.seat) });
    });

    // 通知狼人行动
    const firstWerewolf = werewolves[0];
    if (firstWerewolf) {
      io.to(firstWerewolf.id).emit('your_turn', {
        action: 'night_kill',
        targets: Array.from(room.players.values()).filter(p => p.isAlive).map(p => ({ seat: p.seat, name: p.name }))
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[断开] 玩家断开: ${socket.id}`);
    const result = roomManager.leaveRoom(socket.id);
    if (result && result.action === 'left') {
      io.to(result.roomId).emit('player_left', { seat: result.seat });
      if (result.newHost) {
        io.to(result.roomId).emit('host_changed', { newHost: result.newHost });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[启动] 狼人杀服务器运行在 http://localhost:${PORT}`);
});
