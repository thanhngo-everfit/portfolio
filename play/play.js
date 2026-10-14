// Signal Hunt — look around a sky of noise, lock onto hidden signals, hold to decode them.
// Each decoded signal summons a vessel that carries one fact, and unlocks that fact in the HUD.
import { createSignal } from './signal.js';

const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
if (!fine) html.classList.add('touch');

// yaw: radians to the right of the starting view, pitch: radians up
const NODES = [
  { label: 'BASED', freq: '88.4', yaw: 0.32, pitch: 0.06, msg: 'HOME PLANET LOCATED',
    vessel: { type: 'planet', ringText: 'DA NANG · VIETNAM · 16.0544°N 108.2022°E', pinLabel: 'DA NANG', lat: 16.0544, lon: 108.2022 } },
  { label: 'NOW', freq: '94.2', yaw: -1.75, pitch: -0.12, msg: 'CREW MEMBER SPOTTED',
    vessel: { type: 'alien', sign: { kicker: 'NOW · SINCE 2020', l1: 'PRODUCT', l2: 'MANAGER', sub: '@ EVERFIT' } } },
  { label: 'BEFORE', freq: '101.7', yaw: 2.7, pitch: 0.16, msg: 'TWO PAST MISSIONS ON BOARD',
    vessel: { type: 'freighter', accent: '#ffb347', livery: { reg: 'TN-00 · EVERFIT', kicker: 'PREVIOUSLY', title: 'SCRUM MASTER', sub: 'AND BEFORE THAT: QA LEAD AT GAMELOFT, 2016–2020' } } },
  { label: 'SIGNAL', freq: '107.9', yaw: 1.42, pitch: -0.2, msg: 'OPEN CHANNEL', contact: true,
    vessel: { type: 'station', title: 'THANHNGO@EVERFIT.IO', sub: 'OR LINKEDIN: THANH NGO' } },
];
const EMAIL = 'thanhngo@everfit.io';
const LOCK_PX = fine ? 70 : 90;
const DECODE_S = 1.1;

let signal = null;
try {
  signal = createSignal($('#gl'), { reduced, nodes: NODES, startYaw: -0.15 });
} catch (e) {
  console.warn('WebGL unavailable, using static background.', e);
  html.classList.add('no-webgl');
}
const nodeCount = signal ? signal.count.toLocaleString('en-US') : '0';
$('#tNodes').textContent = nodeCount;

