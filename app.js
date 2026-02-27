/* ============================================================
   Earthview from the Moon — Canvas Renderer  (v0.4.0)
   ============================================================
   Changes from v0.3.0:
   - Equirectangular Earth map for full-globe rotation
   - Proper optical libration (eccentricity + inclination)
   - Seasonal Earth axial tilt rendering
   - Variable Earth apparent size (perigee/apogee)
   - Proper terminator tilt (Sun–Earth–Moon geometry)
   ============================================================ */

(function () {
    'use strict';

    /* --- DOM refs --- */
    const canvas = document.getElementById('scene');
    const ctx = canvas.getContext('2d');
    const locSel = document.getElementById('location-select');
    const startIn = document.getElementById('start-date');
    const endIn = document.getElementById('end-date');
    const playBtn = document.getElementById('play-btn');
    const speedSel = document.getElementById('speed-select');
    const timelineSlider = document.getElementById('timeline-slider');
    const statDate = document.getElementById('stat-date');
    const statPhase = document.getElementById('stat-phase');
    const statIllum = document.getElementById('stat-illum');
    const statLibration = document.getElementById('stat-libration');

    /* --- Palette --- */
    const C = {
        skyBlack: '#0B0E14',
        starWhite: '#FFFDE7',
        oceanBlue: '#5DADE2',
        outline: '#2C3E50',
        groundWarm: '#D4905C',
        groundDeep: '#C47A3A',
        shadow: 'rgba(10, 12, 20, 0.88)',
    };

    /* ==========================================================
       ASTRONOMICAL CONSTANTS
       ========================================================== */

    // Reference New Moon (UTC): 2025-01-29T12:36:00Z
    const REF_NEW_MOON = new Date('2025-01-29T12:36:00Z').getTime();

    // Synodic month (Earth phase cycle as seen from Moon) ≈ 29.53059 days
    const SYNODIC_DAYS = 29.53059;

    // Earth's sidereal rotation period ≈ 23h 56m 4s = 0.99727 days
    const SIDEREAL_DAY = 0.99726968;

    // Obliquity of Earth's axis ≈ 23.44° (affects terminator tilt)
    const OBLIQUITY = 23.44;

    // Moon's orbital eccentricity
    const MOON_ECC = 0.0549;

    // Moon's orbital inclination to the ecliptic (degrees)
    const MOON_INC = 5.145;

    // Anomalistic month (perigee to perigee) ≈ 27.55455 days
    const ANOMALISTIC_MONTH = 27.55455;

    // Draconic month (node to node) ≈ 27.21222 days
    const DRACONIC_MONTH = 27.21222;

    // Sidereal month ≈ 27.32166 days
    const SIDEREAL_MONTH = 27.32166;

    // Mean Earth–Moon distance (km)
    const MEAN_DISTANCE = 384400;

    // J2000.0 epoch
    const J2000 = new Date('2000-01-01T12:00:00Z').getTime();

    // Degrees ↔ radians helpers
    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;

    /* ==========================================================
       EARTH IMAGE — equirectangular map for full-globe scroll
       ========================================================== */
    const earthImg = new Image();
    earthImg.src = 'earth-map.png';
    let earthImgLoaded = false;

    /* The equirectangular map is used directly for horizontal
       scrolling — no circular clip preprocessing needed since
       the circular clip happens at draw time in drawEarth(). */
    let earthCanvas = null;

    earthImg.onload = () => {
        const w = earthImg.naturalWidth;
        const h = earthImg.naturalHeight;
        earthCanvas = document.createElement('canvas');
        earthCanvas.width = w;
        earthCanvas.height = h;
        const oc = earthCanvas.getContext('2d');
        oc.drawImage(earthImg, 0, 0);
        earthImgLoaded = true;
    };

    /* ==========================================================
       STARS
       ========================================================== */
    let stars = [];
    function genStars(n) {
        stars = [];
        for (let i = 0; i < n; i++) {
            stars.push({
                x: Math.random(), y: Math.random(),
                r: 0.5 + Math.random() * 2,
                alpha: 0.4 + Math.random() * 0.6,
                speed: 0.5 + Math.random() * 2,
                off: Math.random() * Math.PI * 2,
            });
        }
    }
    genStars(220);

    let starsCanvas = null;
    function createStarsCanvas(w, h, time) {
        if (!starsCanvas || starsCanvas.width !== w || starsCanvas.height !== h) {
            starsCanvas = document.createElement('canvas');
            starsCanvas.width = w;
            starsCanvas.height = h;
        }
        const sCtx = starsCanvas.getContext('2d');
        sCtx.clearRect(0, 0, w, h);
        for (const s of stars) {
            const tw = 0.5 + 0.5 * Math.sin(time * s.speed + s.off);
            const a = s.alpha * (0.6 + 0.4 * tw);
            sCtx.beginPath();
            sCtx.arc(s.x * w, s.y * h * 0.78, s.r, 0, Math.PI * 2);
            sCtx.fillStyle = `rgba(255,253,231,${a.toFixed(2)})`;
            sCtx.fill();
        }
    }

    function drawStars(w, h, time) {
        createStarsCanvas(w, h, time);
        ctx.drawImage(starsCanvas, 0, 0);
    }

    /* ==========================================================
       LOCATION PRESETS  (astronomically derived)
       ==========================================================
       Selenographic coords → angular distance from sub-Earth
       point → elevation / azimuth → canvas X/Y.

       Sub-Earth point ≈ 0°N, 0°E.
       Elevation = 90° − angular_distance.
       Azimuth maps to horizontal position.

       Canvas convention (observer looking at the sky):
         LEFT  = WEST      RIGHT = EAST
         TOP   = high elev  BOTTOM = near horizon

       Observer at Procellarum (57°W): sub-Earth is 57° to
       the EAST → Earth appears east → RIGHT side of canvas.
       Observer at Tranquility (31°E): sub-Earth is 31° to
       the WEST → Earth appears west → LEFT side of canvas.

       Location               Coords        Dist  Elev  Az     X%   Y%   Scale
       Sea of Tranquility     8°N, 31°E     ~32°  58°   West   30   25   1.0
       Oceanus Procellarum    18°N, 57°W    ~60°  30°   East   75   55   0.92
       Lunar South Pole       90°S, 0°      ~84°   6°   North  50   68   0.82
       Far Side (Moscoviense) 27°N, 148°E   ~150° <0°   —      —    —    0
       ========================================================== */
    const LOCATIONS = {
        tranquility: { xRatio: 0.30, yRatio: 0.25, scale: 1.0 },
        procellarum: { xRatio: 0.75, yRatio: 0.55, scale: 0.92 },
        southpole: { xRatio: 0.50, yRatio: 0.68, scale: 0.82 },
        farside: { xRatio: 0.50, yRatio: -1, scale: 0 },
    };

    let current = { xRatio: 0.30, yRatio: 0.25, scale: 1.0 };
    let target = { ...current };
    const LERP = 0.045;
    function lerp(a, b, t) { return a + (b - a) * t; }

    /* ==========================================================
       PHASE NAME
       ========================================================== */
    function phaseName(d) {
        d = ((d % 360) + 360) % 360;
        if (d < 8 || d > 352) return 'New Earth';
        if (d < 82) return 'Waxing Crescent';
        if (d < 98) return 'First Quarter';
        if (d < 172) return 'Waxing Gibbous';
        if (d < 188) return 'Full Earth';
        if (d < 262) return 'Waning Gibbous';
        if (d < 278) return 'Third Quarter';
        return 'Waning Crescent';
    }

    /* ==========================================================
       DATE ↔ PHASE ASTRONOMY
       ========================================================== */

    /**
     * Julian centuries since J2000.0 for a given JS Date.
     * Used by most astronomy functions below.
     */
    function julianCenturies(date) {
        return (date.getTime() - J2000) / (86400000 * 36525);
    }

    /**
     * Sun's mean anomaly and ecliptic longitude (degrees).
     * Low-precision formulae accurate to ~1° over ±50 years.
     */
    function sunPosition(T) {
        // Mean anomaly (degrees)
        const M = (357.5291 + 35999.0503 * T) % 360;
        const Mrad = M * DEG;
        // Equation of centre (degrees)
        const C = 1.9146 * Math.sin(Mrad)
            + 0.0200 * Math.sin(2 * Mrad)
            + 0.0003 * Math.sin(3 * Mrad);
        // Mean longitude
        const L0 = (280.4665 + 36000.7698 * T) % 360;
        // Ecliptic longitude
        const sunLon = ((L0 + C) % 360 + 360) % 360;
        return { M, sunLon };
    }

    /**
     * Moon's mean elements (degrees).
     */
    function moonElements(T) {
        // Mean longitude
        const Lm = (218.3165 + 481267.8813 * T) % 360;
        // Mean anomaly
        const Mm = (134.9634 + 477198.8676 * T) % 360;
        // Mean elongation
        const D = (297.8502 + 445267.1115 * T) % 360;
        // Argument of latitude (distance from ascending node)
        const F = (93.2720 + 483202.0175 * T) % 360;
        // Longitude of ascending node
        const Om = (125.0446 - 1934.1363 * T) % 360;
        return { Lm, Mm, D, F, Om };
    }

    /** Phase angle (0–360°) for a given JS Date.
     *  0° = New Earth (fully shadowed), 180° = Full Earth. */
    function phaseForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        return ((days / SYNODIC_DAYS) * 360 % 360 + 360) % 360;
    }

    /** Earth rotation angle (degrees) for a given JS Date.
     *  This drives the image scroll so continents drift. */
    function rotationForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        return ((days / SIDEREAL_DAY) * 360) % 360;
    }

    /**
     * Terminator tilt angle (degrees) as seen from the Moon.
     *
     * Uses direct Sun–Earth–Moon geometry:
     *  1. Compute the Sun's ecliptic longitude (with equation of centre).
     *  2. Compute the Moon's ecliptic longitude.
     *  3. The tilt is the projection of Earth's obliquity onto the
     *     Moon-observer's plane, modulated by the Sun–Moon angle.
     */
    function terminatorTiltForDate(date) {
        const T = julianCenturies(date);
        const { sunLon } = sunPosition(T);
        const { Lm, Mm, D, F } = moonElements(T);

        // Moon's ecliptic longitude (truncated series, ~0.5° accuracy)
        const moonLon = Lm
            + 6.289 * Math.sin(Mm * DEG)
            + 1.274 * Math.sin((2 * D - Mm) * DEG)
            + 0.658 * Math.sin(2 * D * DEG)
            - 0.214 * Math.sin(2 * Mm * DEG)
            - 0.186 * Math.sin((Lm - 2 * D) * DEG * 0)  // mean anomaly of Sun term
            + 0.114 * Math.sin(2 * F * DEG);

        // Sun–Moon elongation projected onto ecliptic
        const elong = (sunLon - moonLon) * DEG;

        // Solar declination (seasonal tilt of Earth's axis toward/away Sun)
        const sunDec = Math.asin(Math.sin(OBLIQUITY * DEG) * Math.sin(sunLon * DEG));

        // The terminator tilt as seen from the Moon combines:
        //  - Earth's axial tilt projected toward the observer
        //  - The elongation angle (most visible at quarter phases)
        const tilt = sunDec * RAD * Math.sin(elong) * 0.7;

        return tilt;   // degrees
    }

    /**
     * Earth's apparent angular tilt (degrees) as seen from the Moon.
     * Earth's north pole direction rotates seasonally because the
     * Earth–Moon system orbits the Sun while Earth's axis stays fixed
     * in inertial space (pointing toward Polaris).
     */
    function earthTiltForDate(date) {
        const T = julianCenturies(date);
        const { sunLon } = sunPosition(T);

        // The apparent tilt of Earth's axis as seen from the Moon
        // is the projection of the obliquity onto the Moon's sky plane.
        // It varies from +23.44° (June solstice, north pole tilted toward
        // Sun/Moon) to −23.44° (December solstice).
        //
        // The visual rotation of the Earth's image is approximately:
        //   -OBLIQUITY × sin(sunLon)  (negative because screen Y is down)
        // This gives the angle between Earth's north pole and "up" on screen.
        const tiltAngle = -OBLIQUITY * Math.sin(sunLon * DEG) * 0.6;
        return tiltAngle;   // degrees
    }

    /**
     * Earth apparent size scale factor (1.0 = mean distance).
     * Varies ±~6% between perigee (356,500 km) and apogee (406,700 km).
     */
    function earthScaleForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;

        // Moon's mean anomaly (radians)
        const M = (days / ANOMALISTIC_MONTH) * 2 * Math.PI;

        // Distance using equation of centre (first two terms)
        // r ≈ a(1 - e·cos(M)) for small e
        const distance = MEAN_DISTANCE * (1 - MOON_ECC * Math.cos(M)
            - MOON_ECC * MOON_ECC * 0.5 * Math.cos(2 * M));

        // Scale is inverse of distance ratio
        return MEAN_DISTANCE / distance;
    }

    /* ==========================================================
       LIBRATION (ASTRONOMY)
       ========================================================== */
    /**
     * Optical libration of the Moon.
     *
     * Optical libration in longitude arises because the Moon's
     * rotation is uniform but its orbital speed varies (Kepler's
     * 2nd law, driven by eccentricity e ≈ 0.0549). The observer
     * sees ±7.9° around the mean sub-Earth point.
     *
     * Optical libration in latitude arises because the Moon's
     * equator is tilted ~6.7° to its orbital plane (which is
     * itself tilted 5.145° to the ecliptic). The observer sees
     * ±6.7° north-south wobble.
     *
     * This model uses the Moon's mean anomaly for longitude
     * libration and argument of latitude for latitude libration,
     * giving date-accurate phase offsets.
     */
    function librationForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        const T = julianCenturies(date);
        const { Mm, F } = moonElements(T);

        // --- Longitude libration (east-west) ---
        // Driven by the equation of centre: the difference between
        // the Moon's true anomaly and its mean anomaly.
        // Leading term: 2e·sin(M) ≈ 2×0.0549×sin(M) in radians
        // Converting to degrees: max ≈ 6.29° (the dominant correction)
        // We use the full amplitude of ±7.9° with proper phase.
        const MmRad = Mm * DEG;
        const degLon = -(6.289 * Math.sin(MmRad)
            + 1.274 * Math.sin(2 * MmRad)
            + 0.186 * Math.sin(3 * MmRad));

        // --- Latitude libration (north-south) ---
        // Driven by the Moon's argument of latitude (F = distance
        // from ascending node along the orbit). The Moon's equator
        // is tilted ~6.7° to its orbital plane.
        const FRad = F * DEG;
        const degLat = -(MOON_INC + 1.54) * Math.sin(FRad)
            - 0.28 * Math.sin(2 * FRad);

        // Visual offsets (fraction of Earth radius on canvas)
        const lonOffset = degLon / 60;  // ~0.13 at maximum
        const latOffset = degLat / 80;  // ~0.08 at maximum

        return { xOff: lonOffset, yOff: latOffset, degLon, degLat };
    }

    /* ==========================================================
       RESIZE
       ========================================================== */
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    /* ==========================================================
       DRAW EARTH  (image-based)
       ========================================================== */

    /** Wobbly circle outline */
    function wobbleCircle(cx, cy, r, segs, w) {
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const wr = r + Math.sin(a * 7.3 + 1.2) * w + Math.cos(a * 13.1) * w * 0.6;
            const x = cx + Math.cos(a) * wr;
            const y = cy + Math.sin(a) * wr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    function drawEarth(cx, cy, r, phaseDeg, rotDeg, tiltDeg, axisTiltDeg) {
        if (!earthImgLoaded) return;

        /* --- Single circular clip for image + shadow + highlight --- */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        /* -- Apply Earth axial tilt (seasonal rotation) -- */
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(axisTiltDeg * DEG);
        ctx.translate(-cx, -cy);

        /* -- Polar-axis rotation via horizontal scroll --
           Features drift RIGHT → LEFT (as seen from the Moon).
           The equirectangular map tiles seamlessly. The map width
           maps to the equator circumference; height maps to pole-
           to-pole. We draw it at 2× radius wide (equirectangular
           aspect) and 1× radius tall. */
        const mapW = r * 4;   // equirectangular: width = 2× height
        const mapH = r * 2;
        const scrollFrac = ((rotDeg % 360) + 360) % 360 / 360;
        const scrollX = scrollFrac * mapW;

        for (let i = -1; i <= 1; i++) {
            ctx.drawImage(earthCanvas,
                cx - mapW / 2 - scrollX + i * mapW, cy - mapH / 2,
                mapW, mapH);
        }

        ctx.restore();   // releases axial tilt rotation

        /* -- Specular highlight (inside same clip) -- */
        const hg = ctx.createRadialGradient(
            cx - r * 0.28, cy - r * 0.28, r * 0.02,
            cx - r * 0.1, cy - r * 0.1, r * 0.55
        );
        hg.addColorStop(0, 'rgba(255,255,255,0.25)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        /* -- Phase shadow with tilt (inside same clip) -- */
        drawPhaseShadowInClip(cx, cy, r, phaseDeg, tiltDeg);

        ctx.restore();   // releases the clip

        /* --- Wobbly outline (outside clip) --- */
        wobbleCircle(cx, cy, r, 90, r * 0.012);
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 3.5;
        ctx.stroke();
    }

    /**
     * Phase terminator shadow — called INSIDE the globe clip.
     * phaseDeg 0 = New Earth (full shadow), 180 = Full (no shadow).
     * tiltDeg = rotation of the terminator line.
     */
    function drawPhaseShadowInClip(cx, cy, r, phaseDeg, tiltDeg) {
        const d = ((phaseDeg % 360) + 360) % 360;
        const phaseAngle = Math.PI - (d / 180) * Math.PI;
        const terminatorW = Math.abs(Math.cos(phaseAngle)) * r;

        ctx.save();
        // Apply tilt rotation around Earth centre
        ctx.translate(cx, cy);
        ctx.rotate((tiltDeg * Math.PI) / 180);
        ctx.translate(-cx, -cy);

        ctx.beginPath();
        if (d <= 180) {
            ctx.arc(cx, cy, r + 2, -Math.PI / 2, Math.PI / 2, false);
            ctx.ellipse(cx, cy, terminatorW, r + 2, 0,
                Math.PI / 2, -Math.PI / 2, d > 90);
        } else {
            ctx.arc(cx, cy, r + 2, Math.PI / 2, -Math.PI / 2, false);
            ctx.ellipse(cx, cy, terminatorW, r + 2, 0,
                -Math.PI / 2, Math.PI / 2, d < 270);
        }
        ctx.closePath();
        ctx.fillStyle = C.shadow;
        ctx.fill();

        ctx.restore();
    }

    /* ==========================================================
       LUNAR SURFACE
       ========================================================== */
    const HSEG = 80;
    let hBumps = [];
    (function genBumps() {
        for (let i = 0; i <= HSEG; i++) {
            hBumps.push(
                Math.sin(i * 0.35) * 8 +
                Math.sin(i * 0.7 + 1) * 5 +
                Math.sin(i * 1.8 + 3) * 3
            );
        }
    })();

    let scribH = [], scribD = [];
    (function genScrib() {
        for (let i = 0; i < 22; i++) {
            const segs = [];
            const sx = Math.random() * 0.3;
            const ex = sx + 0.1 + Math.random() * 0.5;
            for (let j = 0; j <= 8; j++) {
                segs.push({ xr: sx + ((ex - sx) / 8) * j, yr: (Math.random() - 0.5) * 3 });
            }
            scribH.push({ yOff: 8 + i * 6 + Math.random() * 3, segs });
        }
        for (let i = 0; i < 50; i++) {
            const len = 6 + Math.random() * 14;
            const ang = -0.5 + Math.random() * 0.4;
            scribD.push({
                xr: Math.random(), yr: Math.random(),
                dx: Math.cos(ang) * len, dy: Math.sin(ang) * len
            });
        }
    })();

    let surfaceCanvas = null;
    function drawLunarSurface(w, h) {
        if (!surfaceCanvas || surfaceCanvas.width !== w || surfaceCanvas.height !== h) {
            surfaceCanvas = document.createElement('canvas');
            surfaceCanvas.width = w;
            surfaceCanvas.height = h;
            const sCtx = surfaceCanvas.getContext('2d');

            const hy = h * 0.78;

            sCtx.save();
            sCtx.beginPath();
            sCtx.moveTo(0, hy);
            for (let i = 0; i <= HSEG; i++) sCtx.lineTo((i / HSEG) * w, hy + hBumps[i]);
            sCtx.lineTo(w, h); sCtx.lineTo(0, h); sCtx.closePath();
            const gg = sCtx.createLinearGradient(0, hy, 0, h);
            gg.addColorStop(0, C.groundWarm); gg.addColorStop(0.4, C.groundDeep);
            gg.addColorStop(1, '#A0643A');
            sCtx.fillStyle = gg; sCtx.fill();
            sCtx.restore();

            sCtx.save();
            sCtx.beginPath(); sCtx.rect(0, hy - 4, w, h - hy + 4); sCtx.clip();
            sCtx.strokeStyle = 'rgba(160,90,40,0.30)'; sCtx.lineWidth = 1.2;
            for (const s of scribH) {
                sCtx.beginPath();
                for (let j = 0; j < s.segs.length; j++) {
                    const px = s.segs[j].xr * w, py = hy + s.yOff + s.segs[j].yr;
                    if (j === 0) sCtx.moveTo(px, py); else sCtx.lineTo(px, py);
                }
                sCtx.stroke();
            }
            sCtx.strokeStyle = 'rgba(195,120,60,0.18)'; sCtx.lineWidth = 1;
            const gH = h - hy;
            for (const d of scribD) {
                const x = d.xr * w, y = hy + 8 + d.yr * (gH - 12);
                sCtx.beginPath(); sCtx.moveTo(x, y); sCtx.lineTo(x + d.dx, y + d.dy); sCtx.stroke();
            }
            sCtx.restore();

            sCtx.save(); sCtx.beginPath(); sCtx.moveTo(0, hy);
            for (let i = 0; i <= HSEG; i++) sCtx.lineTo((i / HSEG) * w, hy + hBumps[i]);
            sCtx.strokeStyle = C.outline; sCtx.lineWidth = 2.5; sCtx.stroke();
            sCtx.restore();
        }
        ctx.drawImage(surfaceCanvas, 0, 0);
    }

    /* ==========================================================
       FAR-SIDE MESSAGE
       ========================================================== */
    function drawFarSideMsg(w, h, time) {
        ctx.save();
        ctx.font = '28px Patrick Hand'; ctx.fillStyle = C.starWhite;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.65 + 0.15 * Math.sin(time * 1.2);
        ctx.fillText('🌑  Earth is below the horizon here…', w / 2, h * 0.38);
        ctx.font = '18px Patrick Hand'; ctx.globalAlpha = 0.45;
        ctx.fillText("You're on the Moon's far side!", w / 2, h * 0.44);
        ctx.restore();
    }

    /* ==========================================================
       ON-CANVAS DATE COUNTER
       ========================================================== */
    function drawDateLabel(w, h, date, phase) {
        if (!date) return;
        const dateStr = date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        });
        const phaseStr = phaseName(phase);

        ctx.save();
        ctx.font = '20px Patrick Hand';
        ctx.fillStyle = 'rgba(255,253,231,0.75)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(dateStr, 20, h * 0.78 - 58);
        ctx.font = '15px Patrick Hand';
        ctx.fillStyle = 'rgba(255,253,231,0.50)';
        ctx.fillText(phaseStr, 20, h * 0.78 - 40);
        ctx.restore();
    }

    /* ==========================================================
       TIME-LAPSE ENGINE
       ========================================================== */
    let isPlaying = false;
    let currentDate = new Date();   // the "virtual" date for rendering
    let lapseStart = null;         // Date object
    let lapseEnd = null;
    let lapseTimer = null;
    let isScrubbing = false;

    // Set default date inputs (today ± 14 days)
    const today = new Date();
    const d14ago = new Date(today); d14ago.setDate(d14ago.getDate() - 14);
    const d14fwd = new Date(today); d14fwd.setDate(d14fwd.getDate() + 14);
    startIn.value = isoDate(d14ago);
    endIn.value = isoDate(d14fwd);

    function isoDate(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function startLapse() {
        lapseStart = new Date(startIn.value + 'T00:00:00');
        lapseEnd = new Date(endIn.value + 'T23:59:59');
        if (isNaN(lapseStart) || isNaN(lapseEnd) || lapseEnd <= lapseStart) return;

        // Only reset currentDate if we are not already within the lapse window
        if (!currentDate || currentDate < lapseStart || currentDate > lapseEnd) {
            currentDate = new Date(lapseStart);
        }

        isPlaying = true;
        playBtn.textContent = '⏸ Pause';
        playBtn.classList.add('playing');

        const speed = parseInt(speedSel.value, 10);  // days per second
        const tickMs = 50;                            // ~20 fps for the counter
        const daysPerTick = speed * (tickMs / 1000);

        clearInterval(lapseTimer);
        lapseTimer = setInterval(() => {
            currentDate = new Date(currentDate.getTime() + daysPerTick * 86400000);
            if (currentDate >= lapseEnd) {
                currentDate = new Date(lapseEnd);
                stopLapse();
            }
            updateSliderFromDate();
        }, tickMs);
    }

    function stopLapse() {
        isPlaying = false;
        clearInterval(lapseTimer);
        playBtn.textContent = '▶ Play Time-Lapse';
        playBtn.classList.remove('playing');
    }

    playBtn.addEventListener('click', () => {
        if (isPlaying) stopLapse(); else startLapse();
    });

    // Timeline Slider Logic
    function updateSliderFromDate() {
        if (isScrubbing || !lapseStart || !lapseEnd) return;
        const totalMs = lapseEnd.getTime() - lapseStart.getTime();
        const curMs = currentDate.getTime() - lapseStart.getTime();
        timelineSlider.value = (curMs / totalMs) * 1000;
    }

    function updateDateFromSlider() {
        lapseStart = new Date(startIn.value + 'T00:00:00');
        lapseEnd = new Date(endIn.value + 'T23:59:59');
        if (isNaN(lapseStart) || isNaN(lapseEnd)) return;

        const totalMs = lapseEnd.getTime() - lapseStart.getTime();
        const sliderFrac = timelineSlider.value / 1000;
        currentDate = new Date(lapseStart.getTime() + totalMs * sliderFrac);
    }

    timelineSlider.addEventListener('mousedown', () => { isScrubbing = true; stopLapse(); });
    timelineSlider.addEventListener('touchstart', () => { isScrubbing = true; stopLapse(); });
    timelineSlider.addEventListener('input', updateDateFromSlider);
    timelineSlider.addEventListener('mouseup', () => { isScrubbing = false; });
    timelineSlider.addEventListener('touchend', () => { isScrubbing = false; });

    // When dates change, reset slider
    startIn.addEventListener('change', () => { timelineSlider.value = 0; updateDateFromSlider(); });
    endIn.addEventListener('change', () => { timelineSlider.value = 0; updateDateFromSlider(); });

    locSel.addEventListener('change', () => {
        const loc = LOCATIONS[locSel.value];
        if (loc) {
            target.xRatio = loc.xRatio;
            target.yRatio = loc.yRatio;
            target.scale = loc.scale;
        }
    });

    /* ==========================================================
       MAIN LOOP
       ========================================================== */
    function draw(ts) {
        const time = ts / 1000;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width, h = rect.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = C.skyBlack;
        ctx.fillRect(0, 0, w, h);

        drawStars(w, h, time);

        // Lerp position
        current.xRatio = lerp(current.xRatio, target.xRatio, LERP);
        current.yRatio = lerp(current.yRatio, target.yRatio, LERP);
        current.scale = lerp(current.scale, target.scale, LERP);

        // Determine current date for astronomy
        let renderDate = currentDate;

        // If the date hasn't been set by playing or scrubbing yet, default to start date
        if (!isPlaying && !isScrubbing && (!renderDate || isNaN(renderDate.getTime()))) {
            const startVal = startIn.value;
            renderDate = startVal ? new Date(startVal + 'T12:00:00') : new Date();
            currentDate = renderDate;
        }

        // Compute astronomy
        const phaseDeg = phaseForDate(renderDate);
        const rotDeg = rotationForDate(renderDate);
        const tiltDeg = terminatorTiltForDate(renderDate);
        const axisTiltDeg = earthTiltForDate(renderDate);
        const distScale = earthScaleForDate(renderDate);
        const libration = librationForDate(renderDate);

        // Earth position (apply libration offset + distance-based size)
        const earthR = Math.min(w, h) * 0.14 * current.scale * distScale;
        const earthX = w * current.xRatio + (libration.xOff * earthR);
        const earthY = h * current.yRatio + (libration.yOff * earthR);

        if (target.yRatio >= 0 && current.scale > 0.05) {
            // Subtle glow
            ctx.save();
            const glow = ctx.createRadialGradient(earthX, earthY, earthR * 0.9,
                earthX, earthY, earthR * 1.8);
            glow.addColorStop(0, 'rgba(93,173,226,0.10)');
            glow.addColorStop(1, 'rgba(93,173,226,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(earthX, earthY, earthR * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            drawEarth(earthX, earthY, earthR, phaseDeg, rotDeg, tiltDeg, axisTiltDeg);
        } else {
            drawFarSideMsg(w, h, time);
        }

        drawLunarSurface(w, h);

        // Update Stats UI
        const isoStr = renderDate.toISOString().split('T')[0];
        statDate.textContent = isoStr;
        statPhase.textContent = phaseName(phaseDeg) + ` (${Math.round(phaseDeg)}°)`;

        const ill = (1 - Math.cos((phaseDeg / 180) * Math.PI)) / 2;
        statIllum.textContent = `${(ill * 100).toFixed(1)}%`;

        statLibration.textContent = `X: ${libration.degLon > 0 ? '+' : ''}${libration.degLon.toFixed(1)}° Y: ${libration.degLat > 0 ? '+' : ''}${libration.degLat.toFixed(1)}°`;

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();
