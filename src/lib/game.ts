const KANA = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'nn']
] as const;

const INITIAL_TARGET_LIMIT = 2;
const MAX_TARGET_LIMIT = 5;

type Kana = (typeof KANA)[number];

interface FallingKana {
  id: number;
  kana: Kana[0];
  romaji: Kana[1];
  x: number;
  y: number;
  speed: number;
  color: string;
  hit: boolean;
}

interface Shot {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  targetId: number;
  progress: number;
  duration: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface GameCallbacks {
  onScore(score: number): void;
  onProgress(hits: number): void;
  onMistake(mistakes: number, score: number): void;
  onTimer(seconds: number): void;
  onGameOver(manual?: boolean): void;
  onPaused(paused: boolean): void;
  onFeedback(message: string, color?: string): void;
  onTyped(value: string): void;
}

export class KanaDropGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly backgroundImage = new Image();
  private readonly backgroundCanvas = document.createElement('canvas');
  private readonly ninjaImage = new Image();
  private readonly shurikenImage = new Image();
  private width = 0;
  private height = 0;
  private dpr = 1;
  private running = false;
  private paused = false;
  private ended = false;
  private lastFrame = 0;
  private elapsed = 0;
  private hits = 0;
  private mistakes = 0;
  private spawnClock = 0;
  private typed = '';
  private score = 0;
  private nextId = 0;
  private lastSpawnKana = -1;
  private objects: FallingKana[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private frameId = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: GameCallbacks
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');
    this.ctx = context;
    this.backgroundImage.onload = () => {
      this.prepareBackground();
      this.draw();
    };
    this.ninjaImage.onload = () => this.draw();
    this.shurikenImage.onload = () => this.draw();
    this.backgroundImage.src = new URL('../images/japan_pixel_background_new.png', import.meta.url).href;
    this.ninjaImage.src = new URL('../images/ninja.png', import.meta.url).href;
    this.shurikenImage.src = new URL('../images/shuriken_transparent.png', import.meta.url).href;
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resizeCanvas();
    this.frameId = requestAnimationFrame(this.frame);
  }

  start(): void {
    this.score = 0;
    this.elapsed = 0;
    this.spawnClock = 0;
    this.hits = 0;
    this.mistakes = 0;
    this.objects = [];
    this.shots = [];
    this.particles = [];
    this.floatingTexts = [];
    this.nextId = 0;
    this.typed = '';
    this.ended = false;
    this.running = true;
    this.paused = false;
    this.callbacks.onScore(0);
    this.callbacks.onProgress(0);
    this.callbacks.onTimer(0);
    this.callbacks.onPaused(false);
    this.callbacks.onTyped('');
    this.callbacks.onFeedback('Введи ромадзи');
    this.spawn();
  }

  input(key: string): void {
    if (!this.running || this.paused) return;
    if (key === 'backspace') {
      this.setTyped(this.typed.slice(0, -1));
      return;
    }
    if (key === 'clear') {
      this.setTyped('');
      this.callbacks.onFeedback('Ввод очищен');
      return;
    }
    if (!/^[a-z]$/.test(key) || this.typed.length >= 5) return;

    this.setTyped(this.typed + key);
    if (!this.typed) return;

    const matches = this.objects.filter((item) => item.romaji === this.typed && !item.hit);
    if (matches.length) {
      matches.sort((a, b) => b.y - a.y);
      this.fireAt(matches[0]);
      return;
    }

    const possible = this.objects.some((item) => !item.hit && item.romaji.startsWith(this.typed));
    if (possible) {
      this.callbacks.onFeedback('Продолжай…', '#ffd36e');
    } else {
      this.mistakes += 1;
      this.score = Math.max(0, this.score - 10);
      this.callbacks.onScore(this.score);
      this.callbacks.onMistake(this.mistakes, this.score);
      this.showFloatingText(this.width / 2, this.height * 0.44, '−10', '#ff4357');
      this.callbacks.onFeedback('Нет такой каны', '#ff91a5');
      this.setTyped('');
    }
  }

  togglePause(): void {
    if (!this.running) return;
    this.paused = !this.paused;
    this.callbacks.onPaused(this.paused);
    this.callbacks.onFeedback(this.paused ? 'Игра на паузе' : 'Введи ромадзи');
  }

