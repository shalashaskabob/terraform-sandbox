// Terraform 3D — From-Dust-style water & erosion sandbox.
// Heightfield simulation (pipe-model shallow water + hydraulic erosion + lava)
// rendered as a real lit 3D landscape with Three.js.
import * as THREE from 'three';

//================================================================
// Simulation fields
//================================================================
let W = 0, H = 0;                 // grid dimensions
let cssW = 0, cssH = 0, cellPx = 6;
const HS = 0.5;                   // world height units per terrain unit

let rock, sand, water, sed, lava, ltemp, grass;
let fL, fR, fU, fD, vx, vy, tmp, steamFx;
const sources = new Map();        // grid index -> { type, rate }

const I = (x, y) => y * W + x;
const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DX = [-1, 1, 0, 0], DY = [0, 0, -1, 1];

function allocFields() {
  const N = W * H;
  rock = new Float32Array(N); sand = new Float32Array(N); water = new Float32Array(N);
  sed = new Float32Array(N); lava = new Float32Array(N); ltemp = new Float32Array(N); grass = new Float32Array(N);
  fL = new Float32Array(N); fR = new Float32Array(N); fU = new Float32Array(N); fD = new Float32Array(N);
  vx = new Float32Array(N); vy = new Float32Array(N); tmp = new Float32Array(N); steamFx = new Float32Array(N);
  sources.clear();
}

//================================================================
// Terrain generation (fractal value noise)
//================================================================
let seed = 12345;
function rnd() { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; }
function hash2(ix, iy) { let h = ix * 374761393 + iy * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) & 0xffff) / 0xffff; }
function valNoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = x0 + 1, y1 = y0 + 1;
  const sx = x - x0, sy = y - y0;
  const n00 = hash2(x0, y0), n10 = hash2(x1, y0), n01 = hash2(x0, y1), n11 = hash2(x1, y1);
  const ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
  const a = n00 + (n10 - n00) * ux, b = n01 + (n11 - n01) * ux;
  return (a + (b - a) * uy) * 2 - 1;
}
function genTerrain() {
  rock.fill(0); sand.fill(0); water.fill(0); sed.fill(0);
  lava.fill(0); ltemp.fill(0); grass.fill(0);
  fL.fill(0); fR.fill(0); fU.fill(0); fD.fill(0); vx.fill(0); vy.fill(0);
  sources.clear();

  const oct = [{ f: 0.012, a: 30 }, { f: 0.025, a: 16 }, { f: 0.05, a: 8 }, { f: 0.1, a: 4 }];
  const offs = oct.map(() => [rnd() * 1000, rnd() * 1000]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let h = 0;
    for (let o = 0; o < oct.length; o++)
      h += valNoise((x + offs[o][0]) * oct[o].f, (y + offs[o][1]) * oct[o].f) * oct[o].a;
    const nx = (x / W - 0.5) * 2, ny = (y / H - 0.5) * 2;
    h -= (nx * nx + ny * ny) * 18;               // radial falloff -> island
    const i = I(x, y);
    const total = clamp(22 + h, 2, 220);
    // a thin, erodible topsoil mantle sitting on a hard bedrock floor.
    // water only carves the soil; bedrock resists, so canyons stop at rock.
    const soil = clamp(9 + h * 0.16, 3, 24);
    sand[i] = Math.min(soil, total - 1);
    rock[i] = total - sand[i];
  }
  for (let k = 0; k < 6; k++) {
    const lx = (rnd() * W) | 0, ly = (rnd() * H) | 0;
    if (rock[I(lx, ly)] + sand[I(lx, ly)] < 20)
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = lx + dx, y = ly + dy; if (inb(x, y) && dx * dx + dy * dy < 36) water[I(x, y)] += 6;
      }
  }
}

//================================================================
// Simulation — pipe-model shallow water + hydraulic erosion
//================================================================
const dt = 0.10, G = 10, Lpipe = 1.0;
const Kc = 0.45, Ks = 0.12, Kd = 0.10, Kevap = 0.006, FLUXDAMP = 0.985, MINW = 0.0008;
const ERODE_MAX = 0.06;       // max terrain change per erosion pass (gentle)
const EROSION_EVERY = 3;      // erosion runs only every N sim ticks (slow & watchable)
let raining = false, paused = false;