// ---------------------------------------------------------------- text effects
const GLYPHS = '!<>-_\\/[]{}—=+*^?#01ABCDEFXZ%$&';
const noise = (n) => Array.from({ length: n }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
function scramble(el, dur = 700, final = el?.dataset.final ?? el?.textContent) {
  if (!el) return;
  el.dataset.final = final;
  if (reduced) { el.textContent = final; return; }
  cancelAnimationFrame(el._sr);
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    let out = '';
    for (let i = 0; i < final.length; i++) out += final[i] === ' ' || i / final.length < p ? final[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = out;
    if (p < 1) el._sr = requestAnimationFrame(tick);
  };
  el._sr = requestAnimationFrame(tick);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- sound
class Sound {
  constructor() { this.on = false; this.ctx = null; }
  init() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.filt = ctx.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 360; this.filt.Q.value = 6; this.filt.connect(this.master);
    [[55, 'sawtooth', 0.16], [55.4, 'sawtooth', 0.16], [82.4, 'triangle', 0.22], [110, 'sine', 0.1]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const gn = ctx.createGain(); gn.gain.value = g; o.connect(gn); gn.connect(this.filt); o.start();
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(this.filt.frequency); lfo.start();
    this.tone = ctx.createOscillator(); this.tone.type = 'triangle'; this.tone.frequency.value = 220;
    this.toneGain = ctx.createGain(); this.toneGain.gain.value = 0;
    this.tone.connect(this.toneGain); this.toneGain.connect(ctx.destination); this.tone.start();
    return true;
  }
  toggle() {
    if (!this.ctx && !this.init()) return false;
    this.on = !this.on;
    const t = this.ctx.currentTime;
    if (this.on) { this.ctx.resume(); this.master.gain.setTargetAtTime(0.08, t, 0.5); }
    else { this.master.gain.setTargetAtTime(0, t, 0.15); this.toneGain.gain.setTargetAtTime(0, t, 0.05); }
    return this.on;
  }
  intensity(v) { if (this.on) this.filt.frequency.setTargetAtTime(300 + v * 2400, this.ctx.currentTime, 0.15); }
  decode(p) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    this.tone.frequency.setTargetAtTime(180 + p * 700, t, 0.03);
    this.toneGain.gain.setTargetAtTime(p > 0 ? 0.02 + p * 0.022 : 0, t, 0.05);
  }
  blip(f = 660, d = 0.2, type = 'sine', vol = 0.08) {
    if (!this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.55, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + 0.05);
  }
  whoosh() { this.blip(70, 1.2, 'sawtooth', 0.08); this.blip(900, 0.6, 'sine', 0.03); }
  success() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => this.blip(f, 0.5, 'sine', 0.06), i * 70)); }
}
const sound = new Sound();
// Sound is on by default. Browsers only allow audio after a user gesture, so it starts on the first
// click, tap or key press. A viewer who turns it off stays off on their next visit.
let soundWanted = true;
try { soundWanted = localStorage.getItem('heymintty-sound') !== 'off'; } catch {}
const showSound = (on) => { $('#sound').setAttribute('aria-pressed', String(on)); $('#soundState').textContent = on ? 'ON' : 'OFF'; };
showSound(soundWanted);
const unlockSound = () => {
  removeEventListener('pointerdown', unlockSound, true); removeEventListener('keydown', unlockSound, true);
  if (soundWanted && !sound.on) sound.toggle();
};
addEventListener('pointerdown', unlockSound, true);
addEventListener('keydown', unlockSound, true);
$('#sound').addEventListener('click', () => {
  soundWanted = !soundWanted;
  if (soundWanted !== sound.on) sound.toggle();
  showSound(soundWanted);
  try { localStorage.setItem('heymintty-sound', soundWanted ? 'on' : 'off'); } catch {}
  sound.blip(880, 0.25);
});

// ---------------------------------------------------------------- boot
async function runBoot(ready) {
  const log = $('#bootLog'), bar = $('#bootBar'), pct = $('#bootPct');
  if (reduced) { await ready; return; }
  let p = 0, target = 0;
  const pctLoop = () => {
    p += (target - p) * 0.12;
    pct.textContent = String(Math.round(p)).padStart(3, '0');
    bar.style.transform = `scaleX(${p / 100})`;
    if (!html.classList.contains('booted')) requestAnimationFrame(pctLoop);
  };
  requestAnimationFrame(pctLoop);
  const lines = [
    ['HEYMINTTY.SYS', 'v3.1 — COLD BOOT'],
    ['OPERATOR', 'THANH NGO'],
    ['COORDS', '16.0544°N 108.2022°E'],
    [`SPAWNING ${nodeCount} NODES`, 'OK'],
    ['SCANNING SPECTRUM', `${NODES.length} SIGNALS DETECTED`],
  ];
  for (let i = 0; i < lines.length; i++) {
    const [k, v] = lines[i];
    const row = document.createElement('div');
    const dots = '.'.repeat(Math.max(3, 30 - k.length));
    row.innerHTML = `&gt; ${k} <span class="d"></span> <b></b>`;
    log.appendChild(row);
    const d = row.querySelector('.d'), b = row.querySelector('b');
    for (let j = 0; j <= dots.length; j += 3) { d.textContent = dots.slice(0, j); await wait(8); }
    b.textContent = v; scramble(b, 260, v);
    target = Math.min(92, ((i + 1) / lines.length) * 92);
    await wait(110);
  }
  await ready;
  target = 100;
  await wait(380);
}
const fontsReady = Promise.race([
  Promise.all([document.fonts.load('800 120px "Unbounded"'), document.fonts.load('500 40px "JetBrains Mono"')]).catch(() => {}),
  wait(3000),
]);

// ---------------------------------------------------------------- facts (HUD columns)
const facts = $$('.fact');
const found = new Set();
let stage = null; // index of the vessel on stage

