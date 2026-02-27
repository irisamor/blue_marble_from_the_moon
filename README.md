# 🌍 Earthview from the Moon

An interactive 2D visualizer that shows what the Earth looks like from the surface of the Moon — rendered in a charming, hand-drawn sketch style.

![Earthview from the Moon — Full Earth](https://img.shields.io/badge/version-v0.2.0-blue?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/built_with-vanilla_JS-yellow?style=flat-square)

---

## ✨ What It Does

From the Moon's surface, Earth hangs permanently in the sky (thanks to tidal locking). This visualizer lets you explore that view:

- **Phase Slider** — drag to sweep a shadow across the Earth, cycling through New Earth → Crescent → Quarter → Gibbous → Full Earth and back.
- **Location Dropdown** — pick a spot on the Moon (Oceanus Procellarum, Sea of Tranquility, Lunar South Pole, or the Far Side) and watch Earth shift its position in the sky — or vanish entirely when you're on the far side.

## 🎨 Visual Style

The entire application follows a **hand-drawn sketch aesthetic**, inspired by a hand-drawn reference image:

| Element | Style |
|---|---|
| Earth | Wobbly outline, bézier-curve continents, specular highlight, soft glow |
| Sky | Deep black with ~220 twinkling stars |
| Lunar surface | Warm orange/brown gradient with cross-hatch scribble texture |
| Controls | Paper-texture background, quirky rounded borders, thick dark outlines |
| Typography | [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) — a handwritten Google Font |

## 🚀 Getting Started

No build tools, no `npm install`, no frameworks. Just serve the files:

```bash
cd 202602_earthview_from_moon
python3 -m http.server 8000
# Open http://localhost:8000
```

Or simply open `index.html` directly in your browser.

## 📁 Project Structure

```
202602_earthview_from_moon/
├── index.html          Page shell, controls, font import
├── style.css           Sketch-paper aesthetic, styled inputs
├── app.js              Canvas renderer & interactivity
├── README.md           This file
├── change_log.md       Version history (semver)
└── .gitignore          Standard ignores
```

## 🛠 Tech Stack

- **HTML5 Canvas 2D** — all rendering
- **Vanilla CSS** — sketch aesthetic, responsive layout
- **Vanilla JavaScript** — no libraries, no dependencies
- **Google Fonts** — Patrick Hand (loaded via `<link>`)

## 📐 Controls

| Control | What It Does |
|---|---|
| **☽ Earth Phase** (slider, 0–360°) | Rotates the Earth and sweeps a terminator shadow across it |
| **🌙 Location** (dropdown) | Moves Earth's vertical position; Far Side hides it entirely |

## 📝 Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **Major** — breaking changes that alter expected outputs or remove features
- **Minor** — new capabilities, visual features, or interaction modes
- **Patch** — non-breaking refinements, documentation, or small tweaks

See [change_log.md](change_log.md) for the full version history.

## 📄 License

This project is provided as-is for educational and personal use.