// Simulation speed control: water flows every tick, but the whole sim advances
// on an accumulator so we can run it slowly enough to watch erosion happen.
const BASE_RATE = 0.5;        // sim ticks per rendered frame at 1x
const SPEEDS = [0.25, 0.5, 1, 2, 4];
let simSpeed = 1;
let simAcc = 0;
const surf = i => rock[i] + sand[i] + lava[i];

function stepWater() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y), w = water[i], hi = surf(i) + w;
    let l = 0, r = 0, u = 0, d = 0;
    if (x > 0) { const j = i - 1; l = Math.max(0, fL[i] * FLUXDAMP + dt * G * (hi - (surf(j) + water[j])) / Lpipe); }
    if (x < W - 1) { const j = i + 1; r = Math.max(0, fR[i] * FLUXDAMP + dt * G * (hi - (surf(j) + water[j])) / Lpipe); }
    if (y > 0) { const j = i - W; u = Math.max(0, fU[i] * FLUXDAMP + dt * G * (hi - (surf(j) + water[j])) / Lpipe); }
    if (y < H - 1) { const j = i + W; d = Math.max(0, fD[i] * FLUXDAMP + dt * G * (hi - (surf(j) + water[j])) / Lpipe); }
    const tot = l + r + u + d;
    if (tot > 0) { const K = Math.min(1, w / (tot * dt)); l *= K; r *= K; u *= K; d *= K; }
    fL[i] = l; fR[i] = r; fU[i] = u; fD[i] = d;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y);
    let inflow = 0; const outflow = fL[i] + fR[i] + fU[i] + fD[i];
    if (x > 0) inflow += fR[i - 1];
    if (x < W - 1) inflow += fL[i + 1];
    if (y > 0) inflow += fD[i - W];
    if (y < H - 1) inflow += fU[i + W];
    const w0 = water[i];
    let w1 = w0 + dt * (inflow - outflow); if (w1 < 0) w1 = 0;
    water[i] = w1;
    const wm = (w0 + w1) * 0.5 + 1e-4;
    const fxL = (x > 0) ? fR[i - 1] : 0, fxR = (x < W - 1) ? fL[i + 1] : 0;
    const fyU = (y > 0) ? fD[i - W] : 0, fyD = (y < H - 1) ? fU[i + W] : 0;
    vx[i] = ((fxL - fL[i]) + (fR[i] - fxR)) * 0.5 / wm;
    vy[i] = ((fyU - fU[i]) + (fD[i] - fyD)) * 0.5 / wm;
  }
}
function stepErosion() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y);
    if (water[i] < MINW) { if (sed[i] > 0) { const dp = sed[i] * 0.5; sand[i] += dp; sed[i] -= dp; } continue; }
    const hL = surf(x > 0 ? i - 1 : i), hR = surf(x < W - 1 ? i + 1 : i);
    const hU = surf(y > 0 ? i - W : i), hD = surf(y < H - 1 ? i + W : i);
    const dhx = (hR - hL) * 0.5, dhy = (hD - hU) * 0.5;
    const slope = Math.sqrt(dhx * dhx + dhy * dhy);
    let sinT = slope / Math.sqrt(slope * slope + 1); if (sinT < 0.02) sinT = 0.02;
    const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
    const C = Kc * sinT * speed * Math.min(1, water[i] * 3);
    if (C > sed[i]) {
      // erode only the soil mantle — bedrock (rock) is the hard floor and never erodes
      let e = Ks * (C - sed[i]); if (e > ERODE_MAX) e = ERODE_MAX;
      const fromSand = Math.min(sand[i], e);
      sand[i] -= fromSand; sed[i] += fromSand;
    } else { let dp = Kd * (sed[i] - C); if (dp > ERODE_MAX) dp = ERODE_MAX; sand[i] += dp; sed[i] -= dp; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y);
    if (water[i] < MINW) { tmp[i] = sed[i]; continue; }
    const sx = clamp(x - vx[i] * dt, 0, W - 1.001), sy = clamp(y - vy[i] * dt, 0, H - 1.001);
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
    const a = sed[I(x0, y0)], b = sed[I(x0 + 1, y0)], c = sed[I(x0, y0 + 1)], d = sed[I(x0 + 1, y0 + 1)];
    const top = a + (b - a) * fx, bot = c + (d - c) * fx;
    tmp[i] = top + (bot - top) * fy;
  }
  sed.set(tmp);
}
function stepEvaporate() {
  const ev = 1 - Kevap * dt * (raining ? 0.4 : 1);
  for (let i = 0, n = W * H; i < n; i++) if (water[i] > 0) { water[i] *= ev; if (water[i] < 1e-5) water[i] = 0; }
}
function stepLava() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y), lv = lava[i];
    if (lv <= 0.001) continue;
    const hi = surf(i);
    let sumd = 0; const nb = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d]; if (!inb(nx, ny)) continue;
      const j = I(nx, ny), diff = hi - surf(j);
      if (diff > 0.05) { nb.push(j); nb.push(diff); sumd += diff; }
    }
    if (sumd > 0) {
      const flow = Math.min(lv * 0.35, sumd * 0.25);
      for (let k = 0; k < nb.length; k += 2) {
        const j = nb[k], diff = nb[k + 1], give = flow * (diff / sumd);
        lava[i] -= give; lava[j] += give; ltemp[j] = Math.max(ltemp[j], ltemp[i] * 0.96);
      }
    }
    ltemp[i] -= 2.0 + (water[i] > MINW ? 40 : 0); if (ltemp[i] < 0) ltemp[i] = 0;
    if (water[i] > MINW && lava[i] > 0) {
      const solid = Math.min(lava[i], 0.5 + water[i]);
      rock[i] += solid; lava[i] -= solid; water[i] = Math.max(0, water[i] - solid * 0.8); steamFx[i] = 1;
    }
    if (ltemp[i] < 140 && lava[i] > 0) { const s = Math.min(lava[i], lava[i] * 0.10 + 0.02); rock[i] += s; lava[i] -= s; }
  }
}
function stepGrass() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y);
    if (lava[i] > 0.05 || water[i] > 0.6) { grass[i] = Math.max(0, grass[i] - 0.05); continue; }
    if (grass[i] > 0) {
      let moist = water[i] > 0.01 ? 1 : 0;
      if (!moist) for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (inb(nx, ny) && water[I(nx, ny)] > 0.02) { moist = 1; break; } }
      if (moist && sand[i] > 1) {
        grass[i] = Math.min(1, grass[i] + 0.02);
        if (Math.random() < 0.06) { const d = (Math.random() * 4) | 0, nx = x + DX[d], ny = y + DY[d]; if (inb(nx, ny)) { const j = I(nx, ny); if (lava[j] < 0.05 && water[j] < 0.4 && sand[j] > 1 && grass[j] < 0.1) grass[j] = 0.2; } }
      } else grass[i] = Math.max(0, grass[i] - 0.005);
    }
  }
}
let frame = 0;
function simulate() {
  frame++;
  steamFx.fill(0);
  // constant sources (springs / lava vents)
  if (sources.size) for (const [idx, s] of sources) {
    if (s.type === 'water') water[idx] += s.rate;
    else { lava[idx] += s.rate; ltemp[idx] = 400; }
  }
  if (raining && frame % 2 === 0) { const drops = (W * H / 600) | 0; for (let k = 0; k < drops; k++) { const x = (Math.random() * W) | 0, y = (Math.random() * H) | 0; water[I(x, y)] += 0.6; } }
  stepLava();
  stepWater();
  if (frame % EROSION_EVERY === 0) stepErosion();
  stepEvaporate();
  if (frame % 3 === 0) stepGrass();
}

