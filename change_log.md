# Changelog

All notable changes to **Earthview from the Moon** will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/):
- **Major**: breaking workflow/protocol changes or removals that alter expected outputs.
- **Minor**: new capabilities, personas, protocols, outputs, or workflows.
- **Patch**: non-breaking refinements, doc clarifications, or small process tweaks.
- **Release recommendation**: if `[Unreleased]` has 5+ entries total, or if it includes a Major/Minor change, recommend cutting a release section and starting a fresh `[Unreleased]`.

---

## [Unreleased]

_Nothing unreleased at this time._

---

## [0.2.1] — 2026-02-25

### 🔧 Visual & Astronomical Fixes

### Fixed (Patch)
- **Shadow clipping**: Phase shadow now drawn inside a single circular `clip()` path shared with the Earth image — no bleed outside the globe.
- **Earth rotation direction**: Corrected to counterclockwise (features drift right-to-left as seen from the Moon, matching the east=left sky convention).
- **Oceanus Procellarum position**: Earth moved to the LEFT side of the canvas (X:25%, Y:55%) — east is left in astronomical sky charts.
- **Sea of Tranquility position**: Correspondingly moved to upper-right (X:62%, Y:25%) — west is right.
- **Date label overlap**: Moved up ~44px so it floats clearly in the sky above the lunar horizon.

### Changed (Patch)
- **Earth image**: Source updated from `earth-sketch.jpg` to `earth-clean.jpg`.

---

## [0.2.0] — 2026-02-25

### 🚀 Image-Based Earth, Astronomical Positioning & Flight Director

Three major changes that transform the visualizer from a manual slider toy into a date-driven time-lapse tool.

### Changed (Minor — breaking UI change)
- **Earth rendering**: Replaced all bézier-curve continent drawing code with a loaded image asset (`earth-sketch.jpg`). The image is rendered inside a circular clip and rotates based on Earth's sidereal rotation period (~23h 56m).
- **Earth positioning**: Earth X/Y position is now astronomically derived from selenographic coordinates. Each Moon location maps to a specific elevation and azimuth:
  - Sea of Tranquility (8°N, 31°E) → upper-west (X:38%, Y:25%)
  - Oceanus Procellarum (18°N, 57°W) → lower-east (X:72%, Y:50%)
  - Lunar South Pole (90°S) → centered, near horizon (X:50%, Y:68%)
  - Far Side → hidden (below horizon)
- **Phase shadow terminator**: Now tilted based on Sun's ecliptic longitude and lunar phase angle, matching the astronomical reality that the terminator isn't always vertical on a celestial body.

### Added (Minor)
- **Flight Director time-lapse UI**: Replaced the manual Earth Phase slider with:
  - Two date-picker inputs (Start / End date, defaults to ±14 days from today)
  - A "▶ Play Time-Lapse" / "⏸ Pause" toggle button
  - A speed selector (1×, 5×, 10×, 30× = days per second)
- **Real-time phase calculation**: When idle (no time-lapse), the app shows Earth at today's actual phase using the synodic month formula (reference: 2025-01-29 New Moon).
- **On-canvas date counter**: During playback, displays the current date and phase name (e.g., "Feb 25, 2026 / First Quarter") in Patrick Hand font on the canvas.

---

## [0.1.0] — 2026-02-25

### 🎉 Initial Prototype

The first working version of the Earthview from the Moon interactive visualizer.

### Added (Minor)
- **Canvas scene**: deep-black starry sky with ~220 twinkling stars (randomised positions, sizes, and blink speeds).
- **Hand-drawn Earth**: blue ocean with radial gradient, 6 continent shapes (Africa, Europe, Asia, North America, South America, Australia) projected onto a 3D sphere using bézier curves, wobbly thick outline, and specular highlight with soft glow.
- **Earth phase system**: slider (0–360°) sweeps an elliptical terminator shadow across Earth — cycles through New Earth, Waxing Crescent, First Quarter, Waxing Gibbous, Full Earth, Waning Gibbous, Third Quarter, Waning Crescent.
- **Moon location dropdown**: 4 selectable locations (Oceanus Procellarum, Sea of Tranquility, Lunar South Pole, Far Side — Mare Moscoviense) — each changes Earth's vertical sky position with smooth lerp animation.
- **Far Side behaviour**: Earth hidden with a softly pulsing "Earth is below the horizon" message.
- **Sketchy lunar horizon**: warm orange/brown gradient ground with pre-computed bumpy silhouette, horizontal scribble strokes, and diagonal cross-hatch texture.
- **Hand-drawn UI control panel**: fixed bottom bar with paper-texture background, Patrick Hand Google Font, asymmetrically rounded borders, styled range slider with grab cursor, and custom-arrowed dropdown.
- **Responsive layout**: canvas fills viewport above the control bar; adapts to narrow screens (< 600px) with stacked controls.

### Infrastructure
- Project initialised with `index.html`, `style.css`, `app.js` — zero external dependencies.
- `.gitignore` configured for agent artifacts, secrets, build outputs, and IDE files.
- `README.md` project documentation.
- `change_log.md` (this file) with semantic versioning policy.
