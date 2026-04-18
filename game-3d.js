// =============================================
// ふきふきゲーム - 3Dモード
// Three.js + キャンバステクスチャ + レイキャスト
// =============================================

// --- Three.js 基本セットアップ ---
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
document.body.insertBefore(renderer.domElement, document.body.firstChild);

// --- パーティクル用2Dオーバーレイ ---
const overlayCanvas = document.createElement('canvas');
overlayCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:5;';
overlayCanvas.width  = window.innerWidth;
overlayCanvas.height = window.innerHeight;
document.body.insertBefore(overlayCanvas, document.body.children[1]);
const oc = overlayCanvas.getContext('2d');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  overlayCanvas.width  = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
});

// =============================================
// 効果音（game.jsと同じ実装）
// =============================================
let audioCtx = null;
let lastWipeSound = 0;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function unlockAudio() {
  const ac = getAudio();
  const buf = ac.createBuffer(1, 1, 22050);
  const src = ac.createBufferSource();
  src.buffer = buf; src.connect(ac.destination); src.start(0);
  ac.resume();
}
function playTone(freq, type, duration, gain_val, freqEnd) {
  const ac = getAudio();
  ac.resume();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + duration);
  gain.gain.setValueAtTime(gain_val, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + duration);
}
function playWipeSound() {
  const now = Date.now();
  if (now - lastWipeSound < 150) return;
  lastWipeSound = now;
  playTone(800, 'sine', 0.12, 0.5, 400);
}
function playPopSound(freq = 600) {
  playTone(freq, 'triangle', 0.2, 0.8, freq * 0.3);
}
function playFinishSound() {
  const ac = getAudio(); ac.resume();
  [523,659,784,1047,1319].forEach((freq, i) => {
    const osc = ac.createOscillator(), gain = ac.createGain();
    const t = ac.currentTime + i * 0.1;
    osc.type = 'triangle'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.7, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.5);
  });
}

// =============================================
// パーティクル
// =============================================
const particles = [];
const MAX_PARTICLES = 300;
const FINISH_COLORS = ['#FF2D78','#FF6B00','#00CFFF','#39FF14','#BF5FFF','#FFE600','#ffffff'];

