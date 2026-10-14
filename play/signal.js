// Signal Hunt — the viewer stands inside a sky of noise particles and looks around for hidden signals.
// Decoding a signal summons the vessel that carries that piece of info. Ships cross the sky now and then.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShip, animateShip, buildCourier, animateCourier, buildPlanet, animatePlanet, buildAlien, animateAlien, buildStation, animateStation, buildSatellite, glowTexture } from './vessels.js';

const TAU = Math.PI * 2;
const R = Math.random;
const FOV = 50;
const NODE_DIST = 14; // signals sit on a sphere this far from the viewer

// ---------------------------------------------------------------- the sky
function noiseSky(n) {
  const o = new Float32Array(n * 3);
  const streams = Array.from({ length: 7 }, () => {
    const a = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    const b = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).cross(a).normalize();
    return [a, b, 0.6 + R() * 2.2];
  });
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (R() < 0.3) {
      const [a, b, span] = streams[(R() * streams.length) | 0];
      const t = (R() - 0.5) * span, c = Math.cos(t), s = Math.sin(t), w = 0.06;
      x = a.x * c + b.x * s + (R() - 0.5) * w; y = a.y * c + b.y * s + (R() - 0.5) * w; z = a.z * c + b.z * s + (R() - 0.5) * w;
    } else {
      const u = R() * 2 - 1, t = R() * TAU, q = Math.sqrt(1 - u * u);
      x = q * Math.cos(t); y = u * 0.8; z = q * Math.sin(t);
    }
    const r = 9 + Math.pow(R(), 1.6) * 30;
    o[i * 3] = x * r; o[i * 3 + 1] = y * r; o[i * 3 + 2] = z * r;
  }
  return o;
}

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// Interaction runs in screen space (y in [-1, 1], x in [-aspect, aspect]) so it works wherever the viewer looks.
const VERT = /* glsl */ `
uniform float uTime, uScatter, uPixelRatio, uSize, uAlpha, uTanHalf, uSkyRot;
uniform float uMouseStr, uAttract, uShockT, uShockAmp, uScanY, uWarp;
uniform vec2 uMouse, uShockO;
uniform vec3 uColA, uColB, uColHot;
attribute vec4 aRnd;
varying vec3 vColor;
varying float vAlpha;
${NOISE}
void main(){
  float c = cos(uSkyRot), s = sin(uSkyRot);
  vec3 p = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
  vec3 q = p * 0.2 + vec3(0.0, 0.0, uTime * 0.12);
  vec3 n = vec3(snoise(q), snoise(q + vec3(31.4, 0.0, 0.0)), snoise(q + vec3(0.0, -17.2, 0.0)));
  p += n * (0.05 + uScatter * (0.4 + length(p) * 0.03));

  vec4 mv = viewMatrix * vec4(p, 1.0);
  float depth = max(0.05, -mv.z);
  float span = depth * uTanHalf;
  vec2 scr = mv.xy / span;
  vec2 d = scr - uMouse; float dist = length(d);
  vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0);
  float heat = 0.0;

  float infl = (1.0 - smoothstep(0.0, 0.3, dist)) * uMouseStr;
  mv.xy += (dir * 0.11 + vec2(-dir.y, dir.x) * 0.07) * infl * span;
  heat += infl;

  float k = uAttract * (1.0 - smoothstep(0.0, 1.5, dist)) * (0.55 + 0.45 * aRnd.y);
  vec2 tgt = uMouse * span;
  float ang = k * (3.5 + uTime * 1.5);
  vec2 rd = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (mv.xy - tgt) * (1.0 - 0.88 * k);
  mv.xy = mix(mv.xy, tgt + rd, step(0.0001, k));
  heat += k * 1.4;

  vec2 sd = scr - uShockO; float sdist = length(sd);
  float st = uTime - uShockT;
  float ring = exp(-pow(sdist - st * 1.7, 2.0) / 0.012) * exp(-st * 1.3) * uShockAmp;
  mv.xy += (sdist > 1e-4 ? sd / sdist : vec2(0.0)) * ring * 0.2 * span;
  heat += ring;

  // warp: when a vessel jumps in, the sky streaks away from the centre
  mv.xy += scr * span * uWarp * 0.25 * aRnd.x;
  heat += uWarp * 0.5;

  heat += exp(-pow(scr.y - uScanY, 2.0) * 300.0) * 0.7;

  gl_Position = projectionMatrix * mv;
  float big = aRnd.w > 0.975 ? 2.6 : 1.0;
  gl_PointSize = min(48.0, uSize * (0.55 + aRnd.w) * big * uPixelRatio * (1.0 + heat * 1.3) * (${NODE_DIST.toFixed(1)} / depth));

  vec3 base = mix(uColA, uColB, clamp(0.5 + (aRnd.y - 0.5) * 1.1 + n.x * 0.25, 0.0, 1.0));
  vec3 col = mix(base, uColHot, clamp(heat, 0.0, 1.0));
  float tw = aRnd.z > 0.985 ? max(0.0, sin(uTime * 3.0 + aRnd.x * 40.0)) : 0.0;
  vColor = col + tw * 0.9;
  vAlpha = uAlpha * (0.75 + 0.5 * aRnd.y + heat * 0.6) * (1.0 - smoothstep(30.0, 55.0, depth)) * smoothstep(0.4, 2.5, depth);
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5) discard;
  float a = 1.0 - smoothstep(0.0, 0.5, d); a *= a;
  float core = 1.0 - smoothstep(0.0, 0.16, d);
  gl_FragColor = vec4((vColor * a + core * 0.35) * vAlpha, 1.0);
}`;