//================================================================
// Three.js scene
//================================================================
const canvas = document.getElementById('c');
let renderer, scene, camera;
let terrMesh, watMesh, lavMesh;
let terrGeo, watGeo, lavGeo;
const markerGroup = new THREE.Group();
const markerGeo = new THREE.CylinderGeometry(0.6, 1.1, 2.4, 8);

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  scene = new THREE.Scene();
  const sky = new THREE.Color(0x8fb4e6);
  scene.background = sky;

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a3b2a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
  sun.position.set(-0.5, 1.0, 0.6);
  scene.add(sun);
  scene.add(markerGroup);

  camera = new THREE.PerspectiveCamera(52, 1, 0.5, 4000);
}

// camera as orbit around terrain centre
const cam = { az: 0.7, polar: 0.95, radius: 160, ty: 8 };
function updateCamera() {
  const r = cam.radius, sp = Math.sin(cam.polar);
  camera.position.set(Math.cos(cam.az) * sp * r, Math.cos(cam.polar) * r, Math.sin(cam.az) * sp * r);
  camera.lookAt(0, cam.ty, 0);
}

function buildMeshes() {
  // dispose previous
  for (const m of [terrMesh, watMesh, lavMesh]) if (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }

  const N = W * H, verts = N * 3;
  const positions = new Float32Array(verts);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = I(x, y) * 3;
    positions[p] = x - W / 2; positions[p + 1] = 0; positions[p + 2] = y - H / 2;
  }
  const index = [];
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = I(x, y), b = I(x + 1, y), c = I(x, y + 1), d = I(x + 1, y + 1);
    index.push(a, c, b, b, c, d);
  }
  const indexAttr = new (N > 65000 ? THREE.Uint32BufferAttribute : THREE.Uint16BufferAttribute)(index, 1);

  function makeGeo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts), 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(indexAttr);
    return g;
  }
  terrGeo = makeGeo(); watGeo = makeGeo(); lavGeo = makeGeo();

  terrMesh = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false }));
  watMesh = new THREE.Mesh(watGeo, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.1, depthWrite: false }));
  lavMesh = new THREE.Mesh(lavGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  watMesh.renderOrder = 1; lavMesh.renderOrder = 2;
  scene.add(terrMesh); scene.add(watMesh); scene.add(lavMesh);

  cam.radius = Math.max(90, W * 1.25);
  cam.ty = 10;
}

