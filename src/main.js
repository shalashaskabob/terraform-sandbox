// Terraform 3D — From-Dust-style water & erosion sandbox.
// Heightfield simulation (pipe-model shallow water + hydraulic erosion + lava)
// rendered as a real lit 3D landscape with Three.js.
import * as THREE from 'three';

const BUILD = 'v26';   // shown in the UI so you can confirm the live version

//================================================================
// Simulation fields
//================================================================
let W = 0, H = 0;                 // grid dimensions
let cssW = 0, cssH = 0, cellPx = 6;
const HS = 0.5;                   // world height units per terrain unit

let rock, sand, water, sed, lava, ltemp, grass;
let fL, fR, fU, fD, vx, vy, tmp, steamFx, occupied;
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
  occupied = new Uint8Array(N);
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
  if (occupied) occupied.fill(0);
  sources.clear();
  resetCivilization();

  const oct = [{ f: 0.012, a: 32 }, { f: 0.025, a: 17 }, { f: 0.05, a: 9 }, { f: 0.1, a: 4 }];
  const offs = oct.map(() => [rnd() * 1000, rnd() * 1000]);
  const soilOX = rnd() * 1000, soilOY = rnd() * 1000;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let h = 0;
    for (let o = 0; o < oct.length; o++)
      h += valNoise((x + offs[o][0]) * oct[o].f, (y + offs[o][1]) * oct[o].f) * oct[o].a;
    const nx = (x / W - 0.5) * 2, ny = (y / H - 0.5) * 2;
    h -= (nx * nx + ny * ny) * 16;               // radial falloff -> island
    const i = I(x, y);
    const total = clamp(26 + h, 2, 220);
    // an uneven, erodible topsoil mantle over layered bedrock. Soil thickness
    // varies spatially so erosion exposes the strata unevenly.
    const soilN = valNoise((x + soilOX) * 0.06, (y + soilOY) * 0.06) * 5;
    const soil = clamp(8 + h * 0.14 + soilN, 2, 26);
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
const BASEMENT = 12;          // bedrock below this elevation never erodes (map floor)
const CIV_EVERY = 4;          // civilization updates every N sim ticks
let raining = false, paused = false;

// Geological strata colours (top layer first), revealed as canyons cut down.
const STRATA = [
  [158, 126, 88],  // tan sandstone
  [128, 114, 98],  // pale grey limestone
  [100, 88, 78],   // brown mudstone
  [82, 84, 94],    // blue-grey slate
  [116, 96, 70],   // ochre
  [92, 78, 70],    // dark shale
];

// Simulation speed control: water flows every tick, but the whole sim advances
// on an accumulator so we can run it slowly enough to watch erosion happen.
const BASE_RATE = 0.5;        // sim ticks per rendered frame at 1x
const SPEEDS = [0.25, 0.5, 1, 2, 4];
let simSpeed = 1;
let simAcc = 0;
const surf = i => rock[i] + sand[i] + lava[i];