// encrypted values flicker until decoded
setInterval(() => {
  facts.forEach((f, i) => {
    if (found.has(i)) return;
    $$('.fact__v i', f).forEach((el) => { el.textContent = noise(Math.max(6, Math.round(el.dataset.final.length * 0.75))); });
  });
}, reduced ? 1000 : 110);

function updateCount() {
  $('#count').textContent = `${found.size}/${NODES.length}`;
  $$('#pips i').forEach((p, i) => p.classList.toggle('on', i < found.size));
}

function markFound(i) {
  if (found.has(i)) return;
  found.add(i);
  signal?.setNodeState(i, 'found');
  markers[i].classList.add('is-found');
  $('.marker__tag', markers[i]).textContent = `0${i + 1} ${NODES[i].label} ✓`;
  facts[i].classList.add('is-found');
  facts[i].dataset.cursor = 'SUMMON';
  $$('.fact__v i', facts[i]).forEach((el, k) => setTimeout(() => scramble(el, 600), k * 120));
  updateCount();
  if (found.size === NODES.length) setTimeout(() => { showToast('4/4 SIGNALS DECODED'); signal?.glitch(1); sound.success(); }, 2200);
}

// ---------------------------------------------------------------- stage: summon / dismiss a vessel
const callout = $('#callout'), leader = $('#leader');
function summon(i) {
  markFound(i);
  stage = i;
  signal?.summon(i);
  facts.forEach((f, k) => f.classList.toggle('is-open', k === i));
  html.classList.add('on-stage');
  $('#calloutId').textContent = `SIG-0${i + 1} · ${NODES[i].label}`;
  $('#calloutMsg').dataset.final = NODES[i].msg; $('#calloutMsg').textContent = '';
  $('#calloutAct').hidden = !NODES[i].contact;
  callout.hidden = true; // shown once the vessel has arrived
  leader.classList.remove('is-on');
  sound.whoosh();
  setTimeout(() => sound.success(), 900);
}
function dismiss() {
  if (stage === null) return;
  stage = null;
  signal?.dismiss();
  facts.forEach((f) => f.classList.remove('is-open'));
  html.classList.remove('on-stage');
  callout.hidden = true;
  leader.classList.remove('is-on');
  sound.whoosh();
}
$('#calloutX').addEventListener('click', dismiss);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stage !== null) { e.preventDefault(); dismiss(); return; }
  if (stage !== null || !signal || e.target.closest?.('input,textarea')) return;
  const step = 46;
  const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (map[e.key]) { e.preventDefault(); signal.look(...map[e.key]); }
});

// fact buttons: summon decoded ones, fly to and decode the rest
facts.forEach((f, i) => f.addEventListener('click', () => {
  if (stage === i) { dismiss(); return; }
  if (!signal) { markFound(i); return; }
  if (found.has(i)) { summon(i); return; }
  if (stage !== null) dismiss();
  signal.turnTo(NODES[i].yaw, NODES[i].pitch);
  sound.blip(330, 0.3, 'triangle', 0.06);
  setTimeout(() => summon(i), reduced ? 50 : 1100);
}));

const toast = $('#toast');
function showToast(msg) {
  toast.textContent = msg; toast.classList.add('is-on');
  clearTimeout(toast._t); toast._t = setTimeout(() => toast.classList.remove('is-on'), 2200);
}
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(EMAIL); showToast('EMAIL COPIED'); } catch { showToast(EMAIL); }
  sound.blip(990, 0.3);
});

// ---------------------------------------------------------------- markers, reticle
const overlay = $('#overlay'), reticle = $('#reticle'), reticleProg = $('#reticleProg');
const markers = NODES.map((n, i) => {
  const el = document.createElement('div');
  el.className = 'marker';
  el.innerHTML = `<span class="marker__tag">SIG-0${i + 1} · ${n.freq} MHz</span><span class="marker__arrow"><i></i><b>SIG-0${i + 1}</b></span>`;
  overlay.appendChild(el);
  return el;
});

