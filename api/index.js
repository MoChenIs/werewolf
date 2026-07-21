// api/index.js - Vercel Serverless 入口
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const RoomManager = require('../room-manager');
const { GameEngine } = require('../game-engine');
const { processWerewolfAction, getWerewolfTargets } = require('../roles/werewolf');
const { processSeerAction, getSeerTargets } = require('../roles/seer');
const { processWitchAction, getWitchInfo } = require('../roles/witch');
const { processHunterAction, getHunterTargets } = require('../roles/hunter');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  transports: ['polling'], // Vercel 不支持 WebSocket，使用长轮询
  cors: { origin: '*' }
});

const roomManager = new RoomManager();

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// ========== 将所有 Socket 事件处理器从 server.js 搬过来 ==========
// 由于 handler 逻辑太长，引用公共模块
require('../socket-handlers')(io, roomManager);

// Vercel 导出
module.exports = (req, res) => {
  server.emit('request', req, res);
};
