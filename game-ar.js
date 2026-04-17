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
// モンスター定義（angle/elevation はランダム生成で上書きされる）
// =============================================
const MONSTERS = [
  { id: 1, name: 'ピンクモン',   color: '#FF2D78', hp: 2, emoji: '👾', scale: 1.0, angle: 0, elevation: 0 },
  { id: 2, name: 'オレンジモン', color: '#FF6B00', hp: 3, emoji: '🤢', scale: 1.2, angle: 0, elevation: 0 },
  { id: 3, name: 'シアンモン',   color: '#00CFFF', hp: 1, emoji: '👻', scale: 0.9, angle: 0, elevation: 0 },
  { id: 4, name: 'グリーンモン', color: '#39FF14', hp: 2, emoji: '🦠', scale: 1.1, angle: 0, elevation: 0 },
  { id: 5, name: 'パープルモン', color: '#BF5FFF', hp: 3, emoji: '😈', scale: 1.3, angle: 0, elevation: 0 },
  { id: 6, name: 'イエローモン', color: '#FFE600', hp: 1, emoji: '🌟', scale: 0.8, angle: 0, elevation: 0 },
];

// ランダム配置（ページロードごとに再配置・最低60°離す）
(function randomizePositions() {
  const usedAngles = [];
  MONSTERS.forEach(m => {
    let angle;
    let tries = 0;
    do {
      angle = Math.floor(Math.random() * 360);
      tries++;
    } while (tries < 30 && usedAngles.some(a => Math.abs(((angle - a + 540) % 360) - 180) < 60));
    usedAngles.push(angle);
    m.angle     = angle;
    m.elevation = Math.floor(Math.random() * 161) - 80; // -80〜+80
  });
})();

// 倒したモンスターIDを管理（3Dモードから戻った場合のみ引き継ぎ）
const _urlParams = new URLSearchParams(window.location.search);
if (!_urlParams.get('cleared')) {
  sessionStorage.removeItem('defeatedMonsters'); // 新規入場時はリセット
}
const defeated = new Set(
  JSON.parse(sessionStorage.getItem('defeatedMonsters') || '[]')
);

function getLiveMonsters() {
  return MONSTERS.filter(m => !defeated.has(m.id));
}

// =============================================
// センサー・カメラ状態
// =============================================
let heading = 0;
let tiltY   = 0;
let smoothHeading = 0;
let smoothTilt    = 0;
let gyroAvailable = false;
let dragStart = null;

// 角度のlerp
function lerpAngle(a, b, t) {
  let diff = ((b - a) + 540) % 360 - 180;
  return (a + diff * t + 360) % 360;
}

// =============================================
// 許可要求 → カメラ＋ジャイロ起動
// =============================================
function startAR() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showDebug('❌ このブラウザはカメラ非対応');
  } else {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => {
        video.srcObject = stream;
        video.play();
        showDebug('📷 カメラ起動 OK');
      })
      .catch(err => {
        showDebug('❌ カメラ: ' + err.name + ' - ' + err.message);
      });
  }
  const granted = sessionStorage.getItem('gyroGranted');
  if (granted === '1') {
    setupGyro();
  } else {
    showDebug('タイトル画面から入ってください');
  }
  document.getElementById('permScreen').style.display = 'none';
}

document.getElementById('startBtn').addEventListener('click', startAR);

function setupGyro() {
  gyroAvailable = true;
  const dbg = document.getElementById('gyroDebug');
  if (dbg) dbg.style.display = 'block';
  window.addEventListener('deviceorientation', e => {
    if (e.alpha !== null) {
      heading = e.alpha;
      tiltY   = (e.beta || 0);
      if (dbg) dbg.textContent = `h:${Math.round(smoothHeading)}° t:${Math.round(smoothTilt)}°`;
    }
  }, true);
}

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

// PC用：マウスドラッグ
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
const VIEW_ANGLE = 50;

function angleDiff(a, b) {
  let d = ((a - b) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function getScreenPos(monster) {
  const diff = angleDiff(monster.angle, smoothHeading);
  if (Math.abs(diff) > VIEW_ANGLE) return null;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const x  = cx - (diff / VIEW_ANGLE) * cx * 0.8;
  const tiltOffset = (smoothTilt - 60) * 9;
  const y = cy - monster.elevation * 8 + tiltOffset;
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
  const diff = Math.abs(angleDiff(m.angle, heading));
  const sizeScale = 1 - diff / VIEW_ANGLE * 0.4;
  const sz = s * sizeScale;

  ctx.save();
  ctx.shadowColor = m.color;
  ctx.shadowBlur  = 30;
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

  ctx.globalAlpha = 1;
  ctx.font = `${sz * 0.8}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.emoji, x, y);

  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(m.name, x, y + sz * 0.9 + 4);

  const barW = sz * 1.4;
  const barX = x - barW / 2;
  const barY = y + sz * 0.9 + 22;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(barX, barY, barW, 8);
  ctx.fillStyle = m.color;
  ctx.fillRect(barX, barY, barW, 8);

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

  radarCtx.beginPath();
  radarCtx.arc(cx, cy, r, 0, Math.PI*2);
  radarCtx.fillStyle = 'rgba(0,0,0,0.5)';
  radarCtx.fill();
  radarCtx.strokeStyle = 'rgba(255,255,255,0.2)';
  radarCtx.lineWidth = 1;
  radarCtx.stroke();

  // 前方マーカー（上=視点方向）
  radarCtx.fillStyle = 'rgba(255,255,255,0.5)';
  radarCtx.font = '10px Arial';
  radarCtx.textAlign = 'center';
  radarCtx.fillText('▲', cx, cy - r + 10);

  // モンスター点（カメラと同じ diff で方向を統一）
  const live = getLiveMonsters();
  for (const m of live) {
    const diff = angleDiff(m.angle, heading);
    const rad  = -diff * Math.PI / 180; // diff>0=左、diff<0=右
    const dist = r * 0.7;
    const mx = cx + Math.sin(rad) * dist;
    const my = cy - Math.cos(rad) * dist;
    radarCtx.beginPath();
    radarCtx.arc(mx, my, 5, 0, Math.PI*2);
    radarCtx.fillStyle = m.color;
    radarCtx.fill();
  }

  // 自分（中心）
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

  smoothHeading = lerpAngle(smoothHeading, heading, 0.08);
  smoothTilt    = smoothTilt + (tiltY - smoothTilt) * 0.08;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const live = getLiveMonsters();
  for (const m of live) {
    const diff = angleDiff(m.angle, heading);
    const pos  = getScreenPos(m);
    if (pos) {
      drawMonster(m, pos);
    } else {
      // 画面外モンスターの方向矢印（diff>0=左、diff<0=右）
      const arrowX = diff > 0 ? 40 : canvas.width - 40;
      const arrowY = canvas.height / 2;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = m.color;
      ctx.font = '28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(diff > 0 ? '◀' : '▶', arrowX, arrowY);
      ctx.font = '11px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(m.name, arrowX, arrowY + 22);
      ctx.restore();
    }
  }

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

  drawRadar();
  updateUI();
}

loop();

// =============================================
// 3Dモードから戻ってきた場合の処理
// =============================================
if (_urlParams.get('cleared') === '1') {
  const m = JSON.parse(sessionStorage.getItem('currentMonster') || 'null');
  if (m) {
    defeated.add(m.id);
    sessionStorage.setItem('defeatedMonsters', JSON.stringify([...defeated]));
  }
}