function emitParticles(x, y, color) {
  const count = 12 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 3.5 + Math.random() * 7;
    particles.push({ x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      r: 4 + Math.random()*9, color, alpha: 1, life: 1 });
  }
}
function launchFinishFireworks() {
  let count = 0;
  function burst() {
    if (count++ >= 18) return;
    const x = 60 + Math.random() * (overlayCanvas.width - 120);
    const y = 80 + Math.random() * (overlayCanvas.height * 0.7);
    const col = FINISH_COLORS[Math.floor(Math.random() * FINISH_COLORS.length)];
    for (let i = 0; i < 40; i++) {
      if (particles.length >= MAX_PARTICLES * 2) break;
      const angle = (i/40)*Math.PI*2 + Math.random()*0.3;
      const speed = 4 + Math.random()*10;
      particles.push({ x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        r: 5 + Math.random()*10, color: col, alpha: 1, life: 1 });
    }
    playPopSound(300 + Math.random()*600);
    setTimeout(burst, 180 + Math.random()*200);
  }
  burst();
}
function updateParticles() {
  for (let i = particles.length-1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.88; p.vy *= 0.88;
    p.life -= 0.028; p.alpha = Math.max(0, p.life);
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  oc.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  for (const p of particles) {
    oc.globalAlpha = p.alpha;
    oc.fillStyle = p.color;
    oc.beginPath();
    oc.arc(p.x, p.y, p.r * p.life, 0, Math.PI*2);
    oc.fill();
  }
  oc.globalAlpha = 1;
}

// --- ライト ---
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// --- 汚れテクスチャ用キャンバス ---
const TEX_W = 512;
const TEX_H = 512;
const dirtCanvas = document.createElement('canvas');
dirtCanvas.width  = TEX_W;
dirtCanvas.height = TEX_H;
const dirtCtx = dirtCanvas.getContext('2d');

// ベーステクスチャ（白い壁っぽい色）
const baseCanvas = document.createElement('canvas');
baseCanvas.width  = TEX_W;
baseCanvas.height = TEX_H;
const baseCtx = baseCanvas.getContext('2d');
baseCtx.fillStyle = '#e8e0d5';
baseCtx.fillRect(0, 0, TEX_W, TEX_H);
// タイル風グリッド
baseCtx.strokeStyle = 'rgba(180,170,155,0.4)';
baseCtx.lineWidth = 2;
for (let x = 0; x < TEX_W; x += 80) { baseCtx.beginPath(); baseCtx.moveTo(x,0); baseCtx.lineTo(x,TEX_H); baseCtx.stroke(); }
for (let y = 0; y < TEX_H; y += 80) { baseCtx.beginPath(); baseCtx.moveTo(0,y); baseCtx.lineTo(TEX_W,y); baseCtx.stroke(); }

// wipeマスク（消した領域を記録）
const wipeCanvas = document.createElement('canvas');
wipeCanvas.width  = TEX_W;
wipeCanvas.height = TEX_H;
const wipeCtx = wipeCanvas.getContext('2d');

// 合成テクスチャ（最終的にThree.jsに渡す）
const finalCanvas = document.createElement('canvas');
finalCanvas.width  = TEX_W;
finalCanvas.height = TEX_H;
const finalCtx = finalCanvas.getContext('2d');

const texture = new THREE.CanvasTexture(finalCanvas);

// --- 3Dモデル（モンスターに応じて形状を変える） ---
const _m3d = JSON.parse(sessionStorage.getItem('currentMonster') || 'null');
const _shapeIdx = _m3d ? ((_m3d.id - 1) % 3) : 0;
const _shapeNames = ['絡み結び', '深溝球', '太ドーナツ'];

// 深溝球（パンプキン形：8本の深い縦溝）
function createFlutedSphere() {
  const geo = new THREE.SphereGeometry(1.5, 128, 64);
  const pos = geo.attributes.position;
  const ridges = 8;
  const depth  = 0.38;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r   = Math.sqrt(x*x + y*y + z*z);
    const phi = Math.atan2(z, x);
    const theta = Math.acos(Math.max(-1, Math.min(1, y / r)));
    const groove = 1 + depth * Math.cos(phi * ridges) * Math.sin(theta);
    const nr = r * groove;
    pos.setXYZ(i, x/r*nr, y/r*nr, z/r*nr);
  }
  geo.computeVertexNormals();
  return geo;
}

const _geos = [
  new THREE.TorusKnotGeometry(1.0, 0.25, 512, 12, 5, 3), // 0: 複雑絡み結び（細・多重巻き）
  createFlutedSphere(),                                    // 1: 深溝球（谷が深く回転必須）
  new THREE.TorusGeometry(1.1, 0.72, 48, 128),           // 2: 太ドーナツ（内側が死角）
];
const geometry = _geos[_shapeIdx];
const material = new THREE.MeshPhongMaterial({ map: texture });
const sphere   = new THREE.Mesh(geometry, material);
scene.add(sphere);
document.getElementById('modeLabel').textContent = `3D: ${_shapeNames[_shapeIdx]}`;

// --- 汚れオブジェクト ---
const DIRT_COLORS = ['#FF2D78','#FF6B00','#00CFFF','#39FF14','#BF5FFF','#FFE600'];
let dirtObjects = [];
let totalDirtPixels = 0;

function generateSplatPoints(cx, cy, r, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const isSpike = Math.random() > 0.35;
    const noise   = isSpike ? 0.85 + Math.random() * 0.9 : 0.15 + Math.random() * 0.35;
    pts.push({ x: cx + Math.cos(angle) * r * noise, y: cy + Math.sin(angle) * r * noise });
  }
  return pts;
}

function drawSplatOnCtx(c, points) {
  if (points.length < 3) return;
  c.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i], p1 = points[(i+1) % points.length];
    const mx = (p0.x+p1.x)/2, my = (p0.y+p1.y)/2;
    if (i === 0) c.moveTo(mx, my);
    else c.quadraticCurveTo(p0.x, p0.y, mx, my);
  }
  c.closePath();
}

