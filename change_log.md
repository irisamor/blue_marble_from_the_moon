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

## [1.0.0] — 2026-02-25

### 🎉 Initial Release

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

---

> **Release Recommendation**: ✅ `v1.0.0` has been cut. `[Unreleased]` is clean. The project is ready for use and further iteration.
