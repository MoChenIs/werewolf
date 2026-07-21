const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./room-manager');

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
