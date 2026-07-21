// game-engine.js
// 核心游戏引擎：状态机 + 角色管理 + 阶段流转

const roles = {
  WEREWOLF: 'werewolf',
  SEER: 'seer',
  WITCH: 'witch',
  HUNTER: 'hunter',
  VILLAGER: 'villager'
};

class GameEngine {
  constructor(room) {
    this.room = room;
    this.phase = 'waiting';
    this.round = 0;
    this.currentSpeaker = null;
    this.speechStartTime = null;
    this.speechDuration = 90000; // 90s 发言
    this.voteDuration = 30000;   // 30s 投票
    this.nightDuration = 20000;  // 20s 夜间行动上限
    this.history = [];
    this.votes = {};             // seat -> targetSeat
    this.nightActions = {};
    this.witchUsedSave = false;
    this.witchUsedKill = false;
  }

  // 分配角色
  assignRoles() {
    const players = Array.from(this.room.players.values());
    const count = players.length;
    const werewolfCount = Math.min(this.room.config.werewolfCount, Math.floor(count / 3));
    const roleList = [];

    // 添加狼人
    for (let i = 0; i < werewolfCount; i++) roleList.push(roles.WEREWOLF);
    // 添加预言家
    roleList.push(roles.SEER);
    // 添加女巫
    roleList.push(roles.WITCH);
    // 添加猎人
    roleList.push(roles.HUNTER);
    // 剩余为平民
    while (roleList.length < count) roleList.push(roles.VILLAGER);

    // 随机打乱
    for (let i = roleList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roleList[i], roleList[j]] = [roleList[j], roleList[i]];
    }

    players.forEach((p, idx) => {
      p.role = roleList[idx];
    });