const solidH = i => rock[i] + sand[i];

function updateMeshes() {
  const tp = terrGeo.attributes.position.array, tc = terrGeo.attributes.color.array, tn = terrGeo.attributes.normal.array;
  const wp = watGeo.attributes.position.array, wc = watGeo.attributes.color.array, wn = watGeo.attributes.normal.array;
  const lp = lavGeo.attributes.position.array, lc = lavGeo.attributes.color.array;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y), p = i * 3;
    const sh = solidH(i), st = surf(i), w = water[i], lv = lava[i];

    // ---- terrain height + layered geology albedo + analytic normal ----
    tp[p + 1] = sh * HS;
    let r, g, b;
    const soilMix = clamp(sand[i] / 7, 0, 1);                 // 0 = bare bedrock, 1 = full soil
    // bedrock with sedimentary strata banding (shows where water has cut down to rock)
    const strata = 0.80 + 0.20 * Math.sin(rock[i] * 0.5);
    const rr = 104 * strata, rg = 98 * strata, rb = 90 * strata;
    // brown topsoil over the bedrock
    r = rr + (150 - rr) * soilMix; g = rg + (116 - rg) * soilMix; b = rb + (74 - rb) * soilMix;
    // snowy peaks
    if (sh > 76) { const t = clamp((sh - 76) / 26, 0, 1); r += (236 - r) * t; g += (240 - g) * t; b += (247 - b) * t; }
    // sandy shoreline near the waterline
    if (sh < 19) { const t = clamp((19 - sh) / 9, 0, 1); r = r * (1 - t) + 198 * t; g = g * (1 - t) + 178 * t; b = b * (1 - t) + 122 * t; }
    // vegetation
    const gr = grass[i];
    if (gr > 0) { r = r * (1 - gr) + 58 * gr; g = g * (1 - gr) + 150 * gr; b = b * (1 - gr) + 62 * gr; }
    tc[p] = r / 255; tc[p + 1] = g / 255; tc[p + 2] = b / 255;
    {
      const hl = solidH(x > 0 ? i - 1 : i), hr = solidH(x < W - 1 ? i + 1 : i);
      const hu = solidH(y > 0 ? i - W : i), hd = solidH(y < H - 1 ? i + W : i);
      let nx = -(hr - hl) * HS * 0.5, nz = -(hd - hu) * HS * 0.5, ny = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      tn[p] = nx * inv; tn[p + 1] = ny * inv; tn[p + 2] = nz * inv;
    }

    // ---- water surface ----
    if (w > MINW) {
      wp[p + 1] = (st + w) * HS + 0.02;
      const depth = clamp(w / 8, 0, 1);
      wc[p] = (24 + 30 * (1 - depth)) / 255; wc[p + 1] = (92 + 70 * (1 - depth)) / 255; wc[p + 2] = (150 + 70 * depth) / 255;
      const al = (x > 0 ? surf(i - 1) + water[i - 1] : st + w), ar = (x < W - 1 ? surf(i + 1) + water[i + 1] : st + w);
      const au = (y > 0 ? surf(i - W) + water[i - W] : st + w), ad = (y < H - 1 ? surf(i + W) + water[i + W] : st + w);
      let nx = -(ar - al) * HS * 0.5, nz = -(ad - au) * HS * 0.5, ny = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      wn[p] = nx * inv; wn[p + 1] = ny * inv; wn[p + 2] = nz * inv;
    } else {
      wp[p + 1] = st * HS - 1.2; wc[p] = 0.09; wc[p + 1] = 0.27; wc[p + 2] = 0.55;
      wn[p] = 0; wn[p + 1] = 1; wn[p + 2] = 0;
    }

    // ---- lava (unlit, bright) ----
    if (lv > 0.02) {
      lp[p + 1] = st * HS + 0.06;
      const heat = clamp(ltemp[i] / 400, 0, 1);
      lc[p] = 1.0; lc[p + 1] = (70 + 150 * heat) / 255; lc[p + 2] = (20 + 30 * heat) / 255;
    } else {
      lp[p + 1] = sh * HS - 1.4; lc[p] = 0; lc[p + 1] = 0; lc[p + 2] = 0;
    }
    if (steamFx[i] > 0) { wc[p] = 0.9; wc[p + 1] = 0.95; wc[p + 2] = 1.0; }
  }

  terrGeo.attributes.position.needsUpdate = true;
  terrGeo.attributes.color.needsUpdate = true;
  terrGeo.attributes.normal.needsUpdate = true;
  watGeo.attributes.position.needsUpdate = true;
  watGeo.attributes.color.needsUpdate = true;
  watGeo.attributes.normal.needsUpdate = true;
  lavGeo.attributes.position.needsUpdate = true;
  lavGeo.attributes.color.needsUpdate = true;

  // source markers float at the surface
  let mi = 0;
  for (const [idx] of sources) {
    const m = markerGroup.children[mi++]; if (!m) break;
    const gx = idx % W, gy = (idx / W) | 0;
    m.position.set(gx - W / 2, surf(idx) * HS + 1.4, gy - H / 2);
  }
}

