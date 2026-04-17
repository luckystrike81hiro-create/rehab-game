// =============================================
// ふきふきゲーム - モンスター探索モード
// カメラ + DeviceOrientation + モンスター配置
// =============================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const video  = document.getElementById('video');
const radar  = document.getElementById('radar');
const radarCtx = radar.getContext('2d');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// =============================================
// モンスター定義（配置する方角 angle: 0-359）
// =============================================
const MONSTERS = [
  { id: 1, angle: 0,   name: 'ピンクモン',   color: '#FF2D78', hp: 2, emoji: '👾', scale: 1.0 },
  { id: 2, angle: 90,  name: 'オレンジモン', color: '#FF6B00', hp: 3, emoji: '🤢', scale: 1.2 },
  { id: 3, angle: 180, name: 'シアンモン',   color: '#00CFFF', hp: 1, emoji: '👻', scale: 0.9 },
  { id: 4, angle: 270, name: 'グリーンモン', color: '#39FF14', hp: 2, emoji: '🦠', scale: 1.1 },
  { id: 5, angle: 45,  name: 'パープルモン', color: '#BF5FFF', hp: 3, emoji: '😈', scale: 1.3 },
  { id: 6, angle: 225, name: 'イエローモン', color: '#FFE600', hp: 1, emoji: '🌟', scale: 0.8 },
];

// 倒したモンスターIDを管理
const defeated = new Set(
  JSON.parse(sessionStorage.getItem('defeatedMonsters') || '[]')
);

function getLiveMonsters() {
  return MONSTERS.filter(m => !defeated.has(m.id));
}

// =============================================
// センサー・カメラ状態
// =============================================
let heading = 0;   // 現在のコンパス方向（0-360）
let tiltY   = 0;   // 上下チルト
let gyroAvailable = false;
let dragStart = null; // PC用マウスシミュレート

// =============================================
// 許可要求 → カメラ＋ジャイロ起動
// =============================================
document.getElementById('startBtn').addEventListener('touchstart', e => {
  e.preventDefault();
  startAll();
}, { passive: false });
document.getElementById('startBtn').addEventListener('click', startAll);

function startAll() {
  document.getElementById('permScreen').style.display = 'none';

  // ① ジャイロ許可を最初に（同期的にユーザージェスチャー内で呼ぶ）
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(res => {
      if (res === 'granted') setupGyro();
      else showDebug('ジャイロ許可: 拒否されました');
    }).catch(e => showDebug('ジャイロエラー: ' + e.message));
  } else {
    // Android / non-iOS はそのまま使える
    setupGyro();
  }

  // ② カメラは非同期で起動
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(stream => { video.srcObject = stream; })
    .catch(e => showDebug('カメラエラー: ' + e.message));
}

function setupGyro() {
  gyroAvailable = true;
  showDebug('ジャイロ: OK');
  window.addEventListener('deviceorientation', e => {
    if (e.alpha !== null) {
      heading = e.alpha;
      tiltY   = (e.beta || 0);
    }
  }, true);
}

