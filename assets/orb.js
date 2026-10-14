/*
 * Smoke Orb — tens of thousands of 1px smoke fibres bent by a flowing noise field,
 * wrapped around a pulsing electric-blue core. WebGL1, renders at native screen resolution.
 *
 * Usage:
 *   <canvas id="orb"></canvas>
 *   <script src="orb.js"></script>
 *   <script>OrbHeader.mount(document.getElementById('orb'), { orbX: 0.68 });</script>
 *
 * Options:
 *   orbX, orbY   orb centre in the canvas (0..1), default 0.5 / 0.5
 *   size         orb size relative to the canvas's shorter side, default 1.45
 *   strands      number of smoke fibres (auto: 60000 desktop / 26000 mobile)
 *   segments     points per fibre, default 10
 *   loopSeconds  length of one seamless loop, default 16
 *   core, smoke  RGB arrays 0..1 for the glow and the smoke tint
 *   brightness   overall fibre brightness multiplier, default 1
 *   pixelRatio   render scale (default: devicePixelRatio, capped at 2)
 *   phase        fixed loop phase 0..1 (frame-exact video rendering); omit for live
 */
(function (global) {
  var NOISE = [
    'float h(vec3 p){p=fract(p*0.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
    'float n3(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.-2.*f);',
    ' return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),',
    '            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/.875;}',
    'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}'
  ].join('\n');

  // ---- fibres -------------------------------------------------------------
  var STRAND_VS = [
    'precision highp float;',
    'attribute vec3 aPos;attribute vec2 aInfo;',      // aInfo.x = position along fibre 0..1, aInfo.y = random
    'uniform float uPhase;uniform vec2 uRes;uniform vec2 uCenter;uniform float uSize;',
    'uniform vec3 uCore;uniform vec3 uSmoke;uniform float uAlpha;uniform float uShadow;',
    'varying vec4 vCol;',
    NOISE,
    '#define TAU 6.28318530718',
    'void main(){',
    '  float A=uPhase*TAU;',
    '  float pulse=.55+.45*sin(A*2.-1.);float flare=pow(.5+.5*sin(A-0.8),6.);',
    '  vec3 q=aPos; q.xz*=rot(A); q.xy*=rot(.35*sin(A));',
    // large-scale flow
    '  vec3 o=vec3(cos(A),sin(A),cos(2.*A))*.55;',
    '  vec3 w=vec3(fbm3(q*1.05+o),fbm3(q*1.05+o+vec3(5.2,1.3,2.8)),fbm3(q*1.05+o+vec3(1.7,9.1,4.4)))-.5;',
    '  q+=w*1.15;',
    // fine curl that turns straight fibres into wisps
    '  vec3 o2=vec3(sin(A),cos(A),sin(2.*A))*.35;',
    '  vec3 w2=vec3(n3(q*4.2+o2),n3(q*4.2+o2+vec3(3.1,7.7,1.9)),n3(q*4.2+o2+vec3(8.3,2.2,5.5)))-.5;',
    '  q+=w2*.45;',
    '  float r=length(q);',
    '  float keep=smoothstep(1.32,.85,r);',
    // inner light that the smoke picks up
    '  float g=smoothstep(1.,.15,r)*smoothstep(.42,.78,fbm3(q*1.9+vec3(0.,0.,3.)+o*.6)+.12*pulse+.22*flare);',
    '  float ends=sin(3.14159*aInfo.x);',
    '  float depth=mix(.55,1.,smoothstep(-1.,1.,q.z));',
    // perspective projection
    '  float z=3.2-q.z;vec2 uv=q.xy*1.75/z;',
    '  vec2 px=uCenter*uRes+uv*min(uRes.x,uRes.y)*uSize;',
    '  gl_Position=vec4(px/uRes*2.-1.,0.,1.);',
    '  float dens=smoothstep(.3,.72,fbm3(aPos*1.7+vec3(2.,5.,1.)+o*.4));',
    '  float a=ends*keep*(.35+.65*aInfo.y)*(.3+1.1*dens);',
    '  vec3 c=mix(uSmoke*(.5+.5*depth),uCore*1.5+vec3(.2),clamp(g*(.5+.4*pulse+.6*flare),0.,1.));',
    '  vCol=uShadow>.5? vec4(0.,0.,0.,a*uAlpha*depth): vec4(c*a*uAlpha*depth,1.);',
    '}'
  ].join('\n');
  var STRAND_FS = 'precision mediump float;varying vec4 vCol;void main(){gl_FragColor=vCol;}';

  // ---- glowing core (full-screen pass, drawn first) -----------------------
  var QUAD_VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var CORE_FS = [
    'precision highp float;',
    'uniform float uPhase;uniform vec2 uRes;uniform vec2 uCenter;uniform float uSize;uniform vec3 uCore;',
    NOISE,
    '#define TAU 6.28318530718',
    'void main(){',
    '  float A=uPhase*TAU;',
    '  float pulse=.55+.45*sin(A*2.-1.);float flare=pow(.5+.5*sin(A-0.8),6.);',
    '  vec2 uv=(gl_FragCoord.xy-uCenter*uRes)/(min(uRes.x,uRes.y)*uSize);',
    '  float r=length(uv)/.5;',
    '  vec3 o=vec3(cos(A),sin(A),cos(2.*A))*.6;',
    '  vec2 wv=uv*2.6+vec2(fbm3(vec3(uv*2.,1.)+o),fbm3(vec3(uv*2.,7.)+o))*.9;',
    '  float n=fbm3(vec3(wv*1.8,2.)+o*.8);',
    '  float n2=n3(vec3(wv*5.,4.)+o*1.3);',
    '  float core=smoothstep(.95,.05,r)*smoothstep(.5,.78,n*.8+n2*.25+.14*pulse+.26*flare);',
    '  vec3 col=uCore*core*(.55+1.4*flare+.4*pulse);',
    '  col+=uCore*exp(-r*r*2.2)*(.03+.03*pulse+.07*flare);',     // soft halo
    '  col=1.-exp(-col*1.3);',
    '  gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function uniforms(gl, p, names) { var u = {}; names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); }); return u; }

  // deterministic fibre geometry
  function buildStrands(count, segs) {
    var seed = 9001;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var verts = count * (segs - 1) * 2, pos = new Float32Array(verts * 3), info = new Float32Array(verts * 2), k = 0;
    var axis = [0.3, 1, 0.2], al = Math.hypot(0.3, 1, 0.2); axis = axis.map(function (v) { return v / al; });
    for (var s = 0; s < count; s++) {
      // point inside a ball, slightly biased outward
      var u = rnd(), v = rnd(), w = Math.pow(rnd(), 0.42) * 1.02;
      var th = u * 2 * Math.PI, ph = Math.acos(2 * v - 1);
      var px = w * Math.sin(ph) * Math.cos(th), py = w * Math.sin(ph) * Math.sin(th), pz = w * Math.cos(ph);
      // direction: blend of a swirl around a tilted axis and a random direction -> bundled, flowing fibres
      var sx = axis[1] * pz - axis[2] * py, sy = axis[2] * px - axis[0] * pz, sz = axis[0] * py - axis[1] * px;
      var sl = Math.hypot(sx, sy, sz) || 1;
      var ru = rnd() * 2 * Math.PI, rv = Math.acos(2 * rnd() - 1);
      var dx = 0.6 * sx / sl + 0.55 * Math.sin(rv) * Math.cos(ru);
      var dy = 0.6 * sy / sl + 0.55 * Math.sin(rv) * Math.sin(ru);
      var dz = 0.6 * sz / sl + 0.55 * Math.cos(rv);
      var dl = Math.hypot(dx, dy, dz) || 1, len = 0.12 + 0.5 * Math.pow(rnd(), 1.6);
      dx = dx / dl * len; dy = dy / dl * len; dz = dz / dl * len;
      var r = rnd();
      for (var i = 0; i < segs - 1; i++) {
        for (var e = 0; e < 2; e++) {
          var t = (i + e) / (segs - 1);
          pos[k * 3] = px + dx * (t - 0.5); pos[k * 3 + 1] = py + dy * (t - 0.5); pos[k * 3 + 2] = pz + dz * (t - 0.5);
          info[k * 2] = t; info[k * 2 + 1] = r; k++;
        }
      }
    }
    return { pos: pos, info: info, count: verts };
  }

  function mount(canvas, opts) {
    opts = opts || {};
    var mobile = Math.min(screen.width, screen.height) < 700;
    var o = {
      orbX: opts.orbX != null ? opts.orbX : 0.5, orbY: opts.orbY != null ? opts.orbY : 0.5,
      size: opts.size || 1.45, loopSeconds: opts.loopSeconds || 16,
      strands: opts.strands || (mobile ? 26000 : 60000), segments: opts.segments || 10,
      core: opts.core || [0.12, 0.5, 1.0], smoke: opts.smoke || [0.62, 0.67, 0.76],
      brightness: opts.brightness || 1, pixelRatio: opts.pixelRatio, phase: opts.phase
    };
    var gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: !!opts.preserve, alpha: false });
    if (!gl) return null;

    var coreP = program(gl, QUAD_VS, CORE_FS), strandP = program(gl, STRAND_VS, STRAND_FS);
    var CU = uniforms(gl, coreP, ['uPhase', 'uRes', 'uCenter', 'uSize', 'uCore']);
    var SU = uniforms(gl, strandP, ['uPhase', 'uRes', 'uCenter', 'uSize', 'uCore', 'uSmoke', 'uAlpha', 'uShadow']);

    var quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var geo = buildStrands(o.strands, o.segments);
    var posB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posB); gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
    var infB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, infB); gl.bufferData(gl.ARRAY_BUFFER, geo.info, gl.STATIC_DRAW);
    var qLoc = gl.getAttribLocation(coreP, 'p'), pLoc = gl.getAttribLocation(strandP, 'aPos'), iLoc = gl.getAttribLocation(strandP, 'aInfo');

    function resize() {
      var dpr = o.pixelRatio || Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), hgt = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; }
      gl.viewport(0, 0, w, hgt);
    }

    function draw(phase) {
      resize();
      phase = ((phase % 1) + 1) % 1;
      var W = canvas.width, H = canvas.height, sz = o.size * 0.5;
      // fibre brightness is normalised for density so the look holds across strand counts and resolutions
      var density = 60000 / o.strands, res = Math.sqrt(W * H / (1920 * 1080));
      var alpha = 0.095 * o.brightness * density * Math.max(0.6, Math.min(1.8, res));

      // 1) core glow
      gl.disable(gl.BLEND);
      gl.useProgram(coreP);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(qLoc); gl.vertexAttribPointer(qLoc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(CU.uPhase, phase); gl.uniform2f(CU.uRes, W, H); gl.uniform2f(CU.uCenter, o.orbX, o.orbY);
      gl.uniform1f(CU.uSize, sz); gl.uniform3fv(CU.uCore, o.core);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(qLoc);

      // 2) fibres: first a darkening pass (smoke occludes the light), then an additive light pass
      gl.useProgram(strandP);
      gl.bindBuffer(gl.ARRAY_BUFFER, posB); gl.enableVertexAttribArray(pLoc); gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, infB); gl.enableVertexAttribArray(iLoc); gl.vertexAttribPointer(iLoc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(SU.uPhase, phase); gl.uniform2f(SU.uRes, W, H); gl.uniform2f(SU.uCenter, o.orbX, o.orbY);
      gl.uniform1f(SU.uSize, sz); gl.uniform3fv(SU.uCore, o.core); gl.uniform3fv(SU.uSmoke, o.smoke);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(SU.uShadow, 1); gl.uniform1f(SU.uAlpha, alpha * 2.2);
      gl.drawArrays(gl.LINES, 0, geo.count);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(SU.uShadow, 0); gl.uniform1f(SU.uAlpha, alpha);
      gl.drawArrays(gl.LINES, 0, geo.count);
      gl.disableVertexAttribArray(pLoc); gl.disableVertexAttribArray(iLoc);
    }

    var running = true;
    var api = { draw: draw, options: o, stop: function () { running = false; } };
    if (o.phase != null) { draw(o.phase); return api; }

    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var visible = true, start = performance.now();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(canvas);
    if (reduce) { draw(0.3); return api; }
    (function loop(now) {
      if (!running) return;
      if (visible && !document.hidden) draw(((now - start) / 1000) / o.loopSeconds);
      requestAnimationFrame(loop);
    })(start);
    return api;
  }

  global.OrbHeader = { mount: mount };
})(window);