function hpToColor(baseColor, ratio) {
  const r = parseInt(baseColor.slice(1,3),16);
  const g = parseInt(baseColor.slice(3,5),16);
  const b = parseInt(baseColor.slice(5,7),16);
  const fade = Math.pow(ratio, 0.6);
  return `rgb(${Math.round(r+(255-r)*(1-fade))},${Math.round(g+(255-g)*(1-fade))},${Math.round(b+(255-b)*(1-fade))})`;
}

function generateDirt() {
  dirtObjects = [];
  const count = 30 + Math.floor(Math.random() * 20);
  for (let i = 0; i < count; i++) {
    const color = DIRT_COLORS[Math.floor(Math.random() * DIRT_COLORS.length)];
    const x = 60 + Math.random() * (TEX_W - 120);
    const y = 60 + Math.random() * (TEX_H - 120);
    const r = 40 + Math.random() * 60;
    const maxHp = 1 + Math.floor(Math.random() * 3);
    dirtObjects.push({
      x, y, r, baseColor: color,
      hp: maxHp, maxHp,
      splatPoints: generateSplatPoints(x, y, r, 16 + Math.floor(Math.random() * 8)),
      droplets: Array.from({length: 4 + Math.floor(Math.random()*5)}, () => ({
        x: x + (Math.random()-0.5)*r*2.5,
        y: y + (Math.random()-0.5)*r*2.5,
        r: r * (0.08 + Math.random()*0.2),
      })),
    });
  }
}

function rebuildDirtCanvas() {
  dirtCtx.clearRect(0, 0, TEX_W, TEX_H);
  for (const d of dirtObjects) {
    if (d.hp <= 0) continue;
    const ratio = d.hp / d.maxHp;
    dirtCtx.globalAlpha = 0.92;
    dirtCtx.fillStyle = hpToColor(d.baseColor, ratio);
    drawSplatOnCtx(dirtCtx, d.splatPoints);
    dirtCtx.fill();
    for (const drop of d.droplets) {
      dirtCtx.globalAlpha = 0.75;
      dirtCtx.beginPath();
      dirtCtx.arc(drop.x, drop.y, drop.r, 0, Math.PI*2);
      dirtCtx.fill();
    }
  }
  dirtCtx.globalAlpha = 1;
  dirtCtx.globalCompositeOperation = 'destination-out';
  dirtCtx.drawImage(wipeCanvas, 0, 0);
  dirtCtx.globalCompositeOperation = 'source-over';
}

function rebuildFinalTexture() {
  finalCtx.clearRect(0, 0, TEX_W, TEX_H);
  finalCtx.drawImage(baseCanvas, 0, 0);
  finalCtx.drawImage(dirtCanvas, 0, 0);
  texture.needsUpdate = true;
}

function countDirtPixels() {
  rebuildDirtCanvas();
  rebuildFinalTexture();
  const img = dirtCtx.getImageData(0, 0, TEX_W, TEX_H);
  totalDirtPixels = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] > 10) totalDirtPixels++;
  }
}

// cleanPercent 計算の間引き用
let _lastPercentTime = 0;
const PERCENT_INTERVAL = 300; // ms

// --- ゲーム状態 ---
const state = {
  cleanPercent: 0,
  startTime: Date.now(),
  running: true,
  completed: false,
  fingers: [],
};

// --- レイキャスト＋拭き取り ---
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
const WIPE_UV_R = 0.04; // UV空間での消去半径