function rebuildMarkers() {
  while (markerGroup.children.length) { const m = markerGroup.children.pop(); m.material.dispose(); }
  for (const [, s] of sources) {
    const mat = new THREE.MeshBasicMaterial({ color: s.type === 'water' ? 0x49c0ff : 0xff5a1e });
    markerGroup.add(new THREE.Mesh(markerGeo, mat));
  }
}

//================================================================
// Sizing
//================================================================
function resize() {
  const s = document.getElementById('stage');
  cssW = s.clientWidth; cssH = s.clientHeight;
  cellPx = Math.max(5, Math.round(cssW / 110));
  let nW = Math.max(48, Math.floor(cssW / cellPx));
  let nH = Math.max(48, Math.floor(cssH / cellPx));
  while (nW * nH > 11000) { cellPx++; nW = Math.floor(cssW / cellPx); nH = Math.floor(cssH / cellPx); }
  renderer.setSize(cssW, cssH, false);
  camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
  if (nW !== W || nH !== H) {
    W = nW; H = nH;
    allocFields(); genTerrain(); buildMeshes(); rebuildMarkers();
  }
}

//================================================================
// Tools / painting
//================================================================
const T_LAND = 0, T_WATER = 1, T_LAVA = 2, T_ROCK = 3, T_PLANT = 4, T_SPRING = 5, T_SCOOP = 6, T_HAND = 7;
const TOOLS = [
  { id: T_HAND, name: 'Move', ic: '✋' },
  { id: T_LAND, name: 'Land', ic: '⛰' },
  { id: T_WATER, name: 'Water', ic: '💧' },
  { id: T_SPRING, name: 'Spring', ic: '⛲' },
  { id: T_LAVA, name: 'Lava', ic: '🌋' },
  { id: T_ROCK, name: 'Rock', ic: '🪨' },
  { id: T_PLANT, name: 'Plant', ic: '🌱' },
  { id: T_SCOOP, name: 'Scoop', ic: '⛏' },
];
let tool = T_HAND, brush = 9;