    this.phase = 'role_assign';
    return { roleList, players };
  }

  // 获取某玩家角色
  getPlayerRole(socketId) {
    const player = this.room.players.get(socketId);
    return player ? player.role : null;
  }

  // 获取所有狼人列表
  getWerewolves() {
    return Array.from(this.room.players.values())
      .filter(p => p.role === roles.WEREWOLF);
  }

  // 检查胜负
  checkGameEnd() {
    const alivePlayers = Array.from(this.room.players.values()).filter(p => p.isAlive);
    const aliveWerewolves = alivePlayers.filter(p => p.role === roles.WEREWOLF);
    const aliveGood = alivePlayers.filter(p => p.role !== roles.WEREWOLF);

    if (aliveWerewolves.length === 0) {
      return { ended: true, winner: 'good', message: '所有狼人已被消灭，好人阵营获胜！' };
    }
    if (aliveWerewolves.length >= aliveGood.length) {
      return { ended: true, winner: 'werewolf', message: '狼人人数与好人均等，狼人阵营获胜！' };
    }
    return { ended: false };
  }

  // 记录日志
  addLog(type, content, targetSeat = null) {
    this.history.push({
      round: this.round,
      phase: this.phase,
      type,
      content,
      timestamp: Date.now(),
      targetSeat
    });
  }

  // 启动游戏（开始第一夜）
  startGame() {
    this.assignRoles();
    this.round = 1;
    this.phase = 'night_werewolf';
    this.addLog('system', '天黑请闭眼。狼人请行动...');
    return this.phase;
  }

  // 进入夜间下一角色阶段
  advanceNight() {
    const nightOrder = ['night_werewolf', 'night_seer', 'night_witch', 'night_hunter'];
    const idx = nightOrder.indexOf(this.phase);
    if (idx < nightOrder.length - 1) {
      this.phase = nightOrder[idx + 1];
      return { phase: this.phase, isNight: true };
    }
    // 夜间结束，进入白天
    return this.startDay();
  }

  // 进入白天
  startDay() {
    this.phase = 'dawn_death_announce';
    this.votes = {};
    // 计算死者
    const deaths = this.calculateDeaths();
    this.addLog('death', `昨晚 ${deaths.length > 0 ? deaths.map(d => `${d.seat}号 ${d.name}`).join('、') : '没有人'}死亡`);
    return { phase: this.phase, deaths, isDay: true };
  }

  // 计算死者（处理女巫解救和毒杀）
  calculateDeaths() {
    const werewolfKill = this.nightActions.werewolfKill;
    const witchSave = this.nightActions.witchSave;
    const witchKill = this.nightActions.witchKill;
    const dead = [];

    if (werewolfKill && werewolfKill !== witchSave) {
      const target = Array.from(this.room.players.values())
        .find(p => p.seat === werewolfKill);
      if (target) {
        target.isAlive = false;
        dead.push({ seat: target.seat, name: target.name, cause: 'werewolf' });
      }
    }
    if (witchKill) {
      const target = Array.from(this.room.players.values())
        .find(p => p.seat === witchKill);
      if (target && target.isAlive) {
        target.isAlive = false;
        dead.push({ seat: target.seat, name: target.name, cause: 'witch' });
      }
    }
    return dead;
  }

  // 推进到白天发言阶段
  startFreeSpeech() {
    this.phase = 'free_speech';
    // 确定发言顺序（按座位号从小到大）
    const alivePlayers = Array.from(this.room.players.values())
      .filter(p => p.isAlive)
      .sort((a, b) => a.seat - b.seat);
    this.dayOrder = alivePlayers.map(p => p.seat);
    this.currentSpeaker = 0; // dayOrder 中的索引
    this.speechStartTime = Date.now();
    this.addLog('system', '自由发言开始，按顺序每人90秒');
    return {
      phase: this.phase,
      speaker: this.dayOrder[this.currentSpeaker]
    };
  }

  // 发言结束，进入下一位或投票
  nextSpeaker() {
    this.currentSpeaker++;
    if (this.currentSpeaker < this.dayOrder.length) {
      this.speechStartTime = Date.now();
      return {
        phase: 'free_speech',
        speaker: this.dayOrder[this.currentSpeaker],
        isLast: this.currentSpeaker === this.dayOrder.length - 1
      };
    }
    // 所有人发言完毕，进入投票
    return this.startVote();
  }

  // 开始投票
  startVote() {
    this.phase = 'vote';
    this.votes = {};
    this.addLog('system', '请所有存活玩家投票');
    return { phase: this.phase };
  }

  // 执行投票结果
  executeVote() {
    // 统计票数
    const tally = {};
    Object.values(this.votes).forEach(target => {
      if (target) tally[target] = (tally[target] || 0) + 1;
    });
    let maxVotes = 0, maxTarget = null;
    Object.entries(tally).forEach(([target, count]) => {
      if (count > maxVotes) { maxVotes = count; maxTarget = parseInt(target); }
    });

    if (!maxTarget || maxVotes === 0) {
      this.addLog('system', '无人被放逐（全部弃权）');
      return { phase: 'free_speech', eliminated: null, isTie: true };
    }

    // 检测平票：是否有多个候选人获得相同最高票数
    const topCandidates = Object.entries(tally).filter(([_, count]) => count === maxVotes);
    if (topCandidates.length > 1) {
      this.addLog('system', `无人被放逐（平票）`);
      return { phase: 'free_speech', eliminated: null, isTie: true };
    }

    const eliminated = Array.from(this.room.players.values()).find(p => p.seat === maxTarget);
    if (eliminated) {
      eliminated.isAlive = false;
      this.addLog('system', `${eliminated.seat}号 ${eliminated.name} 被放逐`);
      this.phase = 'final_words';
      return { phase: 'final_words', eliminated: { seat: eliminated.seat, name: eliminated.name } };
    }
    return { phase: 'free_speech', eliminated: null };
  }

  // 遗言结束，进入下一夜或结算
  afterFinalWords() {
    // 如果游戏结束，先检查
    const endCheck = this.checkGameEnd();
    if (endCheck.ended) return { phase: 'settlement', ...endCheck };

    this.round++;
    this.nightActions = {};
    this.phase = 'night_werewolf';
    this.addLog('system', `第${this.round}夜，天黑请闭眼。`);
    return { phase: this.phase };
  }
}

module.exports = { GameEngine, roles };
