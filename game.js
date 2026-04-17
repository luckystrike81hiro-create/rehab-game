// =============================================
// ふきふきゲーム - Phase 1
// マルチタッチ（4本指）で汚れを拭き取る基本システム
// =============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// =============================================
// 効果音（Web Audio API）
// =============================================
let audioCtx = null;
let audioUnlocked = false;
let lastWipeSound = 0;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// iOS Safari用：最初のタッチでサイレントバッファを鳴らしてAudioをアンロック
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const ac = getAudio();
  const buf = ac.createBuffer(1, 1, 22050);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(ac.destination);
  src.start(0);
  ac.resume().then(() => { audioUnlocked = true; });
}

// 拭き取り音：ピュッと下がるトーン
function playWipeSound() {
  const now = Date.now();
  if (now - lastWipeSound < 150) return;
  lastWipeSound = now;
  const ac = getAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.1);
  gain.gain.setValueAtTime(0.5, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.12);
}

// ポップ音：ポンと弾ける
function playPopSound(freq = 600) {
  const ac = getAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, ac.currentTime + 0.18);
  gain.gain.setValueAtTime(0.8, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.2);
}

// フィニッシュ音：ファンファーレ
function playFinishSound() {
  const ac = getAudio();
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const t = ac.currentTime + i * 0.1;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.7, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.5);
  });
}

// --- キャンバスサイズ ---
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initDirt();
}
window.addEventListener('resize', resize);

// --- 2層キャンバス構成 ---
// wipeCanvas : 消去履歴（ユーザーが拭いた領域を白で蓄積）
// colorCanvas: 汚れの色描画（HPに応じて毎回再描画）
let wipeCanvas, wipeCtx;
let colorCanvas, colorCtx;
let totalDirtPixels = 0;

// --- ゲーム状態 ---
const state = {
  fingers: [],
  startTime: null,
  elapsed: 0,
  running: false,
  cleanPercent: 0,
  completed: false,
};

// --- 汚れの種類定義（スプラトゥーン系ビビッドカラー） ---
const DIRT_TYPES = [
  { name: 'インク',     color: '#FF2D78', hp: 1, radius: 35 },
  { name: 'べとべと',   color: '#FF6B00', hp: 2, radius: 40 },
  { name: 'こびりつき', color: '#00CFFF', hp: 3, radius: 28 },
  { name: 'のり',       color: '#39FF14', hp: 2, radius: 32 },
  { name: 'ドロ',       color: '#BF5FFF', hp: 1, radius: 45 },
  { name: 'ソース',     color: '#FFE600', hp: 3, radius: 30 },
];

let dirtObjects = [];
let finishTimer = null;

// =============================================
// フィニッシュ花火
// =============================================
const FINISH_COLORS = ['#FF2D78','#FF6B00','#00CFFF','#39FF14','#BF5FFF','#FFE600','#ffffff'];

function launchFinishFireworks() {
  let count = 0;
  const max = 18;
  function burst() {
    if (count >= max) return;
    count++;
    const x = 60 + Math.random() * (canvas.width - 120);
    const y = 80 + Math.random() * (canvas.height * 0.7);
    const col = FINISH_COLORS[Math.floor(Math.random() * FINISH_COLORS.length)];
    // 大量の粒を一気に放出
    for (let i = 0; i < 40; i++) {
      if (particles.length >= MAX_PARTICLES * 3) break;
      const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 4 + Math.random() * 10;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 5 + Math.random() * 10,
        color: col,
        alpha: 1,
        life: 1,
      });
    }
    playPopSound(300 + Math.random() * 600);
    setTimeout(burst, 180 + Math.random() * 200);
  }
  burst();
}

// --- パーティクル ---
const particles = [];
const MAX_PARTICLES = 300;

function emitParticles(x, y, color) {
  const count = 12 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 3.5 + Math.random() * 7;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 4 + Math.random() * 9,
      color,
      alpha: 1,
      life: 1,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.88;
    p.vy *= 0.88;
    p.life -= 0.028;
    p.alpha = Math.max(0, p.life);
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// =============================================
// 汚れ初期化
// =============================================
function initDirt() {
  wipeCanvas = document.createElement('canvas');
  wipeCanvas.width = canvas.width;
  wipeCanvas.height = canvas.height;
  wipeCtx = wipeCanvas.getContext('2d');

  colorCanvas = document.createElement('canvas');
  colorCanvas.width = canvas.width;
  colorCanvas.height = canvas.height;
  colorCtx = colorCanvas.getContext('2d');

  dirtObjects = [];
  generateDirt();
  rebuildColorCanvas();
  countDirtPixels();

  state.startTime = Date.now();
  state.running = true;
  state.completed = false;
  state.cleanPercent = 0;
  updateUI();
}

// =============================================
// スプラット形状生成
// =============================================

// スプラトゥーンっぽいスパイク形状（でっぱりとへこみを交互に）
function generateSplatPoints(cx, cy, r, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    // スパイク（大）とバレー（小）をランダムに切り替え
    const isSpike = Math.random() > 0.35;
    const noise = isSpike
      ? 0.85 + Math.random() * 0.9   // でっぱり: 0.85~1.75
      : 0.15 + Math.random() * 0.35; // へこみ:   0.15~0.5
    points.push({
      x: cx + Math.cos(angle) * r * noise,
      y: cy + Math.sin(angle) * r * noise,
    });
  }
  return points;
}

