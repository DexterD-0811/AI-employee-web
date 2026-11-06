// The Little Faith Bots team room: a cut-away studio in the Little Faith Club sticker style.
// Each employee has a desk along the back wall (nameplate, chair in their colour, lamp, a screen showing their
// work, a status light). On shift they sit at it typing; waiting for you they turn round and wave; on break or
// with nothing to do they sit in the tea-break nook; paused, their desk goes dark. Drafts float from the
// writers' desks past the reviewer to the owner's desk by the door, where the gold sign counts what's waiting.
//
// createTeamRoom(canvas, { onPick }) builds the scene once; the app then calls setTeam(), setBoard(), setYes(),
// select(), setSky(), setView(), setSpin() and setFollow() as data and choices change.

import * as THREE from 'three';

const T = THREE, PI = Math.PI;
export const C = {
  navy: '#1e2452', night: '#141a3e', gold: '#e9a93a', gold2: '#f7b844', goldL: '#fcefcf', cream: '#fdf1d8', wall: '#fffaf0',
  sage: '#5e9c76', sageD: '#3f7a57', grass2: '#4c8a64', coral: '#ee8f78', plum: '#6a4c8e', blue: '#6f9fc2', path: '#f3dfb2',
  wood: '#d9a86c', woodD: '#b9844f', trunk: '#8a5a3c', floor: '#ecc995', lav: '#b9a3d6', grey: '#a3a9bd', ink2: '#4b5279'
};
const STICKERS = { star: '/stickers/star.png', dove: '/stickers/dove.png', hand: '/stickers/hand.png', moon: '/stickers/moon.png', sun: '/stickers/sun.png' };

// how each status looks in the room
export const MODES = {
  working: { at: 'desk', pose: 'type', awake: true, ring: C.gold2, light: C.gold2 },
  waiting: { at: 'desk', pose: 'wave', awake: true, ring: C.coral, light: C.coral },
  paused: { at: 'desk', pose: 'still', awake: false, ring: C.grey, light: C.grey },
  break: { at: 'nook', pose: 'sleep', awake: false, ring: C.lav, light: C.lav },
  idle: { at: 'nook', pose: 'rest', awake: true, ring: '#d6dce7', light: '#d6dce7' }
};