function paintGrid(gx, gy) {
  const r = brush, r2 = r * r;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const dd = dx * dx + dy * dy; if (dd > r2) continue;
    const x = (gx + dx) | 0, y = (gy + dy) | 0; if (!inb(x, y)) continue;
    const fall = 1 - dd / r2, i = I(x, y);
    switch (tool) {
      case T_LAND: sand[i] += 2.4 * fall; break;
      case T_ROCK: rock[i] += 2.6 * fall; break;
      case T_WATER: water[i] += 2.2 * fall; break;
      case T_LAVA: lava[i] += 2.2 * fall; ltemp[i] = 400; break;
      case T_PLANT: if (lava[i] < 0.05 && water[i] < 0.5 && (rock[i] + sand[i]) > 14) grass[i] = Math.min(1, grass[i] + 0.5 * fall); break;
      case T_SCOOP:
        if (water[i] > 0) water[i] = Math.max(0, water[i] - 3 * fall);
        else { const sgrab = Math.min(sand[i], 2.4 * fall); sand[i] -= sgrab; const rem = 2.4 * fall - sgrab; if (rem > 0) rock[i] = Math.max(0, rock[i] - rem); }
        lava[i] = Math.max(0, lava[i] - 3 * fall); grass[i] = 0;
        if (sources.has(i)) { sources.delete(i); rebuildMarkers(); }
        break;
    }
  }
}

// discrete actions (on tap, not continuous): place / remove a source
function placeSpring(gx, gy) {
  const x = gx | 0, y = gy | 0; if (!inb(x, y)) return;
  const i = I(x, y);
  sources.set(i, { type: 'water', rate: 3.2 });
  rebuildMarkers();
}

//================================================================
// Input: 1 finger = sculpt (raycast), 2 fingers = orbit + zoom
//================================================================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointers = new Map();
let gesture = null; // { mid:{x,y}, dist }

function screenToGrid(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(terrMesh, false)[0];
  if (!hit) return null;
  return [hit.point.x + W / 2, hit.point.z + H / 2];
}
function twoFingerState() {
  const pts = [...pointers.values()];
  const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  return { mid, dist };
}