// デバッグ表示（一定時間で消える）
function showDebug(msg) {
  let el = document.getElementById('debugMsg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'debugMsg';
    el.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#0f0;padding:8px 16px;border-radius:12px;font-size:13px;z-index:50;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.remove(), 4000);
}

// PC用：マウスドラッグで方向をシミュレート
canvas.addEventListener('mousedown', e => { dragStart = { x: e.clientX, heading }; });
window.addEventListener('mousemove', e => {
  if (!dragStart) return;
  const diff = (e.clientX - dragStart.x) * 0.5;
  heading = (dragStart.heading - diff + 360) % 360;
});
window.addEventListener('mouseup', () => { dragStart = null; });

// =============================================
// モンスター表示判定
// =============================================
const VIEW_ANGLE = 50; // ±何度で画面に表示するか

function angleDiff(a, b) {
  let d = ((a - b) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function getScreenPos(monster) {
  const diff = angleDiff(monster.angle, heading);
  if (Math.abs(diff) > VIEW_ANGLE) return null;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const x  = cx + (diff / VIEW_ANGLE) * cx * 0.8;
  // 上下はチルトで少し動く
  const y  = cy - (tiltY - 30) * 4;
  return { x, y };
}

// =============================================
// モンスター描画
// =============================================
let time = 0;

function drawMonster(m, pos) {
  const s    = m.scale * 90;
  const bob  = Math.sin(time * 0.05 + m.id) * 8;
  const x    = pos.x;
  const y    = pos.y + bob;

  // 距離感（角度差が小さいほど大きく）
  const diff = Math.abs(angleDiff(m.angle, heading));
  const sizeScale = 1 - diff / VIEW_ANGLE * 0.4;
  const sz = s * sizeScale;

  // グロー
  ctx.save();
  ctx.shadowColor = m.color;
  ctx.shadowBlur  = 30;

  // ブロブ本体
  ctx.beginPath();
  const pts = 10;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = sz * (0.8 + Math.sin(time * 0.08 + i * 1.3 + m.id) * 0.2);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.85;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = m.color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.restore();

  // 目
  ctx.globalAlpha = 1;
  ctx.font = `${sz * 0.8}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.emoji, x, y);

  // 名前
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(m.name, x, y + sz * 0.9 + 4);

  // HPバー
  const barW = sz * 1.4;
  const barX = x - barW / 2;
  const barY = y + sz * 0.9 + 22;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(barX, barY, barW, 8);
  ctx.fillStyle = m.color;
  ctx.fillRect(barX, barY, barW, 8); // 探索モードはHPフル表示

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// =============================================
// タップ判定 → 3Dモードへ
// =============================================
function handleTap(tapX, tapY) {
  const live = getLiveMonsters();
  for (const m of live) {
    const pos = getScreenPos(m);
    if (!pos) continue;
    const s  = m.scale * 90;
    const dx = tapX - pos.x;
    const dy = tapY - (pos.y + Math.sin(time * 0.05 + m.id) * 8);
    if (Math.sqrt(dx*dx + dy*dy) < s * 1.1) {
      // タップしたモンスターのデータをsessionStorageに保存して3Dモードへ
      sessionStorage.setItem('currentMonster', JSON.stringify(m));
      window.location.href = 'mode-3d.html?from=ar';
      return;
    }
  }
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  handleTap(t.clientX, t.clientY);
}, { passive: false });

canvas.addEventListener('click', e => {
  handleTap(e.clientX, e.clientY);
});

// =============================================
// レーダー描画
// =============================================
function drawRadar() {
  const w = radar.width, h = radar.height;
  const cx = w/2, cy = h/2, r = w/2 - 6;
  radarCtx.clearRect(0, 0, w, h);

  // 背景円
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, r, 0, Math.PI*2);
  radarCtx.fillStyle = 'rgba(0,0,0,0.5)';
  radarCtx.fill();
  radarCtx.strokeStyle = 'rgba(255,255,255,0.2)';
  radarCtx.lineWidth = 1;
  radarCtx.stroke();

  // 方位文字
  radarCtx.fillStyle = 'rgba(255,255,255,0.4)';
  radarCtx.font = '10px Arial';
  radarCtx.textAlign = 'center';
  radarCtx.fillText('N', cx, cy - r + 12);
  radarCtx.fillText('S', cx, cy + r - 4);
  radarCtx.fillText('E', cx + r - 6, cy + 4);
  radarCtx.fillText('W', cx - r + 6, cy + 4);

  // モンスター点
  const live = getLiveMonsters();
  for (const m of live) {
    const relAngle = (m.angle - heading + 360) % 360;
    const rad = relAngle * Math.PI / 180 - Math.PI/2;
    const dist = r * 0.7;
    const mx = cx + Math.cos(rad) * dist;
    const my = cy + Math.sin(rad) * dist;
    radarCtx.beginPath();
    radarCtx.arc(mx, my, 5, 0, Math.PI*2);
    radarCtx.fillStyle = m.color;
    radarCtx.fill();
  }

  // 自分（中心の矢印）
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, 5, 0, Math.PI*2);
  radarCtx.fillStyle = '#fff';
  radarCtx.fill();
}

// =============================================
// UI更新
// =============================================
function updateUI() {
  const live = getLiveMonsters();
  document.getElementById('monsterCount').textContent = `残り: ${live.length} 体`;
  document.getElementById('heading').textContent = `${Math.round(heading)}°`;

  // コンパスラベル
  const dirs = ['N','NE','E','SE','S','SW','W','NW','N'];
  const idx = Math.round(heading / 45) % 8;
  document.getElementById('compass').textContent = dirs[idx];
}

// =============================================
// メインループ
// =============================================
function loop() {
  requestAnimationFrame(loop);
  time++;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 視野外ガイド（方向矢印）
  const live = getLiveMonsters();
  for (const m of live) {
    const diff = angleDiff(m.angle, heading);
    const pos  = getScreenPos(m);
    if (pos) {
      drawMonster(m, pos);
    } else {
      // 画面外モンスターの方向矢印
      const arrowX = diff > 0 ? canvas.width - 40 : 40;
      const arrowY = canvas.height / 2;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = m.color;
      ctx.font = '28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(diff > 0 ? '▶' : '◀', arrowX, arrowY);
      ctx.font = '11px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(m.name, arrowX, arrowY + 22);
      ctx.restore();
    }
  }

  // 全滅チェック
  if (live.length === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✨ 全モンスター撃退！', canvas.width/2, canvas.height/2);
    ctx.font = '18px Arial';
    ctx.fillText('おつかれさまでした！', canvas.width/2, canvas.height/2 + 48);
  }

  // デバッグ：ジャイロ値を画面に大きく表示
  ctx.fillStyle = gyroAvailable ? 'rgba(0,255,0,0.8)' : 'rgba(255,100,0,0.8)';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    gyroAvailable ? `▶ heading: ${Math.round(heading)}°` : '⚠ ジャイロ未接続',
    canvas.width / 2, canvas.height - 160
  );

  drawRadar();
  updateUI();
}

loop();

// =============================================
// 3Dモードから戻ってきた場合の処理
// =============================================
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('cleared') === '1') {
  const m = JSON.parse(sessionStorage.getItem('currentMonster') || 'null');
  if (m) {
    defeated.add(m.id);
    sessionStorage.setItem('defeatedMonsters', JSON.stringify([...defeated]));
  }
}
