const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./room-manager');
const { GameEngine } = require('./game-engine');
const { processWerewolfAction, getWerewolfTargets } = require('./roles/werewolf');
const { processSeerAction, getSeerTargets } = require('./roles/seer');
const { processWitchAction, getWitchInfo } = require('./roles/witch');
const { processHunterAction, getHunterTargets } = require('./roles/hunter');

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

  // 房主开始白天发言
  socket.on('start_free_speech', () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || room.host !== socket.id) return;
    const engine = room.game;
    if (!engine || engine.phase !== 'dawn_death_announce') return;

    const result = engine.startFreeSpeech();
    io.to(room.id).emit('phase_change', { phase: 'free_speech', message: '自由发言开始' });
    startSpeechTimerForSpeaker(room, io);
  });

  // 玩家提交发言
  socket.on('player_speech', ({ content }) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const engine = room.game;
    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;
    if (engine.phase !== 'free_speech') return;

    const expectedSeat = engine.dayOrder[engine.currentSpeaker];
    if (player.seat !== expectedSeat) return;

    // 敏感词过滤
    const filtered = filterSensitiveWords(content);
    if (filtered !== content) {
      socket.emit('error', { code: 'SENSITIVE', message: '你的发言包含敏感词，已被过滤' });
    }

    // 记录发言（挂机检测）
    engine.markPlayerSpoke(player.seat);

    io.to(room.id).emit('speech_broadcast', {
      seat: player.seat,
      name: player.name,
      content: filtered
    });
    engine.addLog('speech', `${player.seat}号发言: ${filtered}`, player.seat);
  });

  // 提前结束发言
  socket.on('end_speech', () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const engine = room.game;
    if (engine.phase !== 'free_speech') return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const expectedSeat = engine.dayOrder[engine.currentSpeaker];
    if (player.seat !== expectedSeat) return;

    clearTimeout(room._speechTimer);
    const next = engine.nextSpeaker();
    handleSpeechTransition(room, io, next);
  });

  // 投票
  socket.on('vote', ({ targetSeat }) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const engine = room.game;
    const player = room.players.get(socket.id);
    if (!player || !player.isAlive) return;
    if (engine.phase !== 'vote') return;

    engine.votes[player.seat] = targetSeat;
    player.hasVoted = true;
    player.voteTarget = targetSeat;

    io.to(room.id).emit('vote_update', {
      seat: player.seat,
      target: targetSeat,
      totalVoters: Object.keys(engine.votes).length,
      totalAlive: Array.from(room.players.values()).filter(p => p.isAlive).length
    });

    // 所有人投票完毕，统计结果
    const aliveCount = Array.from(room.players.values()).filter(p => p.isAlive).length;
    if (Object.keys(engine.votes).length >= aliveCount) {
      clearTimeout(room._voteTimer);
      const result = engine.executeVote();
      handleVoteResult(room, io, result);
    }
  });

  // 夜间行动
  socket.on('night_action', ({ target, action, save, killTarget }) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const engine = room.game;

    let result;
    switch (action) {
      case 'kill':
        result = processWerewolfAction(engine, socket.id, target);
        if (result.success) {
          const werewolves = engine.getWerewolves().filter(w => w.isAlive);
          werewolves.forEach(w => {
            io.to(w.id).emit('night_result', { message: `狼人已选择击杀 ${result.target}号玩家` });
          });
          const next = engine.advanceNight();
          if (!next.isNight) {
            io.to(room.id).emit('phase_change', {
              phase: next.phase, deaths: next.deaths,
              message: '天亮了',
              players: Array.from(room.players.values()).map(p => ({
                seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
              }))
            });
          } else {
            handleNightPhase(room, io, next);
          }
        }
        break;
      case 'investigate':
        result = processSeerAction(engine, socket.id, target);
        if (result.success) {
          io.to(socket.id).emit('night_result', { message: result.message });
          const next = engine.advanceNight();
          if (!next.isNight) {
            io.to(room.id).emit('phase_change', {
              phase: next.phase, deaths: next.deaths, message: '天亮了',
              players: Array.from(room.players.values()).map(p => ({
                seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
              }))
            });
          } else {
            handleNightPhase(room, io, next);
          }
        }
        break;
      case 'shoot':
        result = processHunterAction(engine, socket.id, target);
        if (result.success) {
          io.to(room.id).emit('death_announce', { seat: result.target.seat, name: result.target.name });
          io.to(room.id).emit('night_result', { message: result.message });
          const next = engine.advanceNight();
          if (!next.isNight) {
            io.to(room.id).emit('phase_change', {
              phase: next.phase, deaths: next.deaths, message: '天亮了',
              players: Array.from(room.players.values()).map(p => ({
                seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
              }))
            });
          }
        }
        break;
      case 'witch':
        result = processWitchAction(engine, socket.id, { save, killTarget });
        if (result.success) {
          io.to(socket.id).emit('night_result', { message: result.message });
          const next = engine.advanceNight();
          if (!next.isNight) {
            io.to(room.id).emit('phase_change', {
              phase: next.phase, deaths: next.deaths, message: '天亮了',
              players: Array.from(room.players.values()).map(p => ({
                seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
              }))
            });
          } else {
            handleNightPhase(room, io, next);
          }
        }
        break;
    }

    if (result && result.error) {
      socket.emit('error', { code: 'ACTION_FAILED', message: result.error });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[断开] 玩家断开: ${socket.id}`);
    const room = roomManager.findRoomBySocket(socket.id);
    if (room) {
      const player = room.players.get(socket.id);
      if (player) {
        player.disconnected = true;
        io.to(room.id).emit('player_disconnected', { seat: player.seat });
        io.to(room.id).emit('phase_change', {
          phase: room.game ? room.game.phase : 'waiting',
          players: Array.from(room.players.values()).map(p => ({
            seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
          }))
        });
        // 60秒后根据房间状态处理
        room._disconnectTimer = setTimeout(() => {
          if (player.disconnected && room.status === 'waiting') {
            const result = roomManager.leaveRoom(socket.id);
            if (result.action === 'left') {
              io.to(room.id).emit('player_left', { seat: result.seat });
              if (result.newHost) {
                io.to(room.id).emit('host_changed', { newHost: result.newHost });
              }
            }
          } else if (player.disconnected && room.status === 'playing') {
            player.isAlive = false;
            io.to(room.id).emit('phase_change', {
              phase: room.game.phase,
              message: `${player.seat}号 ${player.name} 因断线超时，被标记为出局`,
              players: Array.from(room.players.values()).map(p => ({
                seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
              }))
            });
          }
        }, 60000);
      }
    }
  });

  // 重连
  socket.on('reconnect_player', ({ roomId, seat }) => {
    const room = roomManager.rooms.get(roomId);
    if (!room) return socket.emit('error', { code: 'NO_ROOM', message: '房间不存在' });

    let player = null;
    for (const [, p] of room.players) {
      if (p.seat === seat) {
        player = p;
        break;
      }
    }

    if (!player) return socket.emit('error', { code: 'NOT_IN_ROOM', message: '你不在这个房间中' });

    const oldId = player.id;
    player.id = socket.id;
    player.disconnected = false;
    socket.join(roomId);

    if (room._disconnectTimer) {
      clearTimeout(room._disconnectTimer);
      room._disconnectTimer = null;
    }

    socket.emit('room_joined', roomManager.getRoomInfo(room));

    if (room.game) {
      const engine = room.game;
      socket.emit('game_started', { role: player.role });
      socket.emit('phase_change', {
        phase: engine.phase,
        message: `欢迎回来，当前是 ${engine.phase}`,
        players: Array.from(room.players.values()).map(p => ({
          seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
        }))
      });

      // 如果当前是发言阶段，推送计时
      if (engine.phase === 'free_speech' && engine.speechStartTime) {
        socket.emit('timer_sync', {
          startTimestamp: engine.speechStartTime,
          duration: engine.speechDuration
        });
      }

      io.to(roomId).emit('player_reconnected', { seat: player.seat });
    }
  });
});

// ========== 辅助函数 ==========

const sensitiveWords = require('./sensitive-words.json');

function filterSensitiveWords(content) {
  let filtered = content;
  sensitiveWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '***');
  });
  return filtered;
}

function startSpeechTimerForSpeaker(room, io) {
  const engine = room.game;
  const speakerSeat = engine.dayOrder[engine.currentSpeaker];
  const speaker = Array.from(room.players.values()).find(p => p.seat === speakerSeat);

  io.to(room.id).emit('timer_sync', {
    startTimestamp: engine.speechStartTime,
    duration: engine.speechDuration
  });
  io.to(room.id).emit('your_turn', {
    seat: speakerSeat,
    action: 'speech',
    timeLimit: engine.speechDuration,
    isYou: false
  });
  if (speaker) {
    io.to(speaker.id).emit('your_turn', {
      seat: speakerSeat,
      action: 'speech',
      timeLimit: engine.speechDuration,
      isYou: true
    });
  }

  // 90秒后自动结束发言
  room._speechTimer = setTimeout(() => {
    if (engine.phase !== 'free_speech') return;
    const next = engine.nextSpeaker();
    handleSpeechTransition(room, io, next);
  }, engine.speechDuration);
}

function handleSpeechTransition(room, io, next) {
  if (next.phase === 'vote') {
    io.to(room.id).emit('phase_change', {
      phase: 'vote',
      message: '发言结束，开始放逐投票'
    });
    // 30秒投票倒计时
    room._voteTimer = setTimeout(() => {
      if (room.game.phase !== 'vote') return;
      const result = room.game.executeVote();
      handleVoteResult(room, io, result);
    }, room.game.voteDuration);
  } else {
    startSpeechTimerForSpeaker(room, io);
  }
}

function handleVoteResult(room, io, result) {
  if (result.phase === 'final_words') {
    io.to(room.id).emit('phase_change', {
      phase: 'final_words',
      eliminated: result.eliminated
    });
    // 60s 遗言后进入下一环节
    setTimeout(() => {
      const next = room.game.afterFinalWords();
      if (next.phase === 'settlement') {
        const rolesInfo = Array.from(room.players.values()).map(p => ({
          seat: p.seat,
          name: p.name,
          role: p.role
        }));

        room.players.forEach((player) => {
          const isGood = player.role !== 'werewolf';
          const playerWon = (next.winner === 'good' && isGood) || (next.winner === 'werewolf' && !isGood);
          io.to(player.id).emit('game_over', {
            winner: next.winner,
            message: next.message,
            youWon: playerWon,
            roles: rolesInfo
          });
        });

        room.status = 'ended';
      } else {
        handleNightPhase(room, io, next);
      }
    }, 60000);
  } else if (result.phase === 'free_speech') {
    // 平票，重新发言和投票
    const next = room.game.startFreeSpeech();
    io.to(room.id).emit('phase_change', { phase: 'free_speech', message: '平票，重新发言' });
    startSpeechTimerForSpeaker(room, io);
  }
}

function handleNightPhase(room, io, result) {
  const engine = room.game;
  io.to(room.id).emit('phase_change', {
    phase: result.phase,
    message: result.message || `第${room.game.round}夜，天黑请闭眼。`,
    players: Array.from(room.players.values()).map(p => ({
      seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
    }))
  });

  // 通知对应角色行动
  room.players.forEach((player) => {
    let shouldAct = false;
    let actionData = null;

    switch (engine.phase) {
      case 'night_werewolf':
        if (player.role === 'werewolf' && player.isAlive) {
          shouldAct = true;
          actionData = {
            action: 'night_kill',
            targets: getWerewolfTargets(engine)
          };
        }
        break;
      case 'night_seer':
        if (player.role === 'seer' && player.isAlive) {
          shouldAct = true;
          actionData = {
            action: 'investigate',
            targets: getSeerTargets(engine)
          };
        }
        break;
      case 'night_witch':
        if (player.role === 'witch' && player.isAlive) {
          shouldAct = true;
          actionData = {
            action: 'witch',
            info: getWitchInfo(engine, player.id)
          };
          io.to(player.id).emit('witch_info', actionData.info);
        }
        break;
      case 'night_hunter':
        if (player.role === 'hunter' && !player.isAlive) {
          shouldAct = true;
          actionData = {
            action: 'shoot',
            targets: getHunterTargets(engine)
          };
        }
        break;
    }

    if (shouldAct) {
      io.to(player.id).emit('your_turn', {
        seat: player.seat,
        action: actionData.action,
        isYou: true,
        ...actionData
      });
    }
  });

  // 设置超时（20秒后自动跳过夜间）
  room._nightTimer = setTimeout(() => {
    if (engine.phase.startsWith('night_')) {
      const nextPhase = engine.advanceNight();
      if (nextPhase.isDay) {
        io.to(room.id).emit('phase_change', {
          phase: nextPhase.phase, deaths: nextPhase.deaths,
          message: '天亮了',
          players: Array.from(room.players.values()).map(p => ({
            seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
          }))
        });
      } else {
        handleNightPhase(room, io, nextPhase);
      }
    }
  }, engine.nightDuration);
}

server.listen(PORT, () => {
  console.log(`[启动] 狼人杀服务器运行在 http://localhost:${PORT}`);
});