canvas.addEventListener('pointerdown', e => {
  hideToast();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) gesture = twoFingerState();
  else if (pointers.size === 1) {
    if (tool === T_SPRING) { const g = screenToGrid(e.clientX, e.clientY); if (g) placeSpring(g[0], g[1]); }
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const px = e.clientX, py = e.clientY;
  pointers.set(e.pointerId, { x: px, y: py });
  if (pointers.size >= 2) {
    const s = twoFingerState();
    if (gesture) {
      cam.az -= (s.mid.x - gesture.mid.x) * 0.006;
      cam.polar = clamp(cam.polar - (s.mid.y - gesture.mid.y) * 0.006, 0.15, 1.45);
      if (s.dist > 0 && gesture.dist > 0) cam.radius = clamp(cam.radius * (gesture.dist / s.dist), W * 0.4, W * 3);
    }
    gesture = s;
  } else if (tool === T_HAND) {
    // Move tool: a single finger orbits the camera instead of sculpting
    cam.az -= (px - prev.x) * 0.006;
    cam.polar = clamp(cam.polar - (py - prev.y) * 0.006, 0.15, 1.45);
  }
  e.preventDefault();
}, { passive: false });

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) gesture = null;
  if (pointers.size === 2) gesture = twoFingerState();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

//================================================================
// UI
//================================================================
const toolsEl = document.getElementById('tools'), curname = document.getElementById('curname');
const chips = [];
TOOLS.forEach(t => {
  const c = document.createElement('div'); c.className = 'chip';
  c.innerHTML = '<div class="ic">' + t.ic + '</div><span>' + t.name + '</span>';
  c.addEventListener('click', () => selectTool(t.id));
  toolsEl.appendChild(c); chips.push([t.id, c]);
});
function selectTool(id) { tool = id; curname.textContent = TOOLS.find(t => t.id === id).name; chips.forEach(([tid, el]) => el.classList.toggle('sel', tid === id)); }
selectTool(T_HAND);
document.getElementById('brush').addEventListener('input', e => brush = +e.target.value);
const pauseBtn = document.getElementById('pauseBtn');
pauseBtn.addEventListener('click', function () { paused = !paused; this.textContent = paused ? '▶' : '⏸'; this.classList.toggle('on', paused); });
const rainBtn = document.getElementById('rainBtn');
rainBtn.addEventListener('click', function () { raining = !raining; this.classList.toggle('on', raining); });
const speedBtn = document.getElementById('speedBtn');
speedBtn.textContent = simSpeed + '×';
speedBtn.addEventListener('click', function () {
  simSpeed = SPEEDS[(SPEEDS.indexOf(simSpeed) + 1) % SPEEDS.length];
  this.textContent = simSpeed + '×';
});
document.getElementById('resetBtn').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; genTerrain(); rebuildMarkers(); });

const toast = document.getElementById('toast'), badge = document.getElementById('badge');
function showToast() { toast.classList.add('show'); }
function hideToast() { toast.classList.remove('show'); badge.style.opacity = '0'; }
toast.addEventListener('click', hideToast);
document.getElementById('helpBtn').addEventListener('click', showToast);
showToast(); setTimeout(() => { if (toast.classList.contains('show')) hideToast(); }, 8000);

//================================================================
// Loop
//================================================================
function loop() {
  // continuous sculpting while a single finger is held (springs are discrete)
  if (pointers.size === 1 && tool !== T_SPRING && tool !== T_HAND) {
    const p = [...pointers.values()][0];
    const g = screenToGrid(p.x, p.y);
    if (g) paintGrid(g[0], g[1]);
  }
  if (!paused) {
    simAcc += BASE_RATE * simSpeed;
    let n = 0;
    while (simAcc >= 1 && n < 4) { simulate(); simAcc -= 1; n++; }
    if (simAcc > 1) simAcc = 1;
  }
  updateMeshes();
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function boot() {
  initThree();
  // initial size + world
  cssW = document.getElementById('stage').clientWidth;
  cssH = document.getElementById('stage').clientHeight;
  cellPx = Math.max(5, Math.round(cssW / 110));
  W = Math.max(48, Math.floor(cssW / cellPx));
  H = Math.max(48, Math.floor(cssH / cellPx));
  while (W * H > 11000) { cellPx++; W = Math.floor(cssW / cellPx); H = Math.floor(cssH / cellPx); }
  renderer.setSize(cssW, cssH, false);
  camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
  allocFields(); genTerrain(); buildMeshes(); rebuildMarkers();
  requestAnimationFrame(loop);
}

let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 220); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

boot();
