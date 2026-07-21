const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io 连接
io.on('connection', (socket) => {
  console.log(`[连接] 玩家连接: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[断开] 玩家断开: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`[启动] 狼人杀服务器运行在 http://localhost:${PORT}`);
});