// Erosion resistance of bedrock by elevation: soft layers near the surface,
// progressively harder with depth, alternating hard/soft strata, and a fully
// unerodible basement below BASEMENT so nothing carves down to the map floor.
function hardness(e) {
  if (e <= BASEMENT) return 0;
  const depthSoft = clamp((e - BASEMENT) / 45, 0.06, 1);  // higher up = softer/faster
  const band = 0.55 + 0.45 * Math.sin(e * 0.5);           // alternating hard/soft bands
  return depthSoft * band;
}

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
      let e = Ks * (C - sed[i]); if (e > ERODE_MAX) e = ERODE_MAX;
      // topsoil erodes freely
      const fromSand = Math.min(sand[i], e);
      sand[i] -= fromSand; let removed = fromSand; const rem = e - fromSand;
      // then bedrock erodes slowly, scaled by the hardness of the current strata
      // layer, and never below the unerodible basement
      if (rem > 0) {
        const allow = rock[i] - BASEMENT;
        if (allow > 0) { const re = Math.min(allow, rem * hardness(rock[i])); rock[i] -= re; removed += re; }
      }
      sed[i] += removed;
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
  if (sources.size) {
    let depleted = null;
    for (const [idx, s] of sources) {
      if (s.type === 'water') {
        const give = Math.min(s.rate, s.remaining);
        water[idx] += give; s.remaining -= give;
        if (s.remaining <= 0) (depleted || (depleted = [])).push(idx);
      } else { lava[idx] += s.rate; ltemp[idx] = 400; }
    }
    if (depleted) { for (const idx of depleted) sources.delete(idx); rebuildMarkers(); }
  }
  if (raining && frame % 2 === 0) { const drops = (W * H / 600) | 0; for (let k = 0; k < drops; k++) { const x = (Math.random() * W) | 0, y = (Math.random() * H) | 0; water[I(x, y)] += 0.6; } }
  stepLava();
  stepWater();
  if (frame % EROSION_EVERY === 0) stepErosion();
  stepEvaporate();
  if (frame % 3 === 0) stepGrass();
  if (frame % CIV_EVERY === 0) stepCivilization();
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
const cam = { az: 0.7, polar: 0.95, radius: 160, ty: 8, tx: 0, tz: 0 };
function updateCamera() {
  const r = cam.radius, sp = Math.sin(cam.polar);
  camera.position.set(
    cam.tx + Math.cos(cam.az) * sp * r,
    cam.ty + Math.cos(cam.polar) * r,
    cam.tz + Math.sin(cam.az) * sp * r
  );
  camera.lookAt(cam.tx, cam.ty, cam.tz);
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
    // bedrock colour drawn from a stack of strata that varies with elevation,
    // so canyons reveal distinct coloured layers
    const be = rock[i];
    const sc = STRATA[((Math.floor(clamp(be, 0, 240) / 6.5) % STRATA.length) + STRATA.length) % STRATA.length];
    const shade = 0.82 + 0.18 * Math.sin(be * 1.25);
    const rr = sc[0] * shade, rg = sc[1] * shade, rb = sc[2] * shade;
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
  for (const [idx, s] of sources) {
    const m = markerGroup.children[mi++]; if (!m) break;
    const gx = idx % W, gy = (idx / W) | 0;
    const frac = s.budget ? clamp(s.remaining / s.budget, 0.12, 1) : 1;  // shrink as it drains
    m.scale.set(1, frac, 1);
    m.position.set(gx - W / 2, surf(idx) * HS + 1.4 * frac, gy - H / 2);
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
const T_LAND = 0, T_WATER = 1, T_LAVA = 2, T_ROCK = 3, T_PLANT = 4, T_SPRING = 5, T_SCOOP = 6, T_HAND = 7, T_METEOR = 8, T_PEOPLE = 9;
const TOOLS = [
  { id: T_HAND, name: 'Move', ic: '✋' },
  { id: T_PEOPLE, name: 'People', ic: '🧑‍🤝‍🧑' },
  { id: T_LAND, name: 'Land', ic: '⛰' },
  { id: T_WATER, name: 'Water', ic: '💧' },
  { id: T_SPRING, name: 'Spring', ic: '⛲' },
  { id: T_LAVA, name: 'Lava', ic: '🌋' },
  { id: T_METEOR, name: 'Meteor', ic: '☄️' },
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
  // finite reservoir sized by the brush: bigger brush = more water & faster flow
  const rate = 1.5 + brush * 0.2;
  const budget = brush * 120;
  sources.set(i, { type: 'water', rate, remaining: budget, budget });
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
    else if (tool === T_METEOR) { const g = screenToGrid(e.clientX, e.clientY); if (g) callAsteroid(g[0], g[1]); }
    else if (tool === T_PEOPLE) { const g = screenToGrid(e.clientX, e.clientY); if (g) foundSettlement(g[0], g[1]); }
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
    // Move tool: a single finger pans the camera across the terrain
    const dx = px - prev.x, dy = py - prev.y, k = cam.radius * 0.0016;
    const sinA = Math.sin(cam.az), cosA = Math.cos(cam.az);
    cam.tx -= (dx * sinA + dy * cosA) * k;
    cam.tz -= (dx * -cosA + dy * sinA) * k;
    const lim = Math.max(W, H);
    cam.tx = clamp(cam.tx, -lim, lim);
    cam.tz = clamp(cam.tz, -lim, lim);
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
const toolsEl = document.getElementById('tools'), curname = document.getElementById('curname'), civEl = document.getElementById('civ');
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
document.getElementById('resetBtn').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; genTerrain(); rebuildMarkers(); cam.tx = 0; cam.tz = 0; });

const toast = document.getElementById('toast'), badge = document.getElementById('badge');
function showToast() { toast.classList.add('show'); }
function hideToast() { toast.classList.remove('show'); badge.style.opacity = '0'; }
toast.addEventListener('click', hideToast);
document.getElementById('helpBtn').addEventListener('click', showToast);
showToast(); setTimeout(() => { if (toast.classList.contains('show')) hideToast(); }, 8000);

//================================================================
// Asteroids — call one in; it falls and realistically impacts the world
//================================================================
const asteroids = [], flashes = [], rings = [];
const astGeo = new THREE.IcosahedronGeometry(2.6, 0);
const astMat = new THREE.MeshStandardMaterial({ color: 0x2e2118, emissive: 0xff5a1e, emissiveIntensity: 1.5, roughness: 1, metalness: 0 });
const flashGeo = new THREE.SphereGeometry(1, 16, 12);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const ringGeo = new THREE.RingGeometry(0.86, 1.0, 48);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

function callAsteroid(gx, gy) {
  if (asteroids.length > 6) return;
  const x = clamp(gx | 0, 2, W - 3), z = clamp(gy | 0, 2, H - 3);
  const R = clamp(brush * 0.7, 5, 20);
  const a = {
    gx: x, gz: z, R, t: 0,
    wx: x - W / 2, wz: z - H / 2,
    ox: (Math.random() - 0.5) * 50, oz: (Math.random() - 0.5) * 50,
    startY: 200 + R * 5, targetY: surf(I(x, z)) * HS + 1,
    mesh: new THREE.Mesh(astGeo, astMat),
    light: new THREE.PointLight(0xff6a2c, 2.4, 150),
  };
  a.mesh.scale.setScalar(R * 0.22);
  scene.add(a.mesh); scene.add(a.light);
  asteroids.push(a);
}

function impact(cx, cz, R) {
  const depth = R * 0.9, rimR = R * 1.7, reach = Math.ceil(rimR * 1.4);
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const x = cx + dx, y = cz + dy; if (!inb(x, y)) continue;
    const i = I(x, y), dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < R) {
      // excavate a bowl — through soil and into bedrock (impacts beat hardness)
      const bowl = depth * (1 - (dist / R) * (dist / R));
      let rem = bowl;
      const fs = Math.min(sand[i], rem); sand[i] -= fs; rem -= fs;
      if (rem > 0) rock[i] = Math.max(BASEMENT * 0.5, rock[i] - rem);
      if (water[i] > MINW) { steamFx[i] = 1; water[i] *= 0.12; }   // flash to steam
      ltemp[i] = Math.max(ltemp[i], 600 * (1 - dist / R));
      if (dist < R * 0.35) { lava[i] += 1.4 * (1 - dist / (R * 0.35)); ltemp[i] = Math.max(ltemp[i], 520); }
    } else if (dist < rimR) {
      // raised ejecta rim
      const t = (rimR - dist) / (rimR - R);
      sand[i] += depth * 0.32 * t * t;
    }
    // splash waves: depress the centre, raise a ring where there is water
    if (water[i] > MINW && dist >= R * 0.8 && dist < reach) {
      water[i] += 1.5 * Math.max(0, 1 - Math.abs(dist - R) / R);
    }
  }
  destroyBuildingsNear(cx, cz, rimR);
  spawnFlash(cx, cz, R);
}

