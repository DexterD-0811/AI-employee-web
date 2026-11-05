import * as THREE from 'three';
import './styles.css';
import { STATUS, AGENTS as DEMO_AGENTS } from './data/agents.js';
import { DAYS, COLS as DEMO_COLS, SEED_TASKS, SEED_GOALS, UTIL, HOURS, ATTEND } from './data/boards.js';
import { connect, fetchAll, signIn, signOut, decide, setPaused } from './lib/hq.js';
import { POLL_MS } from './lib/config.js';
import { liveAgents, syncAgents, liveTasks, liveGoals, LIVE_COLS, KIND_LABEL, ago, shortDate, weekRuns, weekDecided, thisWeek } from './lib/live.js';

// The office opens on the live team for a signed-in owner, otherwise on the demo.
function startScene(hq) {
  'use strict';
  const loadingEl = document.getElementById('loading');
  const T = THREE;
  const OX = -62, OZ = -22;             // office local -> world offset (studs)
  const FY = 0.2;                       // floor top
  const SEAT = 1.6;                     // seat top (absolute)
  const PI = Math.PI;
  const live = hq.mode === 'live';
  let data = hq.data || null;
  const AGENTS = live ? liveAgents(data) : DEMO_AGENTS;
  const COLS = live ? LIVE_COLS : DEMO_COLS;


  // ---------------------------------------------------------------- renderer
  const canvas = document.getElementById('scene');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const SKY = 0xbfe8f7;
  scene.background = new T.Color(SKY);
  renderer.setClearColor(SKY, 1);
  scene.fog = new T.Fog(SKY, 150, 400);
  const camera = new T.PerspectiveCamera(42, 1, 1.5, 6000);

  scene.add(new T.HemisphereLight(0xfff6e5, 0x7fb069, 0.78));
  const sun = new T.DirectionalLight(0xfff0d2, 0.66);
  sun.position.set(-70, 130, 60);
  sun.target.position.set(-5, 0, 6);
  scene.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 80, bottom: -80, near: 10, far: 360 });
  sun.shadow.bias = -0.0006;

  // ---------------------------------------------------------------- helpers
  const matCache = {};
  function mat(color, opts) {
    const key = color + '|' + (opts ? JSON.stringify(opts) : '');
    if (!matCache[key]) matCache[key] = new T.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    return matCache[key];
  }
  const BOX = new T.BoxGeometry(1, 1, 1);
  const CYL = new T.CylinderGeometry(1, 1, 1, 16);
  const CYL8 = new T.CylinderGeometry(1, 1, 1, 8);
  const ICO = new T.IcosahedronGeometry(1, 0);
  const ICO2 = new T.IcosahedronGeometry(1, 1);
  const CONE = new T.ConeGeometry(1, 1, 6);
  const _p = new T.Vector3(), _s = new T.Vector3(), _q = new T.Quaternion(), _e = new T.Euler();

  function Builder() { this.b = {}; }
  Builder.prototype.add = function (geo, color, px, py, pz, sx, sy, sz, rx, ry, rz, base, opts) {
    const m = new T.Matrix4().compose(_p.set(px, py, pz), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)), _s.set(sx, sy, sz));
    if (base) m.premultiply(base);
    let g = geo.clone().applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    const key = color + '|' + (opts ? JSON.stringify(opts) : '');
    (this.b[key] || (this.b[key] = { color, opts, list: [] })).list.push(g);
  };
  Builder.prototype.box = function (color, x0, x1, y0, y1, z0, z1, base, opts) {
    this.add(BOX, color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, 0, 0, base, opts);
  };
  Builder.prototype.cyl = function (color, cx, cz, r, y0, y1, base, opts, geo) {
    this.add(geo || CYL, color, cx, (y0 + y1) / 2, cz, r, y1 - y0, r, 0, 0, 0, base, opts);
  };
  Builder.prototype.build = function (parent, cast) {
    Object.keys(this.b).forEach((k) => {
      const bucket = this.b[k];
      let n = 0;
      bucket.list.forEach((g) => { n += g.attributes.position.count; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let o = 0;
      bucket.list.forEach((g) => {
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
        g.dispose();
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.computeBoundingSphere();
      const mesh = new T.Mesh(geo, mat(bucket.color, bucket.opts));
      const transparent = bucket.opts && bucket.opts.transparent;
      mesh.castShadow = cast !== false && !transparent;
      mesh.receiveShadow = !transparent;
      parent.add(mesh);
    });
    this.b = {};
  };

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // ---------------------------------------------------------------- ground: grass tiles, roads, farm fields and a small town
  const grassTex = canvasTex(128, 128, (c) => {
    const cols = ['#88d25b', '#82cc56', '#7ec853', '#86cf59'];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = cols[i * 2 + j]; c.fillRect(i * 64, j * 64, 64, 64); }
    c.strokeStyle = 'rgba(40,90,20,.12)'; c.lineWidth = 2;
    for (let k = 0; k <= 128; k += 64) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 128); c.stroke(); c.beginPath(); c.moveTo(0, k); c.lineTo(128, k); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.14)'; for (let n = 0; n < 16; n++) c.fillRect((n * 37) % 120 + 3, (n * 53) % 120 + 3, 5, 2);
  });
  grassTex.wrapS = grassTex.wrapT = T.RepeatWrapping;
  grassTex.repeat.set(9000 / 16, 9000 / 16);
  const ground = new T.Mesh(new T.PlaneGeometry(9000, 9000), new T.MeshLambertMaterial({ map: grassTex }));
  ground.rotation.x = -PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const CH = 640, CS = 2048, CK = CS / (CH * 2);   // town texture covers [-CH, CH] studs
  const RW = 8;                                    // road width
  const LOT = { x0: -74, x1: 66, z0: -30, z1: 52 }; // the campus cell, bounded by roads
  const roadsX = [], roadsZ = [];
  for (let x = LOT.x0; x > -CH + 24; x -= 56) roadsX.push(x);
  for (let x = LOT.x1; x < CH - 24; x += 56) roadsX.push(x);
  for (let z = LOT.z0; z > -CH + 24; z -= 56) roadsZ.push(z);
  for (let z = LOT.z1; z < CH - 24; z += 56) roadsZ.push(z);
  roadsX.sort((a, b) => a - b); roadsZ.sort((a, b) => a - b);
  const toC = (v) => (v + CH) * CK;

  const R = rng(11);
  const bounds = (arr) => [-CH].concat(arr).concat([CH]);
  const bx = bounds(roadsX), bz = bounds(roadsZ);
  const houses = [], parks = [], fields = [], ponds = [], yards = [], mills = [];
  const WALLC = ['#fff3df', '#ffe2c4', '#f9d9e3', '#dcecff', '#e8f5d8', '#fff0b8'];
  const ROOFC = ['#e4553f', '#3d7fd6', '#f2a93b', '#5fae4f', '#8e5bbd', '#d9734e'];
  const CROPS = [['#efcb68', '#d9ae45'], ['#a5d65a', '#86bd42'], ['#b9825a', '#9c6a46'], ['#f6b2c2', '#a5d65a'], ['#ffd65c', '#7cc653']];
  for (let i = 0; i < bx.length - 1; i++) {
    for (let j = 0; j < bz.length - 1; j++) {
      let x0 = bx[i], x1 = bx[i + 1], z0 = bz[j], z1 = bz[j + 1];
      if (x0 === LOT.x0 && x1 === LOT.x1 && z0 === LOT.z0 && z1 === LOT.z1) continue;
      if (x0 !== -CH) x0 += RW / 2; if (x1 !== CH) x1 -= RW / 2;
      if (z0 !== -CH) z0 += RW / 2; if (z1 !== CH) z1 -= RW / 2;
      const w = x1 - x0, d = z1 - z0;
      if (w < 8 || d < 8) continue;
      const ix0 = x0 + 3, iz0 = z0 + 3, iw = w - 6, id = d - 6;
      const nx = Math.max(1, Math.round(iw / 24)), nz = Math.max(1, Math.round(id / 24));
      const cw = iw / nx, cd = id / nz;
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          const cx = ix0 + a * cw + cw / 2, cz = iz0 + b * cd + cd / 2;
          const dl = Math.hypot(Math.max(LOT.x0 - cx, 0, cx - LOT.x1), Math.max(LOT.z0 - cz, 0, cz - LOT.z1));
          const roll = R();
          let type;
          if (dl < 75) type = roll < 0.45 ? 'park' : 'house';
          else if (dl < 220) type = roll < 0.5 ? 'house' : roll < 0.82 ? 'field' : roll < 0.93 ? 'park' : 'pond';
          else type = roll < 0.3 ? 'house' : roll < 0.8 ? 'field' : roll < 0.9 ? 'park' : 'pond';
          if (type === 'park') parks.push([cx, cz, cw, cd]);
          else if (type === 'pond') { ponds.push([cx, cz, cw, cd]); }
          else if (type === 'field') {
            fields.push([cx, cz, cw, cd, Math.floor(R() * CROPS.length), R() < 0.5]);
            if (R() < 0.14) mills.push([cx + (cw / 2 - 4) * (R() < 0.5 ? -1 : 1), cz + (cd / 2 - 4) * (R() < 0.5 ? -1 : 1), R() * PI * 2]);
          } else {
            yards.push([cx, cz, cw, cd]);
            const two = cw > 18 && R() < 0.6, n = two ? 2 : 1;
            for (let q = 0; q < n; q++) {
              const hw = Math.max(5, (two ? cw / 2 - 4 : cw - 7) * (0.6 + R() * 0.3));
              const hd = Math.max(5, (cd - 7) * (0.5 + R() * 0.35));
              houses.push({ x: two ? cx + (q ? cw / 4 : -cw / 4) : cx, z: cz, w: hw, d: hd, h: 4 + R() * 3 + (dl > 200 && R() < 0.15 ? 5 : 0),
                wall: WALLC[Math.floor(R() * WALLC.length)], roof: ROOFC[Math.floor(R() * ROOFC.length)] });
            }
          }
        }
      }
    }
  }
  const cityTex = canvasTex(CS, CS, (c) => {
    c.clearRect(0, 0, CS, CS);
    c.fillStyle = '#e6d6a8';
    yards.forEach((p) => c.fillRect(toC(p[0] - p[2] / 2 + 1.5), toC(p[1] - p[3] / 2 + 1.5), (p[2] - 3) * CK, (p[3] - 3) * CK));
    fields.forEach((f) => {
      const [cx, cz, fw, fd, ci, alongX] = f, cols = CROPS[ci];
      const fx = toC(cx - fw / 2 + 1.5), fz = toC(cz - fd / 2 + 1.5), W2 = (fw - 3) * CK, H2 = (fd - 3) * CK;
      c.fillStyle = cols[0]; c.fillRect(fx, fz, W2, H2);
      c.fillStyle = cols[1];
      const step = 2.5 * CK;
      if (alongX) for (let y = fz + step / 2; y < fz + H2; y += step) c.fillRect(fx, y, W2, step / 2);
      else for (let x = fx + step / 2; x < fx + W2; x += step) c.fillRect(x, fz, step / 2, H2);
      c.strokeStyle = 'rgba(90,60,30,.35)'; c.lineWidth = 2; c.strokeRect(fx, fz, W2, H2);
    });
    ponds.forEach((p) => {
      const px = toC(p[0] - p[2] / 2 + 3), pz = toC(p[1] - p[3] / 2 + 3), pw = (p[2] - 6) * CK, ph = (p[3] - 6) * CK;
      c.fillStyle = '#9adcf5'; roundRect(c, px - 3, pz - 3, pw + 6, ph + 6, Math.min(pw, ph) / 2); c.fill();
      c.fillStyle = '#5cc0ec'; roundRect(c, px, pz, pw, ph, Math.min(pw, ph) / 2.2); c.fill();
    });
    c.fillStyle = '#a7adb6';
    roadsX.forEach((x) => c.fillRect(toC(x - RW / 2), 0, RW * CK, CS));
    roadsZ.forEach((z) => c.fillRect(0, toC(z - RW / 2), CS, RW * CK));
    c.fillStyle = '#8c929c';
    roadsX.forEach((x) => { c.fillRect(toC(x - RW / 2), 0, 2, CS); c.fillRect(toC(x + RW / 2) - 2, 0, 2, CS); });
    roadsZ.forEach((z) => { c.fillRect(0, toC(z - RW / 2), CS, 2); c.fillRect(0, toC(z + RW / 2) - 2, CS, 2); });
    c.fillStyle = '#ffffff';
    roadsX.forEach((x) => { for (let z = -CH; z < CH; z += 10) c.fillRect(toC(x) - 1, toC(z), 2, 5 * CK); });
    roadsZ.forEach((z) => { for (let x = -CH; x < CH; x += 10) c.fillRect(toC(x), toC(z) - 1, 5 * CK, 2); });
  });
  cityTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cityPlane = new T.Mesh(new T.PlaneGeometry(CH * 2, CH * 2),
    new T.MeshLambertMaterial({ map: cityTex, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  cityPlane.rotation.x = -PI / 2;
  cityPlane.position.y = 0.06;
  cityPlane.receiveShadow = true;
  scene.add(cityPlane);

  // town objects (one draw call per kind)
  const town = new T.Group();
  scene.add(town);
  const m4 = new T.Matrix4(), col = new T.Color();
  const houseTex = canvasTex(64, 64, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#7fc0ea'; c.fillRect(9, 16, 14, 14); c.fillRect(41, 16, 14, 14);
    c.fillStyle = '#ffffff'; c.fillRect(15, 16, 2, 14); c.fillRect(9, 22, 14, 2); c.fillRect(47, 16, 2, 14); c.fillRect(41, 22, 14, 2);
    c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(0, 56, 64, 8);
  });
  const wallGeo = new T.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
  const hSide = new T.MeshLambertMaterial({ map: houseTex }), hTop = new T.MeshLambertMaterial({ color: 0xffffff });
  const hMesh = new T.InstancedMesh(wallGeo, [hSide, hSide, hTop, hTop, hSide, hSide], houses.length);
  const roofGeo = new T.BufferGeometry();
  roofGeo.setAttribute('position', new T.Float32BufferAttribute([
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0
  ], 3));
  roofGeo.computeVertexNormals();
  const roofI = new T.InstancedMesh(roofGeo, new T.MeshLambertMaterial({ color: 0xffffff }), houses.length);
  houses.forEach((hs, i) => {
    hMesh.setMatrixAt(i, m4.compose(_p.set(hs.x, 0, hs.z), _q.identity(), _s.set(hs.w, hs.h, hs.d)));
    hMesh.setColorAt(i, col.set(hs.wall));
    const along = hs.w >= hs.d, rh = Math.min(hs.w, hs.d) * 0.5;
    _q.setFromEuler(_e.set(0, along ? 0 : PI / 2, 0));
    roofI.setMatrixAt(i, m4.compose(_p.set(hs.x, hs.h, hs.z), _q, _s.set((along ? hs.w : hs.d) + 0.9, rh, (along ? hs.d : hs.w) + 0.9)));
    roofI.setColorAt(i, col.set(hs.roof));
  });
  hMesh.castShadow = hMesh.receiveShadow = roofI.castShadow = true;
  town.add(hMesh, roofI);

  // park and pond-side trees
  const treeSpots = [];
  parks.forEach((p) => { const n = 3 + Math.floor(R() * 3); for (let k = 0; k < n; k++) treeSpots.push([p[0] + (R() - 0.5) * (p[2] - 8), p[1] + (R() - 0.5) * (p[3] - 8), 2.4 + R() * 1.4]); });
  ponds.forEach((p) => { for (let k = 0; k < 2; k++) treeSpots.push([p[0] + (k ? 1 : -1) * (p[2] / 2 - 2), p[1] + (R() - 0.5) * (p[3] - 6), 2 + R()]); });
  houses.forEach((hs) => { if (R() < 0.5) treeSpots.push([hs.x + hs.w / 2 + 2.2, hs.z + hs.d / 2 + 1.5, 1.6 + R() * 0.8]); });
  const trunkI = new T.InstancedMesh(CYL8, mat('#9a6a3e'), treeSpots.length);
  const crownI = new T.InstancedMesh(ICO2, new T.MeshLambertMaterial({ color: 0xffffff }), treeSpots.length);
  const GREENS = ['#4cbb4a', '#5cc957', '#3fae4a', '#6fd04f'];
  treeSpots.forEach((t, i) => {
    trunkI.setMatrixAt(i, m4.compose(_p.set(t[0], 1.6, t[1]), _q.identity(), _s.set(0.5, 3.2, 0.5)));
    crownI.setMatrixAt(i, m4.compose(_p.set(t[0], 3.4 + t[2], t[1]), _q.identity(), _s.set(t[2], t[2] * 1.05, t[2])));
    crownI.setColorAt(i, col.set(GREENS[i % GREENS.length]));
  });
  trunkI.castShadow = crownI.castShadow = true;
  town.add(trunkI, crownI);

  // windmills by the fields (blades turn)
  const millBlades = [];
  mills.forEach((m) => {
    const g = new T.Group(); g.position.set(m[0], 0, m[1]); g.rotation.y = m[2];
    const tower = new T.Mesh(new T.CylinderGeometry(1.1, 1.8, 10, 8), mat('#fff3df')); tower.position.y = 5; tower.castShadow = true;
    const cap = new T.Mesh(new T.ConeGeometry(1.6, 2.4, 8), mat('#e4553f')); cap.position.y = 11.2;
    const door = new T.Mesh(BOX, mat('#9a6a3e')); door.scale.set(1, 2, 0.2); door.position.set(0, 1, 1.75);
    const hub = new T.Group(); hub.position.set(0, 9.6, 1.5);
    for (let k = 0; k < 4; k++) {
      const arm = new T.Group(); arm.rotation.z = k * PI / 2;
      const spar = new T.Mesh(BOX, mat('#9a6a3e')); spar.scale.set(0.3, 6.5, 0.2); spar.position.y = 3.25;
      const sail = new T.Mesh(BOX, mat('#fffaf0')); sail.scale.set(1.3, 4.6, 0.12); sail.position.set(0.75, 4, 0);
      arm.add(spar, sail); hub.add(arm);
    }
    g.add(tower, cap, door, hub); town.add(g); millBlades.push(hub);
  });

  // ---------------------------------------------------------------- the office (local coords)
  const office = new T.Group();
  office.position.set(OX, 0, OZ);
  scene.add(office);
  const ob = new Builder();
  const WOOD = '#b9844f', WOODTOP = '#d29a62', CHAIR = '#3b5fa8', DARK = '#2e3440', WHITE = '#f2f2f2';

  ob.box('#c9c2b5', -0.6, 84.6, 0, FY - 0.12, -0.6, 56.6);
  [[0, 48, 0, 26, '#d9b48a'], [48, 84, 0, 14, '#c9d5e3'], [48, 84, 14, 26, '#efe2cd'], [0, 84, 26, 31, '#d7cfc2'],
   [0, 26, 31, 56, '#a9d9ba'], [26, 54, 31, 56, '#f2d2a6'], [54, 84, 31, 43, '#d3c8e8'], [54, 84, 43, 56, '#e9dcc4']]
    .forEach((r) => ob.box(r[4], r[0], r[1], FY - 0.12, FY, r[2], r[3]));
  ob.box('#e7c9a0', 3, 45, FY, FY + 0.06, 16.2, 25.4);
  ob.cyl('#8fcaa4', 10, 40, 6, FY, FY + 0.06);

  function chair(b, cx, cz, yaw, color) {
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    b.box(color || CHAIR, cx - 1, cx + 1, FY, SEAT, cz - 1, cz + 1);
    const bx2 = cx - dx * 0.85, bz2 = cz - dz * 0.85;
    const hw = Math.abs(dz) > 0.5 ? 1 : 0.2, hd = Math.abs(dz) > 0.5 ? 0.2 : 1;
    b.box(color || CHAIR, bx2 - hw, bx2 + hw, SEAT, SEAT + 2.1, bz2 - hd, bz2 + hd);
  }
  function stool(b, cx, cz, color) { b.cyl(color || '#ff8a4c', cx, cz, 0.85, FY, SEAT, null, null, CYL8); }
  function table(b, x0, x1, z0, z1, h, top) {
    b.box(top || WOODTOP, x0, x1, h - 0.3, h, z0, z1);
    b.box(WOOD, x0 + 0.2, x0 + 0.6, FY, h - 0.3, z0 + 0.2, z1 - 0.2);
    b.box(WOOD, x1 - 0.6, x1 - 0.2, FY, h - 0.3, z0 + 0.2, z1 - 0.2);
  }
  function monitor(b, cx, cz, facesNorth) {
    b.box(DARK, cx - 1.3, cx + 1.3, 2.9, 4.5, cz - 0.12, cz + 0.12);
    b.box('#5fa8ff', cx - 1.15, cx + 1.15, 3.05, 4.35, facesNorth ? cz - 0.14 : cz + 0.12, facesNorth ? cz - 0.12 : cz + 0.14);
    b.box(DARK, cx - 0.2, cx + 0.2, 2.6, 2.9, cz - 0.1, cz + 0.1);
  }
  function plant(b, cx, cz) {
    b.cyl('#e8743b', cx, cz, 0.75, FY, FY + 1.3, null, null, CYL8);
    b.add(ICO, '#3fa34d', cx, FY + 2.3, cz, 1.2, 1.3, 1.2);
  }

  // workspace pods: 3 pods x 2 rows x 2 desks
  for (let p = 0; p < 3; p++) {
    for (let row = 0; row < 2; row++) {
      for (let c = 0; c < 2; c++) {
        const cx = 6 + 15 * p + 6 * c;
        const z0 = row === 0 ? 6 : 9, z1 = z0 + 3;
        table(ob, cx - 3, cx + 3, z0, z1, 2.6);
        monitor(ob, cx, row === 0 ? 8.4 : 9.6, row === 0);
        chair(ob, cx, row === 0 ? 4.6 : 13.4, row === 0 ? 0 : PI);
      }
    }
  }
  // huddle zone
  ob.cyl(WOODTOP, 9, 21, 2.6, 2.3, 2.6);
  ob.cyl(WOOD, 9, 21, 0.4, FY, 2.3, null, null, CYL8);
  [[9, 17.4], [9, 24.6], [5.4, 21], [12.6, 21]].forEach((s) => stool(ob, s[0], s[1], CHAIR));
  table(ob, 20, 28, 19, 21.5, 3.6);
  ob.box('#dfe3e8', 42.5, 46, FY, 2.8, 17, 19.6);
  ob.box('#aab2bd', 42.8, 45.7, 2.8, 3.0, 17.3, 19.3);
  ob.box(WOOD, 46.5, 47.7, FY, 6.2, 15, 25);
  ['#c4281c', '#0d69ac', '#f5cd30', '#4b974b', '#6b327c'].forEach((cc, i) => ob.box(cc, 46.3, 46.6, 1 + i * 1, 1.8 + i * 1, 15.5 + i * 1.6, 17 + i * 1.6));
  plant(ob, 2.2, 2.2); plant(ob, 45.8, 2.2); plant(ob, 2.2, 14.8); plant(ob, 45.8, 24.4);
  // meeting room
  ob.box(WOODTOP, 60, 72, 2.3, 2.6, 4.5, 9.5);
  ob.cyl(WOODTOP, 60, 7, 2.5, 2.3, 2.6);
  ob.cyl(WOODTOP, 72, 7, 2.5, 2.3, 2.6);
  ob.box(WOOD, 62, 70, FY, 2.3, 6.2, 7.8);
  [60, 66, 72].forEach((x) => { chair(ob, x, 2.6, 0, '#5b6b8c'); chair(ob, x, 11.4, PI, '#5b6b8c'); });
  chair(ob, 55.2, 7, PI / 2, '#5b6b8c'); chair(ob, 76.8, 7, -PI / 2, '#5b6b8c');
  plant(ob, 50.5, 12);
  // coffee room
  ob.box(WOOD, 80.6, 83.7, FY, 3.0, 15, 25);
  ob.box('#e8e4dc', 80.4, 83.8, 3.0, 3.3, 14.8, 25.2);
  ob.box(DARK, 81.1, 83.4, 3.3, 5.5, 16, 18.6);
  ob.box('#ff4a3d', 81.0, 81.1, 4.9, 5.2, 16.6, 17);
  ob.cyl(WHITE, 81.8, 20.2, 0.32, 3.3, 3.9, null, null, CYL8);
  ob.cyl(WHITE, 82.6, 21.1, 0.32, 3.3, 3.9, null, null, CYL8);
  ob.box('#c9d1db', 81.4, 83.2, 3.3, 4.6, 22.6, 24.4);
  ob.cyl(WHITE, 64, 20, 1.8, 3.4, 3.7);
  ob.cyl('#9aa3ad', 64, 20, 0.25, FY, 3.4, null, null, CYL8);
  stool(ob, 64, 17.2, CHAIR); stool(ob, 66.8, 20, CHAIR);
  plant(ob, 50.5, 24.2);
  // break room
  ob.box('#3d7fd6', 1, 10, FY, SEAT, 32, 35.2); ob.box('#2f63ad', 1, 10, SEAT, 3.8, 32, 32.9);
  ob.box('#3d7fd6', 1, 4.2, FY, SEAT, 32, 44); ob.box('#2f63ad', 1, 1.9, SEAT, 3.8, 32, 44);
  table(ob, 7, 12, 38, 41, 1.6);
  ob.box(DARK, 25.2, 25.6, 2.6, 6.6, 36, 44);
  ob.box('#7dd3fc', 25.1, 25.2, 2.9, 6.3, 36.3, 43.7);
  ob.box('#3b4252', 23.6, 25.4, FY, 1.2, 38.5, 41.5);
  ob.add(ICO, '#ffc93c', 20.5, FY + 0.9, 36.5, 1.6, 1.1, 1.6);
  ob.add(ICO, '#b48ae0', 20.5, FY + 0.9, 46, 1.6, 1.1, 1.6);
  ob.box('#1f9d61', 8.5, 17.5, 2.3, 2.6, 48.5, 53.5);
  ob.box(WHITE, 8.5, 17.5, 2.6, 2.62, 50.92, 51.08);
  ob.box(WHITE, 12.9, 13.1, 2.6, 3.2, 48.3, 53.7);
  ob.box(DARK, 9, 9.5, FY, 2.3, 49, 53); ob.box(DARK, 16.5, 17, FY, 2.3, 49, 53);
  plant(ob, 24, 54); plant(ob, 2.2, 54);
  // lunch room
  table(ob, 30, 48, 36, 39, 2.6); table(ob, 30, 48, 44, 47, 2.6);
  [32, 36, 40, 44].forEach((x) => { stool(ob, x, 34.6); stool(ob, x, 40.4); stool(ob, x, 42.6); stool(ob, x, 48.4); });
  ob.cyl(WHITE, 36, 37, 0.7, 2.6, 2.7); ob.box('#ff6b5e', 35.6, 36.4, 2.7, 3.0, 36.6, 37.4);
  ob.cyl(WHITE, 44, 46, 0.7, 2.6, 2.7); ob.box('#69db7c', 43.6, 44.4, 2.7, 3.0, 45.6, 46.4);
  ob.box(WOOD, 28, 46, FY, 3.0, 53.2, 55.7); ob.box('#e8e4dc', 27.8, 46.2, 3.0, 3.3, 53, 55.8);
  ob.box('#aab2bd', 31, 34, 3.25, 3.35, 53.6, 55.2);
  ob.box(DARK, 38, 40.4, 3.3, 4.8, 53.5, 55.4);
  ob.box('#eef1f4', 48.5, 52, FY, 6.8, 52.6, 55.7);
  ob.box('#aab2bd', 51.9, 52.05, 3.2, 6, 53, 53.3);
  // manager office
  table(ob, 70, 78, 34, 37, 2.8, '#8a5a3c');
  monitor(ob, 74, 34.9, false);
  chair(ob, 74, 39.4, PI, '#2f3542');
  plant(ob, 82, 33); plant(ob, 82, 41);
  // reception
  ob.box('#8a5a3c', 62, 72, FY, 3.0, 47, 49.5); ob.box('#e8e4dc', 61.8, 72.2, 3.0, 3.3, 46.8, 49.7);
  monitor(ob, 67, 47.6, false);
  [58, 61, 64].forEach((x) => chair(ob, x, 54.4, PI, '#3d7fd6'));
  ob.box('#c4281c', 82.2, 83.8, FY, FY + 0.05, 47.5, 51.5);
  plant(ob, 82, 54.6); plant(ob, 56, 45);
  ob.build(office);

  // status screen (manager office wall) + company plate
  // standing boards in the office: task board, assigned board, weekly goals, reports (double-sided, clickable)
  const clickables = [];
  const boardLabels = [];
  const fb = new Builder();
  function boardLabel(text, wx, wz, open) {
    const tex = canvasTex(512, 96, (c) => {
      c.font = '700 40px Fredoka, sans-serif';
      const w = Math.min(500, c.measureText(text).width + 110), x = (512 - w) / 2;
      c.fillStyle = '#ffd23f'; roundRect(c, x, 10, w, 76, 38); c.fill(); c.lineWidth = 6; c.strokeStyle = '#1f2a44'; c.stroke();
      c.fillStyle = '#1f2a44'; roundRect(c, x + 16, 28, 40, 40, 10); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x + 31, 38); c.lineTo(x + 41, 48); c.lineTo(x + 31, 58); c.stroke();
      c.fillStyle = '#1f2a44'; c.textBaseline = 'middle'; c.fillText(text, x + 70, 50);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(13, 2.45, 1); s.renderOrder = 16; s.position.set(wx, 10.2, wz); s.userData.open = open;
    scene.add(s); clickables.push(s); boardLabels.push(s);
  }
  function board(label, cx, cz, alongX, w, open) {
    const TW = 512, TH = 300, h = w * TH / TW, y0 = 2.6, y1 = y0 + h;
    const leg = (px, pz) => fb.box('#6b7380', px - 0.15, px + 0.15, FY, y0, pz - 0.15, pz + 0.15);
    if (alongX) {
      fb.box(DARK, cx - w / 2 - 0.25, cx + w / 2 + 0.25, y0 - 0.25, y1 + 0.25, cz - 0.12, cz + 0.12);
      [-1, 1].forEach((sg) => { const px = cx + sg * (w / 2 + 0.05); leg(px, cz); fb.box('#6b7380', px - 0.2, px + 0.2, FY, FY + 0.2, cz - 1, cz + 1); });
    } else {
      fb.box(DARK, cx - 0.12, cx + 0.12, y0 - 0.25, y1 + 0.25, cz - w / 2 - 0.25, cz + w / 2 + 0.25);
      [-1, 1].forEach((sg) => { const pz = cz + sg * (w / 2 + 0.05); leg(cx, pz); fb.box('#6b7380', cx - 1, cx + 1, FY, FY + 0.2, pz - 0.2, pz + 0.2); });
    }
    const tex = canvasTex(TW, TH, () => {});
    const m = new T.MeshBasicMaterial({ map: tex });
    const geo = new T.PlaneGeometry(w, h);
    const g = new T.Group();
    const front = new T.Mesh(geo, m), back = new T.Mesh(geo, m);
    front.position.z = 0.14; back.position.z = -0.14; back.rotation.y = PI;
    front.userData.open = back.userData.open = open;
    g.add(front, back);
    g.position.set(cx, (y0 + y1) / 2, cz);
    if (!alongX) g.rotation.y = PI / 2;
    office.add(g);
    clickables.push(front, back);
    boardLabel(label, cx + OX, cz + OZ, open);
    return tex;
  }
  const boardTex = {
    tasks: board('Task board', 3.0, 19.5, false, 7, 'tasks'),
    assigned: board('Assigned', 32, 23.4, true, 7, 'assigned'),
    goals: board('Weekly goals', 80.4, 7, false, 7, 'goals'),
    reports: board('Reports', 57.6, 37, false, 6, 'reports')
  };
  fb.build(office);
  const plate = new T.Mesh(new T.PlaneGeometry(9, 1.8), new T.MeshBasicMaterial({ map: canvasTex(512, 102, (c) => {
    c.fillStyle = '#2f3a56'; roundRect(c, 0, 0, 512, 102, 18); c.fill();
    c.fillStyle = '#ffffff'; c.font = '700 50px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('[YOUR COMPANY]', 256, 54);
  }), transparent: true }));
  plate.position.set(67, 5.4, 43.33);
  office.add(plate);

  // walls: full and cutaway versions
  const WALLS = [[0, 0, 84, 0], [0, 0, 0, 56], [0, 56, 84, 56], [84, 0, 84, 47], [84, 52, 84, 56],
    [48, 0, 48, 4], [48, 9, 48, 26], [0, 26, 20, 26], [25, 26, 36, 26], [41, 26, 60, 26], [65, 26, 84, 26],
    [0, 31, 10, 31], [15, 31, 36, 31], [41, 31, 62, 31], [67, 31, 84, 31], [26, 31, 26, 56],
    [54, 31, 54, 46], [54, 51, 54, 56], [54, 43, 76, 43], [81, 43, 84, 43]];
  const GLASS = [[48, 14, 74, 14], [79, 14, 84, 14]];
  const GLASSM = { transparent: true, opacity: 0.32, depthWrite: false };
  function buildWalls(h) {
    const g = new T.Group(), b = new Builder();
    const seg = (s, color, opts, top) => {
      const [x0, z0, x1, z1] = s;
      if (z0 === z1) b.box(color, x0 - 0.3, x1 + 0.3, FY, top, z0 - 0.3, z0 + 0.3, null, opts);
      else b.box(color, x0 - 0.3, x0 + 0.3, FY, top, z0 - 0.3, z1 + 0.3, null, opts);
    };
    WALLS.forEach((s) => { seg(s, '#fff4e0', null, h - 0.45); seg(s, '#d9734e', null, h); });
    GLASS.forEach((s) => { seg(s, '#9fd4ff', GLASSM, h - 0.2); });
    b.build(g);
    // door frames around entrance
    const f = new Builder();
    f.box('#6b7380', 83.6, 84.4, FY, Math.min(h, 7.5), 46.6, 47.2);
    f.box('#6b7380', 83.6, 84.4, FY, Math.min(h, 7.5), 51.8, 52.4);
    f.build(g);
    return g;
  }
  const wallsFull = buildWalls(10), wallsCut = buildWalls(2.8);
  office.add(wallsFull, wallsCut);

  // ---------------------------------------------------------------- the lot (world coords)
  const lb = new Builder();
  lb.box('#7a828e', 28, 58, 0, 0.12, -26, 34);
  for (let r = 0; r <= 9; r++) lb.box(WHITE, 29, 38, 0.12, 0.18, -23 + 5.5 * r - 0.12, -23 + 5.5 * r + 0.12);
  for (let r = 0; r <= 10; r++) lb.box(WHITE, 46, 55, 0.12, 0.18, -23 + 5.5 * r - 0.12, -23 + 5.5 * r + 0.12);
  for (let z = -24; z < 25; z += 4) lb.box('#f5cd30', 41.85, 42.15, 0.12, 0.18, z, z + 2);
  for (let x = 28.6; x < 38; x += 2) lb.box(WHITE, x, x + 1, 0.12, 0.18, 27, 31.5);
  lb.box('#d8d3c7', 22, 28, 0, 0.14, 21, 34);
  lb.box('#d8d3c7', -64, 28, 0, 0.14, 34.6, 37);
  lb.box('#d8d3c7', 22, 28, 0, 0.14, -26, 21);
  lb.cyl('#d8d3c7', -20, 42, 9.5, 0, 0.22);
  // fountain
  lb.cyl('#c8ccd2', -20, 42, 6, 0, 1.2);
  lb.cyl('#4fb3ff', -20, 42, 5.4, 1.2, 1.25);
  lb.cyl('#c8ccd2', -20, 42, 0.8, 1.2, 3.6, null, null, CYL8);
  lb.cyl('#c8ccd2', -20, 42, 2, 3.6, 4.0);
  lb.cyl('#4fb3ff', -20, 42, 1.7, 4.0, 4.05);
  // benches
  [[-20, 32.2, 0], [-20, 51.8, 0], [-31.5, 42, 1], [-8.5, 42, 1]].forEach((bn) => {
    const [x, z, v] = bn;
    if (v) { lb.box('#a0683b', x - 0.7, x + 0.7, 1.1, 1.5, z - 2.2, z + 2.2); lb.box(DARK, x - 0.5, x + 0.5, 0, 1.1, z - 1.8, z - 1.4); lb.box(DARK, x - 0.5, x + 0.5, 0, 1.1, z + 1.4, z + 1.8); }
    else { lb.box('#a0683b', x - 2.2, x + 2.2, 1.1, 1.5, z - 0.7, z + 0.7); lb.box(DARK, x - 1.8, x - 1.4, 0, 1.1, z - 0.5, z + 0.5); lb.box(DARK, x + 1.4, x + 1.8, 0, 1.1, z - 0.5, z + 0.5); }
  });
  // hedges with gaps for the driveway and paths
  const HEDGE = '#3fae4a';
  lb.box(HEDGE, -70, 21, 0, 1.8, -25.6, -24.6);
  lb.box(HEDGE, 47, 62, 0, 1.8, -25.6, -24.6);
  lb.box(HEDGE, -70, -69, 0, 1.8, -24.6, 48);
  lb.box(HEDGE, 61, 62, 0, 1.8, -24.6, 48);
  lb.box(HEDGE, -70, -23, 0, 1.8, 47, 48);
  lb.box(HEDGE, -17, 61, 0, 1.8, 47, 48);
  // trees
  function tree(x, z, kind, s) {
    s = s || 1;
    lb.box('#8b5a2b', x - 0.5 * s, x + 0.5 * s, 0, 4.5 * s, z - 0.5 * s, z + 0.5 * s);
    if (kind === 'block') { lb.box('#4cbb4a', x - 2.6 * s, x + 2.6 * s, 4 * s, 8 * s, z - 2.6 * s, z + 2.6 * s); lb.box('#6fd04f', x - 1.6 * s, x + 1.6 * s, 8 * s, 10 * s, z - 1.6 * s, z + 1.6 * s); }
    else if (kind === 'pine') { lb.add(CONE, '#2d8f55', x, 7 * s, z, 3 * s, 6 * s, 3 * s); lb.add(CONE, '#3aa864', x, 10.2 * s, z, 2.2 * s, 4.4 * s, 2.2 * s); }
    else lb.add(ICO2, '#4cbb4a', x, 6.4 * s, z, 3.3 * s, 3.2 * s, 3.3 * s);
  }
  [-18, -6, 6, 18, 30].forEach((z, i) => tree(-66, z, i % 2 ? 'pine' : 'round'));
  [-58, -46, -34, -6, 8].forEach((x, i) => tree(x, 43.5, ['block', 'round', 'pine', 'round', 'block'][i]));
  tree(-27, 36.6 + 3, 'round', 0.7); tree(-13, 39.6, 'round', 0.7);
  [-15, 0, 12].forEach((z) => tree(59.6, z, 'pine', 0.7));
  [24, 35].forEach((z, i) => tree(25, z + 6, i ? 'round' : 'block', 0.7));
  // lamps
  function lamp(x, z) {
    lb.box('#3b4252', x - 0.2, x + 0.2, 0, 7, z - 0.2, z + 0.2);
    lb.box('#3b4252', x - 0.7, x + 0.7, 7, 7.4, z - 0.7, z + 0.7);
    lb.box('#ffe7a3', x - 0.55, x + 0.55, 6.6, 7.0, z - 0.55, z + 0.55, null, { emissive: '#8a6a1f' });
  }
  [[27, 22], [27, 33], [38.6, -18], [38.6, 4], [38.6, 20], [45.4, -8], [45.4, 14], [-30, 36], [-10, 36], [10, 36]].forEach((l) => lamp(l[0], l[1]));
  // EV chargers
  [9, 10].forEach((r) => { const z = -20.25 + 5.5 * r; lb.box('#38c9b0', 55.2, 56, 0, 3, z - 0.6, z + 0.6); lb.box('#0b5f53', 55.15, 55.2, 1.6, 2.6, z - 0.4, z + 0.4); });
  // gate booth + monument sign
  lb.box('#ffb020', 47.5, 50, 0, 3.4, -24.4, -22.4); lb.box(DARK, 47.3, 50.2, 3.4, 3.8, -24.6, -22.2);
  lb.box('#2f3a56', 0, 16, 0, 4.8, 43.2, 44.4);
  lb.box('#ffd23f', -0.2, 16.2, 4.8, 5.2, 43.0, 44.6);

  // parked cars (static, merged)
  function carParts(b, base, color) {
    b.box(color, -2, 2, 0.6, 2.0, -4, 4, base);
    b.box('#a9d6f0', -1.8, 1.8, 2.0, 3.4, -2.4, 1.6, base);
    b.box(color, -1.9, 1.9, 3.4, 3.7, -2.5, 1.7, base);
    [[-2.05, -2.6], [2.05, -2.6], [-2.05, 2.6], [2.05, 2.6]].forEach((w) => b.add(CYL8, '#23262c', w[0], 0.75, w[1], 0.75, 0.5, 0.75, 0, 0, PI / 2, base));
    b.box('#fff3b0', -1.6, -0.8, 1.3, 1.7, 3.95, 4.06, base); b.box('#fff3b0', 0.8, 1.6, 1.3, 1.7, 3.95, 4.06, base);
    b.box('#ff4a3d', -1.6, -0.8, 1.3, 1.7, -4.06, -3.95, base); b.box('#ff4a3d', 0.8, 1.6, 1.3, 1.7, -4.06, -3.95, base);
  }
  const CARCOL = ['#c4281c', '#f2f3f3', '#0d69ac', '#f5cd30', '#4b974b', '#1b2a35', '#da8541', '#6b327c', '#a3a2a5', '#00a2ff', '#e8bac8', '#c4281c', '#f2f3f3'];
  let cc = 0;
  [0, 1, 3, 4, 6, 7].forEach((r) => carParts(lb, new T.Matrix4().makeRotationY(PI / 2).setPosition(33.5, 0, -20.25 + 5.5 * r), CARCOL[cc++]));
  [0, 1, 3, 5, 6, 8, 10].forEach((r) => carParts(lb, new T.Matrix4().makeRotationY(-PI / 2).setPosition(50.5, 0, -20.25 + 5.5 * r), CARCOL[cc++]));
  lb.build(scene);

  const signText = new T.Mesh(new T.PlaneGeometry(15, 3.6), new T.MeshBasicMaterial({ map: canvasTex(640, 154, (c) => {
    c.fillStyle = '#2f3a56'; c.fillRect(0, 0, 640, 154);
    c.fillStyle = '#ffffff'; c.font = '800 92px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('AGENT HQ', 320, 82);
  }) }));
  signText.position.set(8, 2.4, 44.42);
  scene.add(signText);

  // ---------------------------------------------------------------- moving cars
  function makeCar(color) {
    const g = new T.Group();
    const add = (geo, c, x, y, z, sx, sy, sz, rz) => { const m = new T.Mesh(geo, mat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (rz) m.rotation.z = rz; m.castShadow = true; g.add(m); return m; };
    add(BOX, color, 0, 1.3, 0, 4, 1.4, 8);
    add(BOX, '#a9d6f0', 0, 2.7, -0.4, 3.6, 1.4, 4);
    add(BOX, color, 0, 3.55, -0.4, 3.8, 0.3, 4.2);
    [[-2.05, -2.6], [2.05, -2.6], [-2.05, 2.6], [2.05, 2.6]].forEach((w) => add(CYL8, '#23262c', w[0], 0.75, w[1], 0.75, 0.5, 0.75, PI / 2));
    add(BOX, '#fff3b0', -1.2, 1.5, 4.0, 0.8, 0.4, 0.12); add(BOX, '#fff3b0', 1.2, 1.5, 4.0, 0.8, 0.4, 0.12);
    add(BOX, '#ff4a3d', -1.2, 1.5, -4.0, 0.8, 0.4, 0.12); add(BOX, '#ff4a3d', 1.2, 1.5, -4.0, 0.8, 0.4, 0.12);
    scene.add(g);
    return g;
  }
  const traffic = [
    ['#c4281c', 'x', -28, 1, 11, 0], ['#f5cd30', 'x', -28, 1, 12, 220], ['#f2f3f3', 'x', -28, 1, 10, 430],
    ['#0d69ac', 'x', -32, -1, 11.5, 90], ['#4b974b', 'x', -32, -1, 10.5, 330], ['#6b327c', 'x', -32, -1, 12, 540],
    ['#da8541', 'z', 68, -1, 11, 50], ['#1b2a35', 'z', 64, 1, 10, 260], ['#00a2ff', 'x', 54, 1, 11, 150], ['#e8bac8', 'x', 50, -1, 10, 400]
  ].map((t) => ({ car: makeCar(t[0]), axis: t[1], lane: t[2], dir: t[3], speed: t[4], s: t[5] }));
  const SPAN = 680;

  // ---------------------------------------------------------------- chibi townsfolk
  const ringGeo = new T.RingGeometry(1.45, 1.85, 28);
  const blobTex = canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(30,40,20,.35)'); g.addColorStop(1, 'rgba(30,40,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
  const blobMat = new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const blobGeo = new T.PlaneGeometry(3.2, 3.2);
  const LEG = new T.CylinderGeometry(0.3, 0.26, 0.85, 8); LEG.translate(0, -0.425, 0);
  const ARM = new T.CylinderGeometry(0.24, 0.2, 1.0, 8); ARM.translate(0, -0.5, 0);
  const HAND = new T.SphereGeometry(0.27, 8, 6);
  const SHOE = new T.SphereGeometry(0.34, 8, 6);
  const BODY = new T.CylinderGeometry(0.72, 0.95, 1.5, 12);
  const HEADG = new T.SphereGeometry(1, 18, 12);
  const HAIR_TOP = new T.SphereGeometry(1.07, 18, 8, 0, PI * 2, 0, PI * 0.36);
  const HAIR_BACK = new T.SphereGeometry(1.05, 18, 10, PI, PI, 0, PI * 0.6);
  const HAIR_LONG = new T.SphereGeometry(1.05, 18, 12, PI * 0.92, PI * 1.16, 0, PI * 0.8);
  const hitMat = new T.MeshBasicMaterial({ visible: false });
  const HIT = new T.BoxGeometry(2.6, 5.2, 2.6);

  // face painted onto the round head (front of the sphere is u = 0.25)
  function headTexture(skin) {
    return canvasTex(256, 128, (c) => {
      c.fillStyle = skin; c.fillRect(0, 0, 256, 128);
      c.fillStyle = '#2a2230';
      c.beginPath(); c.ellipse(52, 70, 5, 8, 0, 0, PI * 2); c.fill();
      c.beginPath(); c.ellipse(76, 70, 5, 8, 0, 0, PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(53.5, 66.5, 1.8, 0, PI * 2); c.fill();
      c.beginPath(); c.arc(77.5, 66.5, 1.8, 0, PI * 2); c.fill();
      c.fillStyle = 'rgba(255,110,110,.45)';
      c.beginPath(); c.ellipse(42, 82, 6, 3.5, 0, 0, PI * 2); c.fill();
      c.beginPath(); c.ellipse(86, 82, 6, 3.5, 0, 0, PI * 2); c.fill();
      c.strokeStyle = '#2a2230'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.arc(64, 80, 7, PI * 0.2, PI * 0.8); c.stroke();
    });
  }
  function tagTexture(name, color) {
    return canvasTex(256, 64, (c) => {
      c.font = '600 30px Fredoka, sans-serif';
      const w = Math.min(248, c.measureText(name).width + 60), x = (256 - w) / 2;
      c.fillStyle = '#fffaf0'; roundRect(c, x, 6, w, 52, 26); c.fill();
      c.lineWidth = 4; c.strokeStyle = '#1f2a44'; c.stroke();
      c.fillStyle = color; c.beginPath(); c.arc(x + 26, 32, 10, 0, PI * 2); c.fill();
      c.lineWidth = 3; c.stroke();
      c.fillStyle = '#1f2a44'; c.textBaseline = 'middle'; c.fillText(name, x + 44, 33);
    });
  }

  function makePerson(spec) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const mats = {
      shirt: new T.MeshLambertMaterial({ color: spec.shirt }),
      pants: new T.MeshLambertMaterial({ color: spec.pants }),
      skin: new T.MeshLambertMaterial({ color: spec.skin }),
      hair: new T.MeshLambertMaterial({ color: spec.hair }),
      head: new T.MeshLambertMaterial({ map: headTexture(spec.skin) }),
      shoe: new T.MeshLambertMaterial({ color: '#4a3a2e' })
    };
    const mk = (geo, m, x, y, z, parent) => { const mesh = new T.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; (parent || body).add(mesh); return mesh; };
    const legL = mk(LEG, mats.pants, -0.38, 1.1, 0), legR = mk(LEG, mats.pants, 0.38, 1.1, 0);
    mk(SHOE, mats.shoe, 0, -0.8, 0.12, legL); mk(SHOE, mats.shoe, 0, -0.8, 0.12, legR);
    mk(BODY, mats.shirt, 0, 1.75, 0);
    const armL = mk(ARM, mats.shirt, -0.95, 2.35, 0), armR = mk(ARM, mats.shirt, 0.95, 2.35, 0);
    mk(HAND, mats.skin, 0, -1.05, 0, armL); mk(HAND, mats.skin, 0, -1.05, 0, armR);
    const head = new T.Group(); head.position.set(0, 3.45, 0); body.add(head);
    mk(HEADG, mats.head, 0, 0, 0, head);
    mk(HAIR_TOP, mats.hair, 0, 0, 0, head);
    mk(spec.hairStyle === 'long' ? HAIR_LONG : HAIR_BACK, mats.hair, 0, 0, 0, head);
    const cup = new T.Mesh(new T.CylinderGeometry(0.3, 0.26, 0.55, 8), mat('#ffffff'));
    cup.position.set(0, -1.2, 0.3); cup.visible = false; armR.add(cup);
    const paddle = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.12, 12), mat('#e4553f'));
    paddle.position.set(0, -1.5, 0.2); paddle.rotation.x = PI / 2; paddle.visible = false; armR.add(paddle);
    const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: spec.ringColor || '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -PI / 2; ring.position.y = 0.26; root.add(ring);
    const blob = new T.Mesh(blobGeo, blobMat); blob.rotation.x = -PI / 2; blob.position.y = 0.24; root.add(blob);
    const tagMat = new T.SpriteMaterial({ map: tagTexture(spec.name, spec.ringColor || '#ffffff'), depthTest: false, transparent: true });
    const tag = new T.Sprite(tagMat); tag.scale.set(5.6, 1.4, 1); tag.position.y = 6.2; tag.renderOrder = 20; root.add(tag);
    const hit = new T.Mesh(HIT, hitMat); hit.position.y = 2.6; root.add(hit);
    scene.add(root);
    return { root, body, head, legL, legR, armL, armR, mats, cup, paddle, ring, tag, tagMat, hit };
  }

  // ---------------------------------------------------------------- paths
  function Path(pts) {
    this.pts = pts.map((p) => new T.Vector2(p[0], p[1]));
    this.seg = []; let L = 0;
    for (let i = 0; i < this.pts.length - 1; i++) { const l = this.pts[i].distanceTo(this.pts[i + 1]); this.seg.push(l); L += l; }
    this.len = L;
  }
  Path.prototype.at = function (d) {
    d = Math.max(0, Math.min(this.len, d));
    for (let i = 0; i < this.seg.length; i++) {
      if (d <= this.seg[i] || i === this.seg.length - 1) {
        const a = this.pts[i], b = this.pts[i + 1], u = this.seg[i] ? Math.min(1, d / this.seg[i]) : 0;
        return { x: a.x + (b.x - a.x) * u, z: a.y + (b.y - a.y) * u, yaw: Math.atan2(b.x - a.x, b.y - a.y) };
      }
      d -= this.seg[i];
    }
    const p = this.pts[this.pts.length - 1]; return { x: p.x, z: p.y, yaw: 0 };
  };
  const W = (p) => [p[0] + OX, p[1] + OZ];
  const kaiOut = new Path([[27, 13.4], [27, 16.6], [38.5, 16.6], [38.5, 28.5], [62.5, 28.5], [62.5, 23.5], [76, 18.4], [78.4, 17.6]].map(W));
  const kaiBack = new Path(kaiOut.pts.slice().reverse().map((v) => [v.x, v.y]));
  const leoWalk = new Path([[17, 31], [21.5, 27.5], [26, 28.5], [31.5, 27.2]]);
  const leoDrive = new Path([[33.5, 23.75], [38.5, 23.75], [41, 22.8], [42, 20.5], [42, -23.5], [42.6, -25.8], [44.5, -27.4], [47, -28], [210, -28]]);
  const maraDrive = new Path([[210, -32], [47, -32], [44.2, -31.3], [42.6, -29.4], [42, -27], [42, -12], [42.7, -10], [44.6, -9.3], [50.5, -9.25]]);
  const maraWalk = new Path([[45.6, -6.6], [43.4, -5], [43.4, 28.6], [29, 29], [21.5, 27.5], [14, 26.5]]);
  const WALK = 5.5, DRIVE = 11;
  const kaiT = { sit1: 8, out: kaiOut.len / WALK, stand: 6, back: kaiBack.len / WALK };
  kaiT.period = kaiT.sit1 + kaiT.out + kaiT.stand + kaiT.back + 7;
  const SCRIPT_P = 54;
  const leoT = { walk0: 1, walk: leoWalk.len / WALK, drive0: 0, drive: leoDrive.len / DRIVE, back: SCRIPT_P - 3 };
  leoT.drive0 = leoT.walk0 + leoT.walk + 1.4;
  const maraT = { drive0: 22, drive: maraDrive.len / DRIVE };
  maraT.walk0 = maraT.drive0 + maraT.drive + 1.0; maraT.walk = maraWalk.len / WALK;
  const leoCar = makeCar('#0d69ac');
  const maraCar = makeCar('#e8bac8');
  if (live) { leoCar.visible = false; maraCar.visible = false; }

  // ---------------------------------------------------------------- people
  const people = AGENTS.map((a, i) => {
    const p = makePerson(Object.assign({ ringColor: STATUS[a.status].color }, a));
    p.a = a; p.i = i;
    p.hit.userData.idx = i;
    if (a.at) { const w = W(a.at); p.root.position.set(w[0], 0, w[1]); p.root.rotation.y = a.yaw; }
    if (a.pose === 'sip') p.cup.visible = true;
    if (a.pose === 'paddle') p.paddle.visible = true;
    return p;
  });
  const manager = makePerson({ name: 'You', shirt: '#1f2a44', pants: '#2f3542', skin: '#e0ac80', hair: '#3b2418', hairStyle: 'short', ringColor: '#ffffff' });
  { const w = W([74, 39.4]); manager.root.position.set(w[0], 0, w[1]); manager.root.rotation.y = PI; }
  manager.hit.userData.open = 'reports';
  clickables.push(manager.hit);

  // zZ sprite for idle people
  const zzMat = new T.SpriteMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = '#ffffff'; c.strokeStyle = '#1f2a44'; c.lineWidth = 6; c.font = '800 46px Fredoka, sans-serif'; c.textAlign = 'center'; c.strokeText('z', 32, 46); c.fillText('z', 32, 46); }), transparent: true, depthTest: false });
  const zz = new T.Sprite(zzMat); zz.scale.set(1.1, 1.1, 1); zz.renderOrder = 21; scene.add(zz);
  // selection arrow
  const arrow = new T.Mesh(new T.ConeGeometry(0.7, 1.2, 4), new T.MeshLambertMaterial({ color: '#ffd23f', emissive: '#6b5200' }));
  arrow.rotation.x = PI; scene.add(arrow);
  // coffee steam + ping-pong ball
  const steam = [0, 1, 2].map(() => { const m = new T.Mesh(BOX, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false })); m.scale.setScalar(0.35); scene.add(m); return m; });
  const ball = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), mat('#ffffff')); scene.add(ball);

  // room labels
  const labelSprites = [];
  function roomLabel(text, color, lx, lz) {
    const tex = canvasTex(512, 96, (c) => {
      c.font = '700 40px Fredoka, sans-serif';
      const w = Math.min(500, c.measureText(text).width + 84), x = (512 - w) / 2;
      c.fillStyle = '#fffaf0'; roundRect(c, x, 10, w, 76, 38); c.fill(); c.lineWidth = 6; c.strokeStyle = '#1f2a44'; c.stroke();
      c.fillStyle = color; roundRect(c, x + 16, 28, 40, 40, 10); c.fill();
      c.fillStyle = '#11151d'; c.textBaseline = 'middle'; c.fillText(text, x + 68, 50);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(15, 2.8, 1); s.renderOrder = 15;
    const w = W([lx, lz]); s.position.set(w[0], 11.5, w[1]);
    scene.add(s); labelSprites.push(s);
  }
  const zoneCount = (z) => AGENTS.filter((a) => a.zone === z).length;
  roomLabel('Workspace · ' + zoneCount('Workspace'), '#3d8bff', 24, 13);
  roomLabel('Meeting · ' + zoneCount('Meeting room'), '#a77bff', 66, 7);
  roomLabel('Coffee · ' + zoneCount('Coffee room'), '#ffb020', 66, 20);
  roomLabel('Break room · ' + zoneCount('Break room'), '#4fd16a', 13, 43);
  roomLabel('Lunch · ' + zoneCount('Lunch room'), '#ff7a3d', 40, 43);
  roomLabel('Manager', '#7c5cff', 69, 37);
  roomLabel('Reception', '#c9a87a', 69, 50);
  (function () {
    const tex = canvasTex(512, 96, (c) => {
      c.font = '700 40px Fredoka, sans-serif'; const text = 'Parking · 17 spaces';
      const w = c.measureText(text).width + 84, x = (512 - w) / 2;
      c.fillStyle = '#fffaf0'; roundRect(c, x, 10, w, 76, 38); c.fill(); c.lineWidth = 6; c.strokeStyle = '#1f2a44'; c.stroke();
      c.fillStyle = '#0d69ac'; roundRect(c, x + 16, 28, 40, 40, 10); c.fill();
      c.fillStyle = '#11151d'; c.textBaseline = 'middle'; c.fillText(text, x + 68, 50);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(15, 2.8, 1); s.position.set(42, 8, 4); s.renderOrder = 15; scene.add(s); return s;
  })();

  // ---------------------------------------------------------------- UI state
  const state = { selected: 0, filter: 'all', follow: false, auto: false, walls: 'cut', quality: 'fast' };
  try { const q = localStorage.getItem('hq3d-quality'); if (q === 'sharp' || q === 'fast') state.quality = q; } catch (e) { /* storage unavailable */ }

  function counts() {
    const c = {};
    Object.keys(STATUS).forEach((k) => { c[k] = 0; });
    AGENTS.forEach((a) => { if (c[a.status] !== undefined) c[a.status]++; });
    return c;
  }
  // statuses worth showing: the ones someone is in right now
  function shownStatuses() { const c = counts(), k = Object.keys(STATUS).filter((s) => c[s] > 0); return k.length ? k : Object.keys(STATUS); }
  const chipsEl = document.getElementById('chips');
  function renderChips() {
    const c = counts();
    const defs = [['all', 'All', AGENTS.length, null]].concat(shownStatuses().map((k) => [k, STATUS[k].label, c[k], STATUS[k].color]));
    chipsEl.innerHTML = '';
    defs.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.setAttribute('aria-pressed', String(state.filter === d[0]));
      b.innerHTML = (d[3] ? '<span class="dot" style="background:' + d[3] + '"></span>' : '<span class="dot" style="background:#ffffff"></span>') +
        '<span>' + d[1] + '</span><span class="n">' + d[2] + '</span>';
      b.addEventListener('click', () => { state.filter = (state.filter === d[0] && d[0] !== 'all') ? 'all' : d[0]; renderChips(); applyFilter(); });
      chipsEl.appendChild(b);
    });
    const bar = document.getElementById('bar'); bar.innerHTML = '';
    Object.keys(STATUS).forEach((k) => { const i = document.createElement('i'); i.style.width = (c[k] / AGENTS.length * 100) + '%'; i.style.background = STATUS[k].color; bar.appendChild(i); });
    if (live) {
      const w = data.drafts.filter((d) => d.status === 'awaiting_approval').length;
      document.getElementById('utiltext').textContent = c.working + ' of ' + AGENTS.length + ' working · ' + w + (w === 1 ? ' draft' : ' drafts') + ' waiting for you';
      document.getElementById('floorline').textContent = 'Little Faith Club team · ' + AGENTS.length + ' AI employees';
    } else {
      document.getElementById('utiltext').textContent = Math.round(c.working / AGENTS.length * 100) + '% working · ' + c.break + ' on break';
      document.getElementById('floorline').textContent = 'Digital workspace · ' + AGENTS.length + ' agents on Floor 1';
    }
  }
  function applyFilter() {
    people.forEach((p) => {
      const on = state.filter === 'all' || p.a.status === state.filter;
      Object.keys(p.mats).forEach((k) => { const m = p.mats[k]; m.transparent = !on || k === 'face'; m.opacity = on ? 1 : 0.18; m.depthWrite = on; m.needsUpdate = true; });
      p.ring.visible = on; p.tag.visible = on;
    });
  }
  function renderCard() {
    const a = AGENTS[state.selected], st = STATUS[a.status];
    document.getElementById('c-name').textContent = a.name;
    document.getElementById('c-role').textContent = a.role;
    const pill = document.getElementById('c-pill'); pill.textContent = st.label; pill.style.background = st.color; pill.style.color = a.status === 'paused' ? '#ffffff' : '';
    document.getElementById('c-task').textContent = a.task;
    if (live) {
      document.getElementById('c-meta').textContent = a.desk + ' · ' + a.zone + ' · updated ' + a.since + ' ago · ' + (a.waiting ? a.waiting + ' waiting for you' : 'nothing waiting for you');
      document.getElementById('msg').textContent = a.paused ? 'Resume' : 'Pause';
      document.getElementById('assign').textContent = 'Their work';
    } else {
      const open = tasks.filter((x) => x.agent === a.id && x.status !== 'done').length;
      document.getElementById('c-meta').textContent = a.desk + ' · ' + a.zone + ' · ' + a.since + ' in status · ' + open + (open === 1 ? ' open task' : ' open tasks');
    }
    const pr = document.getElementById('portrait').style;
    pr.setProperty('--shirt', a.shirt); pr.setProperty('--skin', a.skin); pr.setProperty('--hair', a.hair);
    pr.boxShadow = 'inset 0 0 0 3px ' + st.color;
  }
  function select(i) { state.selected = (i + AGENTS.length) % AGENTS.length; renderCard(); }
  document.getElementById('prev').addEventListener('click', () => select(state.selected - 1));
  document.getElementById('next').addEventListener('click', () => select(state.selected + 1));
  const followBtn = document.getElementById('follow');
  function setFollow(v) { state.follow = v; followBtn.setAttribute('aria-pressed', String(v)); if (v) { cam.goal.dist = Math.min(cam.goal.dist, 45); cam.goal.phi = Math.min(cam.goal.phi, 1.05); } }
  followBtn.addEventListener('click', () => setFollow(!state.follow));
  const toastEl = document.getElementById('toast'); let toastT = 0;
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 2400); }
  document.getElementById('msg').addEventListener('click', () => {
    if (live) togglePause(AGENTS[state.selected].id);
    else toast('Messaging ' + AGENTS[state.selected].name + ' is not connected in the demo');
  });
  document.getElementById('assign').addEventListener('click', () => {
    if (live) openDrawer('assigned');
    else openDrawer('tasks', { form: true, agent: AGENTS[state.selected].id });
  });

  // ---------------------------------------------------------------- boards: tasks, assignments, weekly goals (seed data in src/data/boards.js, edits saved in this browser)
  function load(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); if (Array.isArray(v) && v.length) return v; } catch (e) { /* storage unavailable */ }
    return JSON.parse(JSON.stringify(def));
  }
  let tasks = live ? liveTasks(data.drafts) : load('hq3d-tasks-v1', SEED_TASKS);
  let goals = live ? liveGoals(data.drafts) : load('hq3d-goals-v1', SEED_GOALS);
  function save() {
    if (live) return;
    try { localStorage.setItem('hq3d-tasks-v1', JSON.stringify(tasks)); localStorage.setItem('hq3d-goals-v1', JSON.stringify(goals)); } catch (e) { /* storage unavailable */ }
  }
  const byId = (id) => AGENTS.find((a) => a.id === id) || { name: 'Unassigned', shirt: '#888888', id: '' };
  const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const trunc = (v, n) => (v.length > n ? v.slice(0, n - 1) + '…' : v);
  const colLabel = (k) => (COLS.find((c) => c[0] === k) || ['', k])[1];
  function weekInfo() {
    const now = new Date(), day = (now.getDay() + 6) % 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { label: fmt(mon) + ' – ' + fmt(sun), elapsed: Math.min(1, (day + now.getHours() / 24) / 5), day };
  }
  function goalState(g) {
    const pct = g.current / g.target;
    if (pct >= 1) return ['Done', '#4fd16a'];
    if (pct >= weekInfo().elapsed - 0.15) return ['On track', '#3d8bff'];
    return ['At risk', '#ff7a3d'];
  }

  // the boards inside the 3D office mirror the same data
  function paint(tex, fn) { const cv = tex.image, c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); fn(c, cv.width, cv.height); tex.needsUpdate = true; }
  function drawBoards() {
    paint(boardTex.tasks, (c, w, h) => {
      c.fillStyle = '#f7f6f0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1b2433'; c.font = '800 30px Fredoka, sans-serif'; c.fillText('TASK BOARD', 18, 40);
      COLS.forEach((cl, i) => {
        const x = 14 + i * 124, list = tasks.filter((t) => t.status === cl[0]);
        c.fillStyle = '#e4e2d8'; c.fillRect(x, 56, 116, 232);
        c.fillStyle = '#1b2433'; c.font = '700 16px Fredoka, sans-serif'; c.fillText(cl[1], x + 8, 78);
        c.fillStyle = '#6b7380'; c.fillText(String(list.length), x + 98, 78);
        list.slice(0, 12).forEach((t, j) => {
          const sx = x + 8 + (j % 3) * 35, sy = 90 + Math.floor(j / 3) * 48;
          c.fillStyle = t.prio === 'High' ? '#ff8a80' : t.prio === 'Med' ? '#ffd54f' : '#90caf9';
          c.fillRect(sx, sy, 30, 40);
          c.fillStyle = byId(t.agent).shirt; c.fillRect(sx + 4, sy + 30, 22, 5);
        });
      });
    });
    paint(boardTex.assigned, (c, w, h) => {
      c.fillStyle = '#c99a5e'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 90; i++) c.fillRect((i * 97) % w, (i * 53) % h, 3, 3);
      c.fillStyle = '#ffffff'; c.fillRect(14, 12, 190, 38);
      c.fillStyle = '#1b2433'; c.font = '800 26px Fredoka, sans-serif'; c.fillText('ASSIGNED', 26, 40);
      AGENTS.forEach((a, i) => {
        const x = 14 + (i < 8 ? 0 : 250), y = 60 + (i % 8) * 29;
        const open = tasks.filter((t) => t.agent === a.id && t.status !== 'done').length;
        c.fillStyle = '#fffdf5'; c.fillRect(x, y, 236, 25);
        c.fillStyle = a.shirt; c.fillRect(x + 4, y + 4, 17, 17);
        c.fillStyle = '#1b2433'; c.font = '600 16px Fredoka, sans-serif'; c.fillText(a.name, x + 28, y + 18);
        for (let k = 0; k < Math.min(open, 6); k++) { c.fillStyle = '#3d8bff'; c.fillRect(x + 120 + k * 18, y + 6, 13, 13); }
        if (!open) { c.fillStyle = live ? '#2b8a3e' : '#c4281c'; c.font = '700 15px Fredoka, sans-serif'; c.fillText(live ? 'all clear' : 'needs a task', x + 120, y + 18); }
      });
    });
    paint(boardTex.goals, (c, w, h) => {
      c.fillStyle = '#1b2433'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.font = '800 28px Fredoka, sans-serif'; c.fillText('WEEKLY GOALS', 18, 40);
      goals.slice(0, 5).forEach((g, i) => {
        const y = 60 + i * 46, pct = Math.min(1, g.current / g.target), st = goalState(g);
        c.fillStyle = '#e9eef5'; c.font = '600 17px Fredoka, sans-serif'; c.fillText(trunc(g.title, 34), 18, y + 14);
        c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(18, y + 22, 400, 12);
        c.fillStyle = st[1]; c.fillRect(18, y + 22, Math.max(4, 400 * pct), 12);
        c.fillStyle = '#ffffff'; c.font = '700 16px Fredoka, sans-serif'; c.fillText(Math.round(pct * 100) + '%', 432, y + 34);
      });
    });
    paint(boardTex.reports, (c, w, h) => {
      const n = counts();
      c.fillStyle = '#10141c'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd23f'; c.fillRect(18, 16, 8, 32);
      c.fillStyle = '#ffffff'; c.font = '800 28px Fredoka, sans-serif'; c.fillText('REPORTS', 36, 42);
      shownStatuses().slice(0, 5).forEach((k, i) => {
        const y = 66 + i * 38, bw = (n[k] / AGENTS.length) * 300;
        c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(18, y, 300, 24);
        c.fillStyle = STATUS[k].color; c.fillRect(18, y, Math.max(6, bw), 24);
        c.fillStyle = '#ffffff'; c.font = '600 17px Fredoka, sans-serif'; c.fillText(STATUS[k].label + '  ' + n[k], 332, y + 18);
      });
      c.fillStyle = '#b9c3d3'; c.font = '500 16px Fredoka, sans-serif'; c.fillText('Click to open the full report', 18, 280);
    });
  }

  // ---------------------------------------------------------------- side panel
  const drawer = document.getElementById('drawer'), drBody = document.getElementById('dr-body');
  const cardEl = document.getElementById('card');
  let tab = 'tasks', formOpen = false, formFor = null, role = 'manager';
  function openDrawer(t, opts) {
    tab = t; formOpen = !!(opts && opts.form); formFor = (opts && opts.agent) || null;
    drawer.hidden = false; cardEl.hidden = true;
    renderDrawer();
    if (formOpen) focusTitle(); else { const sel = drawer.querySelector('.tab[aria-selected="true"]'); if (sel) sel.focus(); }
  }
  function closeDrawer() { drawer.hidden = true; cardEl.hidden = false; canvas.focus(); }
  function focusTitle() { const el = document.getElementById('f-title'); if (el) el.focus(); }
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.open)));


  function viewTasks() {
    const open = tasks.filter((t) => t.status !== 'done').length, done = tasks.length - open;
    let html = live
      ? '<div class="row"><div class="grow"><h2 class="dr-title">Task board</h2><div class="muted">' + open + ' in progress · ' + done + ' approved · every draft the team is working on</div></div></div>'
      : '<div class="row"><div class="grow"><h2 class="dr-title">Task board</h2><div class="muted">' + open + ' open · ' + done + ' done this week · use the arrows on a card to move it</div></div>' +
        '<button class="btn primary sm" id="new-task" type="button">New task</button></div>';
    if (formOpen) {
      html += '<form class="form" id="task-form">' +
        '<label class="wide" for="f-title">Task<input id="f-title" required maxlength="80" placeholder="What needs doing?" autocomplete="off"></label>' +
        '<label for="f-who">Assign to<select id="f-who">' + AGENTS.map((a) => '<option value="' + a.id + '"' + (a.id === formFor ? ' selected' : '') + '>' + esc(a.name) + ' · ' + esc(a.role) + '</option>').join('') + '</select></label>' +
        '<label for="f-prio">Priority<select id="f-prio"><option>High</option><option selected>Med</option><option>Low</option></select></label>' +
        '<label for="f-due">Due<select id="f-due">' + DAYS.map((d) => '<option' + (d === 'Fri' ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></label>' +
        '<label for="f-goal">Weekly goal<select id="f-goal"><option value="">None</option>' + goals.map((g) => '<option value="' + g.id + '">' + esc(g.title) + '</option>').join('') + '</select></label>' +
        '<div class="actions"><button class="btn sm" type="button" id="f-cancel">Cancel</button><button class="btn primary sm" type="submit">Add task</button></div></form>';
    }
    html += '<div class="kanban">' + COLS.map((cl, ci) => {
      const list = tasks.filter((t) => t.status === cl[0]);
      return '<section class="col" aria-label="' + cl[1] + '"><h3><span>' + cl[1] + '</span><span>' + list.length + '</span></h3>' +
        (list.map((t) => {
          const a = byId(t.agent);
          return '<article class="tcard"><b>' + esc(t.title) + '</b><div class="tmeta">' +
            '<button class="who-chip" type="button" data-agent="' + a.id + '" title="Show ' + esc(a.name) + ' in the office"><i style="background:' + a.shirt + '"></i>' + esc(a.name) + '</button>' +
            (live ? '<span class="kind">' + KIND_LABEL[t.kind] + '</span>' + (t.due !== '—' ? '<span>For ' + t.due + '</span>' : '') :
            '<span class="prio ' + t.prio + '">' + t.prio + '</span><span>Due ' + t.due + '</span>' +
            '<span class="moves"><button class="mv-btn" type="button" data-move="' + t.id + '" data-dir="-1" aria-label="Move back to ' + (COLS[ci - 1] ? COLS[ci - 1][1] : '') + '"' + (ci === 0 ? ' disabled' : '') + '>&lsaquo;</button>' +
            '<button class="mv-btn" type="button" data-move="' + t.id + '" data-dir="1" aria-label="Move forward to ' + (COLS[ci + 1] ? COLS[ci + 1][1] : '') + '"' + (ci === COLS.length - 1 ? ' disabled' : '') + '>&rsaquo;</button></span>') +
            '</div></article>';
        }).join('') || '<p class="muted" style="margin:4px">Nothing here yet</p>') + '</section>';
    }).join('') + '</div>';
    return html;
  }
  function viewAssigned() {
    const rows = AGENTS.map((a) => {
      const mine = tasks.filter((t) => t.agent === a.id), open = mine.filter((t) => t.status !== 'done'), st = STATUS[a.status];
      return '<section class="person"><div class="person-head"><span class="sw" style="background:' + a.shirt + '"></span>' +
        '<div class="nm"><b>' + esc(a.name) + '</b><span>' + esc(a.role) + ' · ' + open.length + ' open · ' + (mine.length - open.length) + ' done</span></div>' +
        '<span class="tag" style="background:' + st.color + (a.status === 'paused' ? ';color:#ffffff' : '') + '">' + st.label + '</span>' +
        (live ? '<button class="btn sm" type="button" data-pause="' + a.id + '">' + (a.paused ? 'Resume' : 'Pause') + '</button>'
          : '<button class="btn sm" type="button" data-assign="' + a.id + '">Assign</button>') + '</div>' +
        (open.length ? '<ul class="mini">' + open.map((t) => '<li>' + esc(t.title) + '<span class="st">' + colLabel(t.status) + ' · ' + t.due + '</span></li>').join('') + '</ul>'
          : '<p class="muted" style="margin:0">' + (live ? 'Nothing in progress. ' + esc(a.task) : 'No open tasks.' + (a.status === 'idle' ? ' ' + esc(a.name) + ' is idle right now, so this is a good time to assign one.' : '')) + '</p>') +
        '</section>';
    });
    const free = AGENTS.filter((a) => !tasks.some((t) => t.agent === a.id && t.status !== 'done')).length;
    return '<div class="row"><div class="grow"><h2 class="dr-title">Assigned</h2><div class="muted">' + (live ? 'What each employee has in progress · pause anyone here' : 'Who is working on what · ' + free + ' without an open task') + '</div></div></div>' + rows.join('');
  }
  function viewGoals() {
    const w = weekInfo();
    const total = goals.reduce((s2, g) => s2 + Math.min(1, g.current / g.target), 0) / goals.length;
    return '<div class="row"><div class="grow"><h2 class="dr-title">Weekly goals</h2><div class="muted">Week of ' + w.label + ' · ' + Math.round(total * 100) + '% overall · ' + (live ? 'counted from the team\'s drafts' : Math.round(w.elapsed * 100) + '% of the work week gone') + '</div></div></div>' +
      goals.map((g) => {
        const pct = Math.min(1, g.current / g.target), st = goalState(g);
        const linked = tasks.filter((t) => t.goal === g.id && t.status !== 'done').length;
        return '<article class="goal"><div class="goal-top"><b>' + esc(g.title) + '</b><span class="tag" style="background:' + st[1] + '">' + st[0] + '</span></div>' +
          '<div class="track" role="img" aria-label="' + Math.round(pct * 100) + ' percent"><i style="width:' + (pct * 100) + '%;background:' + st[1] + '"></i></div>' +
          '<div class="row"><span class="muted">' + g.current + ' / ' + g.target + ' ' + esc(g.unit) + ' · ' + linked + ' open ' + (linked === 1 ? 'task' : 'tasks') + '</span>' +
          (live ? '' : '<span class="moves"><button class="mv-btn" type="button" data-goal="' + g.id + '" data-d="-1" aria-label="Lower progress on ' + esc(g.title) + '">&minus;</button>' +
          '<button class="mv-btn" type="button" data-goal="' + g.id + '" data-d="1" aria-label="Log progress on ' + esc(g.title) + '">+</button></span>') + '</div>' +
          '<div class="row">' + g.owners.map((id) => { const a = byId(id); return '<button class="who-chip" type="button" data-agent="' + a.id + '"><i style="background:' + a.shirt + '"></i>' + esc(a.name) + '</button>'; }).join('') + '</div></article>';
      }).join('');
  }
  function viewReports() {
    if (live) return viewLiveReports();
    const c = counts(), w = weekInfo();
    const done = tasks.filter((t) => t.status === 'done').length;
    const onTrack = goals.filter((g) => goalState(g)[0] !== 'At risk').length;
    const hours = Object.keys(HOURS).reduce((s2, k) => s2 + HOURS[k], 0);
    const show = (roles) => roles.indexOf(role) >= 0;
    let html = '<div class="row"><div class="grow"><h2 class="dr-title">Reports</h2><div class="muted">Week of ' + w.label + '</div></div><span class="sample">Hours and attendance are sample data</span></div>' +
      '<div class="row"><span class="muted">Viewing as</span><div class="seg" role="group" aria-label="Report view">' +
      ['owner', 'admin', 'manager'].map((r) => '<button type="button" data-role="' + r + '" aria-pressed="' + (role === r) + '">' + r.charAt(0).toUpperCase() + r.slice(1) + '</button>').join('') + '</div></div>' +
      '<div class="kpis">' +
      '<div class="kpi"><span>Working now</span><b>' + c.working + ' / ' + AGENTS.length + '</b><small>' + Math.round(c.working / AGENTS.length * 100) + '% of the team</small></div>' +
      '<div class="kpi"><span>Tasks done</span><b>' + done + '</b><small>this week</small></div>' +
      '<div class="kpi"><span>Goals on track</span><b>' + onTrack + ' / ' + goals.length + '</b><small>' + (goals.length - onTrack) + ' at risk</small></div>' +
      '<div class="kpi"><span>Team hours</span><b>' + hours.toFixed(0) + 'h</b><small>this week</small></div></div>';
    if (show(['owner', 'manager'])) {
      const max = 120, H = 128, names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], colors = ['#3d8bff', '#ffb020', '#a0a8b5'];
      html += '<section class="sec"><h3>Team hours by day</h3><div class="chart">' + names.map((d, i) => {
        const u = UTIL[i];
        if (!u) return '<div class="bars up" title="' + d + ': not yet"></div>';
        return '<div class="bars" title="' + d + ': ' + u[0] + 'h working, ' + u[1] + 'h break, ' + u[2] + 'h idle">' + u.map((v, j) => '<i style="height:' + (v / max * H).toFixed(1) + 'px;background:' + colors[j] + '"></i>').join('') + '</div>';
      }).join('') + '</div><div class="days">' + names.map((d, i) => '<span>' + d + '<br><b>' + (UTIL[i] ? (UTIL[i][0] + UTIL[i][1] + UTIL[i][2]) + 'h' : '–') + '</b></span>').join('') + '</div>' +
        '<div class="legend"><span><i style="background:#3d8bff"></i>Working</span><span><i style="background:#ffb020"></i>Break</span><span><i style="background:#a0a8b5"></i>Idle</span><span>Gridline every 30h</span></div></section>';
    }
    if (show(['manager', 'admin'])) {
      html += '<section class="sec"><h3>People</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Agent</th><th>Status now</th><th class="num">Hours</th><th class="num">Done</th><th class="num">Open</th></tr></thead><tbody>' +
        AGENTS.map((a) => {
          const mine = tasks.filter((t) => t.agent === a.id), op = mine.filter((t) => t.status !== 'done').length;
          return '<tr><td><span class="dot" style="background:' + a.shirt + '"></span>' + esc(a.name) + '</td><td><span class="dot" style="background:' + STATUS[a.status].color + '"></span>' + STATUS[a.status].label + '</td><td class="num">' + HOURS[a.id].toFixed(1) + '</td><td class="num">' + (mine.length - op) + '</td><td class="num">' + op + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    if (show(['admin', 'manager'])) {
      html += '<section class="sec"><h3>Attendance today</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Agent</th><th>Event</th><th class="num">Time</th></tr></thead><tbody>' +
        ATTEND.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td class="num">' + r[2] + '</td></tr>').join('') + '</tbody></table></div></section>';
    }
    if (show(['owner'])) {
      html += '<section class="sec"><h3>Goals this week</h3><ul class="mini">' + goals.map((g) => { const st = goalState(g); return '<li>' + esc(g.title) + '<span class="st">' + Math.round(Math.min(1, g.current / g.target) * 100) + '% · ' + st[0] + '</span></li>'; }).join('') + '</ul></section>';
    }
    return html;
  }
  let lastTab = null;
  function renderDrawer() {
    drawer.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const keep = lastTab === tab ? drBody.scrollTop : 0;
    drBody.innerHTML = tab === 'approvals' ? viewApprovals() : tab === 'tasks' ? viewTasks() : tab === 'assigned' ? viewAssigned() : tab === 'goals' ? viewGoals() : viewReports();
    drBody.setAttribute('aria-label', colLabelTab(tab));
    drBody.scrollTop = keep; lastTab = tab;
  }
  function colLabelTab(t) { return { approvals: 'Approvals', tasks: 'Task board', assigned: 'Assigned', goals: 'Weekly goals', reports: 'Reports' }[t]; }
    // ---------------------------------------------------------------- live team: approvals, reports, sign-in, pause
  const CHECK_LABEL = { scripture: 'Scripture', faith: 'Faith', voice: 'Voice', facts_prices: 'Facts and prices', privacy: 'Privacy', format: 'Format', owner_note_addressed: 'Your note' };
  const openDrafts = new Set();
  let noteFor = null, seeded = false, linkSent = null, busy = false;
  drBody.addEventListener('toggle', (e) => {
    const art = e.target.closest && e.target.closest('[data-draft]');
    if (!art || e.target.tagName !== 'DETAILS') return;
    if (e.target.open) openDrafts.add(art.dataset.draft); else openDrafts.delete(art.dataset.draft);
  }, true);
  const para = (v) => esc(v || '').split(/\n{2,}/).map((x) => '<p>' + x.replace(/\n/g, '<br>') + '</p>').join('');
  function preview(d) {
    const b = d.body || {};
    if (d.kind === 'landing_page') {
      return '<p class="pv-meta">' + esc(b.path || '') + '</p><h4>' + esc(b.headline || '') + '</h4>' + para(b.subhead) +
        (b.sections || []).map((x) => '<h5>' + esc(x.heading || '') + '</h5>' + para(x.text)).join('') +
        (b.lead_magnet ? '<p class="pv-box"><b>Free printable:</b> ' + esc(b.lead_magnet.title || '') + '. ' + esc(b.lead_magnet.what_it_is || '') + ' <i>[' + esc(b.lead_magnet.button || '') + ']</i></p>' : '') +
        (b.cta ? '<p class="pv-box"><b>Main button:</b> ' + esc(b.cta.text || '') + '</p>' : '') +
        '<p class="pv-meta"><b>Search title:</b> ' + esc(b.meta_title || '') + '<br><b>Search description:</b> ' + esc(b.meta_description || '') + '<br><b>Image:</b> ' + esc(b.hero_image_brief || '') + '</p>';
    }
    if (d.kind === 'pin') {
      return '<h4>' + esc(b.title || '') + '</h4>' + para(b.description) +
        '<p class="pv-meta"><b>Board:</b> ' + esc(b.board || '') + '<br><b>Links to:</b> ' + esc(b.link_path || '') + '<br><b>Image:</b> ' + esc(b.image_brief || '') + '</p>';
    }
    if (d.kind === 'email') {
      const when = b.send_at ? new Date(b.send_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' US Eastern' : '';
      return '<p class="pv-meta"><b>Subject:</b> ' + esc(b.subject || '') + '<br><b>Preview text:</b> ' + esc(b.preheader || '') + (when ? '<br><b>Sends:</b> ' + esc(when) : '') + '</p>' +
        (b.blocks || []).map((k) => (k.heading ? '<h5>' + esc(k.heading) + '</h5>' : '') + para(k.text) + (k.button ? '<p class="pv-box"><i>[' + esc(k.button) + ']</i></p>' : '')).join('') +
        '<p class="pv-meta">' + esc(b.footer || '') + '</p>';
    }
    return '<pre class="pv-raw">' + esc(JSON.stringify(b, null, 2)) + '</pre>';
  }
  function draftCard(d) {
    const a = byId(d.employee_id), rv = d.review || {}, noting = noteFor === d.id;
    const checks = rv.checks ? Object.keys(rv.checks).filter((k) => rv.checks[k] === 'ok' || rv.checks[k] === 'fail').map((k) => {
      const v = rv.checks[k], cls = v === 'ok' ? 'ok' : v === 'fail' ? 'bad' : 'na';
      return '<span class="chk ' + cls + '">' + (cls === 'ok' ? '✓ ' : cls === 'bad' ? '✕ ' : '– ') + esc(CHECK_LABEL[k] || k) + '</span>';
    }).join('') : '';
    const list = (arr) => '<ul>' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    return '<article class="draft" data-draft="' + d.id + '">' +
      '<div class="draft-top"><span class="kind">' + esc(KIND_LABEL[d.kind] || d.kind) + '</span><b>' + esc(d.title) + '</b></div>' +
      '<div class="tmeta"><button class="who-chip" type="button" data-agent="' + a.id + '"><i style="background:' + a.shirt + '"></i>' + esc(a.name) + '</button>' +
      (d.scheduled_for ? '<span>For ' + shortDate(d.scheduled_for) + '</span>' : '') +
      (d.campaign ? '<span>' + esc(d.campaign) + '</span>' : '') +
      (d.revision > 1 ? '<span>Revision ' + d.revision + '</span>' : '') + '</div>' +
      (rv.passed === false ? '<p class="warn">Ruth could not pass this after several rounds. Read her notes before you decide.</p>' : '') +
      (rv.needs_pastor ? '<p class="warn">Needs your pastor\'s sign-off before it goes out.</p>' : '') +
      (rv.for_owner && rv.for_owner.length ? '<div class="flags"><b>Only you can settle</b>' + list(rv.for_owner) + '</div>' : '') +
      (checks ? '<div class="checks" aria-label="Ruth\'s checks">' + checks + '</div>' : '') +
      (rv.notes && rv.notes.length ? '<div class="rnotes"><b>Ruth\'s notes</b>' + list(rv.notes) + '</div>' : '') +
      (d.owner_note && d.revision > 1 ? '<p class="muted">Your last note: “' + esc(d.owner_note) + '”</p>' : '') +
      '<details' + (openDrafts.has(d.id) ? ' open' : '') + '><summary>Read the draft</summary><div class="preview">' + preview(d) + '</div></details>' +
      (noting ? '<label class="note" for="note-' + d.id + '">What should change? (needed to send it back)<textarea id="note-' + d.id + '" rows="3" maxlength="1000"></textarea></label>' : '') +
      '<div class="actions">' + (noting
        ? '<button class="btn sm" type="button" data-cancel-note="1">Cancel</button><button class="btn sm" type="button" data-decide="rejected" data-id="' + d.id + '">Reject</button><button class="btn primary sm" type="button" data-decide="sent_back" data-id="' + d.id + '">Send back</button>'
        : '<button class="btn sm" type="button" data-note="' + d.id + '">Send back or reject…</button><button class="btn primary sm" type="button" data-decide="approved" data-id="' + d.id + '">Approve</button>') +
      '</div></article>';
  }
  function viewApprovals() {
    if (!live) return viewSignIn();
    const waiting = data.drafts.filter((d) => d.status === 'awaiting_approval').sort((x, y) => new Date(x.updated_at) - new Date(y.updated_at));
    if (!seeded && waiting.length) { openDrafts.add(waiting[0].id); seeded = true; }
    const withTeam = data.drafts.filter((d) => d.status === 'in_review' || d.status === 'sent_back').length;
    const recent = data.drafts.filter((d) => d.decided_at).sort((x, y) => new Date(y.decided_at) - new Date(x.decided_at)).slice(0, 8);
    const label = (d) => (d.status === 'approved' || d.status === 'published' ? 'Approved' : d.status === 'rejected' ? 'Rejected' : 'Sent back');
    return '<div class="row"><div class="grow"><h2 class="dr-title">Approvals</h2><div class="muted">' + waiting.length + ' waiting for you · ' + withTeam + ' still with the team · nothing goes out without your approval</div></div></div>' +
      (waiting.length ? waiting.map(draftCard).join('') : '<p class="empty">Nothing is waiting for you. Ruth passes drafts here once she has checked them.</p>') +
      (recent.length ? '<section class="sec"><h3>Recently decided</h3><ul class="mini">' + recent.map((d) => '<li>' + esc(d.title) + '<span class="st">' + label(d) + ' · ' + shortDate(d.decided_at) + '</span></li>').join('') + '</ul></section>' : '');
  }
  function viewSignIn() {
    const r = hq.reason;
    let html = '<div class="row"><div class="grow"><h2 class="dr-title">Your live team</h2><div class="muted">This is the demo office with sample people</div></div></div>';
    if (r === 'unconfigured') return html + '<p>Live mode needs the workspace address and key in <code>src/lib/config.js</code>.</p>';
    if (r === 'not_owner') return html + '<p>You\'re signed in as <b>' + esc(hq.email) + '</b>, which isn\'t an owner of this workspace. An owner can add your email to <code>hq_owners</code>.</p><div class="actions"><button class="btn sm" type="button" data-signout="1">Sign out</button></div>';
    if (r === 'error') {
      html += '<p class="warn">Couldn\'t reach the workspace: ' + esc(hq.error || 'unknown error') + '</p>';
      if (hq.email) return html + '<div class="actions"><button class="btn sm" type="button" data-signout="1">Sign out</button></div>';
    }
    if (linkSent) return html + '<p class="pv-box">Check <b>' + esc(linkSent) + '</b> for a sign-in link and open it in this browser.</p>';
    return html + '<p>Sign in with your owner email to watch your AI employees work, approve their drafts and pause them.</p>' +
      '<form class="form" id="signin-form"><label class="wide" for="f-email">Email<input id="f-email" type="email" required autocomplete="email"></label>' +
      '<div class="actions"><button class="btn primary sm" type="submit">Email me a sign-in link</button></div></form>';
  }
  function viewLiveReports() {
    const runs = weekRuns(data.runs), decided = weekDecided(data.drafts);
    const waiting = data.drafts.filter((d) => d.status === 'awaiting_approval').length;
    const approved = decided.filter((d) => d.status === 'approved' || d.status === 'published').length;
    const made = data.drafts.filter((d) => thisWeek(d.created_at));
    const failed = runs.filter((r) => r.outcome === 'failed').length;
    const w = weekInfo();
    let html = '<div class="row"><div class="grow"><h2 class="dr-title">Reports</h2><div class="muted">Week of ' + w.label + ' · from the team\'s runs and drafts</div></div></div>' +
      '<div class="kpis">' +
      '<div class="kpi"><span>Waiting for you</span><b>' + waiting + '</b><small>' + (waiting === 1 ? 'draft' : 'drafts') + '</small></div>' +
      '<div class="kpi"><span>Drafts this week</span><b>' + made.length + '</b><small>written by the team</small></div>' +
      '<div class="kpi"><span>Approved</span><b>' + approved + '</b><small>this week</small></div>' +
      '<div class="kpi"><span>Runs</span><b>' + runs.length + '</b><small>' + failed + ' failed this week</small></div></div>';
    html += '<section class="sec"><h3>People</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Employee</th><th>Status now</th><th>Last run</th><th class="num">Drafts this week</th><th class="num">Waiting</th></tr></thead><tbody>' +
      AGENTS.map((a) => '<tr><td><span class="dot" style="background:' + a.shirt + '"></span>' + esc(a.name) + '</td><td><span class="dot" style="background:' + STATUS[a.status].color + '"></span>' + STATUS[a.status].label + '</td><td>' + (a.lastRun ? ago(a.lastRun) + ' ago' : 'Not yet') + '</td><td class="num">' + made.filter((d) => d.employee_id === a.id).length + '</td><td class="num">' + a.waiting + '</td></tr>').join('') +
      '</tbody></table></div></section>';
    html += '<section class="sec"><h3>Latest runs</h3>' + (data.runs.length ? '<ul class="mini runs">' + data.runs.slice(0, 12).map((r) => {
      const a = byId(r.employee_id);
      return '<li><span class="dot" style="background:' + a.shirt + '"></span><span class="grow"><b>' + esc(a.name) + '</b> ' + esc(r.summary || (r.finished_at ? '' : 'Still running')) + '</span><span class="st">' + esc(r.outcome || 'running') + ' · ' + ago(r.started_at) + ' ago</span></li>';
    }).join('') + '</ul>' : '<p class="muted">No runs yet.</p>') + '</section>';
    return html;
  }
  async function doDecide(id, decision) {
    if (busy) return;
    const ta = document.getElementById('note-' + id), note = ta ? ta.value.trim() : '';
    if (decision === 'sent_back' && !note) { toast('Add a note so they know what to change'); if (ta) ta.focus(); return; }
    busy = true;
    try {
      await decide(id, decision, note);
      noteFor = null;
      toast({ approved: 'Approved', sent_back: 'Sent back with your note', rejected: 'Rejected' }[decision]);
      await refresh(true);
    } catch (err) { toast(err.message); } finally { busy = false; }
  }
  async function togglePause(id) {
    const a = AGENTS.find((x) => x.id === id);
    if (!a || busy) return;
    busy = true;
    try {
      await setPaused(id, !a.paused);
      toast(a.paused ? a.name + ' will work again at the next scheduled run' : a.name + ' is paused and will skip runs until you resume');
      await refresh(true);
    } catch (err) { toast(err.message); } finally { busy = false; }
  }
  async function doSignIn() {
    const el = document.getElementById('f-email'), email = el ? el.value.trim() : '';
    if (!email) { if (el) el.focus(); return; }
    try { await signIn(email); linkSent = email; renderDrawer(); } catch (err) { toast(err.message); }
  }
  async function doSignOut() { await signOut(); window.location.reload(); }
  function renderAccount() {
    const m = document.getElementById('mode'), b = document.getElementById('acct');
    if (live) { m.textContent = 'Live · ' + hq.email; b.textContent = 'Sign out'; }
    else if (hq.reason === 'not_owner') { m.textContent = 'Demo · ' + hq.email + ' is not an owner'; b.textContent = 'Sign out'; }
    else if (hq.reason === 'unconfigured') { m.textContent = 'Demo office'; b.hidden = true; }
    else { m.textContent = 'Demo office · sample people'; b.textContent = 'Sign in'; }
  }
  document.getElementById('acct').addEventListener('click', () => {
    if (live || hq.email) doSignOut(); else openDrawer('approvals');
  });
  function updateBadge() {
    const el = document.getElementById('appr-n');
    const n = live ? data.drafts.filter((d) => d.status === 'awaiting_approval').length : 0;
    el.textContent = String(n); el.hidden = !n;
  }
  function placePerson(p) {
    const a = p.a;
    if (a.at) { const w = W(a.at); p.root.position.set(w[0], 0, w[1]); p.root.rotation.y = a.yaw; }
    p.cup.visible = a.pose === 'sip'; p.paddle.visible = a.pose === 'paddle';
    p.ring.material.color.set(STATUS[a.status].color);
    p.tagMat.map.dispose(); p.tagMat.map = tagTexture(a.name, STATUS[a.status].color); p.tagMat.needsUpdate = true;
  }
  let refreshing = false, again = null, lastSig = '';
  const sigOf = (d) => d.employees.map((e) => e.id + e.status + e.current_task + e.paused).join('|') + '#' + d.drafts.map((x) => x.id + x.status + x.updated_at).join('|') + '#' + (d.runs[0] ? d.runs[0].id + d.runs[0].finished_at : '');
  async function refresh(force) {
    if (!live) return;
    if (refreshing) { again = again === true || !!force; return; }   // run once more when this one finishes
    refreshing = true;
    try {
      data = await fetchAll();
      const sig = sigOf(data);
      const moved = syncAgents(AGENTS, data);
      people.forEach((p) => { if (moved.indexOf(p.a.id) >= 0) placePerson(p); });
      renderCard();
      if (!force && sig === lastSig) return;
      lastSig = sig;
      tasks = liveTasks(data.drafts); goals = liveGoals(data.drafts);
      renderChips(); applyFilter(); renderCard(); drawBoards(); updateBadge();
      const f = document.activeElement, typing = f && drawer.contains(f) && /INPUT|TEXTAREA/.test(f.tagName);
      if (!drawer.hidden && (force || !typing)) renderDrawer();
    } catch (err) { console.warn('Agent HQ refresh failed', err); } finally {
      refreshing = false;
      if (again !== null) { const f = again; again = null; refresh(f); }
    }
  }
  if (live) lastSig = sigOf(data);
  function changed(refocus) {
    save(); renderDrawer(); drawBoards(); renderCard();
    if (refocus) { const el = drBody.querySelector(refocus); if (el && !el.disabled) el.focus(); }
  }
  function flyTo(idx) {
    const p = people[idx];
    const pos = p.root.visible ? p.root.position : (p.carPos || p.root.position);
    cam.goal.target.set(pos.x, 2.5, pos.z);
    cam.goal.dist = Math.min(cam.goal.dist, 55);
    cam.goal.phi = Math.min(cam.goal.phi, 1.1);
    clearViewPressed();
  }
  drawer.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el || !drawer.contains(el)) return;
    if (el.dataset.tab) { tab = el.dataset.tab; formOpen = false; renderDrawer(); return; }
    if (el.id === 'dr-close') { closeDrawer(); return; }
    if (el.dataset.decide) { doDecide(el.dataset.id, el.dataset.decide); return; }
    if (el.dataset.note) { noteFor = el.dataset.note; openDrafts.add(noteFor); renderDrawer(); const ta = document.getElementById('note-' + noteFor); if (ta) ta.focus(); return; }
    if (el.dataset.cancelNote) { noteFor = null; renderDrawer(); return; }
    if (el.dataset.pause) { togglePause(el.dataset.pause); return; }
    if (el.dataset.signout) { doSignOut(); return; }
    if (el.dataset.move) {
      const t = tasks.find((x) => x.id === el.dataset.move); if (!t) return;
      const i = COLS.findIndex((c) => c[0] === t.status);
      t.status = COLS[Math.max(0, Math.min(COLS.length - 1, i + Number(el.dataset.dir)))][0];
      changed('[data-move="' + t.id + '"][data-dir="' + el.dataset.dir + '"]');
      return;
    }
    if (el.dataset.agent) { const idx = AGENTS.findIndex((a) => a.id === el.dataset.agent); if (idx >= 0) { select(idx); flyTo(idx); closeDrawer(); } return; }
    if (el.id === 'new-task') { formOpen = true; formFor = null; renderDrawer(); focusTitle(); return; }
    if (el.id === 'f-cancel') { formOpen = false; renderDrawer(); return; }
    if (el.dataset.assign) { tab = 'tasks'; formOpen = true; formFor = el.dataset.assign; renderDrawer(); focusTitle(); return; }
    if (el.dataset.goal) {
      const g = goals.find((x) => x.id === el.dataset.goal); if (!g) return;
      g.current = Math.max(0, Math.min(g.target, g.current + Number(el.dataset.d)));
      changed('[data-goal="' + g.id + '"][data-d="' + el.dataset.d + '"]');
      return;
    }
    if (el.dataset.role) { role = el.dataset.role; renderDrawer(); const b = drBody.querySelector('[data-role="' + role + '"]'); if (b) b.focus(); }
  });
  drawer.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'signin-form') { doSignIn(); return; }
    const title = document.getElementById('f-title').value.trim();
    if (!title) { focusTitle(); return; }
    const agent = document.getElementById('f-who').value;
    tasks.unshift({ id: 't' + Date.now(), title, agent, status: 'todo', prio: document.getElementById('f-prio').value, due: document.getElementById('f-due').value, goal: document.getElementById('f-goal').value });
    formOpen = false;
    changed();
    toast('Task added for ' + byId(agent).name);
  });


  // ---------------------------------------------------------------- camera
  const VIEWS = {
    iso: { theta: PI / 4, phi: 0.95, dist: 140, target: [-6, 0, 6] },
    top: { theta: 0, phi: 0.05, dist: 175, target: [-4, 0, 6] },
    wide: { theta: PI / 4, phi: 0.82, dist: 360, target: [0, 0, 10] },
    front: { theta: 0, phi: 1.12, dist: 105, target: [-6, 0, 8] },
    street: { theta: PI / 3, phi: 1.36, dist: 46, target: [24, 2, 26] }
  };
  const cam = {
    theta: VIEWS.iso.theta, phi: VIEWS.iso.phi, dist: VIEWS.iso.dist, target: new T.Vector3().fromArray(VIEWS.iso.target),
    goal: { theta: VIEWS.iso.theta, phi: VIEWS.iso.phi, dist: VIEWS.iso.dist, target: new T.Vector3().fromArray(VIEWS.iso.target) }
  };
  function setView(name) {
    const v = VIEWS[name];
    const twoPi = PI * 2;
    let th = v.theta;
    while (th - cam.goal.theta > PI) th -= twoPi;
    while (th - cam.goal.theta < -PI) th += twoPi;
    Object.assign(cam.goal, { theta: th, phi: v.phi, dist: v.dist });
    cam.goal.target.fromArray(v.target);
    if (state.follow) setFollow(false);
    document.querySelectorAll('.view').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  }
  function clearViewPressed() { document.querySelectorAll('.view').forEach((b) => b.setAttribute('aria-pressed', 'false')); }
  document.querySelectorAll('.view').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  const rotate = (d) => { cam.goal.theta += d; clearViewPressed(); };
  document.getElementById('rotL').addEventListener('click', () => rotate(PI / 4));
  document.getElementById('rotR').addEventListener('click', () => rotate(-PI / 4));
  document.getElementById('compass').addEventListener('click', () => { const k = Math.round(cam.goal.theta / (PI * 2)); cam.goal.theta = k * PI * 2; });
  const zoom = (f) => { cam.goal.dist = Math.max(10, Math.min(460, cam.goal.dist * f)); };
  document.getElementById('zoomIn').addEventListener('click', () => zoom(0.8));
  document.getElementById('zoomOut').addEventListener('click', () => zoom(1.25));
  const autoBtn = document.getElementById('auto');
  function setAuto(v) { state.auto = v; autoBtn.setAttribute('aria-pressed', String(v)); }
  autoBtn.addEventListener('click', () => setAuto(!state.auto));
  const wallsBtn = document.getElementById('walls');
  function setWalls(mode) {
    state.walls = mode;
    wallsFull.visible = mode === 'full'; wallsCut.visible = mode === 'cut';
    wallsBtn.setAttribute('aria-pressed', String(mode === 'cut'));
    labelSprites.forEach((s) => { s.position.y = mode === 'cut' ? 8.5 : 12.5; });
    boardLabels.forEach((s) => { s.position.y = mode === 'cut' ? 10.2 : 13.2; });
  }
  wallsBtn.addEventListener('click', () => setWalls(state.walls === 'cut' ? 'full' : 'cut'));
  const cityBtn = document.getElementById('city');
  function setCity(v) { state.city = v; town.visible = v; cityBtn.setAttribute('aria-pressed', String(v)); }
  cityBtn.addEventListener('click', () => setCity(!state.city));
  const qBtn = document.getElementById('quality');
  function setQuality(q) {
    state.quality = q;
    qBtn.setAttribute('aria-pressed', String(q === 'sharp'));
    renderer.setPixelRatio(q === 'sharp' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.shadowMap.enabled = q === 'sharp';
    sun.castShadow = q === 'sharp';
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    resize();
    try { localStorage.setItem('hq3d-quality', q); } catch (e) { /* storage unavailable */ }
  }
  qBtn.addEventListener('click', () => setQuality(state.quality === 'sharp' ? 'fast' : 'sharp'));

  // pointer controls: drag rotate, right/shift drag pan, wheel zoom, pinch
  const ptrs = new Map(); let downAt = null, moved = 0, panMode = false, pinch0 = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = { x: e.clientX, y: e.clientY }; moved = 0;
    panMode = e.button === 2 || e.shiftKey;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    canvas.classList.add('dragging');
  });
  function pan(dx, dy) {
    const s = cam.dist * 0.0016;
    const right = new T.Vector3(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
    const fwd = new T.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta));
    cam.goal.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s);
    cam.goal.target.x = Math.max(-420, Math.min(420, cam.goal.target.x));
    cam.goal.target.z = Math.max(-420, Math.min(420, cam.goal.target.z));
    if (state.follow) setFollow(false);
    clearViewPressed();
  }
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) zoom(pinch0 / d);
      pinch0 = d;
      pan(dx / 2, dy / 2);
      return;
    }
    if (panMode) { pan(dx, dy); return; }
    cam.goal.theta -= dx * 0.006;
    cam.goal.phi = Math.max(0.05, Math.min(1.45, cam.goal.phi - dy * 0.005));
    if (moved > 6) clearViewPressed();
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = 0;
    if (ptrs.size === 0) {
      canvas.classList.remove('dragging');
      if (downAt && moved < 6 && e.type === 'pointerup') pick(e.clientX, e.clientY);
      downAt = null;
    }
  }
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) { closeDrawer(); return; }
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!drawer.hidden && drawer.contains(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'q') rotate(PI / 4); else if (k === 'e') rotate(-PI / 4);
    else if (k === '+' || k === '=') zoom(0.8); else if (k === '-') zoom(1.25);
    else if (k === '1') setView('iso'); else if (k === '2') setView('top'); else if (k === '3') setView('front'); else if (k === '4') setView('street');
    else if (k === 'r') setAuto(!state.auto); else if (k === 'f') setFollow(!state.follow);
    else if (k === 'w') setWalls(state.walls === 'cut' ? 'full' : 'cut');
    else if (k === 'c') setCity(!state.city); else if (k === '5') setView('wide');
    else if (k === 'arrowleft') pan(40, 0); else if (k === 'arrowright') pan(-40, 0);
    else if (k === 'arrowup') pan(0, 40); else if (k === 'arrowdown') pan(0, -40);
    else return;
  });

  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function hitTest(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const objs = people.filter((p) => p.root.visible).map((p) => p.hit).concat(clickables);
    const hits = ray.intersectObjects(objs, false);
    return hits.length ? hits[0].object : null;
  }
  function pick(x, y) {
    const o = hitTest(x, y);
    if (!o) return;
    if (o.userData.open) openDrawer(o.userData.open);
    else if (o.userData.idx !== undefined) select(o.userData.idx);
  }
  let hoverAt = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (ptrs.size || e.pointerType !== 'mouse') return;
    const now = performance.now(); if (now - hoverAt < 90) return; hoverAt = now;
    canvas.style.cursor = hitTest(e.clientX, e.clientY) ? 'pointer' : '';
  });

  // ---------------------------------------------------------------- animation
  function pose(p, kind, t, ph) {
    const b = p.body;
    b.position.y = FY; b.position.x = 0; b.position.z = 0;
    p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0);
    p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0);
    p.head.rotation.set(0, 0, 0);
    const sit = () => { b.position.y = SEAT + 0.3 - 1.1; p.legL.rotation.x = p.legR.rotation.x = -PI / 2; };
    switch (kind) {
      case 'type': sit(); p.armL.rotation.x = -1.2 + Math.sin(t * 16 + ph) * 0.07; p.armR.rotation.x = -1.2 + Math.sin(t * 16 + ph + 1.6) * 0.07; p.head.rotation.x = 0.12; break;
      case 'gesture': sit(); p.armL.rotation.x = -1.0; p.armR.rotation.x = -1.4 + Math.sin(t * 2.4) * 0.6; p.armR.rotation.z = 0.25 + Math.sin(t * 1.7) * 0.2; p.head.rotation.y = Math.sin(t * 0.9) * 0.3; break;
      case 'rest': sit(); p.armL.rotation.x = p.armR.rotation.x = -0.9; p.head.rotation.y = Math.sin(t * 0.7 + 1) * 0.25; break;
      case 'idle': sit(); p.armL.rotation.x = p.armR.rotation.x = -0.25; p.head.rotation.y = Math.sin(t * 0.6) * 0.7; p.head.rotation.x = -0.15; break;
      case 'eat': { sit(); p.armL.rotation.x = -0.9; const c = ((t + ph) % 2.6) / 2.6; const up = c > 0.4 && c < 0.65 ? Math.sin((c - 0.4) / 0.25 * PI) : 0; p.armR.rotation.x = -0.9 - up * 1.5; break; }
      case 'sip': { const c = ((t + ph) % 5) / 5; const up = c > 0.5 && c < 0.85 ? Math.sin((c - 0.5) / 0.35 * PI) : 0; p.armR.rotation.x = -0.5 - up * 2.1; p.armR.rotation.z = up * 0.35; p.head.rotation.x = -up * 0.2; break; }
      case 'paddle': { p.armR.rotation.x = -0.9 + Math.sin(t * PI / 1.4 + ph) * 0.6; p.armR.rotation.z = 0.3; p.armL.rotation.x = -0.3; break; }
      case 'walk': { const s = Math.sin(t * 9 + ph); p.legL.rotation.x = s * 0.7; p.legR.rotation.x = -s * 0.7; p.armL.rotation.x = -s * 0.6; p.armR.rotation.x = s * 0.6; b.position.y = FY + Math.abs(Math.cos(t * 9 + ph)) * 0.12; break; }
      case 'stand': break;
      default: break;
    }
  }

  let t = 0, last = performance.now();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tmpV = new T.Vector3();

  function updatePeople(dt) {
    people.forEach((p) => {
      const a = p.a;
      if (a.script === 'kai') {
        const c = t % kaiT.period; let kind = 'rest', pos, yaw = PI;
        const seat = W([27, 13.4]);
        if (c < kaiT.sit1) { pos = { x: seat[0], z: seat[1] }; kind = 'rest'; }
        else if (c < kaiT.sit1 + kaiT.out) { const q = kaiOut.at((c - kaiT.sit1) * WALK); pos = q; yaw = q.yaw; kind = 'walk'; }
        else if (c < kaiT.sit1 + kaiT.out + kaiT.stand) { const q = kaiOut.at(kaiOut.len); pos = q; yaw = PI / 2; kind = 'sip'; }
        else if (c < kaiT.sit1 + kaiT.out + kaiT.stand + kaiT.back) { const q = kaiBack.at((c - kaiT.sit1 - kaiT.out - kaiT.stand) * WALK); pos = q; yaw = q.yaw; kind = 'walk'; }
        else { pos = { x: seat[0], z: seat[1] }; kind = 'rest'; }
        p.root.position.set(pos.x, 0, pos.z); p.root.rotation.y = yaw;
        p.cup.visible = kind === 'sip';
        pose(p, kind, t, 0.5);
        return;
      }
      if (a.script === 'leo') {
        const c = t % SCRIPT_P;
        if (c < leoT.walk0) { const q = leoWalk.at(0); p.root.visible = true; p.root.position.set(q.x, 0, q.z); p.root.rotation.y = PI / 2; pose(p, 'stand', t, 0); }
        else if (c < leoT.walk0 + leoT.walk) { const q = leoWalk.at((c - leoT.walk0) * WALK); p.root.visible = true; p.root.position.set(q.x, 0, q.z); p.root.rotation.y = q.yaw; pose(p, 'walk', t, 0); }
        else { p.root.visible = false; }
        // car
        let d = 0, show = true;
        if (c >= leoT.drive0 && c < leoT.drive0 + leoT.drive) { const u = c - leoT.drive0; d = u < 2 ? 0.5 * (DRIVE / 2) * u * u : DRIVE + (u - 2) * DRIVE; d = Math.min(d, leoDrive.len); }
        else if (c >= leoT.drive0 + leoT.drive && c < leoT.back) show = false;
        const q = leoDrive.at(d);
        leoCar.visible = show; leoCar.position.set(q.x, 0, q.z); leoCar.rotation.y = q.yaw;
        p.carPos = (!p.root.visible && show) ? leoCar.position : null;
        return;
      }
      if (a.script === 'mara') {
        const c = t % SCRIPT_P;
        let d = 0, show = false;
        if (c >= maraT.drive0 && c < maraT.drive0 + maraT.drive) {
          show = true; const rem = maraT.drive0 + maraT.drive - c;
          d = rem < 2 ? maraDrive.len - 0.5 * (DRIVE / 2) * rem * rem : (c - maraT.drive0) * DRIVE + DRIVE;
          d = Math.min(d, maraDrive.len);
        } else if (c >= maraT.drive0 + maraT.drive && c < SCRIPT_P - 1) { show = true; d = maraDrive.len; }
        const q = maraDrive.at(d);
        maraCar.visible = show; maraCar.position.set(q.x, 0, q.z); maraCar.rotation.y = q.yaw;
        if (c >= maraT.walk0 && c < maraT.walk0 + maraT.walk) {
          const w = maraWalk.at((c - maraT.walk0) * WALK); p.root.visible = true; p.root.position.set(w.x, 0, w.z); p.root.rotation.y = w.yaw; pose(p, 'walk', t, 1);
          p.carPos = null;
        } else { p.root.visible = false; p.carPos = show ? maraCar.position : null; }
        return;
      }
      if (a.pose === 'paddle') {
        const w = W(a.at);
        p.root.position.z = w[1] + ballZ(t) * 0.9;
      }
      pose(p, a.pose, t, p.i * 0.7);
    });
    pose(manager, 'type', t, 3);

    // ring pulse, idle zz
    people.forEach((p) => {
      const sel = p.i === state.selected;
      p.ring.material.opacity = sel ? 1 : 0.85;
    });
    const sleeper = people.find((p) => p.a.status === 'idle' && p.root.visible && !p.a.script);
    const zc = (t % 2.6) / 2.6;
    if (sleeper) {
      zz.position.set(sleeper.root.position.x + 0.8 + zc * 0.6, 5.2 + zc * 2, sleeper.root.position.z);
      zz.material.opacity = Math.sin(zc * PI);
      zz.visible = sleeper.tag.visible;
    } else zz.visible = false;

    // selection arrow
    const sp = people[state.selected];
    const ap = sp.root.visible ? sp.root.position : (sp.carPos || sp.root.position);
    arrow.visible = sp.root.visible || !!sp.carPos;
    arrow.position.set(ap.x, (sp.root.visible ? 7.6 : 6.2) + Math.sin(t * 5) * 0.3, ap.z);
    arrow.rotation.y += dt * 2;
    sp.tag.scale.set(6.4, 1.6, 1);
    people.forEach((p) => { if (p !== sp) p.tag.scale.set(5.6, 1.4, 1); });
  }
  function ballZ(tt) { return Math.sin(tt * 1.3) * 1.2; }
  function updateProps() {
    millBlades.forEach((h, i) => { h.rotation.z = t * 0.9 + i; });
    // ping-pong ball between the two players
    const per = 1.4, c = (t % (per * 2)) / per, u = c < 1 ? c : 2 - c;
    const x0 = W([7.9, 0])[0], x1 = W([18.1, 0])[0];
    ball.position.set(x0 + (x1 - x0) * u, 2.9 + Math.sin(u * PI) * 1.6, W([0, 51])[1] + ballZ(t) * 0.9);
    // steam
    const m = W([82.2, 17.3]);
    steam.forEach((s, i) => { const k = ((t * 0.5 + i / 3) % 1); s.position.set(m[0] + Math.sin(k * 6 + i) * 0.2, 5.7 + k * 2.2, m[1]); s.material.opacity = 0.8 * (1 - k); s.rotation.y = k * 3; });
    // traffic
    traffic.forEach((c) => {
      const pos = ((c.s + t * c.speed) % SPAN) - SPAN / 2;
      const v = c.dir > 0 ? pos : -pos;
      if (c.axis === 'x') { c.car.position.set(v, 0, c.lane); c.car.rotation.y = c.dir > 0 ? PI / 2 : -PI / 2; }
      else { c.car.position.set(c.lane, 0, v); c.car.rotation.y = c.dir > 0 ? 0 : PI; }
    });
  }

  function updateCamera(dt) {
    if (state.auto) cam.goal.theta += dt * 0.14;
    if (state.follow) {
      const sp = people[state.selected];
      const fp = sp.root.visible ? sp.root.position : (sp.carPos || sp.root.position);
      cam.goal.target.set(fp.x, 2.5, fp.z);
    }
    const k = 1 - Math.exp(-dt * 7);
    cam.theta += (cam.goal.theta - cam.theta) * k;
    cam.phi += (cam.goal.phi - cam.phi) * k;
    cam.dist += (cam.goal.dist - cam.dist) * k;
    cam.target.lerp(cam.goal.target, k);
    const sinP = Math.sin(cam.phi);
    camera.position.set(cam.target.x + cam.dist * sinP * Math.sin(cam.theta), cam.target.y + cam.dist * Math.cos(cam.phi), cam.target.z + cam.dist * sinP * Math.cos(cam.theta));
    camera.lookAt(cam.target);
    scene.fog.near = 90 + cam.dist * 0.8;
    scene.fog.far = Math.min(1200, 380 + cam.dist * 1.8);
    needle.style.transform = 'rotate(' + cam.theta + 'rad)';
  }
  const needle = document.getElementById('needle');

  // status screen + clock
  function tickClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 700 ? 52 : 42;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t += reduceMotion ? dt * 0.5 : dt;
    updateCamera(dt);
    updatePeople(dt);
    updateProps();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // boot
  setWalls('cut');
  setQuality(state.quality);
  state.city = true;
  renderChips(); renderCard(); applyFilter(); drawBoards(); tickClock();
  setInterval(tickClock, 30000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    people.forEach((p) => { p.tagMat.map.dispose(); p.tagMat.map = tagTexture(p.a.name, STATUS[p.a.status].color); p.tagMat.needsUpdate = true; });
    drawBoards();
  });
  renderAccount(); updateBadge();
  if (live) {
    setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  loadingEl.hidden = true;
  requestAnimationFrame((n) => { last = n; frame(n); });
}

connect()
  .catch((err) => ({ mode: 'demo', reason: 'error', error: err.message }))
  .then(startScene);
