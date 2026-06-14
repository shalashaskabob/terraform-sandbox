# 🌍 Terraform — 3D Water & Erosion Sandbox

A mobile-first physics sandbox inspired by Ubisoft's **From Dust**. Sculpt a
living **3D** landscape with your finger and watch it come to life with
**realistic water flow, hydraulic erosion, and lava that cools into rock** —
rendered as a real lit, orbitable terrain with Three.js (WebGL).

**Controls:** **1 finger** sculpts · **2 fingers** orbit & pinch-zoom the camera.

It's a single self-contained web app — no install, no account. Open it on your
phone and tap **Add to Home Screen** to run it like a native app (it works
offline via a service worker / PWA).

## What it simulates

- **Shallow-water hydraulics (pipe model).** Water finds its level, pools into
  lakes, and runs downhill into rivers — using the same virtual-pipe method
  used by serious terrain-erosion tools (Mei et al. 2007).
- **Hydraulic erosion & sediment transport.** Fast water picks up sediment and
  carves valleys and canyons; slow water deposits it to build sandbars and
  deltas. Sediment is advected with the current.
- **Lava.** Flows viscously downhill, glows by temperature (with a bloom pass),
  cools and solidifies into new rock, and flashes water into steam on contact.
- **Vegetation.** Grass spreads across moist, sandy shorelines and dies under
  water or lava.
- **Hill-shaded rendering** with height-banded geology (sea bed, beach, rock,
  snow caps), depth-tinted water, and whitewater foam on fast currents.

## Tools

| Tool | What it does |
|------|--------------|
| ⛰ Land | Raise erodible soil/sand — build mountains |
| 💧 Water | Pour water (hold to keep pouring) |
| ⛲ Spring | Tap to drop a **constant water source** that flows forever |
| 🌋 Lava | Pour lava that flows and cools to rock |
| 🪨 Rock | Raise hard, slow-to-erode bedrock |
| 🌱 Plant | Seed vegetation near the shore |
| ⛏ Scoop | Dig terrain / remove water & lava |

Top bar: **?** help · **🌧** toggle rain · **⏸** pause · **⟳** generate new land.
Use the slider to change brush size. Multi-touch is supported.

## Run locally

```bash
npm install
npm run dev      # open the printed URL on your phone (same Wi-Fi)
```

## Build / deploy

```bash
npm run build    # outputs static files to dist/
npm run preview  # preview the production build
npm run deploy   # build + deploy to Cloudflare Pages (wrangler)
```

The app is plain HTML + Canvas 2D with no runtime dependencies, so `dist/` can
also be hosted on any static host (GitHub Pages, Netlify, etc.).