function spawnFlash(cx, cz, R) {
  const wx = cx - W / 2, wz = cz - H / 2, y = surf(I(cx, cz)) * HS;
  const f = new THREE.Mesh(flashGeo, flashMat.clone());
  f.position.set(wx, y + R * 0.4, wz); f.scale.setScalar(R * 0.6); scene.add(f);
  flashes.push({ mesh: f, t: 0, base: R * 0.6, grow: R * 1.8 });
  const r = new THREE.Mesh(ringGeo, ringMat.clone());
  r.rotation.x = -Math.PI / 2; r.position.set(wx, y + 0.6, wz); r.scale.setScalar(R); scene.add(r);
  rings.push({ mesh: r, t: 0, max: R * 7 });
}

function updateEffects() {
  for (let k = asteroids.length - 1; k >= 0; k--) {
    const a = asteroids[k]; a.t += 0.03; const tt = a.t;
    const x = a.wx + a.ox * (1 - tt), z = a.wz + a.oz * (1 - tt);
    const y = a.startY + (a.targetY - a.startY) * (tt * tt);   // accelerate as it falls
    a.mesh.position.set(x, y, z); a.mesh.rotation.x += 0.3; a.mesh.rotation.y += 0.22;
    a.light.position.set(x, y + 3, z);
    if (tt >= 1) { scene.remove(a.mesh); scene.remove(a.light); impact(a.gx, a.gz, a.R); asteroids.splice(k, 1); }
  }
  for (let k = flashes.length - 1; k >= 0; k--) {
    const f = flashes[k]; f.t += 0.06;
    f.mesh.scale.setScalar(f.base + f.grow * f.t);
    f.mesh.material.opacity = Math.max(0, 1 - f.t);
    if (f.t >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); flashes.splice(k, 1); }
  }
  for (let k = rings.length - 1; k >= 0; k--) {
    const r = rings[k]; r.t += 0.035;
    r.mesh.scale.setScalar(1 + (r.max - 1) * r.t);
    r.mesh.material.opacity = 0.8 * Math.max(0, 1 - r.t);
    if (r.t >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); rings.splice(k, 1); }
  }
  animatePeople();
}