// 飛び散り小滴
function generateDroplets(cx, cy, r) {
  const drops = [];
  const count = 5 + Math.floor(Math.random() * 7);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = r * (1.0 + Math.random() * 1.4);
    drops.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      r: r * (0.08 + Math.random() * 0.2),
      // 小滴も楕円っぽくするための傾き
      angle: Math.random() * Math.PI,
    });
  }
  return drops;
}

// 汚れオブジェクト生成
function generateDirt() {
  const headerH = 60;
  const count = 35 + Math.floor(Math.random() * 20);
  for (let i = 0; i < count; i++) {
    const type = DIRT_TYPES[Math.floor(Math.random() * DIRT_TYPES.length)];
    const x = Math.random() * canvas.width;
    const y = headerH + Math.random() * (canvas.height - headerH - 20);
    const r = type.radius * (0.6 + Math.random() * 0.9);
    dirtObjects.push({
      x, y, r,
      baseColor: type.color,
      hp: type.hp,
      maxHp: type.hp,
      type: type.name,
      splatPoints: generateSplatPoints(x, y, r, 16 + Math.floor(Math.random() * 8)),
      droplets: generateDroplets(x, y, r),
    });
  }
}

// =============================================
// 色計算（HPで鮮やかさが変わる）
// =============================================
function hpToColor(baseColor, ratio) {
  // ratio 1.0 = ビビッド原色, 0.33 = 薄い, 0.0 = ほぼ白
  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);
  const fade = Math.pow(ratio, 0.6); // 少し非線形に
  const wr = Math.round(r + (255 - r) * (1 - fade));
  const wg = Math.round(g + (255 - g) * (1 - fade));
  const wb = Math.round(b + (255 - b) * (1 - fade));
  return `rgb(${wr},${wg},${wb})`;
}

// =============================================
// colorCanvas再描画（汚れの色・形を描く）
// =============================================
function drawSplat(c, points) {
  if (points.length < 3) return;
  c.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    if (i === 0) c.moveTo(mx, my);
    else c.quadraticCurveTo(p0.x, p0.y, mx, my);
  }
  c.closePath();
}

function rebuildColorCanvas() {
  colorCtx.clearRect(0, 0, colorCanvas.width, colorCanvas.height);

  for (const d of dirtObjects) {
    if (d.hp <= 0) continue;
    const ratio = d.hp / d.maxHp;
    const col = hpToColor(d.baseColor, ratio);

    colorCtx.globalAlpha = 0.92;
    colorCtx.fillStyle = col;

    // メインのスプラット
    drawSplat(colorCtx, d.splatPoints);
    colorCtx.fill();

    // 小滴
    for (const drop of d.droplets) {
      colorCtx.globalAlpha = 0.75 + Math.random() * 0.2;
      colorCtx.beginPath();
      colorCtx.ellipse(
        drop.x, drop.y,
        drop.r, drop.r * (0.5 + Math.random() * 0.8),
        drop.angle, 0, Math.PI * 2
      );
      colorCtx.fill();
    }
  }
  colorCtx.globalAlpha = 1;

  // wipeCanvasで消した部分をcolorCanvasから除去
  colorCtx.globalCompositeOperation = 'destination-out';
  colorCtx.drawImage(wipeCanvas, 0, 0);
  colorCtx.globalCompositeOperation = 'source-over';
}

// 汚れピクセル数カウント（進捗計算用）
function countDirtPixels() {
  const imageData = colorCtx.getImageData(0, 0, colorCanvas.width, colorCanvas.height);
  totalDirtPixels = 0;
  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 10) totalDirtPixels++;
  }
}

