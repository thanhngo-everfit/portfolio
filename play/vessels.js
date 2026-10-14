// Procedural vessels that carry the info: ships with hull livery, a planet with a text ring, a courier towing a banner.
// Every model is built along +x (nose forward) with its readable side facing +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const LIME = '#c6ff3d', CYAN = '#3df5ff';
const TAU = Math.PI * 2;
const DISPLAY = '"Unbounded", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function glowTexture() {
  return canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,.55)');
    r.addColorStop(0.5, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
}
const GLOW = glowTexture();
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

// fit text to a width by shrinking the font
function fitFont(g, text, weight, family, size, maxW) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > 8) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  return s;
}

// hull plating: panels, seams, rivets, hazard hatching, stencils
function platingTexture(seed = 1, tint = '#596277') {
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = tint; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, pw = 40 + rnd() * 220, ph = 20 + rnd() * 120;
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.06})`;
      g.fillRect(x, y, pw, ph);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(x, y, pw, ph);
    }
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let i = 0; i < 260; i++) g.fillRect(rnd() * w, rnd() * h, 3, 3);
    g.save(); g.translate(w * 0.72, h * 0.82);
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.45)' : 'rgba(198,255,61,.55)'; g.beginPath(); g.moveTo(i * 22, 0); g.lineTo(i * 22 + 14, 0); g.lineTo(i * 22 + 2, 26); g.lineTo(i * 22 - 12, 26); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = `500 22px ${MONO}`;
    g.fillText('NO STEP', w * 0.08, h * 0.2); g.fillText('▲ VENT', w * 0.5, h * 0.62);
  });
}

// the livery: the big text painted on the hull
function liveryTexture({ reg, kicker, title, sub }, accent = LIME, w = 2048, h = 560) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, h - 40, w * 0.64, 12); g.fillRect(w * 0.66, h - 40, w * 0.34, 12);
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(w * 0.66 + i * 46, h - 70); g.lineTo(w * 0.66 + i * 46 + 26, h - 70); g.lineTo(w * 0.66 + i * 46 + 6, h - 52); g.lineTo(w * 0.66 + i * 46 - 20, h - 52); g.fill(); }
    g.font = `500 44px ${MONO}`; g.fillStyle = 'rgba(255,255,255,.7)';
    g.fillText(reg, 24, 64);
    g.fillStyle = accent; g.font = `500 52px ${MONO}`;
    g.fillText(kicker, 24, 168);
    fitFont(g, title, 800, DISPLAY, 210, w - 48);
    g.fillStyle = '#ffffff'; g.fillText(title, 18, 370);
    if (sub) { fitFont(g, sub, 500, MONO, 54, w - 48); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(sub, 24, 456); }
  });
}

// the Everfit mark: a swept blade, a bar and a falling tail. (x, y) is the top-left, s the width.
export function drawEverfitLogo(g, x, y, s, color) {
  const k = s / 255;
  g.save(); g.translate(x, y); g.scale(k, k); g.fillStyle = color;
  g.beginPath(); g.moveTo(0, 3); g.lineTo(150, 0); g.quadraticCurveTo(158, 0, 162, 8); g.lineTo(176, 48); g.lineTo(74, 46); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(176, 50); g.lineTo(240, 50); g.quadraticCurveTo(246, 50, 248, 56); g.lineTo(256, 82); g.lineTo(114, 82); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(114, 85); g.lineTo(184, 87); g.lineTo(214, 164); g.quadraticCurveTo(170, 102, 114, 85); g.closePath(); g.fill();
  g.restore();
}

function hullMaterial(seed, tint) {
  return new THREE.MeshStandardMaterial({ color: '#c3cad8', map: platingTexture(seed, tint), metalness: 0.78, roughness: 0.36 });
}
const darkMetal = () => new THREE.MeshStandardMaterial({ color: '#232836', metalness: 0.85, roughness: 0.3 });
const glass = () => new THREE.MeshStandardMaterial({ color: '#0b1424', metalness: 0.95, roughness: 0.08, emissive: new THREE.Color(CYAN), emissiveIntensity: 0.18 });

function sweptShape(root, tip, span, sweep) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(root, 0); s.lineTo(root - sweep + tip, span); s.lineTo(-sweep, span); s.closePath();
  return s;
}

function engine(r, len, color) {
  const g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, len, 20, 1, true), darkMetal());
  can.rotation.z = Math.PI / 2; g.add(can);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.12, 8, 28), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.y = Math.PI / 2; ring.position.x = -len / 2; g.add(ring);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, ...additive }));
  glow.scale.setScalar(r * 5); glow.position.x = -len / 2 - r * 0.2; g.add(glow);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 7, 20, 1, true), new THREE.MeshBasicMaterial({ color, ...additive, opacity: 0.35, side: THREE.DoubleSide }));
  plume.rotation.z = Math.PI / 2; plume.position.x = -len / 2 - r * 3.5; g.add(plume);
  g.userData = { glow, plume, base: r * 5 };
  return g;
}

function navLight(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, ...additive }));
  s.scale.setScalar(size); return s;
}

// ---------------------------------------------------------------- ships
// kind: 'cruiser' (sleek), 'freighter' (boxy, containers), 'courier' (small), 'drone' (ambient, no livery)
export function buildShip({ kind = 'cruiser', livery = null, accent = LIME, seed = 1 } = {}) {
  const P = {
    cruiser:   { L: 9, H: 1.25, D: 1.05, nose: 0.3, wings: true, engines: 2, tint: '#5a6378' },
    freighter: { L: 10, H: 1.9, D: 1.6, nose: 0.16, wings: false, engines: 4, tint: '#64604f' },
    courier:   { L: 3.2, H: 0.62, D: 0.55, nose: 0.34, wings: true, engines: 1, tint: '#4f5a6e' },
    drone:     { L: 3, H: 0.5, D: 0.5, nose: 0.36, wings: true, engines: 1, tint: '#4a5266' },
  }[kind];
  const { L, H, D } = P;
  const ship = new THREE.Group();
  const hull = hullMaterial(seed, P.tint);
  const bodyLen = L * (1 - P.nose - 0.08);

  const body = new THREE.Mesh(new RoundedBoxGeometry(bodyLen, H, D, 3, Math.min(H, D) * 0.2), hull);
  ship.add(body);

  const noseGeo = new THREE.ConeGeometry(Math.SQRT2 / 2, 1, 4, 1);
  noseGeo.rotateY(Math.PI / 4); noseGeo.rotateZ(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, hull);
  nose.scale.set(L * P.nose, H * 0.94, D * 0.94);
  nose.position.x = bodyLen / 2 + (L * P.nose) / 2 - 0.02;
  ship.add(nose);

  const tail = new THREE.Mesh(new RoundedBoxGeometry(L * 0.08, H * 0.86, D * 0.86, 2, H * 0.1), darkMetal());
  tail.position.x = -bodyLen / 2 - L * 0.035;
  ship.add(tail);

  // stripe of accent light along the hull
  const strip = new THREE.Mesh(new THREE.BoxGeometry(bodyLen * 0.94, H * 0.035, D * 1.01), new THREE.MeshBasicMaterial({ color: accent }));
  strip.position.y = -H * 0.32; ship.add(strip);

  if (kind !== 'freighter') {
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glass());
    cockpit.scale.set(L * 0.13, H * 0.36, D * 0.42);
    cockpit.position.set(bodyLen * 0.34, H * 0.42, 0);
    ship.add(cockpit);
  } else {
    const bridge = new THREE.Mesh(new RoundedBoxGeometry(L * 0.14, H * 0.5, D * 0.6, 2, 0.08), hull);
    bridge.position.set(-bodyLen * 0.36, H * 0.7, 0); ship.add(bridge);
    const win = new THREE.Mesh(new THREE.BoxGeometry(L * 0.1, H * 0.1, D * 0.61), new THREE.MeshBasicMaterial({ color: CYAN }));
    win.position.set(-bodyLen * 0.34, H * 0.78, 0); ship.add(win);
    const cols = ['#5d7a22', '#7a2a5c', '#1f6b72', '#6b6650', '#3e3480'];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new RoundedBoxGeometry(bodyLen * 0.12, H * 0.42, D * 0.82, 1, 0.04),
        new THREE.MeshStandardMaterial({ color: cols[i], metalness: 0.3, roughness: 0.7, envMapIntensity: 0.4 }));
      c.position.set(-bodyLen * 0.18 + i * bodyLen * 0.135, H * 0.68, 0); ship.add(c);
    }
  }

  // dorsal fin
  const finGeo = new THREE.ExtrudeGeometry(sweptShape(L * 0.18, L * 0.06, H * 0.9, L * 0.12), { depth: 0.05, bevelEnabled: false });
  finGeo.translate(0, 0, -0.025);
  const fin = new THREE.Mesh(finGeo, hull);
  fin.position.set(-bodyLen * 0.48, H * 0.45, 0);
  if (kind !== 'freighter') ship.add(fin);

  // swept wings with a bit of anhedral
  let tipL = null, tipR = null;
  if (P.wings) {
    const span = D * 1.6;
    const wGeo = new THREE.ExtrudeGeometry(sweptShape(L * 0.34, L * 0.1, span, L * 0.2), { depth: 0.04, bevelEnabled: false });
    wGeo.rotateX(Math.PI / 2);
    [1, -1].forEach((side) => {
      const w = new THREE.Mesh(wGeo, hull);
      w.position.set(-bodyLen * 0.25, -H * 0.18, (side * D) / 2);
      w.scale.z = side;
      w.rotation.x = side * 0.18;
      ship.add(w);
      const tip = navLight(side > 0 ? '#ff4060' : '#40ff90', H * 0.6);
      tip.position.set(-bodyLen * 0.25 - L * 0.17, -H * 0.18 - span * Math.sin(0.18) * 0.6, side * (D / 2 + span));
      ship.add(tip);
      if (side > 0) tipL = tip; else tipR = tip;
    });
  }

  // engines
  const engines = [];
  const er = kind === 'freighter' ? H * 0.2 : H * 0.26;
  const offs = { 1: [[0, 0]], 2: [[H * 0.2, D * 0.22], [-H * 0.12, -D * 0.22]], 4: [[H * 0.24, D * 0.26], [H * 0.24, -D * 0.26], [-H * 0.2, D * 0.26], [-H * 0.2, -D * 0.26]] }[P.engines];
  offs.forEach(([y, z]) => {
    const e = engine(er, L * 0.08, kind === 'freighter' ? '#ffb347' : CYAN);
    e.position.set(-bodyLen / 2 - L * 0.1, y, z);
    ship.add(e); engines.push(e);
  });

  const strobe = navLight('#ffffff', H * 0.7);
  strobe.position.set(-bodyLen * 0.48 - L * 0.06, H * 1.3, 0);
  if (kind !== 'freighter') ship.add(strobe); else { strobe.position.set(-bodyLen * 0.36, H * 1.05, 0); ship.add(strobe); }

  // livery decal on the +z face
  if (livery) {
    const lw = bodyLen * (kind === 'freighter' ? 0.62 : 0.9), lh = (lw * 560) / 2048;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: liveryTexture(livery, accent), color: '#b4bac6', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    decal.position.set(kind === 'freighter' ? bodyLen * 0.17 : -bodyLen * 0.02, kind === 'freighter' ? -H * 0.05 : H * 0.02, D / 2 + 0.004);
    decal.scale.setScalar(Math.min(1, (H * 0.86) / lh));
    ship.add(decal);
    if (kind === 'freighter') {
      // the company mark rides on the containers
      const logoTex = canvasTex(1024, 256, (c, w, h) => { c.clearRect(0, 0, w, h); drawEverfitLogo(c, w / 2 - 150, 22, 300, '#eef1f7'); });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(bodyLen * 0.5, bodyLen * 0.125), new THREE.MeshBasicMaterial({ map: logoTex, color: '#b4bac6', transparent: true, depthWrite: false }));
      top.position.set(-bodyLen * 0.18 + 2 * bodyLen * 0.135, H * 0.68, D * 0.41 + 0.004);
      ship.add(top);
    }
  }

  ship.userData = { length: L, engines, strobe, tips: [tipL, tipR].filter(Boolean) };
  return ship;
}

export function animateShip(ship, t, boost = 0) {
  const u = ship.userData;
  u.engines.forEach((e, i) => {
    const f = 1 + Math.sin(t * 40 + i * 2) * 0.08 + boost * 1.6;
    e.userData.glow.scale.setScalar(e.userData.base * f);
    e.userData.plume.scale.set(1, f * (1 + boost * 3), 1);
    e.userData.plume.material.opacity = 0.3 + boost * 0.4;
  });
  u.strobe.material.opacity = (t % 1.4) < 0.08 ? 1 : 0.05;
  u.tips.forEach((tp, i) => { tp.material.opacity = 0.55 + 0.45 * Math.sin(t * 3 + i); });
}

// ---------------------------------------------------------------- courier with a towed banner
export function buildCourier({ text, accent = LIME }) {
  const g = new THREE.Group();
  const ship = buildShip({ kind: 'courier', accent, seed: 7 });
  g.add(ship);
  const bw = 8.4, bh = 1.25;
  const tex = canvasTex(3072, 460, (c, w, h) => {
    c.fillStyle = '#07090f'; c.fillRect(0, 0, w, h);
    c.strokeStyle = accent; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = accent;
    for (let i = 0; i < 6; i++) c.fillRect(30, 40 + i * 66, 22, 40);
    for (let i = 0; i < 6; i++) c.fillRect(w - 52, 40 + i * 66, 22, 40);
    fitFont(c, text, 800, DISPLAY, 200, w - 200);
    c.fillStyle = '#d9dde6'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 8);
  });
  const geo = new THREE.PlaneGeometry(bw, bh, 60, 4);
  const banner = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.16, roughness: 0.9, metalness: 0, envMapIntensity: 0.2, side: THREE.DoubleSide }));
  const tailX = -ship.userData.length * 0.62;
  const gap = 1.6;
  banner.position.set(tailX - gap - bw / 2, -0.15, 0);
  g.add(banner);
  const cablePts = [new THREE.Vector3(tailX, 0, 0), new THREE.Vector3(tailX - gap, bh / 2 - 0.15, 0), new THREE.Vector3(tailX, 0, 0), new THREE.Vector3(tailX - gap, -bh / 2 - 0.15, 0)];
  const cables = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cablePts), new THREE.LineBasicMaterial({ color: '#9aa3b5' }));
  g.add(cables);
  const base = geo.attributes.position.array.slice();
  g.userData = { ship, banner, base, length: ship.userData.length + gap + bw, center: -(gap + bw) / 2 };
  return g;
}

export function animateCourier(g, t, boost = 0) {
  animateShip(g.userData.ship, t, boost);
  const pos = g.userData.banner.geometry.attributes.position, b = g.userData.base;
  const w = 8.4;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], y = b[i * 3 + 1];
    const k = (w / 2 - x) / w; // 0 at the cable end, 1 at the far end
    pos.array[i * 3 + 2] = Math.sin(x * 1.3 + t * 5) * 0.16 * k + Math.sin(y * 3 + t * 3) * 0.03 * k;
    pos.array[i * 3 + 1] = y + Math.sin(x * 0.9 + t * 4) * 0.08 * k;
  }
  pos.needsUpdate = true;
  g.userData.banner.geometry.computeVertexNormals();
}

// ---------------------------------------------------------------- planet with a text ring and a pin on the surface
export function buildPlanet({ ringText, pinLabel, lat, lon, accent = LIME }) {
  const g = new THREE.Group();
  const pu = (lon + 180) / 360, pv = (90 - lat) / 180;
  // the location label is painted on the surface (lit, not glowing) on a dark plate so it stays crisp
  const labelBox = (c, x, y) => {
    c.font = `800 92px ${DISPLAY}`; const w1 = c.measureText(pinLabel).width;
    c.font = `500 40px ${MONO}`; const w2 = c.measureText(`${lat.toFixed(4)}°N  ${lon.toFixed(4)}°E`).width;
    const bw = Math.max(w1, w2) + 56;
    return { x0: x - 84 - bw + 28, y0: y - 128, bw, bh: 168 };
  };
  const paintLabel = (c, x, y, ink, sub, plate) => {
    const b = labelBox(c, x, y);
    if (plate) { c.fillStyle = plate; c.fillRect(b.x0, b.y0, b.bw, b.bh); c.fillStyle = sub; c.fillRect(b.x0, b.y0, 10, b.bh); }
    c.textAlign = 'right';
    c.fillStyle = ink; c.font = `800 92px ${DISPLAY}`; c.fillText(pinLabel, x - 84, y - 40);
    c.fillStyle = sub; c.font = `500 40px ${MONO}`; c.fillText(`${lat.toFixed(4)}°N  ${lon.toFixed(4)}°E`, x - 88, y + 14);
  };
  const surface = canvasTex(2048, 1024, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2a1f63'); grd.addColorStop(0.45, '#14365e'); grd.addColorStop(0.55, '#123d55'); grd.addColorStop(1, '#2b1650');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * h, th = 2 + Math.random() * 26;
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '61,245,255' : '123,97,255'},${0.03 + Math.random() * 0.08})`;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * 0.004 + i) * 14);
      c.lineTo(w, y + th); c.lineTo(0, y + th); c.fill();
    }
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w, y = h * 0.15 + Math.random() * h * 0.7, r = 4 + Math.random() * 30;
      c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
    }
    c.strokeStyle = 'rgba(198,255,61,.12)'; c.lineWidth = 1.5;
    for (let i = 1; i < 12; i++) { c.beginPath(); c.moveTo(0, (h / 12) * i); c.lineTo(w, (h / 12) * i); c.stroke(); }
    for (let i = 1; i < 24; i++) { c.beginPath(); c.moveTo((w / 24) * i, 0); c.lineTo((w / 24) * i, h); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 0, w, h);
    paintLabel(c, pu * w, pv * h, '#6f7686', '#6f8a22', 'rgba(4,5,9,.95)');
  });
  // the pin is emissive so it glows on the night side as well
  const pinTex = canvasTex(2048, 1024, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const x = pu * w, y = pv * h;
    c.strokeStyle = accent; c.fillStyle = accent; c.lineWidth = 5;
    c.beginPath(); c.arc(x, y, 30, 0, 7); c.stroke();
    c.beginPath(); c.arc(x, y, 60, 0, 7); c.setLineDash([10, 10]); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill();
    c.fillRect(x - 110, y - 2, 60, 4); c.fillRect(x + 50, y - 2, 60, 4); c.fillRect(x - 2, y - 110, 4, 60); c.fillRect(x - 2, y + 50, 4, 60);
    paintLabel(c, x, y, '#3a3d44', '#3c4a1c', null);
  }, { srgb: true });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ color: '#ffffff', map: surface, emissiveMap: pinTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1, roughness: 1, metalness: 0, envMapIntensity: 0.25 }));
  // turn the globe so the pin faces the viewer (+z), slightly above centre
  // yaw the pin's longitude to the front, then pitch its latitude to just above centre, keeping north up
  const phi = pu * Math.PI * 2;
  const spin = new THREE.Group();
  spin.rotation.set(THREE.MathUtils.degToRad(lat) - 0.12, Math.PI / 2 - phi + 0.42, 0, 'XYZ');
  spin.add(sphere);
  g.add(spin);

  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(CYAN) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 4.0); gl_FragColor = vec4(uColor * f * 0.7, 1.0); }`,
    ...additive, side: THREE.FrontSide,
  }));
  g.add(atmo);

  // ring with the location written around it
  const inner = 1.55, outer = 2.15;
  const ringGeo = new THREE.RingGeometry(inner, outer, 256, 1);
  const uv = ringGeo.attributes.uv, p = ringGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y);
    uv.setXY(i, ((Math.atan2(y, x) / (Math.PI * 2)) + 1) % 1 * 2, 1 - (r - inner) / (outer - inner));
  }
  const ringTex = canvasTex(4096, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(198,255,61,.18)'; c.fillRect(0, 40, w, 4); c.fillRect(0, h - 44, w, 4);
    for (let x = 0; x < w; x += 24) c.fillRect(x, 48, 2, 14);
    c.fillStyle = accent; c.font = `800 120px ${DISPLAY}`; c.textBaseline = 'middle';
    const unit = ringText + '   ✦   ';
    let x = 0; const uw = c.measureText(unit).width;
    while (x < w) { c.fillText(unit, x, h / 2 + 6); x += uw; }
  });
  ringTex.wrapS = THREE.RepeatWrapping;
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: '#a9b8a0', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  const ringTilt = new THREE.Group();
  ringTilt.rotation.set(-1.0, 0.12, 0.1);
  ringTilt.add(ring);
  g.add(ringTilt);

  // a few moons
  const moons = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 + i * 0.05, 24, 16), new THREE.MeshStandardMaterial({ color: '#4a5163', roughness: 1, envMapIntensity: 0.2 }));
    g.add(m); moons.push(m);
  }
  g.userData = { sphere, spin, ring, moons, radius: outer };
  return g;
}

export function animatePlanet(g, t) {
  const u = g.userData;
  u.sphere.rotation.y = Math.sin(t * 0.15) * 0.25;
  u.ring.rotation.z = -t * 0.05;
  u.moons.forEach((m, i) => { const a = t * (0.3 + i * 0.17) + i * 2; m.position.set(Math.cos(a) * (2.6 + i * 0.5), Math.sin(a * 0.7) * 0.4, Math.sin(a) * (2.6 + i * 0.5)); });
}

// ---------------------------------------------------------------- an alien crew member in an Everfit tee and a bubble helmet, holding a sign
export function buildAlien({ sign }) {
  const g = new THREE.Group();
  // vinyl-toy materials: soft clearcoat skin, fabric sheen on the tee
  const skin = new THREE.MeshPhysicalMaterial({ color: '#7d6ae6', roughness: 0.42, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.4, sheen: 0.2, sheenColor: new THREE.Color('#c9b8ff'), emissive: new THREE.Color('#1c1446'), emissiveIntensity: 0.12, envMapIntensity: 0.35 });
  const shirt = new THREE.MeshPhysicalMaterial({ color: '#17181e', roughness: 0.92, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#4a4f60'), envMapIntensity: 0.25 });
  const pants = new THREE.MeshPhysicalMaterial({ color: '#2a2e3a', roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color('#556'), envMapIntensity: 0.3 });
  const suit = new THREE.MeshPhysicalMaterial({ color: '#5c6375', roughness: 0.55, clearcoat: 0.25, envMapIntensity: 0.3 });
  const ink = new THREE.MeshPhysicalMaterial({ color: '#05060a', roughness: 0.05, clearcoat: 1, envMapIntensity: 1.4 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // torso: a rounded tee
  const prof = [[0, -0.78], [0.4, -0.75], [0.58, -0.55], [0.65, -0.2], [0.63, 0.2], [0.53, 0.47], [0.34, 0.6], [0, 0.63]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(prof, 64), shirt, 0, 0, 0);
  add(new THREE.TorusGeometry(0.55, 0.05, 12, 48), shirt, 0, -0.62, 0).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.27, 0.055, 12, 40), shirt, 0, 0.57, 0).rotation.x = Math.PI / 2;
  const logo = canvasTex(512, 384, (c, w, h) => { c.clearRect(0, 0, w, h); drawEverfitLogo(c, 66, 50, 380, '#eef1f7'); });
  add(new THREE.PlaneGeometry(0.74, 0.555), new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 0.02, 0.12, 0.66).rotation.x = -0.04;

  // legs and boots
  [-1, 1].forEach((s) => {
    const leg = add(new THREE.CapsuleGeometry(0.19, 0.42, 8, 24), pants, s * 0.26, -1.0, 0); leg.rotation.z = s * 0.1;
    const boot = add(new THREE.SphereGeometry(0.24, 32, 20), suit, s * 0.31, -1.42, 0.08); boot.scale.set(1, 0.62, 1.35);
    add(new RoundedBoxGeometry(0.42, 0.07, 0.62, 2, 0.03), darkMetal(), s * 0.31, -1.55, 0.08);
  });

  // arms with mitten hands
  const hand = (parent, y) => {
    const h = new THREE.Group(); h.position.y = y; parent.add(h);
    add(new THREE.SphereGeometry(0.16, 28, 18), skin, 0, 0, 0, h).scale.set(1, 0.95, 0.8);
    [-0.07, 0, 0.07].forEach((x) => add(new THREE.CapsuleGeometry(0.042, 0.1, 6, 12), skin, x, -0.17, 0.02, h));
    const th = add(new THREE.CapsuleGeometry(0.045, 0.08, 6, 12), skin, 0.13, -0.04, 0.06, h); th.rotation.z = -0.9;
    return h;
  };
  const arm = (side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.6, 0.4, 0); g.add(pivot);
    add(new THREE.CapsuleGeometry(0.21, 0.16, 8, 20), shirt, 0, -0.14, 0, pivot);
    add(new THREE.TorusGeometry(0.19, 0.035, 10, 28), shirt, 0, -0.32, 0, pivot).rotation.x = Math.PI / 2;
    add(new THREE.CapsuleGeometry(0.13, 0.5, 8, 20), skin, 0, -0.6, 0, pivot);
    hand(pivot, -0.98);
    return pivot;
  };
  const waveArm = arm(1); waveArm.rotation.z = 1.95;
  const restArm = arm(-1); restArm.rotation.z = -0.45;

  // the sign
  const signTex = canvasTex(1600, 930, (c, w, h) => {
    c.fillStyle = '#0b0d14'; c.fillRect(0, 0, w, h);
    c.strokeStyle = LIME; c.lineWidth = 16; c.strokeRect(16, 16, w - 32, h - 32);
    c.fillStyle = LIME; c.fillRect(60, 70, 120, 10);
    c.font = `500 46px ${MONO}`; c.fillText(sign.kicker, 200, 90);
    c.fillStyle = '#cfd4dd';
    fitFont(c, sign.l1, 800, DISPLAY, 230, w - 140); c.fillText(sign.l1, 66, 350);
    fitFont(c, sign.l2, 800, DISPLAY, 230, w - 140); c.fillText(sign.l2, 66, 590);
    c.fillStyle = LIME; c.font = `500 58px ${MONO}`; c.fillText(sign.sub, 70, 760);
  });
  // a team flag on a pole strapped behind the back, leaning like a flag
  const p0 = new THREE.Vector3(-0.25, -0.35, -0.95), p1 = new THREE.Vector3(-1.25, 3.5, -0.95);
  const pole = add(new THREE.CylinderGeometry(0.035, 0.035, 1, 12), darkMetal(), 0, 0, 0);
  pole.position.copy(p0).add(p1).multiplyScalar(0.5);
  pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
  pole.scale.y = p0.distanceTo(p1);
  add(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: LIME }), p1.x, p1.y + 0.04, p1.z);
  add(new RoundedBoxGeometry(0.2, 0.32, 0.14, 2, 0.04), darkMetal(), -0.4, 0.2, -1.0);
  const lean = Math.atan2(p0.x - p1.x, p1.y - p0.y);
  const at = (y) => p0.clone().lerp(p1, (y - p0.y) / (p1.y - p0.y));
  const flagGeo = new THREE.PlaneGeometry(2.6, 1.51, 48, 6);
  flagGeo.translate(-1.3, -0.755, 0); // right-top corner on the pole
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshPhysicalMaterial({ map: signTex, color: '#a9aebb', emissiveMap: signTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.06, roughness: 0.6, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.25, side: THREE.DoubleSide }));
  flag.position.copy(at(3.3)); flag.position.z += 0.04;
  flag.rotation.z = lean;
  g.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  // head (turns a little inside the helmet)
  add(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 24), skin, 0, 0.78, 0);
  const head = new THREE.Group(); head.position.set(0, 1.6, 0); g.add(head);
  add(new THREE.SphereGeometry(0.84, 64, 48), skin, 0, 0, 0, head).scale.set(1.1, 0.98, 0.94);
  const eyes = [-1, 1].map((s) => {
    const e = add(new THREE.SphereGeometry(0.26, 40, 28), ink, s * 0.33, 0.04, 0.72, head);
    e.scale.set(0.8, 1.15, 0.46); e.rotation.z = s * -0.36;
    const hl = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    add(new THREE.SphereGeometry(0.05, 16, 10), hl, s * 0.29 - 0.05, 0.17, 0.86, head);
    add(new THREE.SphereGeometry(0.022, 12, 8), hl, s * 0.29 + 0.03, 0.02, 0.86, head);
    return e;
  });
  const mouth = add(new THREE.TorusGeometry(0.12, 0.024, 10, 28, Math.PI), new THREE.MeshStandardMaterial({ color: '#1a1030' }), 0, -0.33, 0.76, head);
  mouth.rotation.z = Math.PI;
  [-1, 1].forEach((s) => add(new THREE.SphereGeometry(0.11, 20, 12), new THREE.MeshStandardMaterial({ color: '#ff7ac8', roughness: 0.8, transparent: true, opacity: 0.5 }), s * 0.56, -0.2, 0.69, head).scale.set(1, 0.6, 0.4));

  // antennae curl up inside the helmet
  const tips = [-1, 1].map((s) => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.26, 0.72, 0), new THREE.Vector3(s * 0.38, 0.95, 0.04), new THREE.Vector3(s * 0.5, 1.06, 0.08)]);
    add(new THREE.TubeGeometry(curve, 24, 0.032, 10), skin, 0, 0, 0, head);
    const tip = add(new THREE.SphereGeometry(0.085, 20, 14), new THREE.MeshBasicMaterial({ color: LIME }), s * 0.5, 1.06, 0.08, head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: LIME, ...additive })); glow.scale.setScalar(0.6); tip.add(glow);
    return glow;
  });

  // bubble helmet with a metal collar
  const R = 1.4, thetaLen = 2.36;
  const helmet = new THREE.Group(); helmet.position.set(0, 1.6, 0); g.add(helmet);
  add(new THREE.SphereGeometry(R, 72, 48, 0, TAU, 0, thetaLen), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.03, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.05, envMapIntensity: 1, depthWrite: false, side: THREE.FrontSide }), 0, 0, 0, helmet);
  add(new THREE.SphereGeometry(R * 1.004, 72, 48, 0, TAU, 0, thetaLen), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#bfefff') } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 4.5); gl_FragColor = vec4(uColor * f * 0.32, 1.0); }`,
    ...additive, side: THREE.FrontSide,
  }), 0, 0, 0, helmet);
  // cartoon glint on the glass
  const glint = add(new THREE.TorusGeometry(R * 0.86, 0.035, 8, 40, 0.9), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }), 0, 0, 0, helmet);
  glint.position.set(-0.05, 0.05, 0.5); glint.rotation.set(-0.2, -0.35, 1.9);
  add(new THREE.SphereGeometry(0.07, 16, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }), -0.52, 0.78, 1.0, helmet);
  const collarY = R * Math.cos(thetaLen), collarR = R * Math.sin(thetaLen);
  add(new THREE.TorusGeometry(collarR, 0.1, 16, 64), suit, 0, collarY, 0, helmet).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(collarR + 0.02, 0.025, 8, 64), new THREE.MeshBasicMaterial({ color: LIME }), 0, collarY + 0.06, 0, helmet).rotation.x = Math.PI / 2;

  // life-support pack with two thrusters
  add(new RoundedBoxGeometry(0.95, 1.05, 0.42, 3, 0.12), suit, 0, 0.12, -0.78);
  [-0.22, 0, 0.22].forEach((x, i) => add(new THREE.BoxGeometry(0.1, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: i === 1 ? LIME : CYAN }), x, 0.42, -0.56));
  const jets = [-1, 1].map((s) => {
    const e = engine(0.12, 0.2, CYAN); e.rotation.z = Math.PI / 2; e.position.set(s * 0.26, -0.5, -0.78); g.add(e);
    return e;
  });

  g.userData = { waveArm, eyes, tips, jets, head, flag, flagBase, w: 5.6, h: 5.2, cx: -1.1, cy: 0.95 };
  return g;
}