//================================================================
// Civilization — people settle, grow, and build through the ages,
// while floods, erosion and meteors wipe them out
//================================================================
const ERAS = [
  { name: 'Prehistoric', year: -10000, col: 0x6f4a2c, h: 1.3, w: 0.9 },
  { name: 'Stone Age',   year: -8000,  col: 0x8c7a55, h: 1.7, w: 1.0 },
  { name: 'Ancient',     year: -3000,  col: 0xcdb888, h: 2.4, w: 1.1 },
  { name: 'Medieval',    year: 500,    col: 0x9b8e7c, h: 3.2, w: 1.0 },
  { name: 'Industrial',  year: 1760,   col: 0x8a3f30, h: 4.2, w: 1.1 },
  { name: 'Modern',      year: 1950,   col: 0x7fb0dc, h: 7.0, w: 0.85 },
];
const BUILD_CAP = 260, PER_BUILDING = 12, PEOPLE_CAP = 90, SPACING = 3;
let pop = 0, year = -10000;
const buildings = [];
const people = [];
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_CONE = new THREE.ConeGeometry(0.7, 1, 6);
const G_CYL = new THREE.CylinderGeometry(0.55, 0.7, 1, 6);
const G_PBODY = new THREE.BoxGeometry(0.34, 0.8, 0.24);
const G_PHEAD = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const G_PLEG = new THREE.BoxGeometry(0.13, 0.7, 0.13);
let eraMats = null, roofMat = null, bodyMat = null, skinMat = null;

function eraIndex(y) { let e = 0; for (let k = 0; k < ERAS.length; k++) if (y >= ERAS[k].year) e = k; return e; }
function fmtYear(y) { const v = Math.round(y); return v < 0 ? (-v) + ' BCE' : v + ' CE'; }

