// =============================================
// ふきふきゲーム - Phase 1
// マルチタッチ（4本指）で汚れを拭き取る基本システム
// =============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- キャンバスサイズ ---
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initDirt();
}
window.addEventListener('resize', resize);

// --- 汚れレイヤー（オフスクリーンCanvas） ---
// dirtCanvas: 汚れのマスク。白=汚れあり、黒=きれい
let dirtCanvas, dirtCtx;
let totalDirtPixels = 0;
let cleanedPixels = 0;

// --- ゲーム状態 ---
const state = {
  fingers: [],       // 現在のタッチ点
  startTime: null,
  elapsed: 0,
  running: false,
  cleanPercent: 0,
  completed: false,
};

// --- 汚れの種類定義 ---
const DIRT_TYPES = [
  { name: 'ほこり',   color: '#8B7355', alpha: 0.7, hp: 1, radius: 30 },
  { name: 'しみ',     color: '#4a2c0a', alpha: 0.85, hp: 3, radius: 25 },
  { name: 'べとべと', color: '#556B2F', alpha: 0.9, hp: 2, radius: 40 },
];

// 汚れオブジェクト配列
let dirtObjects = [];

// =============================================
// 汚れ初期化
// =============================================
function initDirt() {
  dirtCanvas = document.createElement('canvas');
  dirtCanvas.width = canvas.width;
  dirtCanvas.height = canvas.height;
  dirtCtx = dirtCanvas.getContext('2d');

  dirtObjects = [];
  generateDirt();
  renderDirtToMask();
  countDirtPixels();

  state.startTime = Date.now();
  state.running = true;
  state.completed = false;
  cleanedPixels = 0;
  updateUI();
}

// スプラット形状の頂点を生成（固定シード）
function generateSplatPoints(cx, cy, r, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    // 半径をランダムに凸凹させてアメーバ形状に
    const noise = 0.5 + Math.random() * 0.9;
    points.push({
      x: cx + Math.cos(angle) * r * noise,
      y: cy + Math.sin(angle) * r * noise,
    });
  }
  return points;
}

// 飛び散り小滴を生成
function generateDroplets(cx, cy, r) {
  const drops = [];
  const count = 4 + Math.floor(Math.random() * 6);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = r * (0.8 + Math.random() * 1.2);
    drops.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      r: r * (0.1 + Math.random() * 0.25),
    });
  }
  return drops;
}

// 汚れオブジェクトを生成
function generateDirt() {
  const headerH = 60;
  const count = 40 + Math.floor(Math.random() * 20);

  for (let i = 0; i < count; i++) {
    const type = DIRT_TYPES[Math.floor(Math.random() * DIRT_TYPES.length)];
    const x = Math.random() * canvas.width;
    const y = headerH + Math.random() * (canvas.height - headerH - 20);
    const r = type.radius * (0.5 + Math.random());
    dirtObjects.push({
      x, y, r,
      color: type.color,
      alpha: type.alpha,
      hp: type.hp,
      maxHp: type.hp,
      type: type.name,
      // スプラット形状を生成時に固定
      splatPoints: generateSplatPoints(x, y, r, 14 + Math.floor(Math.random() * 8)),
      droplets: generateDroplets(x, y, r),
    });
  }
}

// ベジェ曲線でスプラット形状を描画
function drawSplat(ctx, points) {
  if (points.length < 3) return;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
  }
  ctx.closePath();
}

// 汚れをオフスクリーンCanvasに描画（マスク生成）
function renderDirtToMask() {
  dirtCtx.clearRect(0, 0, dirtCanvas.width, dirtCanvas.height);
  for (const d of dirtObjects) {
    if (d.hp <= 0) continue;
    const ratio = d.hp / d.maxHp;

    // メインのスプラット
    dirtCtx.globalAlpha = d.alpha * ratio;
    dirtCtx.fillStyle = d.color;
    drawSplat(dirtCtx, d.splatPoints);
    dirtCtx.fill();

    // 飛び散り小滴
    for (const drop of d.droplets) {
      dirtCtx.globalAlpha = d.alpha * ratio * (0.6 + Math.random() * 0.4);
      dirtCtx.beginPath();
      dirtCtx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
      dirtCtx.fill();
    }
  }
  dirtCtx.globalAlpha = 1;
}