// ---------------------------------------------------------------- pointer: look, lock, decode, pulse, gravity
const dot = $('#cDot'), ring = $('#cRing'), label = $('#cLabel');
const cur = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2, speed: 0 };
if (fine && !reduced) html.classList.add('has-cursor');

let proj = [];
let locked = null;
let down = null;
let holdTimer = 0;
const dec = { i: null, p: 0 };

function nearestNode(x, y) {
  let best = null, bd = LOCK_PX;
  proj.forEach((p, i) => {
    if (!p.onScreen || stage === i) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

const UI = 'a,button,input,textarea,select,label,.callout';
addEventListener('pointermove', (e) => {
  cur.speed = Math.min(80, Math.hypot(e.clientX - cur.x, e.clientY - cur.y));
  cur.x = e.clientX; cur.y = e.clientY;
  signal?.setPointer(e.clientX, e.clientY, true);
  if (!down) return;
  const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
  down.lx = e.clientX; down.ly = e.clientY;
  down.moved += Math.abs(dx) + Math.abs(dy);
  if ((down.mode === 'pending' || down.mode === 'gravity') && down.moved > 8) {
    clearTimeout(holdTimer);
    if (down.mode === 'gravity') { signal?.setHold(false); ring.classList.remove('is-hold'); }
    down.mode = 'drag';
    html.classList.add('dragging');
  }
  if (down.mode === 'decode' && proj[down.i] && Math.hypot(proj[down.i].x - e.clientX, proj[down.i].y - e.clientY) > LOCK_PX * 1.6) {
    endDecode();
    down.mode = 'drag';
    html.classList.add('dragging');
  }
  if (down.mode === 'drag') signal?.look(dx, dy);
}, { passive: true });

addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest(UI)) return;
  down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, mode: 'pending' };
  if (stage !== null) { down.mode = 'closeTap'; return; }
  const n = signal ? nearestNode(e.clientX, e.clientY) : null;
  if (n !== null) {
    down.mode = 'decode'; down.i = n;
    dec.i = n; if (dec.p > 0.95) dec.p = 0;
    signal.setHold(true);
    sound.blip(260, 0.2, 'square', 0.03);
    return;
  }
  holdTimer = setTimeout(() => {
    if (down?.mode !== 'pending') return;
    down.mode = 'gravity';
    signal?.setHold(true);
    ring.classList.add('is-hold');
    sound.blip(110, 0.9, 'sawtooth', 0.05);
  }, 240);
});

function endDecode() { signal?.setHold(false); sound.decode(0); }

function release(e, cancelled) {
  if (!down) return;
  clearTimeout(holdTimer);
  const m = down.mode;
  if (m === 'pending' && !cancelled) { signal?.pulse(e.clientX, e.clientY, 1); sound.blip(300 + (1 - e.clientY / innerHeight) * 600, 0.3, 'sine', 0.08); }
  if (m === 'gravity') { signal?.setHold(false); signal?.pulse(e.clientX, e.clientY, 1.7); sound.blip(90, 0.7, 'sawtooth', 0.09); }
  if (m === 'decode') endDecode();
  if (m === 'closeTap' && !cancelled && down.moved < 8) dismiss();
  ring.classList.remove('is-hold');
  html.classList.remove('dragging');
  down = null;
}
addEventListener('pointerup', (e) => release(e, false));
addEventListener('pointercancel', (e) => release(e, true));
document.addEventListener('pointerleave', () => signal?.pointerLeave());
addEventListener('blur', () => signal?.pointerLeave());

addEventListener('wheel', (e) => {
  if (!signal || stage !== null) return;
  e.preventDefault();
  signal.look(-(e.deltaX + e.deltaY) * 0.5, 0);
}, { passive: false });

document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('a,button,[data-cursor]');
  ring.classList.toggle('is-hover', !!t);
  label.textContent = t?.dataset.cursor || '';
});

// ---------------------------------------------------------------- HUD: clock, telemetry, compass
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const tickClock = () => { $('#clock').textContent = clockFmt.format(new Date()); };
tickClock(); setInterval(tickClock, 1000);
setInterval(() => { $('#tFps').textContent = signal ? String(signal.getFps()).padStart(2, '0') : '--'; }, 400);