function ensureCivAssets() {
  if (eraMats) return;
  eraMats = ERAS.map((e) => new THREE.MeshStandardMaterial({
    color: e.col, roughness: e.name === 'Modern' ? 0.25 : 0.85,
    metalness: e.name === 'Modern' ? 0.45 : 0.0,
    emissive: e.name === 'Modern' ? 0x10202e : 0x000000,
  }));
  roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.9 });
  bodyMat = new THREE.MeshStandardMaterial({ color: 0x3f6ea8, roughness: 0.7 });   // shirt
  skinMat = new THREE.MeshStandardMaterial({ color: 0xe7b58c, roughness: 0.7 });   // head/legs
}
function resetCivilization() {
  for (const b of buildings) if (b.group) scene.remove(b.group);
  for (const p of people) if (p.mesh) scene.remove(p.mesh);
  buildings.length = 0; people.length = 0; pop = 0; year = -10000;
}

// Is a cell habitable at all (dry-ish land, not lava, not a cliff)?
function buildableManual(x, y) {
  if (!inb(x, y)) return false;
  const i = I(x, y);
  if (occupied[i]) return false;
  if (water[i] > 0.3 || lava[i] > 0.02) return false;
  if (solidH(i) < BASEMENT + 3) return false;
  const hl = solidH(I(Math.max(0, x - 1), y)), hr = solidH(I(Math.min(W - 1, x + 1), y));
  const hu = solidH(I(x, Math.max(0, y - 1))), hd = solidH(I(x, Math.min(H - 1, y + 1)));
  if (Math.max(Math.abs(hl - hr), Math.abs(hu - hd)) > 6) return false;   // too steep
  return true;
}
// Auto-growth also requires spacing so towns spread out instead of overlapping.
function buildable(x, y) {
  if (!buildableManual(x, y)) return false;
  for (let sy = -SPACING; sy <= SPACING; sy++) for (let sx = -SPACING; sx <= SPACING; sx++) {
    const nx = x + sx, ny = y + sy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && occupied[ny * W + nx]) return false;
  }
  return true;
}
// Distinct architecture per age, built so the base sits at y = 0.
function buildMeshForEra(era, rnd) {
  const g = new THREE.Group(), mat = eraMats[era], s = 1 + rnd * 0.5;
  if (era === 0) {                         // Prehistoric: tent/hut
    const w = 1.8 * s, h = 1.5 * s; const m = new THREE.Mesh(G_CONE, mat); m.scale.set(w, h, w); m.position.y = h / 2; g.add(m);
  } else if (era === 1) {                  // Stone Age: round hut + thatched cone roof
    const w = 1.9 * s, h = 1.7 * s; const base = new THREE.Mesh(G_CYL, mat); base.scale.set(w, h, w); base.position.y = h / 2; g.add(base);
    const roof = new THREE.Mesh(G_CONE, roofMat); roof.scale.set(w * 1.15, h * 0.85, w * 1.15); roof.position.y = h + h * 0.42; g.add(roof);
  } else if (era === 2) {                   // Ancient: stone block
    const w = 2.3 * s, h = 2.5 * s; const m = new THREE.Mesh(G_BOX, mat); m.scale.set(w, h, w); m.position.y = h / 2; g.add(m);
  } else if (era === 3) {                   // Medieval: tower with spire
    const w = 1.8 * s, h = 3.7 * s; const base = new THREE.Mesh(G_BOX, mat); base.scale.set(w, h, w); base.position.y = h / 2; g.add(base);
    const roof = new THREE.Mesh(G_CONE, roofMat); roof.scale.set(w * 1.25, h * 0.55, w * 1.25); roof.position.y = h + h * 0.24; g.add(roof);
  } else if (era === 4) {                   // Industrial: brick block + chimney
    const w = 2.4 * s, h = 3.3 * s; const m = new THREE.Mesh(G_BOX, mat); m.scale.set(w, h, w); m.position.y = h / 2; g.add(m);
    const ch = new THREE.Mesh(G_BOX, roofMat); ch.scale.set(w * 0.22, h * 0.95, w * 0.22); ch.position.set(w * 0.3, h + h * 0.42, w * 0.3); g.add(ch);
  } else {                                  // Modern: glass skyscraper + antenna
    const w = 1.8 * s, h = 8 * s; const m = new THREE.Mesh(G_BOX, mat); m.scale.set(w, h, w); m.position.y = h / 2; g.add(m);
    const ant = new THREE.Mesh(G_BOX, roofMat); ant.scale.set(w * 0.12, h * 0.18, w * 0.12); ant.position.y = h + h * 0.09; g.add(ant);
  }
  return g;
}
function seatBuilding(b) { b.group.position.set(b.gx - W / 2, solidH(I(b.gx, b.gy)) * HS, b.gy - H / 2); }
function styleBuilding(b, era) {
  if (b.group) scene.remove(b.group);
  b.tier = era; b.group = buildMeshForEra(era, b.rnd); scene.add(b.group); seatBuilding(b);
}
function addBuilding(x, y, era) {
  if (buildings.length >= BUILD_CAP) return false;
  ensureCivAssets();
  const b = { gx: x, gy: y, group: null, baseH: solidH(I(x, y)), rnd: Math.random(), tier: -1, dead: false };
  occupied[I(x, y)] = 1; buildings.push(b); styleBuilding(b, era);
  return true;
}
function destroyBuilding(k) {
  const b = buildings[k]; b.dead = true; if (b.group) scene.remove(b.group);
  occupied[I(b.gx, b.gy)] = 0; buildings.splice(k, 1); pop = Math.max(0, pop - PER_BUILDING);
}
// A simple stick-figure: two legs, a body and a head, that can swing its legs.
function makePerson() {
  const g = new THREE.Group();
  const legL = new THREE.Mesh(G_PLEG, skinMat); legL.position.set(-0.12, 0.35, 0); g.add(legL);
  const legR = new THREE.Mesh(G_PLEG, skinMat); legR.position.set(0.12, 0.35, 0); g.add(legR);
  const body = new THREE.Mesh(G_PBODY, bodyMat); body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(G_PHEAD, skinMat); head.position.y = 1.6; g.add(head);
  g.scale.setScalar(1.4); g.userData = { legL, legR };
  return g;
}
// keep the population of figures in sync with the actual population (count only)
function updatePeople() {
  ensureCivAssets();
  const want = clamp(Math.floor(pop / 8), 0, PEOPLE_CAP);
  while (people.length < want && buildings.length) {
    const home = buildings[(Math.random() * buildings.length) | 0];
    const m = makePerson(); scene.add(m);
    people.push({ mesh: m, home, px: home.gx, pz: home.gy, tx: undefined, tz: 0, phase: Math.random() * 6, speed: 0.035 + Math.random() * 0.05 });
  }
  while (people.length > want) { const p = people.pop(); scene.remove(p.mesh); }
}
// per-frame: wander near home, face travel direction, swing legs to "walk"
function animatePeople() {
  for (const p of people) {
    if (!p.home || p.home.dead) { p.home = buildings.length ? buildings[(Math.random() * buildings.length) | 0] : null; if (p.home) { p.px = p.home.gx; p.pz = p.home.gy; p.tx = undefined; } }
    if (!p.home) { p.mesh.visible = false; continue; }
    p.mesh.visible = true;
    if (p.tx === undefined || (Math.abs(p.px - p.tx) < 0.4 && Math.abs(p.pz - p.tz) < 0.4)) {
      p.tx = clamp(p.home.gx + (Math.random() - 0.5) * 9, 0, W - 1);
      p.tz = clamp(p.home.gy + (Math.random() - 0.5) * 9, 0, H - 1);
    }
    const dx = p.tx - p.px, dz = p.tz - p.pz, d = Math.hypot(dx, dz) || 1;
    p.px += dx / d * p.speed; p.pz += dz / d * p.speed; p.phase += p.speed * 4.5;
    p.mesh.position.set(p.px - W / 2, solidH(I(p.px | 0, p.pz | 0)) * HS, p.pz - H / 2);
    p.mesh.rotation.y = Math.atan2(dx, dz);
    const sw = Math.sin(p.phase) * 0.6;
    p.mesh.userData.legL.rotation.x = sw; p.mesh.userData.legR.rotation.x = -sw;
  }
}
function destroyBuildingsNear(cx, cz, R) {
  for (let k = buildings.length - 1; k >= 0; k--) {
    const b = buildings[k];
    if (Math.hypot(b.gx - cx, b.gy - cz) <= R) destroyBuilding(k);
  }
}
function foundSettlement(gx, gy) {
  let x = gx | 0, y = gy | 0; if (!inb(x, y)) return;
  // place exactly where tapped; only nudge by 1 cell if that exact spot is
  // water/lava/cliff/occupied
  if (!buildableManual(x, y)) {
    let best = null;
    for (let dy = -1; dy <= 1 && !best; dy++) for (let dx = -1; dx <= 1; dx++)
      if (buildableManual(x + dx, y + dy)) { best = [x + dx, y + dy]; break; }
    if (best) { x = best[0]; y = best[1]; }
  }
  if (buildableManual(x, y)) { pop += PER_BUILDING + 8; addBuilding(x, y, eraIndex(year)); }
  else pop += 8;
}
function foundBuilding(era) {
  for (let a = 0; a < 14; a++) {
    let bx, by;
    if (buildings.length) { const b = buildings[(Math.random() * buildings.length) | 0]; bx = b.gx + ((Math.random() * 9) | 0) - 4; by = b.gy + ((Math.random() * 9) | 0) - 4; }
    else { bx = (Math.random() * W) | 0; by = (Math.random() * H) | 0; }
    if (buildable(bx, by)) return addBuilding(bx, by, era);
  }
  return false;
}
function landCapacity(era) {
  let hab = 0;
  for (let i = 0, n = W * H; i < n; i += 3)
    if (water[i] < 0.3 && lava[i] < 0.02 && (rock[i] + sand[i]) > BASEMENT + 3) hab++;
  return hab * 3 * (era + 1) * 0.45;
}
function stepCivilization() {
  if (pop <= 0 && buildings.length === 0) return;     // no society yet
  const era = eraIndex(year);
  if (pop > 0) {
    year += 6 + era * era * 5;                          // time accelerates with progress
    const cap = Math.max(PER_BUILDING, landCapacity(era));
    pop += 0.03 * pop * (1 - pop / cap);
    pop = clamp(pop, 0, 1e6);
  }
  // expand: build up to the population's needs
  const target = Math.min(BUILD_CAP, Math.floor(pop / PER_BUILDING));
  let tries = 6;
  while (buildings.length < target && tries-- > 0) { if (!foundBuilding(era)) break; }
  // disasters + upgrade existing buildings to the current age
  for (let k = buildings.length - 1; k >= 0; k--) {
    const b = buildings[k], i = I(b.gx, b.gy);
    if (water[i] > 0.8 || lava[i] > 0.05 || solidH(i) < b.baseH - 4) { destroyBuilding(k); continue; }
    if (b.tier !== era) styleBuilding(b, era);
    seatBuilding(b);
  }
  updatePeople();
}

//================================================================
// Loop
//================================================================
function loop() {
  // continuous sculpting while a single finger is held (springs are discrete)
  if (pointers.size === 1 && tool !== T_SPRING && tool !== T_HAND && tool !== T_METEOR && tool !== T_PEOPLE) {
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
  updateEffects();
  updateMeshes();
  updateCamera();
  if (civEl) civEl.textContent = '🗓 ' + fmtYear(year) + ' · ' + ERAS[eraIndex(year)].name + ' · 👥 ' + Math.round(pop).toLocaleString() + ' · ' + BUILD;
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
if ('serviceWorker' in navigator) {
  // Auto-update: reload once when a newly deployed service worker takes control,
  // and poll for updates on launch / when the app regains focus.
  if (navigator.serviceWorker.controller) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return; refreshing = true; window.location.reload();
    });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update();
      setInterval(() => reg.update(), 60000);
    }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  });
}

boot();