export function animateAlien(g, t) {
  const u = g.userData;
  u.waveArm.rotation.z = 1.95 + Math.sin(t * 6) * 0.3;
  u.head.rotation.z = Math.sin(t * 1.3) * 0.06; u.head.rotation.y = Math.sin(t * 0.7) * 0.12;
  const blink = (t % 3.6) < 0.12 ? 0.12 : 1;
  u.eyes.forEach((e) => { e.scale.y = 1.18 * blink; });
  u.tips.forEach((s, i) => s.scale.setScalar(0.6 + Math.sin(t * 4 + i) * 0.15));
  u.jets.forEach((e, i) => { const f = 1 + Math.sin(t * 40 + i) * 0.1; e.userData.glow.scale.setScalar(e.userData.base * f * 0.7); e.userData.plume.scale.set(1, f * 0.7, 1); e.userData.plume.material.opacity = 0.14; e.userData.glow.material.opacity = 0.6; });
  const pos = u.flag.geometry.attributes.position, b = u.flagBase;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], y = b[i * 3 + 1], k = -x / 2.6; // 0 at the pole, 1 at the free edge
    pos.array[i * 3 + 2] = Math.sin(x * 2.2 - t * 3.2) * 0.13 * k;
    pos.array[i * 3 + 1] = y + Math.sin(x * 1.6 - t * 2.4) * 0.05 * k;
  }
  pos.needsUpdate = true; u.flag.geometry.computeVertexNormals();
  g.rotation.y = Math.sin(t * 0.45) * 0.18;
  g.position.y = Math.sin(t * 1.1) * 0.12;
}