// =============================================
// 拭き取り処理
// =============================================
function calcWipeRadius(touches) {
  if (touches.length <= 1) return 14;
  let maxDist = 0;
  for (let i = 0; i < touches.length; i++) {
    for (let j = i + 1; j < touches.length; j++) {
      const dx = touches[i].x - touches[j].x;
      const dy = touches[i].y - touches[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxDist) maxDist = d;
    }
  }
  // 指間隔が広いほど少しだけ広がる（14〜22px）
  return 14 + Math.min(maxDist * 0.04, 8);
}

function wipe(touches) {
  if (touches.length === 0) return;
  const wipeRadius = calcWipeRadius(touches);

  playWipeSound();

  // wipeCanvasに消去ストロークを蓄積（白で書く）
  for (const t of touches) {
    const grad = wipeCtx.createRadialGradient(t.x, t.y, 0, t.x, t.y, wipeRadius);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    wipeCtx.fillStyle = grad;
    wipeCtx.beginPath();
    wipeCtx.arc(t.x, t.y, wipeRadius, 0, Math.PI * 2);
    wipeCtx.fill();
  }

  // 汚れオブジェクトのHPを削る
  let hpChanged = false;
  for (const d of dirtObjects) {
    if (d.hp <= 0) continue;
    for (const t of touches) {
      const dx = d.x - t.x;
      const dy = d.y - t.y;
      if (Math.sqrt(dx * dx + dy * dy) < d.r * 0.8) {
        d.hp = Math.max(0, d.hp - 0.12);
        hpChanged = true;
        emitParticles(t.x, t.y, d.baseColor);
        playPopSound();
      }
    }
  }

  // HP変化があった場合のみ色の再描画
  if (hpChanged) {
    rebuildColorCanvas();
  } else {
    // 色変化なくても消去だけ反映
    colorCtx.globalCompositeOperation = 'destination-out';
    colorCtx.drawImage(wipeCanvas, 0, 0);
    colorCtx.globalCompositeOperation = 'source-over';
  }

  updateCleanPercent();
}

function updateCleanPercent() {
  const imageData = colorCtx.getImageData(0, 0, colorCanvas.width, colorCanvas.height);
  let remaining = 0;
  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 10) remaining++;
  }
  if (totalDirtPixels > 0) {
    const cleaned = totalDirtPixels - remaining;
    state.cleanPercent = Math.min(100, Math.round(cleaned / totalDirtPixels * 100));
  }
}

// =============================================
// タッチイベント
// =============================================
function getTouches(e) {
  return Array.from(e.touches).map(t => ({
    x: t.clientX,
    y: t.clientY,
    id: t.identifier,
  }));
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  unlockAudio();
  state.fingers = getTouches(e);
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  state.fingers = getTouches(e);
  if (state.running && !state.completed) wipe(state.fingers);
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  state.fingers = getTouches(e);
}, { passive: false });

// マウス操作（PC確認用）
let mouseDown = false;
canvas.addEventListener('mousedown', e => {
  mouseDown = true;
  state.fingers = [{ x: e.clientX, y: e.clientY }];
});
canvas.addEventListener('mousemove', e => {
  if (!mouseDown) return;
  state.fingers = [{ x: e.clientX, y: e.clientY }];
  if (state.running && !state.completed) wipe(state.fingers);
});
canvas.addEventListener('mouseup', () => { mouseDown = false; state.fingers = []; });

// =============================================
// UI更新
// =============================================
function updateUI() {
  document.getElementById('cleanPercent').textContent = `清潔度: ${state.cleanPercent}%`;
  document.getElementById('fingerInfo').textContent = `指: ${state.fingers.length}本`;

  const elapsed = state.running ? Math.floor((Date.now() - state.startTime) / 1000) : state.elapsed;
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  document.getElementById('timer').textContent = `${m}:${s}`;
  document.getElementById('progressBar').style.width = state.cleanPercent + '%';

  if (state.cleanPercent >= 95 && !state.completed) {
    state.completed = true;
    state.running = false;
    state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    showMessage(`✨ きれいになった！\n${m}:${s}`);
    playFinishSound();
    launchFinishFireworks();
  }
}

function showMessage(text) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// =============================================
// 描画ループ
// =============================================
function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#e8e0d5');
  grad.addColorStop(1, '#d4c9b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(180,170,155,0.4)';
  ctx.lineWidth = 1;
  const tileSize = 60;
  for (let x = 0; x < canvas.width; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 60; y < canvas.height; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

function drawFingerIndicators() {
  for (const t of state.fingers) {
    const r = calcWipeRadius(state.fingers);
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  if (colorCanvas) ctx.drawImage(colorCanvas, 0, 0);
  updateParticles();
  drawParticles();
  drawFingerIndicators();
  updateUI();
  requestAnimationFrame(loop);
}

// =============================================
// 起動
// =============================================
resize();
loop();