// 汚れピクセル数カウント（進捗計算用）
function countDirtPixels() {
  const imageData = dirtCtx.getImageData(0, 0, dirtCanvas.width, dirtCanvas.height);
  totalDirtPixels = 0;
  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 10) totalDirtPixels++;
  }
}

// =============================================
// 拭き取り処理
// =============================================

// 指間隔からワイプ半径を計算（4本指 → 広い範囲）
function calcWipeRadius(touches) {
  if (touches.length <= 1) return 40;

  let maxDist = 0;
  for (let i = 0; i < touches.length; i++) {
    for (let j = i + 1; j < touches.length; j++) {
      const dx = touches[i].x - touches[j].x;
      const dy = touches[i].y - touches[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxDist) maxDist = d;
    }
  }
  // 指間隔 0~200px → 半径 40~120
  return 40 + Math.min(maxDist * 0.4, 80);
}

// 汚れを拭き取る（マスクを消去 + HPを削る）
function wipe(touches) {
  if (touches.length === 0) return;

  const wipeRadius = calcWipeRadius(touches);

  // オフスクリーンCanvasの汚れを消去
  dirtCtx.globalCompositeOperation = 'destination-out';
  for (const t of touches) {
    const grad = dirtCtx.createRadialGradient(t.x, t.y, 0, t.x, t.y, wipeRadius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    dirtCtx.fillStyle = grad;
    dirtCtx.beginPath();
    dirtCtx.arc(t.x, t.y, wipeRadius, 0, Math.PI * 2);
    dirtCtx.fill();
  }
  dirtCtx.globalCompositeOperation = 'source-over';

  // 汚れオブジェクトのHPを削る（拭いた円内に中心がある汚れ）
  for (const d of dirtObjects) {
    if (d.hp <= 0) continue;
    for (const t of touches) {
      const dx = d.x - t.x;
      const dy = d.y - t.y;
      if (Math.sqrt(dx * dx + dy * dy) < wipeRadius * 1.2) {
        d.hp = Math.max(0, d.hp - 0.15);
      }
    }
  }

  updateCleanPercent();
}

function updateCleanPercent() {
  const imageData = dirtCtx.getImageData(0, 0, dirtCanvas.width, dirtCanvas.height);
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
  state.fingers = getTouches(e);
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  state.fingers = getTouches(e);
  if (state.running && !state.completed) {
    wipe(state.fingers);
  }
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

  // クリア判定
  if (state.cleanPercent >= 95 && !state.completed) {
    state.completed = true;
    state.running = false;
    state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    showMessage(`✨ きれいになった！\n${m}:${s}`);
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
  // 背景（壁・床っぽい感じ）
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#e8e0d5');
  grad.addColorStop(1, '#d4c9b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // タイル風グリッド
  ctx.strokeStyle = 'rgba(180,170,155,0.4)';
  ctx.lineWidth = 1;
  const tileSize = 60;
  for (let x = 0; x < canvas.width; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 60; y < canvas.height; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawFingerIndicators() {
  for (const t of state.fingers) {
    const r = calcWipeRadius(state.fingers);
    // ワイプ範囲円
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 指先
    ctx.beginPath();
    ctx.arc(t.x, t.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  drawBackground();

  // 汚れ描画
  if (dirtCanvas) {
    ctx.drawImage(dirtCanvas, 0, 0);
  }

  // 指インジケーター
  drawFingerIndicators();

  // UI更新
  updateUI();

  requestAnimationFrame(loop);
}

// =============================================
// 起動
// =============================================
resize();
loop();