export function createTeamRoom(canvas, opts) {
  opts = opts || {};
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new T.Scene();
  renderer.setClearColor('#6a5a96');
  const camera = new T.PerspectiveCamera(40, 1, 1, 3000);

  // ---------------------------------------------------------------- materials: flat toon shading and sticker outlines
  const ramp = new T.DataTexture(new Uint8Array([120, 195, 255]), 3, 1, T.LuminanceFormat);
  ramp.minFilter = ramp.magFilter = T.NearestFilter; ramp.needsUpdate = true;
  const mats = {};
  const toon = (c) => mats[c] || (mats[c] = new T.MeshToonMaterial({ color: c, gradientMap: ramp }));
  const flat = (c) => new T.MeshBasicMaterial({ color: c });
  const NAVY_HULL = new T.MeshBasicMaterial({ color: C.navy, side: T.BackSide });
  const WHITE_HULL = new T.MeshBasicMaterial({ color: '#ffffff', side: T.BackSide });
  function sticker(mesh, navy, white) {
    const g = mesh.geometry; g.computeBoundingBox();
    const s = new T.Vector3(); g.boundingBox.getSize(s);
    const add = (m, t) => { const h = new T.Mesh(g, m); h.scale.set(1 + 2 * t / Math.max(s.x, .01), 1 + 2 * t / Math.max(s.y, .01), 1 + 2 * t / Math.max(s.z, .01)); mesh.add(h); };
    if (navy !== 0) add(NAVY_HULL, navy == null ? .25 : navy);
    if (white !== 0) add(WHITE_HULL, white == null ? .6 : white);
    return mesh;
  }
  function part(geo, color, x, y, z, parent, o) {
    o = o || {};
    const m = new T.Mesh(geo, o.mat || (o.basic ? flat(color) : toon(color)));
    m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz;
    if (o.outline !== false) sticker(m, o.navy, o.white);
    (parent || scene).add(m);
    return m;
  }
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  function liveCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const tex = new T.CanvasTexture(c); tex.anisotropy = 4; return { c, ctx: c.getContext('2d'), tex }; }
  function canvasTex(w, h, draw) { const l = liveCanvas(w, h); draw(l.ctx, w, h); l.tex.needsUpdate = true; return l.tex; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, text, max) { if (ctx.measureText(text).width <= max) return text; let s = text; while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; }
  const loader = new T.TextureLoader();
  const imgTex = (src) => loader.load(src);
  function picture(tex, w, h, x, y, z, parent, ry) { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: true })); m.position.set(x, y, z); if (ry) m.rotation.y = ry; (parent || scene).add(m); return m; }
  const glowTex = canvasTex(256, 256, (c) => { const g = c.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,214,140,.95)'); g.addColorStop(.35, 'rgba(247,184,68,.45)'); g.addColorStop(1, 'rgba(247,184,68,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); });
  const glowMat = new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const glow = (s, x, y, z, parent) => { const g = new T.Sprite(glowMat); g.scale.set(s, s, 1); g.position.set(x, y, z); parent.add(g); return g; };
  const zTex = canvasTex(64, 64, (c) => { c.font = '600 48px Fredoka, sans-serif'; c.textAlign = 'center'; c.lineWidth = 8; c.strokeStyle = C.navy; c.strokeText('z', 32, 48); c.fillStyle = '#ffffff'; c.fillText('z', 32, 48); });

  // ---------------------------------------------------------------- sky, worked out from the view direction
  const SKIES = {
    evening: { sky: ['#141a3e', '#2f3780', '#6a5a96', '#f0a37a'], fog: '#6a5a96', hemi: [.55, '#c4c9f2', '#3f7a57'], sun: ['#ffe2b0', .6], night: true },
    morning: { sky: ['#8fc0e2', '#cfe3f0', '#eef0e6', '#ffe2a8'], fog: '#eef0e6', hemi: [.66, '#ffffff', '#5e9c76'], sun: ['#fff6e0', .68], night: false }
  };
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new T.Color() }, mid: { value: new T.Color() }, low: { value: new T.Color() }, glow: { value: new T.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 glow; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.22 ? mix(mid, top, smoothstep(0.22, 0.85, h)) : mix(low, mid, smoothstep(0.0, 0.22, h)); vec3 d = normalize(vec3(vP.x, 0.0001, vP.z)); float g = max(0.0, dot(d, normalize(vec3(-0.6, 0.0, -0.8)))); c = mix(c, glow, pow(g, 5.0) * (1.0 - smoothstep(-0.02, 0.3, h)) * 0.85); gl_FragColor = vec4(c, 1.0); }'
  });
  const skyDome = new T.Mesh(new T.SphereGeometry(1400, 32, 24), skyMat); skyDome.renderOrder = -1; scene.add(skyDome);
  const hemi = new T.HemisphereLight('#c4c9f2', '#3f7a57', .55); scene.add(hemi);
  const sun = new T.DirectionalLight('#ffe2b0', .6); sun.position.set(160, 260, 200); scene.add(sun);
  scene.fog = new T.Fog('#6a5a96', 330, 1000);
  const starGeo = new T.BufferGeometry(); const sp = [];
  for (let i = 0; i < 420; i++) { const th = Math.random() * PI * 2, ph = Math.random() * .42 * PI; sp.push(Math.cos(th) * Math.sin(ph) * 1300, Math.cos(ph) * 1300 + 60, Math.sin(th) * Math.sin(ph) * 1300); }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
  const stars = new T.Points(starGeo, new T.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .9 }));
  scene.add(stars);
  function spriteImg(src, w, x, y, z, ratio) { const s = new T.Sprite(new T.SpriteMaterial({ map: imgTex(src), transparent: true, fog: false, depthWrite: false })); s.scale.set(w, w * (ratio || 1), 1); s.position.set(x, y, z); scene.add(s); return s; }
  const moon = spriteImg(STICKERS.moon, 150, -380, 330, -860, 1.13);
  const sunSprite = spriteImg(STICKERS.sun, 190, -380, 330, -860, .97);
  const skyStars = [spriteImg(STICKERS.star, 30, -160, 170, -320, .97), spriteImg(STICKERS.star, 22, 200, 200, -300, .97), spriteImg(STICKERS.star, 26, 40, 240, -430, .97)];
  const dove = spriteImg(STICKERS.dove, 24, 0, 70, 0, .76);

  // ---------------------------------------------------------------- the land around the team room
  const hillH = (x, z) => { const r = Math.hypot(x, z), a = Math.atan2(z, x), r2 = Math.max(0, r - 170); return Math.min(90, r2 * r2 * .00018) * (.75 + .25 * Math.sin(a * 3 + 1) + .15 * Math.sin(a * 7)) + 4 * Math.sin(x * .021) * Math.sin(z * .017) * Math.min(1, r2 / 50); };
  (function () {
    const g = new T.PlaneGeometry(2000, 2000, 120, 120); g.rotateX(-PI / 2);
    const p = g.attributes.position, col = [], a = new T.Color(C.sage), b = new T.Color(C.grass2), c = new T.Color(C.sageD);
    for (let i = 0; i < p.count; i++) { const y = hillH(p.getX(i), p.getZ(i)); p.setY(i, y); const k = y < 6 ? a : y < 40 ? b : c; col.push(k.r, k.g, k.b); }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    scene.add(new T.Mesh(g, new T.MeshToonMaterial({ vertexColors: true, gradientMap: ramp })));
    [[-420, -620, 260, C.sageD], [140, -760, 330, '#356d4f'], [560, -560, 240, C.sageD], [-760, -260, 280, '#356d4f'], [760, -140, 260, C.grass2], [-300, 700, 300, '#356d4f'], [500, 620, 260, C.sageD]]
      .forEach((h) => { const m = new T.Mesh(new T.SphereGeometry(h[2], 28, 14, 0, PI * 2, 0, PI / 2), toon(h[3])); m.scale.y = .42; m.position.set(h[0], hillH(h[0], h[1]) - 6, h[1]); scene.add(m); });
  })();
  function flatOn(geo, color, x, z, y, rz) { const m = new T.Mesh(geo, toon(color)); m.rotation.x = -PI / 2; m.rotation.z = rz || 0; m.position.set(x, y || .08, z); scene.add(m); return m; }
  function tree(x, z, s, i) {
    const y = hillH(x, z), greens = [C.sageD, C.sage, C.grass2, '#6aa77f'];
    part(new T.CylinderGeometry(.9 * s, 1.2 * s, 7 * s, 8), C.trunk, x, y + 3.5 * s, z, scene, { navy: .2, white: .5 });
    part(new T.SphereGeometry(5.5 * s, 18, 14), greens[i % 4], x, y + 10 * s, z, scene, { navy: .35, white: .9 });
  }
  function pine(x, z, s) {
    const y = hillH(x, z);
    part(new T.CylinderGeometry(.8 * s, 1 * s, 4 * s, 8), C.trunk, x, y + 2 * s, z, scene, { outline: false });
    part(new T.ConeGeometry(5 * s, 9 * s, 10), C.sageD, x, y + 7.5 * s, z, scene, { navy: .3, white: .8 });
    part(new T.ConeGeometry(3.6 * s, 7 * s, 10), C.grass2, x, y + 11.5 * s, z, scene, { navy: .3, white: .8 });
  }
  [[-110, -90, 1.4], [-60, -105, 1.1], [10, -112, 1.3], [80, -100, 1.2], [118, -40, 1.1], [-118, -10, 1.2], [-112, 60, 1], [120, 70, 1], [-60, 110, 1.1], [170, 120, 1.6], [-190, -140, 1.7], [210, -150, 1.6], [-240, 40, 1.8], [250, 20, 1.7], [-150, 170, 1.5], [60, 190, 1.4]]
    .forEach((t, i) => (i % 4 === 3 ? pine(t[0], t[1], t[2]) : tree(t[0], t[1], t[2], i)));
  (function () { // a little church on a far hill
    const x = -230, z = -330, y = hillH(x, z) - 2; const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(1.6); scene.add(g);
    part(box(14, 10, 10), C.wall, 0, 5, 0, g, { navy: .3, white: .8 });
    part(new T.CylinderGeometry(6.4, 6.4, 16, 3), C.coral, 0, 13.2, 0, g, { navy: .3, white: .8 }).rotation.set(-PI / 2, 0, PI / 2);
    part(box(4, 10, 4), C.wall, 6, 13, 0, g, { navy: .3, white: .8 });
    part(new T.ConeGeometry(3.4, 6, 4), C.navy, 6, 21, 0, g, { ry: PI / 4, outline: false });
  })();

  // ---------------------------------------------------------------- the room
  const RW = 150, RD = 96, WH = 42, LOW = 4.5;
  const room = new T.Group(); scene.add(room);
  const floorTex = canvasTex(512, 512, (c) => {
    c.fillStyle = C.floor; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? 'rgba(185,132,79,.10)' : 'rgba(255,255,255,.06)'; c.fillRect(0, i * 32, 512, 32); c.fillStyle = 'rgba(138,90,60,.28)'; c.fillRect(0, i * 32, 512, 2); const off = (i * 97) % 512; c.fillRect(off, i * 32, 2, 32); c.fillRect((off + 256) % 512, i * 32, 2, 32); }
  });
  floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping; floorTex.repeat.set(3, 2);
  part(box(RW, 2, RD), C.floor, 0, -.9, 0, room, { mat: new T.MeshToonMaterial({ map: floorTex, gradientMap: ramp }), navy: .4, white: 1.2 });
  const wallMat = toon(C.wall);
  const wall = (w, h, d, x, z) => part(box(w, h, d), C.wall, x, h / 2, z, room, { mat: wallMat, navy: .35, white: .9 });
  wall(RW, WH, 2, 0, -RD / 2); wall(2, WH, RD, -RW / 2, 0);
  wall(RW - 30, LOW, 2, 15, RD / 2); wall(2, LOW, RD, RW / 2, 0);
  part(box(RW + 2, 1.6, 3), C.gold, 0, WH + .4, -RD / 2, room, { navy: .3, white: .7 });
  part(box(3, 1.6, RD + 2), C.gold, -RW / 2, WH + .4, 0, room, { navy: .3, white: .7 });
  part(box(RW - 2, 3, .4), C.sage, 0, 1.5, -RD / 2 + 1.2, room, { outline: false });
  part(box(.4, 3, RD - 2), C.sage, -RW / 2 + 1.2, 1.5, 0, room, { outline: false });
  function windowTex(night) { return canvasTex(128, 160, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); if (night) { g.addColorStop(0, '#1e2452'); g.addColorStop(.7, '#6a4c8e'); g.addColorStop(1, '#f0a37a'); } else { g.addColorStop(0, '#8fc0e2'); g.addColorStop(1, '#fdf1d8'); } c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = C.sageD; c.beginPath(); c.ellipse(40, h + 30, 90, 60, 0, 0, PI * 2); c.fill(); c.fillStyle = C.sage; c.beginPath(); c.ellipse(110, h + 40, 80, 60, 0, 0, PI * 2); c.fill(); if (night) { c.fillStyle = '#ffffff'; [[20, 22], [90, 40], [60, 14], [104, 80]].forEach((s) => c.fillRect(s[0], s[1], 3, 3)); } c.fillStyle = '#ffffff'; c.fillRect(w / 2 - 3, 0, 6, h); c.fillRect(0, h * .45 - 3, w, 6); }); }
  const winTex = { night: windowTex(true), day: windowTex(false) };
  const panes = [];
  function windowOn(x, y, z, ry) {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; room.add(g);
    part(box(15, 19, 1), '#ffffff', 0, 0, 0, g, { navy: .3, white: 0 });
    const p = new T.Mesh(new T.PlaneGeometry(13, 17), new T.MeshBasicMaterial({ map: winTex.night })); p.position.z = .55; g.add(p); panes.push(p);
    part(box(17, 1.2, 2.4), C.woodD, 0, -10, 1, g, { navy: .2, white: 0 });
  }
  windowOn(-62, 15, -RD / 2 + 1.1); windowOn(62, 15, -RD / 2 + 1.1);
  windowOn(-RW / 2 + 1.1, 15, -24, PI / 2); windowOn(-RW / 2 + 1.1, 15, 28, PI / 2);
  function signTex(lines, bg, fg, w, h) {
    return canvasTex(w, h, (c) => {
      c.fillStyle = bg; rr(c, 6, 6, w - 12, h - 12, 28); c.fill(); c.lineWidth = 8; c.strokeStyle = '#ffffff'; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      lines.forEach((l) => { c.font = l[1]; c.fillStyle = l[3] || fg; c.fillText(l[0], w / 2, l[2]); });
    });
  }
  picture(signTex([['Little Faith Club', '600 58px Fredoka, sans-serif', 62], ['THE TEAM ROOM', '800 26px Nunito, sans-serif', 112, C.gold2]], C.navy, '#ffffff', 600, 150), 36, 9, 0, 37, -RD / 2 + 1.2, room);
  // work board (redrawn from real drafts by setBoard)
  const board = liveCanvas(1024, 360);
  part(box(56, 19.6, 1), C.woodD, 0, 24, -RD / 2 + 1.4, room, { navy: .3, white: 0 });
  picture(board.tex, 54, 19, 0, 24, -RD / 2 + 2, room);
  // clock showing the real time
  const clock = liveCanvas(256, 256);
  picture(clock.tex, 8, 8, 52, 35, -RD / 2 + 1.2, room);
  function drawClock() {
    const c = clock.ctx, d = new Date(), h = d.getHours() % 12 + d.getMinutes() / 60, m = d.getMinutes();
    c.clearRect(0, 0, 256, 256); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(128, 128, 120, 0, PI * 2); c.fill(); c.lineWidth = 14; c.strokeStyle = C.navy; c.stroke();
    c.fillStyle = C.navy; for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; c.beginPath(); c.arc(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92, 6, 0, PI * 2); c.fill(); }
    c.lineCap = 'round'; c.lineWidth = 12; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(h / 12 * PI * 2) * 52, 128 - Math.cos(h / 12 * PI * 2) * 52); c.stroke();
    c.lineWidth = 8; c.strokeStyle = C.gold; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(m / 60 * PI * 2) * 80, 128 - Math.cos(m / 60 * PI * 2) * 80); c.stroke();
    clock.tex.needsUpdate = true;
  }
  drawClock(); setInterval(drawClock, 30000);
  // today's shifts by the door (redrawn by setTeam)
  const shifts = liveCanvas(512, 420);
  picture(shifts.tex, 17, 14, -RW / 2 + 1.2, 16, 2, room, PI / 2);

  // tea-break nook: rug, a long sofa with four seats, a table with mugs, a kettle on a shelf
  const NOOK = { x: -44, z: 24 };
  flatOn(new T.CircleGeometry(22, 40), '#f9d3c7', NOOK.x, NOOK.z, .15);
  flatOn(new T.CircleGeometry(16, 40), '#fcefcf', NOOK.x, NOOK.z, .2);
  (function () {
    const g = new T.Group(); g.position.set(NOOK.x, 0, NOOK.z - 6); room.add(g);
    part(box(42, 4, 9), C.coral, 0, 3.2, 0, g, { navy: .3, white: .8 });
    part(box(42, 8, 3), C.coral, 0, 7.5, -4, g, { navy: .3, white: .8 });
    part(box(3, 6, 9), C.coral, -21, 5, 0, g, { navy: .3, white: .8 }); part(box(3, 6, 9), C.coral, 21, 5, 0, g, { navy: .3, white: .8 });
    [-14.5, -4.8, 4.8, 14.5].forEach((cx) => part(box(9, 1.6, 7), '#f9d3c7', cx, 6, .6, g, { navy: .2, white: 0 }));
    const t = new T.Group(); t.position.set(NOOK.x, 0, NOOK.z + 9); room.add(t);
    part(new T.CylinderGeometry(6, 6, 1, 20), C.wood, 0, 5, 0, t, { navy: .25, white: .6 });
    part(new T.CylinderGeometry(.8, .8, 5, 8), C.woodD, 0, 2.5, 0, t, { outline: false });
    [[-2.5, 1], [2, -1.5]].forEach((m) => part(new T.CylinderGeometry(1, .9, 2, 12), '#ffffff', m[0], 6.5, m[1], t, { navy: .18, white: 0 }));
    part(new T.SphereGeometry(1.6, 10, 8), C.gold2, 1.8, 6.4, 2.4, t, { navy: .18, white: 0 });
    part(box(4, 1, 16), C.woodD, -RW / 2 + 3, 13, NOOK.z + 6, room, { navy: .2, white: 0 });
    part(new T.SphereGeometry(2.2, 14, 10), C.blue, -RW / 2 + 3.4, 15.4, NOOK.z + 2, room, { navy: .2, white: .5 });
    part(new T.CylinderGeometry(1.1, 1, 2.4, 12), '#ffffff', -RW / 2 + 3.4, 14.6, NOOK.z + 9, room, { navy: .18, white: 0 });
    picture(signTex([['Tea break', '600 46px Fredoka, sans-serif', 64]], C.coral, C.navy, 360, 128), 12, 4.3, -RW / 2 + 1.2, 21, NOOK.z + 6, room, PI / 2);
    part(new T.CylinderGeometry(2.4, 2, 4, 12), C.coral, NOOK.x + 26, 2, NOOK.z - 9, room, { navy: .2, white: .5 });
    part(new T.SphereGeometry(4, 14, 10), C.sage, NOOK.x + 26, 7, NOOK.z - 9, room, { navy: .3, white: .8 });
  })();
  const NOOK_SEATS = [-14.5, -4.8, 4.8, 14.5].map((dx) => new T.Vector3(NOOK.x + dx, 0, NOOK.z - 3.5));

  // the owner's desk by the door: drafts land in the gold tray
  const YOU = { x: 46, z: 26 };
  const youG = new T.Group(); youG.position.set(YOU.x, 0, YOU.z); youG.rotation.y = -.35; room.add(youG);
  part(box(30, 1.4, 14), C.gold, 0, 8.6, 0, youG, { navy: .3, white: .8 });
  part(box(28, 8, 1), C.woodD, 0, 4, -6, youG, { outline: false });
  [[-14, 6], [14, 6]].forEach((l) => part(box(1.2, 8, 1.2), C.woodD, l[0], 4, l[1], youG, { outline: false }));
  part(box(12, 1.4, 8), '#ffffff', -4, 10, 0, youG, { navy: .25, white: 0 });
  const trayPages = [0, 1, 2, 3].map((i) => part(box(9, .3, 6.4), i % 2 ? '#fcefcf' : '#ffffff', -4 + i * .6, 11 + i * .45, i * .3, youG, { navy: .12, white: 0, ry: i * .1 }));
  part(new T.SphereGeometry(1.4, 12, 10, 0, PI * 2, 0, PI / 2), C.gold2, 8, 9.3, 1, youG, { navy: .2, white: .4 });
  const yesSign = liveCanvas(560, 200);
  const yesSprite = new T.Sprite(new T.SpriteMaterial({ map: yesSign.tex, transparent: true, depthWrite: false })); yesSprite.scale.set(26, 9.3, 1); yesSprite.position.set(0, 24, 0); youG.add(yesSprite);
  const trayGlow = glow(18, -3, 12, 0, youG);
  const youHit = new T.Mesh(box(30, 26, 16), new T.MeshBasicMaterial({ visible: false })); youHit.position.y = 12; youHit.userData.pick = 'yes'; youG.add(youHit);
  const boardHit = new T.Mesh(box(56, 20, 4), new T.MeshBasicMaterial({ visible: false })); boardHit.position.set(0, 24, -RD / 2 + 3); boardHit.userData.pick = 'board'; room.add(boardHit);
  // door, mat, Open sign, and handprint stepping stones up the path
  flatOn(new T.PlaneGeometry(16, 6), C.coral, -RW / 2 + 15, RD / 2 + 5, .12);
  picture(signTex([['Open', '600 44px Fredoka, sans-serif', 64]], C.gold2, C.navy, 240, 128), 7, 3.7, -RW / 2 + 31, 7.6, RD / 2 + 1.1, room);
  const handTex = imgTex(STICKERS.hand);
  for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.PlaneGeometry(6, 6.6), new T.MeshBasicMaterial({ map: handTex, transparent: true, color: C.cream, depthWrite: false })); m.rotation.x = -PI / 2; m.rotation.z = (i % 2 ? .25 : -.2); m.position.set(-RW / 2 + 15 + (i % 2 ? 2 : -2), .2, RD / 2 + 14 + i * 11); scene.add(m); }
  // Pip the lamb, the club's mascot, asleep on the doormat
  const lamb = new T.Group(); lamb.position.set(-RW / 2 + 22, 0, RD / 2 + 9); lamb.rotation.y = -.6; scene.add(lamb);
  [[0, 2.6, 0, 2.6], [-2, 2.4, .4, 2], [2, 2.4, .3, 2], [0, 3.6, 1.4, 1.9], [0, 3.4, -1.6, 1.9], [-1.6, 3.9, -.6, 1.6], [1.6, 3.9, -.6, 1.6]].forEach((s) => part(new T.SphereGeometry(s[3], 16, 12), '#ffffff', s[0], s[1], s[2], lamb, { navy: .26, white: 0 }));
  const lambHead = new T.Group(); lambHead.position.set(0, 2.6, 3.4); lamb.add(lambHead);
  (function () { const hg = new T.SphereGeometry(1.7, 16, 12); hg.scale(1, 1.05, 1.1); part(hg, C.navy, 0, 0, 0, lambHead, { navy: 0, white: .5 }); part(new T.SphereGeometry(.9, 12, 10), '#ffffff', 0, 1.4, -.3, lambHead, { navy: .18, white: 0 }); [-1, 1].forEach((sx) => { const e = part(new T.SphereGeometry(.7, 10, 8), C.navy, sx * 1.6, .5, -.4, lambHead, { outline: false }); e.scale.set(1.2, .5, .8); }); })();
  const lambZ = new T.Sprite(new T.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false })); lambZ.scale.set(2.6, 2.6, 1); scene.add(lambZ);
  // a draft travelling along a dotted route on the floor
  const flyer = part(box(5, .3, 3.6), '#ffffff', 0, 0, 0, scene, { navy: .14, white: 0 });
  glow(8, 0, 0, 0, flyer);
  const routeDots = new T.Group(); scene.add(routeDots);
  let route = null;

  // ---------------------------------------------------------------- desks and bots
  const DESK_Z = -RD / 2 + 14;
  const hitboxes = [youHit, boardHit];
  const team = new Map(); // id -> { desk, bot, data }

  function drawScreen(s, x) {
    const c = s.ctx, w = 320, h = 200;
    c.clearRect(0, 0, w, h); c.textBaseline = 'middle'; c.lineCap = 'round'; c.textAlign = 'left';
    const dark = x.kind === 'asleep' || x.kind === 'paused';
    c.fillStyle = dark ? '#2c3878' : '#ffffff'; c.fillRect(0, 0, w, h);
    if (dark) {
      c.textAlign = 'center';
      if (x.kind === 'asleep') { c.fillStyle = C.cream; c.beginPath(); c.arc(160, 80, 30, 0, PI * 2); c.fill(); c.fillStyle = '#2c3878'; c.beginPath(); c.arc(176, 70, 28, 0, PI * 2); c.fill(); }
      else { c.fillStyle = C.cream; c.fillRect(140, 54, 14, 52); c.fillRect(166, 54, 14, 52); }
      c.fillStyle = '#d9ddf0'; c.font = '700 22px Nunito, sans-serif'; c.fillText(fit(c, x.title || '', 290), 160, 150);
    } else {
      c.fillStyle = C.cream; c.fillRect(0, 0, w, 34); c.fillStyle = C.navy; c.font = '800 18px Nunito, sans-serif'; c.fillText(fit(c, x.title || '', 292), 14, 18);
      if (x.kind === 'pins') {
        [[18, C.coral], [118, C.gold2], [218, C.blue]].forEach((p, i) => { c.fillStyle = p[1]; rr(c, p[0], 46, 86, 120, 10); c.fill(); c.fillStyle = 'rgba(255,255,255,.9)'; rr(c, p[0] + 8, 120, 70, 38, 6); c.fill(); c.fillStyle = C.navy; c.font = '700 11px Nunito, sans-serif'; c.fillText('Pin ' + (i + 1), p[0] + 14, 139); });
      } else if (x.kind === 'checks') {
        const items = x.checks || ['Scripture', 'Faith', 'Voice', 'Prices and facts'];
        items.slice(0, 4).forEach((t, i) => {
          const y = 58 + i * 34, ok = i < (x.done == null ? 3 : x.done); c.fillStyle = ok ? '#d3e7d3' : '#fcefcf'; rr(c, 14, y - 13, 292, 26, 13); c.fill();
          c.strokeStyle = ok ? '#3f7a57' : C.gold; c.lineWidth = 4; c.beginPath(); if (ok) { c.moveTo(26, y); c.lineTo(32, y + 6); c.lineTo(42, y - 6); } else c.arc(34, y, 6, 0, PI * 1.4); c.stroke();
          c.fillStyle = C.navy; c.font = '700 16px Nunito, sans-serif'; c.fillText(t, 54, y);
        });
      } else if (x.kind === 'email') {
        c.fillStyle = C.goldL; rr(c, 14, 46, 292, 28, 8); c.fill(); c.fillStyle = C.navy; c.font = '800 14px Nunito, sans-serif'; c.fillText(fit(c, x.sub || 'Subject', 270), 24, 60);
        for (let i = 0; i < 4; i++) { c.fillStyle = i === 0 ? C.sage : '#d6dce7'; rr(c, 14, 86 + i * 22, i === 3 ? 160 : 292, 10, 5); c.fill(); }
        c.fillStyle = C.gold; rr(c, 14, 176, 100, 16, 8); c.fill();
      } else if (x.kind === 'waiting') {
        c.textAlign = 'center'; c.fillStyle = C.coral; c.beginPath(); c.moveTo(160, 132); c.bezierCurveTo(110, 100, 120, 56, 160, 76); c.bezierCurveTo(200, 56, 210, 100, 160, 132); c.fill();
        c.fillStyle = C.navy; c.font = '800 18px Nunito, sans-serif'; c.fillText(fit(c, x.sub || 'Waiting for your yes', 290), 160, 164);
      } else { // a landing page
        c.fillStyle = C.navy; rr(c, 14, 46, 200, 18, 6); c.fill();
        for (let i = 0; i < 3; i++) { c.fillStyle = '#d6dce7'; rr(c, 14, 76 + i * 18, 292 - i * 40, 9, 4); c.fill(); }
        c.fillStyle = '#dbe8f1'; rr(c, 226, 40, 80, 60, 8); c.fill();
        c.fillStyle = C.gold; rr(c, 14, 150, 120, 26, 13); c.fill();
      }
    }
    s.tex.needsUpdate = true;
  }
  function faceTex(awake, light) {
    return canvasTex(256, 180, (c, w, h) => {
      c.fillStyle = C.navy; rr(c, 6, 6, w - 12, h - 12, 54); c.fill(); c.lineCap = 'round';
      if (awake) {
        c.fillStyle = C.gold2; [[88, 78], [168, 78]].forEach((e) => { c.beginPath(); c.ellipse(e[0], e[1], 15, 19, 0, 0, PI * 2); c.fill(); });
        c.fillStyle = '#ffffff'; [[94, 70], [174, 70]].forEach((e) => { c.beginPath(); c.arc(e[0], e[1], 5, 0, PI * 2); c.fill(); });
        c.strokeStyle = C.gold2; c.lineWidth = 9; c.beginPath(); c.arc(128, 104, 24, PI * .15, PI * .85); c.stroke();
      } else {
        c.strokeStyle = light; c.lineWidth = 9; [[88, 84], [168, 84]].forEach((e) => { c.beginPath(); c.arc(e[0], e[1] - 8, 16, PI * .15, PI * .85); c.stroke(); });
        c.beginPath(); c.arc(128, 118, 10, PI * .2, PI * .8); c.stroke();
      }
      c.fillStyle = 'rgba(238,143,120,.55)'; [[60, 120], [196, 120]].forEach((e) => { c.beginPath(); c.ellipse(e[0], e[1], 16, 9, 0, 0, PI * 2); c.fill(); });
    });
  }
  // in the nook, bots sit close together, so only the selected one shows its speech bubble
  function drawLabel(l, d, talk = true) {
    const c = l.ctx; c.clearRect(0, 0, 512, 256); c.textAlign = 'center'; c.textBaseline = 'middle';
    if (talk) {
    c.font = '700 36px Andika, Nunito, sans-serif';
    const say = fit(c, d.say || '', 440), bw = Math.min(500, c.measureText(say).width + 60);
    c.fillStyle = '#ffffff'; c.strokeStyle = C.navy; c.lineWidth = 6; rr(c, 256 - bw / 2, 12, bw, 80, 38); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(240, 90); c.lineTo(256, 112); c.lineTo(272, 90); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(240, 91); c.lineTo(256, 113); c.lineTo(272, 91); c.stroke();
    c.fillStyle = C.navy; c.fillText(say, 256, 53);
    }
    c.font = '800 34px Nunito, sans-serif';
    const tag = fit(c, d.name + ' · ' + d.title, 440), nw = Math.min(500, c.measureText(tag).width + 60);
    c.fillStyle = d.light; c.strokeStyle = '#ffffff'; c.lineWidth = 8; rr(c, 256 - nw / 2, 140, nw, 66, 33); c.fill(); c.stroke();
    c.fillStyle = C.navy; c.fillText(tag, 256, 174);
    l.tex.needsUpdate = true;
  }

  function buildDesk(d, x) {
    const g = new T.Group(); g.position.set(x, 0, DESK_Z); room.add(g);
    part(box(26, 1.2, 12), C.wood, 0, 8.6, 0, g, { navy: .25, white: .6 });
    [[-12, -5], [12, -5], [-12, 5], [12, 5]].forEach((l) => part(box(1, 8, 1), C.woodD, l[0], 4, l[1], g, { outline: false }));
    part(box(8, 6, 10), C.woodD, -8.5, 5, 0, g, { navy: .2, white: 0 });
    part(box(15, 10, 1), C.navy, 0, 16.4, -3, g, { navy: 0, white: .5 });
    part(box(1.4, 3.6, 1), C.navy, 0, 10.8, -3, g, { outline: false });
    part(box(5, .5, 3), C.navy, 0, 9.4, -3, g, { outline: false });
    const screen = liveCanvas(320, 200);
    const scr = new T.Mesh(new T.PlaneGeometry(13.6, 8.6), new T.MeshBasicMaterial({ map: screen.tex })); scr.position.set(0, 16.4, -2.45); g.add(scr);
    const screenGlow = glow(16, 0, 16.4, -1.5, g); screenGlow.scale.set(18, 12, 1);
    part(new T.CylinderGeometry(.3, .3, 5, 6), C.navy, 10.5, 11.6, -3, g, { outline: false });
    part(new T.ConeGeometry(2, 2.4, 14, 1, true), d.color, 10.5, 14.2, -2.4, g, { navy: .2, white: 0, rx: .5 });
    const lampGlow = glow(10, 10.5, 12.6, -1.6, g);
    part(new T.CylinderGeometry(1, .9, 2, 12), '#ffffff', -9, 10.2, 2, g, { navy: .18, white: 0 });
    part(new T.CylinderGeometry(1.2, 1, 2, 10), C.coral, -11, 10.2, -3, g, { navy: .18, white: 0 });
    part(new T.SphereGeometry(1.8, 10, 8), C.sage, -11, 12.4, -3, g, { navy: .2, white: 0 });
    const plate = canvasTex(360, 96, (c) => { c.fillStyle = d.light; rr(c, 4, 4, 352, 88, 20); c.fill(); c.lineWidth = 6; c.strokeStyle = '#ffffff'; c.stroke(); c.fillStyle = C.navy; c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = '600 34px Fredoka, sans-serif'; c.fillText(d.name, 180, 36); c.font = '800 20px Nunito, sans-serif'; c.fillText(fit(c, d.role.toUpperCase(), 330), 180, 70); });
    part(box(13, 3.6, .6), d.light, 0, 7.4, 6.2, g, { navy: .15, white: 0 });
    picture(plate, 12.6, 3.4, 0, 7.4, 6.55, g);
    const chair = new T.Group(); g.add(chair);
    part(box(8, 1.4, 7), d.color, 0, 5.6, 0, chair, { navy: .22, white: .5 });
    part(box(8, 8, 1.4), d.color, 0, 10, 3.4, chair, { navy: .22, white: .5 });
    part(new T.CylinderGeometry(.5, .5, 4.6, 6), C.navy, 0, 2.6, 0, chair, { outline: false });
    part(new T.CylinderGeometry(3.4, 3.4, .6, 10), C.navy, 0, .4, 0, chair, { outline: false });
    const light = part(new T.SphereGeometry(1.1, 14, 12), C.gold2, 5.6, 22.4, -3, g, { basic: true, navy: .2, white: .45 });
    const lightGlow = glow(7, 5.6, 22.4, -2.4, g);
    const hit = new T.Mesh(box(26, 20, 14), new T.MeshBasicMaterial({ visible: false })); hit.position.y = 12; hit.userData.bot = d.id; g.add(hit); hitboxes.push(hit);
    return { g, screen, screenGlow, lampGlow, chair, light, lightGlow };
  }
  function buildBot(d) {
    const root = new T.Group(); scene.add(root);
    const body = new T.Group(); root.add(body);
    const ring = new T.Mesh(new T.RingGeometry(5, 5.8, 36), new T.MeshBasicMaterial({ color: C.gold2, transparent: true, opacity: .95, depthWrite: false })); ring.rotation.x = -PI / 2; ring.position.y = .3; root.add(ring);
    [-1.6, 1.6].forEach((fx) => part(new T.SphereGeometry(1.25, 12, 10), d.color, fx, 1.6, 2.4, body, { navy: .2, white: .45 }));
    const torsoGeo = new T.SphereGeometry(3.4, 24, 18); torsoGeo.scale(1, .95, .9);
    part(torsoGeo, d.color, 0, 4.8, 0, body, { navy: .3, white: .85 });
    part(new T.SphereGeometry(1.15, 14, 10), d.light, 0, 4.6, 3, body, { navy: .16, white: 0 });
    const badge = canvasTex(120, 150, (c) => { c.fillStyle = '#ffffff'; rr(c, 4, 4, 112, 142, 18); c.fill(); c.fillStyle = d.color; rr(c, 4, 4, 112, 40, 18); c.fill(); c.fillRect(4, 26, 112, 18); c.fillStyle = C.navy; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 28px Fredoka, sans-serif'; c.fillText(d.name, 60, 84); c.font = '800 16px Nunito, sans-serif'; c.fillText('TEAM', 60, 118); });
    picture(badge, 2.2, 2.75, 1.6, 3.9, 3.15, body);
    const strap = new T.Mesh(new T.TorusGeometry(2.2, .16, 6, 24, PI), toon(d.color)); strap.position.set(1.1, 6.1, 2.6); strap.rotation.z = PI; body.add(strap);
    const armL = part(new T.SphereGeometry(1.15, 12, 10), d.color, -3.7, 4.8, .6, body, { navy: .2, white: .45 });
    const armR = part(new T.SphereGeometry(1.15, 12, 10), d.color, 3.7, 4.8, .6, body, { navy: .2, white: .45 });
    const headG = new T.Group(); headG.position.y = 10.6; body.add(headG);
    const headGeo = new T.SphereGeometry(3.6, 26, 18); headGeo.scale(1.22, .9, .95);
    part(headGeo, d.color, 0, 0, 0, headG, { navy: .32, white: .9 });
    const faces = { awake: faceTex(true, d.light), asleep: faceTex(false, d.light) };
    const face = new T.Mesh(new T.PlaneGeometry(6.2, 4.4), new T.MeshBasicMaterial({ map: faces.awake, transparent: true })); face.position.set(0, -.1, 3.35); headG.add(face);
    part(new T.CylinderGeometry(.22, .22, 2.6, 6), C.navy, 0, 4.1, 0, headG, { outline: false });
    const bulbMat = new T.MeshBasicMaterial({ color: C.gold2 });
    part(new T.SphereGeometry(.95, 14, 12), C.gold2, 0, 5.6, 0, headG, { mat: bulbMat, navy: .2, white: .45 });
    const bulbGlow = glow(9, 0, 5.6, 0, headG);
    const mug = part(new T.CylinderGeometry(1, .9, 2, 12), '#ffffff', 2.6, 5.2, 3, body, { navy: .18, white: 0 });
    const label = liveCanvas(512, 256);
    const labelSprite = new T.Sprite(new T.SpriteMaterial({ map: label.tex, transparent: true, depthTest: false, depthWrite: false }));
    labelSprite.scale.set(30, 15, 1); labelSprite.position.y = 32; labelSprite.renderOrder = 10; root.add(labelSprite);
    const zz = new T.Sprite(new T.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false })); zz.scale.set(3.2, 3.2, 1); root.add(zz);
    const hit = new T.Mesh(box(11, 20, 11), new T.MeshBasicMaterial({ visible: false })); hit.position.y = 10; hit.userData.bot = d.id; root.add(hit); hitboxes.push(hit);
    return { root, body, headG, armL, armR, ring, face, faces, bulbMat, bulbGlow, mug, label, labelSprite, zz };
  }

  // members: [{ id, name, title, role, color, light, status, say, screen: { kind, title, sub } }] in desk order
  function setTeam(members) {
    const n = members.length;
    const xs = members.map((_, i) => (n === 1 ? 0 : -54 + i * (108 / Math.max(1, n - 1))));
    let seat = 0;
    members.forEach((d, i) => {
      let e = team.get(d.id);
      if (!e) { e = { desk: buildDesk(d, xs[i]), bot: buildBot(d) }; team.set(d.id, e); }
      e.data = d; e.x = xs[i]; e.desk.g.position.x = xs[i];
      const m = MODES[d.status] || MODES.idle; e.mode = m;
      const b = e.bot;
      if (m.at === 'desk') { b.root.position.set(xs[i], 0, DESK_Z + (d.status === 'waiting' ? 17 : 9)); b.root.rotation.y = d.status === 'waiting' ? 0 : PI; b.body.position.y = 4.2; e.desk.chair.position.z = d.status === 'waiting' ? 12 : 9; }
      else { const s = NOOK_SEATS[seat++ % NOOK_SEATS.length]; b.root.position.copy(s); b.root.position.z += 1.5; b.root.rotation.y = 0; b.body.position.y = 4.6; e.desk.chair.position.z = 12; }
      b.body.position.y = m.at === 'desk' && d.status === 'waiting' ? 0 : b.body.position.y; // standing to wave
      b.face.material.map = m.awake ? b.faces.awake : b.faces.asleep; b.face.material.needsUpdate = true;
      b.bulbMat.color.set(m.awake ? C.gold2 : d.light); b.bulbGlow.visible = m.awake;
      b.ring.material.color.set(m.ring); b.mug.visible = m.at === 'nook';
      b.zz.visible = m.pose === 'sleep';
      b.labelSprite.position.y = m.at === 'nook' ? (seat % 2 ? 30 : 25) : 32;
      drawLabel(b.label, d, m.at !== 'nook' || state.sel === d.id);
      const scr = m.at === 'desk' && d.status !== 'paused' ? d.screen : { kind: d.status === 'paused' ? 'paused' : 'asleep', title: d.status === 'paused' ? 'Paused by you' : (d.screenAway || 'Away from desk') };
      drawScreen(e.desk.screen, scr);
      const on = d.status === 'working' || d.status === 'waiting';
      e.desk.screenGlow.visible = on; e.desk.lampGlow.visible = on; e.desk.light.material.color.set(m.light); e.desk.lightGlow.visible = on;
      e.base = b.root.position.clone();
    });
    // today's shifts board
    const c = shifts.ctx, w = 512, h = 420; c.clearRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; rr(c, 0, 0, w, h, 30); c.fill(); c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillStyle = C.navy; c.font = '600 40px Fredoka, sans-serif'; c.fillText('Today’s shifts', 30, 50);
    members.slice(0, 4).forEach((d, i) => {
      const y = 120 + i * 76, m = MODES[d.status] || MODES.idle;
      c.fillStyle = d.color; c.beginPath(); c.arc(50, y, 18, 0, PI * 2); c.fill();
      c.fillStyle = C.navy; c.font = '800 32px Nunito, sans-serif'; c.fillText(d.name, 86, y - 12);
      c.fillStyle = C.ink2; c.font = '700 24px Nunito, sans-serif'; c.fillText(fit(c, d.shiftLine || '', 340), 86, y + 20);
      c.fillStyle = m.light; c.beginPath(); c.arc(w - 50, y, 14, 0, PI * 2); c.fill();
    });
    shifts.tex.needsUpdate = true;
    buildRoute(members);
  }
  function buildRoute(members) {
    while (routeDots.children.length) routeDots.remove(routeDots.children[0]);
    const desk = (id) => team.get(id);
    const writer = members.find((d) => d.id !== 'reviewer' && d.status === 'working') || members.find((d) => d.id !== 'reviewer');
    const rev = desk('reviewer');
    if (!writer || !rev) { route = null; return; }
    const wx = desk(writer.id).x, rx = rev.x;
    const pts = [new T.Vector3(wx, 12, DESK_Z + 7), new T.Vector3((wx + rx) / 2, 16, DESK_Z + 11), new T.Vector3(rx, 12, DESK_Z + 7), new T.Vector3((rx + YOU.x) / 2, 18, (DESK_Z + YOU.z) / 2), new T.Vector3(YOU.x - 3, 12, YOU.z)];
    route = new T.CatmullRomCurve3(pts);
    const dots = route.getPoints(60);
    for (let i = 2; i < dots.length - 2; i += 3) { const d = new T.Mesh(new T.CircleGeometry(.7, 10), toon(C.gold)); d.rotation.x = -PI / 2; d.position.set(dots[i].x, .25, dots[i].z); routeDots.add(d); }
  }
  let flowOn = true;
  function setFlow(v) { flowOn = !!v; routeDots.visible = flowOn; }

  // columns: [{ title, cards: [{ text, who, color }], more }]
  function setBoard(cols, footer) {
    const c = board.ctx, w = 1024, h = 360; c.clearRect(0, 0, w, h);
    c.fillStyle = '#c99a5e'; rr(c, 0, 0, w, h, 26); c.fill();
    c.fillStyle = 'rgba(0,0,0,.07)'; for (let i = 0; i < 260; i++) c.fillRect((i * 97) % w, (i * 53) % h, 4, 4);
    c.fillStyle = '#ffffff'; rr(c, 24, 18, 250, 52, 16); c.fill();
    c.fillStyle = C.navy; c.font = '600 32px Fredoka, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('Work board', 46, 45);
    if (footer) { c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '700 22px Nunito, sans-serif'; c.textAlign = 'right'; c.fillText(footer, w - 28, 45); c.textAlign = 'left'; }
    cols.forEach((col, i) => {
      const x = 24 + i * 248;
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '800 22px Nunito, sans-serif'; c.fillText(col.title.toUpperCase() + (col.count ? '  ' + col.count : ''), x + 8, 100);
      col.cards.slice(0, 2).forEach((card, j) => {
        const y = 120 + j * 110;
        c.fillStyle = col.gold ? C.goldL : '#ffffff'; rr(c, x, y, 222, 96, 14); c.fill();
        c.fillStyle = card.color; c.fillRect(x, y, 222, 12);
        c.fillStyle = C.navy; c.font = '700 22px Nunito, sans-serif'; c.fillText(fit(c, card.text, 196), x + 14, y + 44);
        c.fillStyle = C.ink2; c.font = '700 20px Nunito, sans-serif'; c.fillText(card.who, x + 14, y + 76);
      });
      if (col.cards.length > 2) { c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '800 20px Nunito, sans-serif'; c.fillText('+ ' + (col.cards.length - 2) + ' more', x + 8, 344); }
      if (!col.cards.length) { c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '700 22px Nunito, sans-serif'; c.fillText('Nothing here', x + 8, 150); }
    });
    board.tex.needsUpdate = true;
  }
  function setYes(n, line) {
    const c = yesSign.ctx; c.clearRect(0, 0, 560, 200);
    c.fillStyle = n ? C.gold : '#ffffff'; rr(c, 6, 6, 548, 188, 40); c.fill(); c.lineWidth = 10; c.strokeStyle = n ? '#ffffff' : C.gold; c.stroke();
    c.fillStyle = C.navy; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 54px Fredoka, sans-serif';
    c.fillText(n ? 'Waiting for your yes' : 'All caught up', 280, 76);
    c.font = '800 34px Nunito, sans-serif'; c.fillText(line || (n + (n === 1 ? ' draft' : ' drafts')), 280, 140);
    yesSign.tex.needsUpdate = true;
    trayPages.forEach((p, i) => { p.visible = i < Math.min(4, n); });
    trayGlow.visible = n > 0;
  }

  // ---------------------------------------------------------------- sky and camera
  const state = { sky: 'evening', spin: false, follow: false, sel: null, filter: null };
  function setSky(name) {
    const s = SKIES[name];
    ['top', 'mid', 'low', 'glow'].forEach((k, i) => skyMat.uniforms[k].value.set(s.sky[i]));
    scene.fog.color.set(s.fog); renderer.setClearColor(s.fog);
    hemi.intensity = s.hemi[0]; hemi.color.set(s.hemi[1]); hemi.groundColor.set(s.hemi[2]);
    sun.color.set(s.sun[0]); sun.intensity = s.sun[1];
    stars.visible = s.night; moon.visible = s.night; sunSprite.visible = !s.night; skyStars.forEach((st) => { st.visible = s.night; });
    panes.forEach((p) => { p.material.map = s.night ? winTex.night : winTex.day; p.material.needsUpdate = true; });
    state.sky = name;
  }
  const VIEWS = { room: { th: .62, ph: .98, d: 235, t: [18, 4, -10] }, above: { th: .3, ph: .28, d: 260, t: [0, 0, 4] }, close: { th: .35, ph: 1.12, d: 120, t: [10, 12, -22] } };
  const cam = { th: VIEWS.room.th, ph: VIEWS.room.ph, d: VIEWS.room.d, t: new T.Vector3().fromArray(VIEWS.room.t) };
  cam.g = { th: cam.th, ph: cam.ph, d: cam.d, t: cam.t.clone() };
  let onCamera = opts.onCamera || (() => {});
  function setView(v) {
    const p = VIEWS[v]; let th = p.th; while (th - cam.g.th > PI) th -= PI * 2; while (th - cam.g.th < -PI) th += PI * 2;
    Object.assign(cam.g, { th, ph: p.ph, d: p.d }); cam.g.t.fromArray(p.t); state.follow = false;
  }
  const ptr = new Map(); let down = null, moved = 0, pan = false, pinch = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY }; moved = 0; pan = e.button === 2 || e.shiftKey; if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } canvas.classList.add('drag'); });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptr.has(e.pointerId)) { hover(e); return; }
    const pv = ptr.get(e.pointerId), dx = e.clientX - pv.x, dy = e.clientY - pv.y; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoom(pinch / d); pinch = d; return; }
    if (pan) { const s = cam.d * .0018; const r = new T.Vector3(Math.cos(cam.th), 0, -Math.sin(cam.th)), f = new T.Vector3(-Math.sin(cam.th), 0, -Math.cos(cam.th)); cam.g.t.addScaledVector(r, -dx * s).addScaledVector(f, dy * s); cam.g.t.clampLength(0, 160); state.follow = false; }
    else { cam.g.th -= dx * .006; cam.g.ph = Math.max(.2, Math.min(1.36, cam.g.ph - dy * .005)); }
    if (moved > 6) onCamera('moved');
  });
  function endPtr(e) { if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0; if (!ptr.size) { canvas.classList.remove('drag'); if (down && moved < 6 && e.type === 'pointerup') pick(e.clientX, e.clientY); down = null; } }
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * .0012)); }, { passive: false });
  function zoom(f) { cam.g.d = Math.max(40, Math.min(460, cam.g.d * f)); onCamera('moved'); }
  canvas.addEventListener('keydown', (e) => {
    const k = e.key; if (k === 'ArrowLeft') cam.g.th += .3; else if (k === 'ArrowRight') cam.g.th -= .3; else if (k === 'ArrowUp') cam.g.ph = Math.max(.2, cam.g.ph - .1); else if (k === 'ArrowDown') cam.g.ph = Math.min(1.36, cam.g.ph + .1); else if (k === '+' || k === '=') zoom(.85); else if (k === '-') zoom(1.18); else return; e.preventDefault();
  });
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function hitAt(x, y) { const r = canvas.getBoundingClientRect(); ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(hitboxes, false); return h.length ? h[0].object.userData : null; }
  function pick(x, y) { const u = hitAt(x, y); if (u && opts.onPick) opts.onPick(u.bot ? { bot: u.bot } : { place: u.pick }); }
  let hoverT = 0; function hover(e) { if (e.pointerType !== 'mouse') return; const n = performance.now(); if (n - hoverT < 90) return; hoverT = n; canvas.style.cursor = hitAt(e.clientX, e.clientY) ? 'pointer' : ''; }
  function select(id, fly) {
    state.sel = id;
    team.forEach((e, k) => { e.bot.ring.scale.setScalar(k === id ? 1.25 : 1); if (e.mode && e.mode.at === 'nook') drawLabel(e.bot.label, e.data, k === id); });
    const e = team.get(id); if (!e || !fly) return;
    cam.g.t.set(e.base.x * .8, 10, e.base.z * .8); cam.g.d = Math.min(cam.g.d, 150); cam.g.ph = Math.min(cam.g.ph, 1.1);
  }
  function setFilter(fn) { state.filter = fn; team.forEach((e) => { const on = !fn || fn(e.data); e.bot.labelSprite.visible = on; e.bot.ring.visible = on; }); }

  // ---------------------------------------------------------------- animation
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0, last = performance.now();
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 700 ? 52 : 40; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize);
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += reduce ? dt * .3 : dt;
    if (state.spin) cam.g.th += dt * .12;
    if (state.follow && team.get(state.sel)) { const b = team.get(state.sel).base; cam.g.t.set(b.x, 8, b.z); }
    const k = 1 - Math.exp(-dt * 6);
    cam.th += (cam.g.th - cam.th) * k; cam.ph += (cam.g.ph - cam.ph) * k; cam.d += (cam.g.d - cam.d) * k; cam.t.lerp(cam.g.t, k);
    const sp2 = Math.sin(cam.ph);
    camera.position.set(cam.t.x + cam.d * sp2 * Math.sin(cam.th), cam.t.y + cam.d * Math.cos(cam.ph), cam.t.z + cam.d * sp2 * Math.cos(cam.th));
    camera.lookAt(cam.t); skyDome.position.copy(camera.position);
    let i = 0;
    team.forEach((e, id) => {
      const b = e.bot, m = e.mode || MODES.idle; i++;
      b.armL.position.set(-3.7, 4.8, .6); b.armR.position.set(3.7, 4.8, .6); b.headG.rotation.set(0, 0, 0);
      if (m.pose === 'type') {
        b.armL.position.y = 4.8 + Math.sin(t * 14 + i) * .3; b.armR.position.y = 4.8 + Math.sin(t * 14 + i + PI) * .3; b.armL.position.z = b.armR.position.z = 2.2;
        const c = (t + i * 3) % 9, look = c > 7.5 ? Math.sin((c - 7.5) / 1.5 * PI) : 0;
        b.headG.rotation.y = look * 1.9; b.headG.rotation.x = .12 - look * .1;
      } else if (m.pose === 'wave') {
        b.armR.position.set(4.4, 9.5 + Math.sin(t * 8) * .8, 1); b.headG.rotation.z = Math.sin(t * 2) * .08;
        b.body.position.y = Math.abs(Math.sin(t * 3)) * .5;
      } else if (m.pose === 'sleep') {
        b.headG.rotation.x = .14 + Math.sin(t * .9 + i) * .05;
        const c = (t * .4 + i * .3) % 1; b.zz.position.set(3 + c * 2.5, 18 + c * 6, 0); b.zz.material.opacity = Math.sin(c * PI);
      } else if (m.pose === 'rest') { b.headG.rotation.y = Math.sin(t * .5 + i) * .4; }
      else if (m.pose === 'still') { b.headG.rotation.x = .35; }
      b.ring.material.opacity = id === state.sel ? .7 + .3 * Math.sin(t * 4) : .9;
    });
    if (route && flowOn) { const u = (t * .09) % 1; flyer.visible = u > .02 && u < .97; flyer.position.copy(route.getPoint(u)); flyer.position.y += Math.sin(u * PI * 6) * .6; flyer.rotation.y = u * 6; } else flyer.visible = false;
    const lc = (t * .35) % 1; lambZ.position.set(lamb.position.x + 2 + lc * 2, 7 + lc * 4, lamb.position.z); lambZ.material.opacity = Math.sin(lc * PI);
    lambHead.rotation.x = .25 + Math.sin(t) * .04;
    yesSprite.position.y = 24 + Math.sin(t * 2) * .5;
    dove.position.set(Math.cos(t * .12) * 110, 70 + Math.sin(t * .7) * 4, Math.sin(t * .12) * 110);
    skyStars.forEach((s, j) => { s.material.rotation = Math.sin(t * .8 + j) * .2; });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  resize(); setSky('evening'); setYes(0);
  requestAnimationFrame((n) => { last = n; frame(n); });

  return {
    setTeam, setBoard, setYes, setFlow, setSky, setView, select, setFilter,
    setSpin(v) { state.spin = v; }, setFollow(v) { state.follow = v; if (v) cam.g.d = Math.min(cam.g.d, 110); },
    get sky() { return state.sky; }
  };
}