function hidpi(c, w, h) {
  const r = Math.min(2, devicePixelRatio || 1);
  c.width = w * r; c.height = h * r;
  const g = c.getContext('2d'); g.scale(r, r); return g;
}
const compassEl = $('#compass');
let compassW = compassEl.clientWidth || 320;
let compass = hidpi(compassEl, compassW, 30);
addEventListener('resize', () => { compassW = compassEl.clientWidth || 320; compass = hidpi(compassEl, compassW, 30); });

const DIRS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
function drawCompass(yaw) {
  const g = compass, W = compassW, H = 30, span = 140, ppd = W / span;
  const hd = ((yaw * 180) / Math.PI % 360 + 360) % 360;
  g.clearRect(0, 0, W, H);
  g.font = '500 9px "JetBrains Mono", monospace'; g.textAlign = 'center';
  for (let d = Math.ceil((hd - span / 2) / 5) * 5; d <= hd + span / 2; d += 5) {
    const x = W / 2 + (d - hd) * ppd, n = ((d % 360) + 360) % 360;
    g.globalAlpha = Math.max(0, 1 - Math.abs(x - W / 2) / (W / 2)) * 0.9;
    g.fillStyle = '#a3abbd';
    if (n % 45 === 0) { g.fillRect(x, 16, 1, 8); g.fillText(DIRS[n], x, 11); }
    else if (n % 15 === 0) g.fillRect(x, 18, 1, 6);
    else g.fillRect(x, 21, 1, 3);
  }
  NODES.forEach((n, i) => {
    let rel = ((n.yaw * 180) / Math.PI - hd + 540) % 360 - 180;
    const out = Math.abs(rel) > span / 2 - 4;
    rel = Math.max(-span / 2 + 4, Math.min(span / 2 - 4, rel));
    const x = W / 2 + rel * ppd;
    g.fillStyle = found.has(i) ? '#c6ff3d' : '#3df5ff';
    g.globalAlpha = out ? 0.5 : 1;
    g.beginPath(); g.moveTo(x, 26); g.lineTo(x - 4, 30); g.lineTo(x + 4, 30); g.closePath(); g.fill();
    g.fillRect(x - 0.5, 14, 1, 10);
  });
  g.globalAlpha = 1; g.fillStyle = '#c6ff3d'; g.fillRect(W / 2 - 0.5, 0, 1.5, 30);
}

// ---------------------------------------------------------------- frame loop
let lastT = performance.now();
function loop(now) {
  try { frameHud(now); } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}