function wipeAtScreen(screenX, screenY) {
  mouse.x = (screenX / window.innerWidth) * 2 - 1;
  mouse.y = -(screenY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(sphere);
  if (hits.length === 0) return false;

  const uv = hits[0].uv;
  const px = uv.x * TEX_W;
  const py = (1 - uv.y) * TEX_H;
  const r  = WIPE_UV_R * TEX_W;

  // wipeCanvasに消去ストローク追加
  const grad = wipeCtx.createRadialGradient(px, py, 0, px, py, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  wipeCtx.fillStyle = grad;
  wipeCtx.beginPath();
  wipeCtx.arc(px, py, r, 0, Math.PI*2);
  wipeCtx.fill();

  // HP削る＋パーティクル＋音
  for (const d of dirtObjects) {
    if (d.hp <= 0) continue;
    const dx = d.x - px, dy = d.y - py;
    if (Math.sqrt(dx*dx+dy*dy) < d.r * 0.9) {
      d.hp = Math.max(0, d.hp - 0.15);
      emitParticles(screenX, screenY, d.baseColor);
      playPopSound();
    }
  }

  playWipeSound();
  rebuildDirtCanvas();
  rebuildFinalTexture();
  updateCleanPercent();
  return true;
}

function updateCleanPercent() {
  const now = Date.now();
  if (now - _lastPercentTime < PERCENT_INTERVAL) return;
  _lastPercentTime = now;
  const img = dirtCtx.getImageData(0, 0, TEX_W, TEX_H);
  let remaining = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] > 10) remaining++;
  }
  if (totalDirtPixels > 0) {
    state.cleanPercent = Math.min(100, Math.round((totalDirtPixels - remaining) / totalDirtPixels * 100));
  }
}

// --- タッチイベント ---
renderer.domElement.addEventListener('touchstart', e => {
  e.preventDefault();
  unlockAudio();
  state.fingers = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
}, { passive: false });

renderer.domElement.addEventListener('touchmove', e => {
  e.preventDefault();
  state.fingers = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
  if (!state.running || state.completed) return;
  for (const f of state.fingers) wipeAtScreen(f.x, f.y);
}, { passive: false });

renderer.domElement.addEventListener('touchend', e => {
  e.preventDefault();
  state.fingers = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
}, { passive: false });

// マウス（PC確認用）
let mouseDown = false;
renderer.domElement.addEventListener('mousedown', e => { mouseDown = true; });
renderer.domElement.addEventListener('mousemove', e => {
  if (!mouseDown || !state.running || state.completed) return;
  wipeAtScreen(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('mouseup', () => { mouseDown = false; });

// --- 十字キー ---
const ROT_SPEED = 0.04;
const dpadState = { up: false, down: false, left: false, right: false };

function bindDpad(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); dpadState[key] = true; }, { passive: false });
  el.addEventListener('touchend',   e => { e.preventDefault(); e.stopPropagation(); dpadState[key] = false; }, { passive: false });
  el.addEventListener('mousedown',  e => { dpadState[key] = true; });
  el.addEventListener('mouseup',    e => { dpadState[key] = false; });
}

bindDpad('dpad-up',    'up');
bindDpad('dpad-down',  'down');
bindDpad('dpad-left',  'left');
bindDpad('dpad-right', 'right');

// --- UI ---
function updateUI() {
  document.getElementById('cleanPercent').textContent = `清潔度: ${state.cleanPercent}%`;
  document.getElementById('progressBar').style.width = state.cleanPercent + '%';
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const m = String(Math.floor(elapsed/60)).padStart(2,'0');
  const s = String(elapsed%60).padStart(2,'0');
  document.getElementById('timer').textContent = `${m}:${s}`;
  if (state.cleanPercent >= 99 && !state.completed) {
    state.completed = true;
    state.running = false;
    const el = document.getElementById('message');
    el.textContent = `✨ きれいになった！\n${m}:${s}`;
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 3000);
    playFinishSound();
    launchFinishFireworks();
    // ARモードから来た場合は3秒後にARモードへ戻る
    if (new URLSearchParams(window.location.search).get('from') === 'ar') {
      setTimeout(() => {
        window.location.href = 'mode-ar.html?cleared=1';
      }, 3500);
    }
  }
}

// --- メインループ ---
function loop() {
  requestAnimationFrame(loop);
  if (dpadState.up)    sphere.rotation.x -= ROT_SPEED;
  if (dpadState.down)  sphere.rotation.x += ROT_SPEED;
  if (dpadState.left)  sphere.rotation.y -= ROT_SPEED;
  if (dpadState.right) sphere.rotation.y += ROT_SPEED;
  renderer.render(scene, camera);
  updateParticles();
  drawParticles();
  updateUI();
}

// --- 起動 ---
generateDirt();
countDirtPixels();
loop();