// ---------------------------------------------------------------- a space station with a screen
function solarTexture() {
  return canvasTex(256, 512, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#16306e'); grd.addColorStop(1, '#0a1838');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,160,255,.45)'; c.lineWidth = 2;
    for (let x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y <= h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = '#c9a24a'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
  });
}
const SOLAR = solarTexture();
const solarMat = () => new THREE.MeshStandardMaterial({ map: SOLAR, metalness: 0.7, roughness: 0.25, envMapIntensity: 1.2 });

function dish(r) {
  const pts = []; for (let i = 0; i <= 12; i++) { const x = (i / 12) * r; pts.push(new THREE.Vector2(x, (x * x) / (r * 1.6))); }
  return new THREE.LatheGeometry(pts, 32);
}

export function buildStation({ title, sub }) {
  const g = new THREE.Group();
  const hull = hullMaterial(11, '#6a7184');
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // spine + modules
  add(new THREE.BoxGeometry(10.4, 0.16, 0.16), darkMetal(), 0, 0, 0);
  const truss = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10.4, 0.36, 0.36, 26, 1, 1)), new THREE.LineBasicMaterial({ color: '#7f889c' }));
  g.add(truss);
  add(new THREE.CylinderGeometry(0.62, 0.62, 3.0, 32), hull, 0, 0, 0).rotation.z = Math.PI / 2;
  [-1, 1].forEach((s) => {
    add(new THREE.SphereGeometry(0.62, 32, 20), hull, s * 1.5, 0, 0);
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 24), hull, s * 2.2, 0, 0).rotation.z = Math.PI / 2;
    add(new THREE.TorusGeometry(0.36, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: CYAN }), s * 2.66, 0, 0).rotation.y = Math.PI / 2;
  });

  // solar arrays
  [-4.7, -3.5, 3.5, 4.7].forEach((x) => [-1, 1].forEach((s) => {
    const p = add(new THREE.BoxGeometry(1.0, 2.3, 0.04), solarMat(), x, s * 1.42, 0);
    p.rotation.x = s * 0.18;
  }));
  [-4.1, 4.1].forEach((x) => add(new THREE.BoxGeometry(0.08, 5.4, 0.08), darkMetal(), x, 0, 0));

  // habitat ring around the core, spinning
  const ring = new THREE.Group();
  add(new THREE.TorusGeometry(2.05, 0.17, 16, 120), hull, 0, 0, 0, ring);
  for (let i = 0; i < 4; i++) { const sp = add(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), darkMetal(), 0, 0, 0, ring); sp.rotation.z = (i * Math.PI) / 2; sp.position.set(Math.cos((i * Math.PI) / 2 + Math.PI / 2) * 1.05, Math.sin((i * Math.PI) / 2 + Math.PI / 2) * 1.05, 0); }
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; add(new THREE.BoxGeometry(0.1, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffd27a' : CYAN }), Math.cos(a) * 2.05, Math.sin(a) * 2.05, 0.17, ring).rotation.z = a; }
  ring.position.z = -0.25;
  g.add(ring);

  // dish on top
  const mast = add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), darkMetal(), 1.1, 1.05, 0);
  const d = new THREE.Mesh(dish(0.62), new THREE.MeshStandardMaterial({ color: '#7f889c', metalness: 0.5, roughness: 0.6, envMapIntensity: 0.4, side: THREE.DoubleSide }));
  const dishPivot = new THREE.Group(); dishPivot.position.set(1.1, 1.65, 0); dishPivot.add(d); d.rotation.x = Math.PI / 2 - 0.5; g.add(dishPivot);

  // the screen that carries the message
  const screenTex = canvasTex(2400, 600, (c, w, h) => {
    c.fillStyle = '#05070c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = CYAN; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = 'rgba(61,245,255,.06)'; for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 2);
    c.fillStyle = LIME; c.font = `500 56px ${MONO}`; c.fillText('● OPEN CHANNEL', 70, 120);
    c.fillStyle = '#ffffff'; fitFont(c, title, 800, DISPLAY, 210, w - 140); c.fillText(title, 66, 360);
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `500 64px ${MONO}`; c.fillText(sub, 70, 500);
  });
  add(new THREE.BoxGeometry(5.0, 1.36, 0.12), darkMetal(), 0, -2.05, 0.35);
  add(new THREE.PlaneGeometry(4.86, 1.215), new THREE.MeshBasicMaterial({ map: screenTex, color: '#b4bac6' }), 0, -2.05, 0.415);
  add(new THREE.BoxGeometry(0.1, 1.4, 0.1), darkMetal(), 0, -0.85, 0.3);

  // lights
  const lights = [];
  [[-5.2, 2.6, '#ff4060'], [5.2, 2.6, '#40ff90'], [-5.2, -2.6, '#ff4060'], [5.2, -2.6, '#40ff90'], [0, 0.7, '#ffffff']].forEach(([x, y, c], i) => {
    const l = navLight(c, 0.5); l.position.set(x, y, 0.1); g.add(l); lights.push(l);
  });
  g.userData = { ring, dishPivot, lights, w: 11, h: 6.4, cx: 0 };
  return g;
}