function frameHud(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;

  if (signal) {
    proj = signal.projectNodes();
    const hd = signal.heading();
    drawCompass(hd.yaw);
    const deg = Math.round((((hd.yaw * 180) / Math.PI) % 360 + 360) % 360);
    const pit = Math.round((hd.pitch * 180) / Math.PI);
    $('#hdg').textContent = `HDG ${String(deg).padStart(3, '0')}° · PITCH ${pit >= 0 ? '+' : '-'}${String(Math.abs(pit)).padStart(2, '0')}°`;

    // lock on (mouse hover; touch locks on press)
    const want = down?.mode === 'decode' ? down.i : (fine && !down && stage === null ? nearestNode(cur.x, cur.y) : null);
    if (want !== locked) {
      if (locked !== null && !found.has(locked)) signal.setNodeState(locked, 'idle');
      locked = want;
      if (locked !== null) {
        if (!found.has(locked)) signal.setNodeState(locked, 'locked');
        $('#reticleId').textContent = `SIG-0${locked + 1}`;
        scramble($('#reticleMsg'), 350, found.has(locked) ? `${NODES[locked].label} · CLICK TO SUMMON` : 'HOLD TO DECODE');
        sound.blip(1200, 0.08, 'square', 0.02);
      }
    }
    ring.classList.toggle('is-lock', locked !== null);

    // decode progress
    if (down?.mode === 'decode') {
      dec.p = Math.min(1, dec.p + dt / (found.has(down.i) ? 0.22 : DECODE_S));
      sound.decode(dec.p);
      if (dec.p >= 1) {
        const i = down.i, p = proj[i];
        down.mode = 'done';
        dec.p = 0;
        endDecode();
        signal.pulse(p.x, p.y, 1.8);
        try { summon(i); } catch (err) { console.error(err); }
      }
    } else dec.p = Math.max(0, dec.p - dt * 2.5);
    reticleProg.style.strokeDashoffset = String(326.7 * (1 - dec.p));

    const ri = locked ?? (dec.p > 0 ? dec.i : null);
    if (ri !== null && proj[ri]?.onScreen && stage === null) {
      reticle.classList.add('is-on');
      reticle.style.transform = `translate3d(${proj[ri].x}px,${proj[ri].y}px,0) scale(${1 + dec.p * 0.25}) rotate(${dec.p * 90}deg)`;
    } else reticle.classList.remove('is-on');

    // markers + edge arrows
    const cx = innerWidth / 2, cy = innerHeight / 2, mx = cx - 44, my = cy - (innerWidth < 820 ? 170 : 110);
    proj.forEach((p, i) => {
      const el = markers[i];
      const hide = stage !== null || locked === i;
      if (p.onScreen) {
        el.classList.remove('is-edge');
        el.classList.toggle('is-hidden', hide);
        el.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
      } else {
        el.classList.add('is-edge');
        el.classList.toggle('is-hidden', hide || found.has(i));
        const a = Math.atan2(-p.cy, p.cx), ux = Math.cos(a), uy = Math.sin(a);
        const k = Math.min(mx / Math.max(Math.abs(ux), 1e-3), my / Math.max(Math.abs(uy), 1e-3));
        el.style.transform = `translate3d(${cx + ux * k}px,${cy + uy * k}px,0)`;
        $('.marker__arrow i', el).style.transform = `rotate(${a}rad)`;
      }
    });

    // callout + leader line to the vessel on stage
    const an = signal.vesselAnchor();
    if (stage !== null && an.ready) {
      if (callout.hidden) { callout.hidden = false; scramble($('#calloutMsg'), 500); }
      const mobile = innerWidth < 820;
      const cw = callout.offsetWidth, ch = callout.offsetHeight;
      const x = mobile ? innerWidth / 2 - cw / 2 : Math.min(innerWidth - cw - 24, an.x + innerWidth * 0.18);
      let y = mobile ? Math.max($('#bio').getBoundingClientRect().bottom + 16, an.y - innerHeight * 0.2 - ch) : Math.max(110, an.y - innerHeight * 0.3);
      y = Math.min(y, innerHeight - ch - (mobile ? 170 : 120));
      callout.style.transform = `translate3d(${x}px,${y}px,0)`;
      leader.classList.add('is-on');
      const lx = mobile ? x + cw / 2 : x, ly = y + ch;
      const line = $('#leaderLine'), d = $('#leaderDot');
      line.setAttribute('x1', an.x); line.setAttribute('y1', an.y); line.setAttribute('x2', lx); line.setAttribute('y2', ly);
      d.setAttribute('cx', an.x); d.setAttribute('cy', an.y);
    }
  }

  // cursor
  cur.speed *= 0.9;
  if (html.classList.contains('has-cursor')) {
    cur.rx += (cur.x - cur.rx) * 0.18; cur.ry += (cur.y - cur.ry) * 0.18;
    const dx = cur.x - cur.rx, dy = cur.y - cur.ry, sp = Math.min(Math.hypot(dx, dy), 60);
    dot.style.transform = `translate3d(${cur.x}px,${cur.y}px,0)`;
    ring.style.transform = `translate3d(${cur.rx}px,${cur.ry}px,0) rotate(${Math.atan2(dy, dx)}rad) scale(${1 + sp * 0.006},${1 - sp * 0.004})`;
    label.style.transform = `rotate(${-Math.atan2(dy, dx)}rad)`;
  }
  sound.intensity(Math.min(1, 0.12 + Math.min(1, cur.speed / 40) * 0.7 + dec.p * 0.9));
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- go
updateCount();
Promise.race([runBoot(fontsReady), wait(5000)]).then(() => {
  html.classList.add('booted');
  signal?.glitch(0.9);
});
