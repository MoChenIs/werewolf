// public/timer.js - 倒计时渲染
// 使用服务端时间戳确保所有客户端倒计时一致

class GameTimer {
  constructor(onExpire) {
    this.intervalId = null;
    this.remaining = 0;
    this.onExpire = onExpire || (() => {});
    this.isRunning = false;
  }

  // 服务端同步计时
  sync(serverTimestamp, startTimestamp, duration) {
    const elapsed = Date.now() - startTimestamp;
    this.remaining = Math.max(0, duration - elapsed);
    this.duration = duration;

    if (this.remaining <= 0) {
      this.stop();
      this.onExpire();
      return;
    }

    this.start();
  }

  start() {
    this.stop();
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.remaining = Math.max(0, this.remaining - 100);
      this.render();

      if (this.remaining <= 0) {
        this.stop();
        this.onExpire();
      }
    }, 100);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  render() {
    const timerEl = document.getElementById('timer-text');
    if (!timerEl) return;
    const seconds = Math.ceil(this.remaining / 1000);
    timerEl.textContent = seconds > 0 ? seconds : '--';

    // 颜色变化：最后10秒变红
    if (seconds <= 10 && seconds > 0) {
      timerEl.style.color = '#ff4444';
    } else {
      timerEl.style.color = '#f0c040';
    }
  }

  getRemaining() {
    return this.remaining;
  }
}
