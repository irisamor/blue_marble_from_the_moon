# 🌍 Earthview from the Moon

An interactive 2D visualizer that shows what the Earth looks like from the surface of the Moon — rendered in a charming, hand-drawn sketch style with real astronomical accuracy.

![Earthview from the Moon](https://img.shields.io/badge/version-v0.4.0-blue?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/built_with-vanilla_JS-yellow?style=flat-square)

---

## ✨ What It Does

From the Moon's surface, Earth hangs permanently in the sky (thanks to tidal locking). This visualizer lets you explore that view with real orbital mechanics:

- **Time-Lapse Engine** — set a date range and watch Earth's phase cycle through New Earth → Crescent → Quarter → Gibbous → Full Earth and back.
- **Timeline Scrubber** — manually scrub through dates to see the phase change instantly.
- **Location Dropdown** — pick a spot on the Moon (Sea of Tranquility, Oceanus Procellarum, Lunar South Pole, or Far Side) and watch Earth shift its position in the sky — or vanish entirely on the far side.
- **Stats Panel** — live overlay showing Date, Phase (name + angle), Illumination %, and Libration offset.
- **Lunar Libration** — Earth subtly wobbles in the lunar sky over the course of a month, driven by the Moon's orbital eccentricity and inclination.
- **Seasonal Earth Tilt** — Earth's north pole direction rotates throughout the year as the Earth–Moon system orbits the Sun.
- **Variable Earth Size** — Earth appears ~6% larger at perigee vs apogee.

## 🔭 Astronomical Accuracy

The simulation uses real orbital mechanics — not fake slider values:

| Feature | Model |
|---|---|
| Phase cycle | Synodic month (29.53 days) from a real New Moon reference date |
| Earth rotation | Sidereal day (23h 56m 4s), continents scroll right-to-left |
| Terminator tilt | Sun–Earth–Moon geometry with truncated lunar ecliptic longitude series |
| Libration | Optical libration from Moon's mean anomaly (lon) and argument of latitude (lat) |
| Earth tilt | Axial obliquity (23.44°) projected onto observer's plane, varying seasonally |
| Earth size | Inverse distance scaling from Moon's orbital eccentricity |
| Ephemeris | J2000-based Sun/Moon mean elements, accurate to ~1° over ±50 years |

## 🎨 Visual Style

| Element | Style |
|---|---|
| Earth | Equirectangular hand-painted map, circular clip, specular highlight, soft glow |
| Sky | Deep black with ~220 twinkling stars |
| Lunar surface | Warm orange/brown gradient with cross-hatch scribble texture |
| Controls | Paper-texture background, quirky rounded borders, thick dark outlines |
| Typography | [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) — a handwritten Google Font |

## 🚀 Getting Started

No build tools, no `npm install`, no frameworks. However, because the astronomical engine uses advanced canvas pixel manipulation (`getImageData`) for the orthographic 3D projection, **it must be run through a local web server**. Modern browsers will block these pixel operations due to CORS security policies if you simply double-click `index.html`.

Just serve the files locally:

```bash
cd 202602_earthview_from_moon
python3 -m http.server 8080
# Open http://localhost:8080
```

### How to Share

Because this is a pure Vanilla HTML/CSS/JS application with zero dependencies, sharing it is incredibly easy:
1. **GitHub Pages / Netlify / Vercel:** You can instantly deploy this app for free by dropping the folder into Netlify or pushing it to a GitHub repo with GitHub Pages enabled.
2. **Send a ZIP:** Send the folder to a friend and tell them to run the `python3 -m http.server` command above.

## 📁 Project Structure

```
202602_earthview_from_moon/
├── index.html          Page shell, controls, stats panel, font import
├── style.css           Sketch-paper aesthetic, styled inputs, stats panel
├── app.js              Canvas renderer, astronomy engine, interactivity
├── earth-map.png       Equirectangular Earth map (hand-painted style)
├── earth-clean.jpg     Original single-hemisphere globe (legacy)
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
| **🌙 Location** (dropdown) | Moves Earth's position; Far Side hides it entirely |
| **🕐 Mission Window** (date pickers) | Set start/end dates for the time-lapse range |
| **▶ Play Time-Lapse** (button) | Animate phase progression through the date range |
| **Speed** (dropdown) | 1×, 5×, 10×, 30× days per second |
| **Timeline Scrubber** (slider) | Manually scrub to any date in the range |

## 📝 Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **Major** — breaking changes that alter expected outputs or remove features
- **Minor** — new capabilities, visual features, or interaction modes
- **Patch** — non-breaking refinements, documentation, or small tweaks

See [change_log.md](change_log.md) for the full version history.

## 📄 License

This project is provided as-is for educational and personal use.