export function animateStation(g, t) {
  const u = g.userData;
  u.ring.rotation.z = t * 0.12;
  u.dishPivot.rotation.y = Math.sin(t * 0.4) * 0.6;
  u.lights.forEach((l, i) => { l.material.opacity = i === 4 ? ((t % 1.6) < 0.1 ? 1 : 0.05) : 0.5 + 0.5 * Math.sin(t * 2.5 + i); });
  g.rotation.y = Math.sin(t * 0.25) * 0.12;
  g.position.y = Math.sin(t * 0.8) * 0.06;
}

// ---------------------------------------------------------------- satellites for the background
export function buildSatellite(seed = 1) {
  const g = new THREE.Group();
  const foil = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#b8902f'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,150' : '90,60,10'},${Math.random() * 0.35})`; c.beginPath(); c.moveTo(Math.random() * w, Math.random() * h); c.lineTo(Math.random() * w, Math.random() * h); c.lineTo(Math.random() * w, Math.random() * h); c.fill(); }
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.8), new THREE.MeshStandardMaterial({ map: foil, color: '#8d8a80', metalness: 0.9, roughness: 0.45, envMapIntensity: 0.5 }));
  g.add(body);
  [-1, 1].forEach((s) => {
    const armM = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), darkMetal()); armM.rotation.z = Math.PI / 2; armM.position.x = s * 0.5; g.add(armM);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.03), solarMat()); panel.position.x = s * 1.5; g.add(panel);
  });
  const d = new THREE.Mesh(dish(0.26), new THREE.MeshStandardMaterial({ color: '#9aa3b5', metalness: 0.5, roughness: 0.5, envMapIntensity: 0.5, side: THREE.DoubleSide }));
  d.rotation.x = -Math.PI / 2; d.position.z = 0.42; g.add(d);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), darkMetal()); rod.position.set(0, 0.55, 0); g.add(rod);
  const light = navLight(seed % 2 ? '#ff4060' : '#c6ff3d', 0.4); light.position.set(0, 0.86, 0); g.add(light);
  g.userData = { light, phase: seed * 1.7 };
  return g;
}