  end(): void {
    if (!this.running) return;
    this.running = false;
    this.paused = false;
    this.ended = true;
    this.callbacks.onPaused(false);
    this.callbacks.onGameOver(true);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
  }

  private readonly frame = (timestamp: number): void => {
    const dt = Math.min((timestamp - (this.lastFrame || timestamp)) / 1000, 0.05);
    this.lastFrame = timestamp;
    this.update(dt);
    this.draw();
    this.frameId = requestAnimationFrame(this.frame);
  };

  private resizeCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.prepareBackground();
    this.draw();
  }

  private cannonPosition(): { x: number; y: number } {
    return {
      x: this.width / 2,
      y: this.sceneGroundY()
    };
  }

  private baseline(): number {
    return this.sceneGroundY() - Math.max(34, this.height * 0.045);
  }

  private sceneGroundY(): number {
    const image = this.backgroundImage;
    if (!image.complete || image.naturalWidth === 0) return this.height - 30;
    const scale = Math.min(this.width / image.naturalWidth, this.height / image.naturalHeight);
    const imageHeight = image.naturalHeight * scale;
    const imageTop = (this.height - imageHeight) / 2;
    return imageTop + imageHeight * 0.92;
  }

  private playfieldBounds(): { left: number; right: number } {
    const image = this.backgroundImage;
    if (!image.complete || image.naturalWidth === 0) {
      return { left: 0, right: this.width };
    }

    const scale = Math.min(this.width / image.naturalWidth, this.height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale * (4 / 3);
    const left = (this.width - imageWidth) / 2;
    return { left, right: left + imageWidth };
  }

  private setTyped(value: string): void {
    this.typed = value.slice(-5);
    this.callbacks.onTyped(this.typed);
  }

  private fireAt(target: FallingKana): void {
    if (!this.running || target.hit) return;
    const cannon = this.cannonPosition();
    target.hit = true;
    this.shots.push({
      x: cannon.x,
      y: cannon.y - 8,
      startX: cannon.x,
      startY: cannon.y - 8,
      targetX: target.x,
      targetY: target.y,
      targetId: target.id,
      progress: 0,
      duration: Math.max(0.12, Math.min(0.34, Math.abs(target.y - cannon.y) / 900))
    });
    this.score += 10;
    this.hits += 1;
    this.showFloatingText(target.x, target.y - 18, '+10', '#ffe36e');
    this.callbacks.onScore(this.score);
    this.callbacks.onProgress(this.hits);
    this.callbacks.onFeedback('Попадание! +10', '#7de5dc');
    this.setTyped('');
  }

  private targetLimit(): number {
    if (this.hits < 10) return INITIAL_TARGET_LIMIT;
    return Math.min(MAX_TARGET_LIMIT, 2 + Math.floor((this.hits - 10) / 5));
  }

  private showFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({ x, y, text, color, life: 0.85, maxLife: 0.85 });
  }

  private spawn(): void {
    let index = Math.floor(Math.random() * KANA.length);
    if (KANA.length > 1 && index === this.lastSpawnKana) {
      index = (index + 1 + Math.floor(Math.random() * (KANA.length - 1))) % KANA.length;
    }
    this.lastSpawnKana = index;
    const [kana, romaji] = KANA[index];
    const { left, right } = this.playfieldBounds();
    const margin = Math.min(48, (right - left) * 0.12);
    const minX = left + margin;
    const maxX = right - margin;
    const colors = ['#7de5dc', '#ffd36e', '#c6a4ff', '#ff91a5'];
    this.objects.push({
      id: this.nextId++,
      kana,
      romaji,
      x: minX + Math.random() * Math.max(1, maxX - minX),
      y: -80,
      speed: 18 + Math.min(42, this.elapsed * 0.7) +
        Math.min(48, Math.max(0, this.hits - 10) * 3),
      color: colors[Math.floor(Math.random() * colors.length)],
      hit: false
    });
  }

  private update(dt: number): void {
    if (this.running && !this.paused) {
      this.elapsed += dt;
      this.callbacks.onTimer(Math.floor(this.elapsed));
      const interval = Math.max(1.8, 3.6 - this.elapsed * 0.008);
      const activeTargets = this.objects.filter((item) => !item.hit).length;
      this.spawnClock = Math.min(interval, this.spawnClock + dt);
      if (this.spawnClock >= interval && activeTargets < this.targetLimit()) {
        this.spawnClock = 0;
        this.spawn();
      }

      const lineY = this.baseline();
      for (const item of this.objects) {
        if (!item.hit) item.y += item.speed * dt;
        if (!item.hit && item.y >= lineY - 13) {
          this.running = false;
          this.ended = true;
          this.callbacks.onGameOver();
          break;
        }
      }

      for (const shot of this.shots) {
        shot.progress += dt / shot.duration;
        const progress = Math.min(1, shot.progress);
        shot.x = shot.startX + (shot.targetX - shot.startX) * progress;
        shot.y = shot.startY + (shot.targetY - shot.startY) * progress;
      }

      const completed = this.shots.filter((shot) => shot.progress >= 1);
      const completedIds = new Set(completed.map((shot) => shot.targetId));
      for (const shot of completed) {
        const target = this.objects.find((item) => item.id === shot.targetId);
        if (target) this.makeBurst(target.x, target.y, target.color);
      }
      this.shots = this.shots.filter((shot) => shot.progress < 1);
      this.objects = this.objects.filter((item) => !completedIds.has(item.id));
    }

    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
    }
    this.floatingTexts = this.floatingTexts.filter((item) => item.life > 0);
    for (const item of this.floatingTexts) {
      item.life -= dt;
      item.y -= 38 * dt;
    }
  }

  private makeBurst(x: number, y: number, color: string): void {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 95;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2.5,
        color,
        life: 0.42,
        maxLife: 0.42
      });
    }
  }

  private drawCannon(): void {
    const { x, y } = this.cannonPosition();
    const ctx = this.ctx;
    if (this.ninjaImage.complete && this.ninjaImage.naturalWidth > 0) {
      const imageHeight = Math.min(this.height * 0.18, 108);
      const imageWidth = imageHeight * (this.ninjaImage.naturalWidth / this.ninjaImage.naturalHeight);
      ctx.drawImage(
        this.ninjaImage,
        x - imageWidth * 0.5,
        y - imageHeight * 0.84,
        imageWidth,
        imageHeight
      );
      return;
    }
    const unit = Math.max(2, Math.min(7, this.width / 150));
    const pixel = (px: number, py: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(px / unit) * unit, Math.round(py / unit) * unit, w * unit, h * unit);
    };

    // Placeholder pixel-art ninja; replace this drawing with a sprite when art is ready.
    pixel(x - 8 * unit, y - 2 * unit, 5, 2, '#11192a');
    pixel(x + 1 * unit, y - 2 * unit, 5, 2, '#11192a');
    pixel(x - 6 * unit, y - 5 * unit, 4, 3, '#11192a');
    pixel(x + 1 * unit, y - 5 * unit, 4, 3, '#11192a');
    pixel(x - 5 * unit, y - 10 * unit, 9, 6, '#121a2a');
    pixel(x - 6 * unit, y - 11 * unit, 10, 2, '#d9344e');
    pixel(x - 2 * unit, y - 13 * unit, 5, 3, '#f4bd91');
    pixel(x - 3 * unit, y - 14 * unit, 6, 2, '#11192a');
    pixel(x + 2 * unit, y - 9 * unit, 6, 2, '#11192a');
    pixel(x + 6 * unit, y - 10 * unit, 2, 3, '#f4bd91');
    pixel(x - 7 * unit, y - 5 * unit, 8, 1, '#cf304c');

    ctx.fillStyle = '#10233a55';
    ctx.fillRect(x - 11 * unit, y + 1 * unit, 22 * unit, 2 * unit);
  }

  private drawShuriken(x: number, y: number, angle: number, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (this.shurikenImage.complete && this.shurikenImage.naturalWidth > 0) {
      ctx.drawImage(this.shurikenImage, -size, -size, size * 2, size * 2);
      ctx.restore();
      return;
    }
    ctx.shadowColor = '#17223a';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#192235';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const radius = i % 2 === 0 ? size : size * 0.34;
      const theta = (Math.PI * i) / 4 - Math.PI / 2;
      const px = Math.cos(theta) * radius;
      const py = Math.sin(theta) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#d7e4f2';
    ctx.fillRect(-size * 0.16, -size * 0.16, size * 0.32, size * 0.32);
    ctx.restore();
  }

  private drawCloud(x: number, y: number, scale: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#e5f3ff88';
    const unit = 9 * scale;
    ctx.fillRect(x, y, unit * 7, unit);
    ctx.fillRect(x + unit, y - unit, unit * 4, unit);
    ctx.fillRect(x + unit * 2, y - unit * 2, unit * 2, unit);
    ctx.fillRect(x + unit * 6, y + unit * 0.4, unit * 2, unit * 0.6);
  }

  private drawSakura(x: number, y: number, unit: number): void {
    const ctx = this.ctx;
    const petals = [
      [-2, 0], [-1, -1], [0, -2], [1, -1], [2, 0],
      [1, 1], [0, 2], [-1, 1], [0, 0]
    ];
    for (const [px, py] of petals) {
      ctx.fillStyle = px === 0 && py === 0 ? '#fff2bf' : '#ff9fc6';
      ctx.fillRect(x + px * unit, y + py * unit, unit, unit);
    }
  }

  private drawTorii(x: number, ground: number, unit: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#a92743';
    ctx.fillRect(x, ground - 10 * unit, 2 * unit, 10 * unit);
    ctx.fillRect(x + 11 * unit, ground - 10 * unit, 2 * unit, 10 * unit);
    ctx.fillRect(x - 2 * unit, ground - 11 * unit, 17 * unit, 1.5 * unit);
    ctx.fillRect(x - unit, ground - 9 * unit, 15 * unit, unit);
    ctx.fillStyle = '#24283e';
    ctx.fillRect(x - 3 * unit, ground - 12 * unit, 19 * unit, 1.5 * unit);
    ctx.fillRect(x - 2 * unit, ground - unit, 4 * unit, unit);
    ctx.fillRect(x + 11 * unit, ground - unit, 4 * unit, unit);
  }

  private drawTarget(item: FallingKana): void {
    const ctx = this.ctx;
    const { left, right } = this.playfieldBounds();
    const playfieldWidth = right - left;
    const r = Math.max(24, Math.min(33, playfieldWidth * 0.03));
    const size = Math.max(2, Math.min(5, playfieldWidth / 230));
    const cy = item.y;
    const canopyY = cy - r * 1.65;
    ctx.strokeStyle = '#e8f3ffbb';
    ctx.lineWidth = Math.max(1.25, size * 0.35);
    ctx.beginPath();
    ctx.moveTo(item.x - r * 0.48, canopyY + r * 0.36);
    ctx.lineTo(item.x - r * 0.24, cy - r * 0.52);
    ctx.moveTo(item.x, canopyY + r * 0.36);
    ctx.lineTo(item.x, cy - r * 0.52);
    ctx.moveTo(item.x + r * 0.48, canopyY + r * 0.36);
    ctx.lineTo(item.x + r * 0.24, cy - r * 0.52);
    ctx.stroke();

    ctx.fillStyle = '#f2f6ff';
    ctx.fillRect(item.x - size * 4, canopyY + size, size * 8, size);
    ctx.fillRect(item.x - size * 3, canopyY, size * 6, size);
    ctx.fillRect(item.x - size, canopyY - size, size * 2, size);
    ctx.fillRect(item.x - size * 4, canopyY + size * 2, size * 8, size);

    const pixel = 4;
    const drawPixelDisk = (radius: number, color: string) => {
      ctx.fillStyle = color;
      const extent = Math.ceil(radius / pixel);
      for (let row = -extent; row <= extent; row++) {
        const py = row * pixel + pixel / 2;
        const halfWidth = Math.sqrt(Math.max(0, radius ** 2 - py ** 2));
        const cells = Math.floor(halfWidth / pixel);
        ctx.fillRect(
          Math.round((item.x - cells * pixel) / pixel) * pixel,
          cy + row * pixel,
          (cells * 2 + 1) * pixel,
          pixel
        );
      }
    };
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    drawPixelDisk(r, '#17243b');
    drawPixelDisk(r - pixel, item.hit ? '#ffffff' : item.color);
    ctx.fillStyle = '#ffffff70';
    ctx.fillRect(item.x - r * 0.32, cy - r * 0.42, pixel * 2, pixel);

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${r * 1.1}px "Noto Sans JP", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.kana, item.x, cy);
    ctx.restore();
  }

  private drawScenery(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const ground = h - 30;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#4c9fe7');
    sky.addColorStop(0.68, '#6eb5ed');
    sky.addColorStop(1, '#80c6f4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    this.drawCloud(w * 0.02, h * 0.2, 0.8);
    this.drawCloud(w * 0.27, h * 0.56, 0.65);
    this.drawCloud(w * 0.86, h * 0.38, 0.7);

    ctx.fillStyle = '#397fc2';
    ctx.beginPath();
    ctx.moveTo(0, ground - h * 0.13);
    ctx.lineTo(w * 0.18, ground - h * 0.2);
    ctx.lineTo(w * 0.34, ground - h * 0.1);
    ctx.lineTo(w * 0.52, ground - h * 0.28);
    ctx.lineTo(w * 0.68, ground - h * 0.11);
    ctx.lineTo(w * 0.84, ground - h * 0.2);
    ctx.lineTo(w, ground - h * 0.12);
    ctx.lineTo(w, ground);
    ctx.lineTo(0, ground);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#285b9a';
    ctx.beginPath();
    ctx.moveTo(0, ground - h * 0.06);
    ctx.lineTo(w * 0.2, ground - h * 0.12);
    ctx.lineTo(w * 0.43, ground - h * 0.04);
    ctx.lineTo(w * 0.68, ground - h * 0.11);
    ctx.lineTo(w * 0.85, ground - h * 0.05);
    ctx.lineTo(w, ground - h * 0.1);
    ctx.lineTo(w, ground);
    ctx.lineTo(0, ground);
    ctx.closePath();
    ctx.fill();

    // Layered Fuji silhouette and snowy cap.
    ctx.fillStyle = '#417db7';
    ctx.beginPath();
    ctx.moveTo(w * 0.48, ground - 12);
    ctx.lineTo(w * 0.65, ground - h * 0.32);
    ctx.lineTo(w * 0.81, ground - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e0f2ff';
    ctx.beginPath();
    ctx.moveTo(w * 0.59, ground - h * 0.12);
    ctx.lineTo(w * 0.65, ground - h * 0.32);
    ctx.lineTo(w * 0.71, ground - h * 0.12);
    ctx.lineTo(w * 0.68, ground - h * 0.16);
    ctx.lineTo(w * 0.66, ground - h * 0.13);
    ctx.lineTo(w * 0.64, ground - h * 0.17);
    ctx.lineTo(w * 0.62, ground - h * 0.13);
    ctx.closePath();
    ctx.fill();

    // A small pagoda adds depth behind the ninja.
    const pagodaX = w * 0.09;
    ctx.fillStyle = '#1f4e86';
    ctx.fillRect(pagodaX - 9, ground - 130, 18, 130);
    for (let floor = 0; floor < 3; floor++) {
      const y = ground - 40 - floor * 34;
      const halfWidth = 18 + floor * 9;
      ctx.fillRect(pagodaX - 4, y, 8, 29);
      ctx.fillRect(pagodaX - halfWidth, y - 5, halfWidth * 2, 5);
      ctx.fillRect(pagodaX - halfWidth + 5, y - 10, halfWidth * 2 - 10, 5);
    }
    ctx.fillRect(pagodaX - 2, ground - 145, 4, 18);

    // Decorative cherry blossoms.
    ctx.strokeStyle = '#56354c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, ground - 7);
    ctx.lineTo(w * 0.06, ground - h * 0.38);
    ctx.lineTo(w * 0.14, ground - h * 0.5);
    ctx.moveTo(w * 0.04, ground - h * 0.26);
    ctx.lineTo(w * 0.17, ground - h * 0.36);
    ctx.moveTo(w * 0.07, ground - h * 0.39);
    ctx.lineTo(w * 0.03, ground - h * 0.49);
    ctx.stroke();
    const blossomSpots = [
      [0.01, 0.49], [0.045, 0.39], [0.09, 0.47], [0.13, 0.36],
      [0.17, 0.43], [0.03, 0.58], [0.1, 0.57], [0.18, 0.55],
      [0.02, 0.34], [0.12, 0.32], [0.96, 0.53], [0.99, 0.42]
    ];
    const blossomUnit = Math.max(3, Math.min(6, w / 220));
    for (const [x, y] of blossomSpots) {
      this.drawSakura(w * x, ground - h * y, blossomUnit);
    }

    this.drawTorii(w * 0.79, ground, Math.max(3, Math.min(7, w / 150)));

    // Pixel-tile walkway at the bottom edge.
    ctx.fillStyle = '#34384f';
    ctx.fillRect(0, ground, w, h - ground);
    ctx.fillStyle = '#555a77';
    ctx.fillRect(0, ground, w, 5);
    const tile = Math.max(36, Math.min(64, w / 16));
    ctx.fillStyle = '#252a41';
    for (let x = 0; x < w; x += tile) {
      ctx.fillRect(x + 2, ground + 12, tile - 5, 12);
      ctx.fillRect(x - tile / 2 + 2, ground + 29, tile - 5, Math.max(1, h - ground - 29));
    }

    // Sunlit water glints.
    ctx.fillStyle = '#9bd6ff58';
    for (let i = 0; i < 8; i++) {
      const x = (i * w) / 8 + w * 0.25;
      ctx.fillRect(x, ground - 39, 30 + (i % 3) * 16, 4);
    }
  }

  private drawBackgroundImage(): void {
    const image = this.backgroundImage;
    if (!image.complete || image.naturalWidth === 0) {
      this.drawScenery();
      return;
    }

    this.ctx.drawImage(this.backgroundCanvas, 0, 0, this.width, this.height);
  }

  private prepareBackground(): void {
    const image = this.backgroundImage;
    if (!this.width || !this.height || !image.complete || image.naturalWidth === 0) return;

    const cache = this.backgroundCanvas;
    cache.width = Math.round(this.width * this.dpr);
    cache.height = Math.round(this.height * this.dpr);
    const ctx = cache.getContext('2d');
    if (!ctx) throw new Error('Background canvas context is unavailable');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    const coverScale = Math.max(this.width / image.naturalWidth, this.height / image.naturalHeight);
    const coverWidth = image.naturalWidth * coverScale;
    const coverHeight = image.naturalHeight * coverScale;
    ctx.fillStyle = '#3497e7';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.filter = 'blur(18px) brightness(0.78)';
    ctx.drawImage(
      image,
      (this.width - coverWidth) / 2 - 24,
      (this.height - coverHeight) / 2 - 24,
      coverWidth + 48,
      coverHeight + 48
    );
    ctx.restore();

    const containScale = Math.min(this.width / image.naturalWidth, this.height / image.naturalHeight);
    const containWidth = image.naturalWidth * containScale;
    const containHeight = image.naturalHeight * containScale;
    ctx.drawImage(
      image,
      (this.width - containWidth * (4 / 3)) / 2,
      (this.height - containHeight) / 2,
      containWidth * (4 / 3),
      containHeight
    );
  }

  private draw(): void {
    if (!this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackgroundImage();

    for (const item of this.objects) {
      this.drawTarget(item);
    }

    for (const shot of this.shots) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shot.x, shot.y);
      ctx.lineTo(
        shot.x - (shot.x - shot.startX) * 0.11,
        shot.y - (shot.y - shot.startY) * 0.11
      );
      ctx.stroke();
      ctx.restore();
      const direction = Math.atan2(shot.targetY - shot.startY, shot.targetX - shot.startX);
      this.drawShuriken(
        shot.x,
        shot.y,
        direction + this.elapsed * 18,
        Math.max(9, this.width * 0.016)
      );
    }

    for (const particle of this.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const item of this.floatingTexts) {
      const progress = 1 - item.life / item.maxLife;
      const scale = 0.85 + Math.sin(Math.min(1, progress * 5) * Math.PI) * 0.2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, item.life / 0.2);
      ctx.translate(item.x, item.y);
      ctx.scale(scale, scale);
      ctx.font = '900 32px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#18243dcc';
      ctx.strokeText(item.text, 0, 0);
      ctx.fillStyle = item.color;
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 12;
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    }
    this.drawCannon();
    if (this.paused) {
      ctx.fillStyle = '#111a2dcc';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 28px sans-serif';
      ctx.fillText('ПАУЗА', this.width / 2, this.height / 2);
    }
  }
}
