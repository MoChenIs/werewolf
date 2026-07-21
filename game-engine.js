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
 this.voteDuration = 30000; // 30s 投票
 this.nightDuration = 20000; // 20s 夜间行动上限
 this.history = [];
 this.votes = {}; // seat -> targetSeat
 this.nightActions = {};
 this.werewolfVotes = {}; // seat → targetSeat，狼人投票记录
 this.witchUsedSave = false;
 this.witchUsedKill = false;
 this.hunterUsedAbility = false; // 猎人是否已使用被动技能
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
 // 剩余为成员
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

 // 获取已死亡但未使用技能的猎人（被动：死亡后可带走一人）
 getPendingHunter() {
 return Array.from(this.room.players.values())
 .find(p => p.role === roles.HUNTER && !p.isAlive && !this.hunterUsedAbility) || null;
 }

 // 获取某成员角色
 getPlayerRole(socketId) {
 const player = this.room.players.get(socketId);
 return player ? player.role : null;
 }

 // 获取所有狼人列表
 getWerewolves() {
 return Array.from(this.room.players.values())
 .filter(p => p.role === roles.WEREWOLF);
 }

 // 检查胜负（9人局：3狼/1预言家/1女巫/1猎人/3成员）
 checkGameEnd() {
 const alivePlayers = Array.from(this.room.players.values()).filter(p => p.isAlive);
 const aliveWerewolves = alivePlayers.filter(p => p.role === roles.WEREWOLF);
 const aliveVillagers = alivePlayers.filter(p => p.role === roles.VILLAGER);
 const aliveGods = alivePlayers.filter(p => p.role === roles.SEER || p.role === roles.WITCH || p.role === roles.HUNTER);

 // 三狼全出局 → 好人胜利
 if (aliveWerewolves.length === 0) {
 return { ended: true, winner: 'good', message: '好人胜利' };
 }
 // 三成员全死 → 狼人胜利
 if (aliveVillagers.length === 0) {
 return { ended: true, winner: 'werewolf', message: '狼人胜利' };
 }
 // 三神全死 → 狼人胜利
 if (aliveGods.length === 0) {
 return { ended: true, winner: 'werewolf', message: '狼人胜利' };
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

 // 进入夜间下一角色阶段（猎人已移除主动阶段，改为死亡触发）
 advanceNight() {
 const nightOrder = ['night_werewolf', 'night_seer', 'night_witch'];
 const prevPhase = this.phase;
 const idx = nightOrder.indexOf(this.phase);
 if (idx < nightOrder.length - 1) {
 this.phase = nightOrder[idx + 1];
 return { phase: this.phase, isNight: true, prevPhase };
 }
 // 夜间结束，进入白天
 return this.startDay(prevPhase);
 }

 // 进入白天
 startDay(prevPhase) {
 this.phase = 'dawn_death_announce';
 this.votes = {};
 // 计算死者
 const deaths = this.calculateDeaths();
 this.addLog('death', `昨晚 ${deaths.length > 0 ? deaths.map(d => `${d.seat}号 ${d.name}`).join(' ') : '平安夜'}死亡`);
 return { phase: this.phase, deaths, isDay: true, prevPhase };
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
 // 重置所有成员的投票状态
 this.room.players.forEach(p => { p.hasVoted = false; p.voteTarget = null; });
 this.addLog('system', '请所有存活成员投票');
 return { phase: this.phase };
 }

 // 执行投票结果
 executeVote() {
 // 原始投票数据（seat → targetSeat）
 const rawVotes = { ...this.votes };
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
 this.addLog('system', '无人被表决出局（全部弃权）');
 return { phase: 'free_speech', eliminated: null, isTie: true, rawVotes, tally };
 }

 // 检测平票：是否有多个候选人获得相同最高票数
 const topCandidates = Object.entries(tally).filter(([_, count]) => count === maxVotes);
 if (topCandidates.length > 1) {
 this.addLog('system', `无人被表决出局（平票）`);
 const tiedSeats = topCandidates.map(([s]) => parseInt(s));
 return { phase: 'tie', eliminated: null, isTie: true, tiedSeats, rawVotes, tally };
 }

 const eliminated = Array.from(this.room.players.values()).find(p => p.seat === maxTarget);
 if (eliminated) {
 eliminated.isAlive = false;
 this.addLog('system', `${eliminated.seat}号 ${eliminated.name} 被表决出局`);
 this.phase = 'final_words';
 return { phase: 'final_words', eliminated: { seat: eliminated.seat, name: eliminated.name }, rawVotes, tally };
 }
 return { phase: 'free_speech', eliminated: null, rawVotes, tally };
 }

 // === 同票处理 ===

 // 开始同票候选人发言
 startTieBreak(tiedSeats) {
 this.phase = 'tie_speech';
 this.tieOrder = [...tiedSeats];
 this.currentTieSpeaker = 0;
 this.speechStartTime = Date.now();
 this.addLog('system', `同票候选人发言：${tiedSeats.map(s => s + '号').join(' ')}`);
 return { speaker: this.tieOrder[0] };
 }

 // 同票发言人下一位
 nextTieSpeaker() {
 this.currentTieSpeaker++;
 if (this.currentTieSpeaker < this.tieOrder.length) {
 this.speechStartTime = Date.now();
 return { phase: 'tie_speech', speaker: this.tieOrder[this.currentTieSpeaker] };
 }
 // 所有候选人发言完毕，开始重新投票
 return this.startTieVote();
 }

 // 开始重新投票
 startTieVote() {
 this.phase = 'tie_vote';
 this.votes = {};
 this.tieVotes = {};
 // 重置所有成员的投票状态
 this.room.players.forEach(p => { p.hasVoted = false; p.voteTarget = null; });
 return { phase: 'tie_vote' };
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

 // 标记成员已发言（挂机检测）
 markPlayerSpoke(seat) {
 const player = Array.from(this.room.players.values()).find(p => p.seat === seat);
 if (player) {
 player.lastSpokeRound = this.round;
 }
 }

 // 检查挂机成员
 checkAfk() {
 const alivePlayers = Array.from(this.room.players.values())
 .filter(p => p.isAlive);
 const afkPlayers = [];

 alivePlayers.forEach(p => {
 if (p.lastSpokeRound !== undefined && p.lastSpokeRound < this.round - 1) {
 p.warnings = (p.warnings || 0) + 1;
 if (p.warnings >= 2) {
 p.isAlive = false;
 p.isAfk = true;
 afkPlayers.push(p);
 this.addLog('system', `${p.seat}号 ${p.name} 因连续挂机被移出游戏`);
 }
 }
 });

 return afkPlayers;
 }

 // 标记投票（弃权检测）
 markVoted(seat) {
 const player = Array.from(this.room.players.values()).find(p => p.seat === seat);
 if (player && player.voteTarget === 0) {
 player.abstainCount = (player.abstainCount || 0) + 1;
 if (player.abstainCount >= 3) {
 player.warnings = (player.warnings || 0) + 1;
 this.addLog('system', `${player.seat}号 ${player.name} 连续3轮弃权，收到警告`);
 }
 }
 }
}

module.exports = { GameEngine, roles };