const LENS = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.0015 }, uGlitch: { value: 0 }, uScan: { value: -1 }, uScanA: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uCA, uGlitch, uScan, uScanA; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uGlitch > 0.01) {
        float f = floor(uTime * 24.0), band = floor(uv.y * 28.0);
        if (h(vec2(band, f)) < uGlitch * 0.55) uv.x += (h(vec2(band, f + 3.0)) - 0.5) * 0.14 * uGlitch;
      }
      vec2 c = uv - 0.5; float d = length(c);
      float ca = uCA * (0.4 + d * 1.8) + uGlitch * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, uv + c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ca).b);
      col += vec3(0.42, 0.75, 0.05) * exp(-pow((uv.y - uScan) * uRes.y, 2.0) / 6.0) * uScanA;
      col *= 1.0 - smoothstep(0.3, 1.1, d);
      col += (h(uv * uRes + fract(uTime) * 91.7) - 0.5) * 0.012 * (0.4 + col);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const easeInCubic = (x) => x * x * x;
const easeOutBack = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

// ---------------------------------------------------------------- main
export function createSignal(canvas, opts = {}) {
  const reduced = !!opts.reduced;
  const narrow = innerWidth < 820;
  const count = opts.count ?? (narrow ? 30000 : (navigator.hardwareConcurrency || 4) >= 8 ? 90000 : 55000);
  const nodeDefs = opts.nodes || [];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let dpr = Math.min(devicePixelRatio || 1, narrow ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x05060a, 1);
  // compress highlights so lit models never blow out to white
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 300);
  scene.add(camera);
  // lights ride with the camera so a vessel is always lit the same way, wherever it appears
  const key = new THREE.DirectionalLight('#ffffff', 1.7); key.position.set(-6, 6, 4);
  const rim = new THREE.DirectionalLight('#3df5ff', 2.2); rim.position.set(6, 2, -24);
  const fill = new THREE.DirectionalLight('#7b61ff', 0.7); fill.position.set(4, -4, 2);
  const lightTarget = new THREE.Object3D(); lightTarget.position.set(0, 0, -11);
  [key, rim, fill].forEach((l) => { l.target = lightTarget; camera.add(l); });
  camera.add(lightTarget);
  scene.add(new THREE.HemisphereLight('#8899ff', '#080810', 0.5));

  const forward = (yaw, pitch, out = new THREE.Vector3()) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const viewAt = (dist) => { const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); return { h, w: h * camera.aspect }; };

  // ---- particles
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(noiseSky(count), 3));
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < rnd.length; i++) rnd[i] = R();
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  const density = Math.min(1.25, Math.max(0.45, Math.sqrt(60000 / count)));
  const U = {
    uTime: { value: 0 }, uScatter: { value: reduced ? 0 : 0.05 }, uSkyRot: { value: 0 },
    uPixelRatio: { value: dpr }, uSize: { value: narrow ? 2.6 : 2.1 }, uAlpha: { value: 0.72 * density },
    uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) },
    uMouseStr: { value: 0 }, uAttract: { value: 0 }, uWarp: { value: 0 },
    uShockT: { value: -100 }, uShockAmp: { value: 1 }, uScanY: { value: 10 },
    uMouse: { value: new THREE.Vector2(9, 9) }, uShockO: { value: new THREE.Vector2() },
    uColA: { value: new THREE.Color('#2a3bff') }, uColB: { value: new THREE.Color('#3df5ff') }, uColHot: { value: new THREE.Color('#eaff8a') },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.frustumCulled = false;
  scene.add(points);

  // ---- signal beacons
  const glowTex = glowTexture();
  const CYAN = new THREE.Color('#3df5ff'), PINK = new THREE.Color('#ff3dbb'), LIME = new THREE.Color('#c6ff3d');
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  function circle(r, seg = 128) {
    const pts = []; for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }
  const nodes = nodeDefs.map((def) => {
    const pos = forward(def.yaw, def.pitch).multiplyScalar(NODE_DIST);
    const g = new THREE.Group(); g.position.copy(pos); g.lookAt(0, 0, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: CYAN.clone(), ...additive, opacity: 0.9 }));
    glow.scale.setScalar(2.2);
    const swarmN = 320, sp = new Float32Array(swarmN * 3);
    for (let k = 0; k < swarmN; k++) { const u = R() * 2 - 1, a = R() * TAU, r = 0.12 + Math.pow(R(), 2) * 0.5, s = Math.sqrt(1 - u * u); sp[k * 3] = Math.cos(a) * s * r; sp[k * 3 + 1] = u * r; sp[k * 3 + 2] = Math.sin(a) * s * r; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const swarm = new THREE.Points(sg, new THREE.PointsMaterial({ color: CYAN.clone(), size: 0.06, ...additive, opacity: 0.9 }));
    const ringA = new THREE.Line(circle(0.62), new THREE.LineDashedMaterial({ color: CYAN.clone(), dashSize: 0.08, gapSize: 0.06, ...additive, opacity: 0.8 }));
    ringA.computeLineDistances();
    const ringB = new THREE.Line(circle(0.86), new THREE.LineBasicMaterial({ color: CYAN.clone(), ...additive, opacity: 0.35 }));
    g.add(glow, swarm, ringA, ringB);
    scene.add(g);
    return { def, pos, g, glow, swarm, ringA, ringB, state: 'idle', lock: 0, show: 1, phase: R() * TAU };
  });

  // ---- vessels (built on first use, after the fonts for their livery have loaded)
  const vessels = new Map();
  function vesselFor(i) {
    if (vessels.has(i)) return vessels.get(i);
    const v = nodeDefs[i].vessel;
    let obj, kind;
    if (v.type === 'planet') { obj = buildPlanet(v); kind = 'planet'; }
    else if (v.type === 'alien') { obj = buildAlien(v); kind = 'alien'; }
    else if (v.type === 'station') { obj = buildStation(v); kind = 'station'; }
    else if (v.type === 'courier') { obj = buildCourier(v); kind = 'courier'; }
    else { obj = buildShip({ kind: v.type, livery: v.livery, accent: v.accent, seed: i + 2 }); kind = 'ship'; }
    const holder = new THREE.Group(); // placed in the world, faces the viewer
    const mover = new THREE.Group();  // flies in/out along the holder's x axis
    const tilt = new THREE.Group();   // shows a little of the top of a ship
    if (kind === 'ship' || kind === 'courier') tilt.rotation.x = 0.2;
    tilt.add(obj); mover.add(tilt); holder.add(mover);
    holder.visible = false;
    scene.add(holder);
    const rec = { i, kind, obj, holder, mover, tilt, phase: 'idle', t0: 0 };
    vessels.set(i, rec);
    return rec;
  }
  let active = null; // the vessel on stage

  function fitVessel(rec) {
    const dist = rec.kind === 'planet' ? 15 : 10.5;
    const { w, h } = viewAt(dist);
    let s;
    if (rec.kind === 'planet') s = Math.min(h * 0.3, w * 0.36) / rec.obj.userData.radius;
    else if (rec.kind === 'alien' || rec.kind === 'station') {
      const u = rec.obj.userData;
      s = Math.min(1.25, (w * (view.mobile ? 0.9 : 0.72)) / u.w, (h * 0.62) / u.h);
      rec.mover.position.x = 0; rec.tilt.position.x = -u.cx * s; rec.tilt.position.y = -(u.cy || 0) * s;
    } else {
      const len = rec.obj.userData.length;
      s = Math.min(1, (w * (view.mobile ? 0.86 : 0.7)) / len, (h * 0.55) / (len * 0.35));
      if (rec.kind === 'courier') rec.obj.position.x = -rec.obj.userData.center * s;
    }
    rec.obj.scale.setScalar(s);
    rec.dist = dist;
  }

  // ---- ambient ships crossing the sky
  const traffic = [];
  const trafficKinds = ['drone', 'drone', 'courier', 'cruiser', 'freighter'];
  function spawnTraffic() {
    const kind = trafficKinds[(R() * trafficKinds.length) | 0];
    const ship = buildShip({ kind, accent: ['#c6ff3d', '#3df5ff', '#ff3dbb', '#ffb347'][(R() * 4) | 0], seed: (R() * 50) | 0 });
    const far = kind === 'freighter' || kind === 'cruiser';
    const dist = far ? 45 + R() * 25 : 20 + R() * 18;
    const yaw = st.yaw + (R() - 0.5) * 1.3, pitch = Math.max(-0.5, Math.min(0.6, st.pitch + (R() - 0.35) * 0.6));
    const center = forward(yaw, pitch).multiplyScalar(dist);
    const toCam = center.clone().negate().normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(toCam).normalize();
    const dir = right.clone().multiplyScalar(R() < 0.5 ? 1 : -1).addScaledVector(new THREE.Vector3(0, 1, 0), (R() - 0.5) * 0.25).normalize();
    const travel = dist * 2.2;
    const z = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const y = new THREE.Vector3().crossVectors(z, dir).normalize();
    ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, y, z));
    ship.scale.setScalar(far ? 1.2 : 1);
    // contrail
    const trailN = 40, tp = new Float32Array(trailN * 3), tc = new Float32Array(trailN * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, ...additive }));
    trail.frustumCulled = false;
    scene.add(ship, trail);
    traffic.push({ ship, trail, start: center.clone().addScaledVector(dir, -travel / 2), dir, travel, t: 0, dur: (far ? 22 : 9) + R() * 6, hist: [] });
  }
  let nextTraffic = 4 + R() * 4;

  // ---- satellites parked around the sky, slowly tumbling along their orbits
  const satellites = [];
  for (let i = 0; i < (narrow ? 4 : 7); i++) {
    const s = buildSatellite(i);
    const yaw = (i / 7) * TAU + R() * 0.5, pitch = (R() - 0.4) * 0.7, dist = 15 + R() * 16;
    s.userData.orbit = { yaw, pitch, dist, speed: (R() < 0.5 ? -1 : 1) * (0.004 + R() * 0.008) };
    s.userData.spin = new THREE.Vector3((R() - 0.5) * 0.3, (R() - 0.5) * 0.4, (R() - 0.5) * 0.2);
    s.scale.setScalar(0.8 + R() * 0.6);
    s.rotation.set(R() * TAU, R() * TAU, R() * TAU);
    scene.add(s); satellites.push(s);
  }

  // ---- post
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.4, 0.5);
  composer.addPass(bloom);
  const lens = new ShaderPass(LENS);
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  lens.uniforms.uRes.value.set(innerWidth, innerHeight);

  // ---------------------------------------------------------------- state
  const view = { mobile: narrow };
  const st = {
    time: 0, last: performance.now() / 1000,
    yaw: opts.startYaw ?? -0.15, pitch: 0.02, vyaw: 0, vpitch: 0, focus: null,
    ndc: new THREE.Vector2(0, 0), inside: false, speed: 0, mouse: new THREE.Vector2(9, 9),
    hold: false, glitch: 0, warp: 0, skyRot: 0,
    frames: 0, fpsT: 0, fps: 60, slowN: 0,
  };
  const tmpV = new THREE.Vector3();

  function setPointer(x, y, inside = true) {
    const nx = (x / innerWidth) * 2 - 1, ny = -(y / innerHeight) * 2 + 1;
    st.speed = Math.min(80, Math.hypot(nx - st.ndc.x, ny - st.ndc.y) * innerWidth * 0.5);
    st.ndc.set(nx, ny); st.inside = inside;
  }
  function pulse(x, y, amp = 1) {
    if (reduced) return;
    U.uShockO.value.set(((x / innerWidth) * 2 - 1) * camera.aspect, -(y / innerHeight) * 2 + 1);
    U.uShockT.value = st.time; U.uShockAmp.value = amp;
    st.glitch = Math.max(st.glitch, 0.3 * amp);
  }
  function look(dx, dy) {
    if (st.focus) return;
    const k = (camera.fov * Math.PI) / 180 / innerHeight;
    st.vyaw = -dx * k * 1.1; st.vpitch = dy * k * 1.1;
    st.yaw += st.vyaw; st.pitch = Math.max(-1.1, Math.min(1.1, st.pitch + st.vpitch));
  }
  function turnTo(yaw, pitch) { st.focus = { yaw, pitch, once: true }; }

  // bring a vessel on stage in front of signal i
  function summon(i) {
    if (active && active.i === i && active.phase !== 'out') return;
    if (active) dismiss(true);
    const rec = vesselFor(i);
    fitVessel(rec);
    const d = nodeDefs[i];
    const pitch = d.pitch + (view.mobile ? 0.06 : 0);
    st.focus = { yaw: d.yaw, pitch };
    rec.holder.position.copy(forward(d.yaw, pitch)).multiplyScalar(rec.dist);
    rec.holder.lookAt(0, 0, 0);
    rec.holder.visible = true;
    rec.phase = 'in'; rec.t0 = st.time;
    active = rec;
    st.warp = reduced ? 0 : 1; st.glitch = Math.max(st.glitch, reduced ? 0 : 0.6);
  }
  function dismiss(instant = false) {
    if (!active) return;
    const rec = active;
    active = null;
    st.focus = null;
    if (instant || reduced) { rec.holder.visible = false; rec.phase = 'idle'; return; }
    rec.phase = 'out'; rec.t0 = st.time;
    st.glitch = Math.max(st.glitch, 0.35);
  }

  // screen anchor of the vessel on stage (for the HTML callout)
  const anchorOut = { x: 0, y: 0, visible: false, ready: false };
  function vesselAnchor() {
    anchorOut.visible = !!active;
    if (!active) return anchorOut;
    tmpV.set(0, 0, 0).applyMatrix4(active.holder.matrixWorld).project(camera);
    anchorOut.x = ((tmpV.x + 1) / 2) * innerWidth; anchorOut.y = ((1 - tmpV.y) / 2) * innerHeight;
    anchorOut.ready = active.phase === 'stay';
    return anchorOut;
  }

  const projOut = nodes.map(() => ({ x: 0, y: 0, front: false, onScreen: false, cx: 0, cy: 0 }));
  function projectNodes() {
    nodes.forEach((n, i) => {
      const o = projOut[i];
      tmpV.copy(n.pos).applyMatrix4(camera.matrixWorldInverse);
      o.cx = tmpV.x; o.cy = tmpV.y; o.front = tmpV.z < 0;
      tmpV.copy(n.pos).project(camera);
      o.x = ((tmpV.x + 1) / 2) * innerWidth; o.y = ((1 - tmpV.y) / 2) * innerHeight;
      o.onScreen = o.front && tmpV.x > -1 && tmpV.x < 1 && tmpV.y > -1 && tmpV.y < 1;
    });
    return projOut;
  }

  // ---------------------------------------------------------------- resize
  let rt = 0;
  function resize() {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    lens.uniforms.uRes.value.set(innerWidth, innerHeight);
    view.mobile = innerWidth < 820;
    if (active) fitVessel(active);
  }
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 160); });

  // ---------------------------------------------------------------- loop
  function frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - st.last); st.last = now;
    if (document.hidden) return;
    st.time += dt;
    const t = st.time;
    U.uTime.value = t;

    // camera: free look with inertia (it never moves on its own), or glide to a focus target
    if (st.focus) {
      let dy = st.focus.yaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
      st.yaw += dy * k; st.pitch += (st.focus.pitch - st.pitch) * k;
      if (st.focus.once && Math.abs(dy) < 0.002 && Math.abs(st.focus.pitch - st.pitch) < 0.002) st.focus = null;
    } else if (!reduced) {
      st.vyaw *= 0.93; st.vpitch *= 0.9;
      st.yaw += st.vyaw * 0.35; st.pitch = Math.max(-1.1, Math.min(1.1, st.pitch + st.vpitch * 0.35));
    }
    const par = reduced || st.focus ? 0 : 0.04;
    forward(st.yaw + st.ndc.x * par, st.pitch + st.ndc.y * par * 0.7, tmpV);
    camera.position.set(0, 0, 0);
    camera.lookAt(tmpV);
    camera.updateMatrixWorld();

    // pointer + sky
    st.mouse.set(st.ndc.x * camera.aspect, st.ndc.y);
    U.uMouse.value.lerp(st.mouse, 0.25);
    st.speed *= 0.92;
    const ms = st.inside && !reduced ? 0.55 + Math.min(st.speed * 0.02, 0.9) : 0;
    U.uMouseStr.value += (ms - U.uMouseStr.value) * 0.08;
    U.uAttract.value += ((st.hold && !reduced ? 1 : 0) - U.uAttract.value) * (st.hold ? 0.05 : 0.12);
    if (!reduced) st.skyRot += dt * 0.01;
    U.uSkyRot.value = st.skyRot;
    st.warp *= Math.exp(-dt * 2.2);
    U.uWarp.value = st.warp;

    const ph = (t % 7) / 2.4;
    if (!reduced && ph < 1) { U.uScanY.value = 1.1 - ph * 2.2; lens.uniforms.uScan.value = 1.05 - ph * 1.1; lens.uniforms.uScanA.value = 0.4 * Math.sin(ph * Math.PI); }
    else { U.uScanY.value = 10; lens.uniforms.uScanA.value = 0; }

    // beacons
    const kc = 1 - Math.exp(-dt * 2.5);
    nodes.forEach((n, i) => {
      const onStage = active && active.i === i;
      n.show += ((onStage ? 0 : 1) - n.show) * kc;
      const found = n.state === 'found', locked = n.state === 'locked';
      const c = found ? LIME : (Math.sin(t * 7 + n.phase) > 0.6 ? PINK : CYAN);
      [n.glow, n.swarm, n.ringA, n.ringB].forEach((o) => o.material.color.lerp(c, 0.08));
      n.lock += ((locked ? 1 : 0) - n.lock) * 0.15;
      const beat = 1 + Math.sin(t * 3 + n.phase) * 0.08;
      const flick = found ? 1 : 0.65 + 0.35 * Math.abs(Math.sin(t * 13 + n.phase * 3));
      n.g.scale.setScalar(Math.max(0.001, n.show) * (1 + n.lock * 0.35) * beat);
      n.g.visible = n.show > 0.02;
      n.swarm.material.opacity = 0.9 * n.show;
      n.glow.material.opacity = 0.8 * n.show * flick;
      n.swarm.rotation.y += dt * (0.6 + n.lock * 3); n.swarm.rotation.x += dt * 0.3;
      n.ringA.rotation.z += dt * (0.5 + n.lock * 4); n.ringB.rotation.z -= dt * 0.2;
      n.ringA.material.opacity = (0.6 + n.lock * 0.4) * n.show; n.ringB.material.opacity = 0.3 * n.show;
    });

    // vessels: jump in from the left, hover, jump out to the right
    vessels.forEach((rec) => {
      if (!rec.holder.visible) return;
      const e = t - rec.t0;
      let boost = 0;
      if (rec.kind === 'planet' || rec.kind === 'alien' || rec.kind === 'station') {
        if (rec.phase === 'in') { const k = Math.min(1, e / 1.6); rec.mover.scale.setScalar(Math.max(0.001, easeOutBack(k))); if (k >= 1) rec.phase = 'stay'; }
        else if (rec.phase === 'out') { const k = Math.min(1, e / 0.7); rec.mover.scale.setScalar(Math.max(0.001, 1 - easeInCubic(k))); if (k >= 1) { rec.phase = 'idle'; rec.holder.visible = false; } }
        else rec.mover.scale.setScalar(1);
        if (rec.kind === 'planet') animatePlanet(rec.obj, t); else if (rec.kind === 'alien') animateAlien(rec.obj, t); else animateStation(rec.obj, t);
      } else {
        const far = 60;
        if (rec.phase === 'in') {
          const k = Math.min(1, e / 1.7), q = easeOutExpo(k);
          rec.mover.position.x = -far * (1 - q); rec.mover.scale.set(1 + (1 - q) * 4, 1, 1);
          boost = 1 - k;
          if (k >= 1) rec.phase = 'stay';
        } else if (rec.phase === 'out') {
          const k = Math.min(1, e / 1.1), q = easeInCubic(k);
          rec.mover.position.x = far * 1.5 * q; rec.mover.scale.set(1 + q * 5, 1, 1);
          boost = 0.5 + k;
          if (k >= 1) { rec.phase = 'idle'; rec.holder.visible = false; rec.mover.position.x = 0; rec.mover.scale.set(1, 1, 1); }
        } else { rec.mover.position.x = 0; rec.mover.scale.set(1, 1, 1); }
        rec.mover.position.y = Math.sin(t * 0.9) * 0.08;
        rec.mover.rotation.z = Math.sin(t * 0.6) * 0.025;
        rec.tilt.rotation.y = st.ndc.x * 0.12; rec.tilt.rotation.x = 0.2 - st.ndc.y * 0.08;
        if (rec.kind === 'courier') animateCourier(rec.obj, t, boost); else animateShip(rec.obj, t, boost);
      }
    });

    satellites.forEach((s) => {
      const o = s.userData.orbit;
      if (!reduced) { o.yaw += dt * o.speed; s.rotation.x += dt * s.userData.spin.x; s.rotation.y += dt * s.userData.spin.y; s.rotation.z += dt * s.userData.spin.z; }
      forward(o.yaw, o.pitch, s.position).multiplyScalar(o.dist);
      s.userData.light.material.opacity = ((t + s.userData.phase) % 2) < 0.12 ? 1 : 0.08;
    });

    // traffic
    if (!reduced) {
      nextTraffic -= dt;
      if (nextTraffic <= 0 && traffic.length < 3) { spawnTraffic(); nextTraffic = 9 + R() * 12; }
      for (let k = traffic.length - 1; k >= 0; k--) {
        const tr = traffic[k];
        tr.t += dt / tr.dur;
        tr.ship.position.copy(tr.start).addScaledVector(tr.dir, tr.travel * tr.t);
        animateShip(tr.ship, t, 0.2);
        tr.hist.unshift(tr.ship.position.clone().addScaledVector(tr.dir, -tr.ship.userData.length * 0.55 * tr.ship.scale.x));
        if (tr.hist.length > 40) tr.hist.pop();
        const pa = tr.trail.geometry.attributes.position, ca = tr.trail.geometry.attributes.color;
        for (let j = 0; j < 40; j++) {
          const p = tr.hist[Math.min(j, tr.hist.length - 1)];
          pa.setXYZ(j, p.x, p.y, p.z);
          const f = (1 - j / 40) * 0.6;
          ca.setXYZ(j, 0.24 * f, 0.96 * f, 1 * f);
        }
        pa.needsUpdate = true; ca.needsUpdate = true;
        if (tr.t >= 1) {
          scene.remove(tr.ship, tr.trail);
          tr.ship.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
          tr.trail.geometry.dispose(); tr.trail.material.dispose();
          traffic.splice(k, 1);
        }
      }
    }

    st.glitch *= Math.exp(-dt * 4.5);
    lens.uniforms.uTime.value = t;
    lens.uniforms.uGlitch.value = reduced ? 0 : st.glitch;
    lens.uniforms.uCA.value = 0.0012 + Math.min(Math.hypot(st.vyaw, st.vpitch) * 0.08, 0.01) + st.warp * 0.006;

    composer.render();

    st.frames++;
    if (now - st.fpsT >= 0.5) {
      st.fps = Math.round(st.frames / (now - st.fpsT)); st.frames = 0; st.fpsT = now;
      if (st.fps < 40) st.slowN++; else st.slowN = 0;
      if (st.slowN >= 4) {
        st.slowN = 0;
        if (dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight); U.uPixelRatio.value = dpr; }
        else if (bloom.enabled) bloom.enabled = false;
      }
    }
  }
  renderer.setAnimationLoop(frame);

  return {
    count,
    setPointer,
    pointerLeave() { st.inside = false; },
    setHold(v) { st.hold = !!v; },
    pulse,
    look,
    turnTo,
    summon,
    dismiss,
    vesselAnchor,
    projectNodes,
    setNodeState(i, s) { if (nodes[i]) nodes[i].state = s; },
    glitch(a = 0.5) { if (!reduced) st.glitch = Math.max(st.glitch, a); },
    getFps: () => st.fps,
    heading: () => ({ yaw: st.yaw, pitch: st.pitch }),
  };
}
