/* ============================================================
   Earthview from the Moon — Canvas Renderer  (v0.2.1)
   ============================================================
   Changes from v0.2.0:
   - Image source: earth-clean.jpg
   - Shadow strictly clipped inside globe circle
   - Earth rotation direction: counterclockwise (correct for Moon)
   - Procellarum position: east=left in sky convention
   - Date label moved above horizon
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

    /* ==========================================================
       EARTH IMAGE
       ========================================================== */
    const earthImg = new Image();
    earthImg.src = 'earth-clean.jpg';
    let earthImgLoaded = false;
    earthImg.onload = () => { earthImgLoaded = true; };

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

    function drawStars(w, h, time) {
        for (const s of stars) {
            const tw = 0.5 + 0.5 * Math.sin(time * s.speed + s.off);
            const a = s.alpha * (0.6 + 0.4 * tw);
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h * 0.78, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,253,231,${a.toFixed(2)})`;
            ctx.fill();
        }
    }

    /* ==========================================================
       LOCATION PRESETS  (astronomically derived)
       ==========================================================
       Selenographic coords → angular distance from sub-Earth
       point → elevation / azimuth → canvas X/Y.

       Sub-Earth point ≈ 0°N, 0°E.
       Elevation = 90° − angular_distance.
       Azimuth maps to horizontal position.
       Sky convention: East = LEFT, West = RIGHT.

       Location               Coords        Dist  Elev  Az     X%   Y%   Scale
       Sea of Tranquility     8°N, 31°E     ~32°  58°   West   62   25   1.0
       Oceanus Procellarum    18°N, 57°W    ~60°  30°   East   25   55   0.92
       Lunar South Pole       90°S, 0°      ~84°   6°   North  50   68   0.82
       Far Side (Moscoviense) 27°N, 148°E   ~150° <0°   —      —    —    0
       ========================================================== */
    const LOCATIONS = {
        tranquility: { xRatio: 0.62, yRatio: 0.25, scale: 1.0 },
        procellarum: { xRatio: 0.25, yRatio: 0.55, scale: 0.92 },
        southpole: { xRatio: 0.50, yRatio: 0.68, scale: 0.82 },
        farside: { xRatio: 0.50, yRatio: -1, scale: 0 },
    };

    let current = { xRatio: 0.62, yRatio: 0.25, scale: 1.0 };
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

    /** Phase angle (0–360°) for a given JS Date.
     *  0° = New Earth (fully shadowed), 180° = Full Earth. */
    function phaseForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        return ((days / SYNODIC_DAYS) * 360 % 360 + 360) % 360;
    }

    /** Earth rotation angle (degrees) for a given JS Date.
     *  This drives the image rotation so continents spin. */
    function rotationForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        return ((days / SIDEREAL_DAY) * 360) % 360;
    }

    /**
     * Terminator tilt angle (degrees) as seen from the Moon.
     *
     * The terminator on Earth is perpendicular to the Sun–Earth line.
     * From the Moon, the apparent tilt of this line against the
     * "local vertical" depends on:
     *   1. The ecliptic longitude of the Sun (seasonal component).
     *   2. The Moon's orbital inclination to the ecliptic (~5.14°).
     *
     * The dominant effect is the solar ecliptic latitude projected
     * onto the Moon's sky. The Sun's ecliptic longitude advances
     * ~0.9856°/day from the vernal equinox (≈ March 20).
     *
     * Simplified model:
     *   tilt ≈ OBLIQUITY × sin(sunEclipticLon) × cos(moonPhaseAngle)
     *
     * This produces a tilt that:
     *   - Varies seasonally (max at solstices, zero at equinoxes)
     *   - Varies within each lunation (max at quarters, zero at
     *     new/full — mirrors what we see of the Moon from Earth)
     */
    function terminatorTiltForDate(date) {
        const dayOfYear = (date - new Date(date.getFullYear(), 0, 0)) / 86400000;
        // Sun's ecliptic longitude (approx), 0 at vernal equinox (~day 79)
        const sunLon = ((dayOfYear - 79) / 365.25) * 360;
        const sunLonRad = (sunLon * Math.PI) / 180;

        // Seasonal component
        const seasonal = OBLIQUITY * Math.sin(sunLonRad);

        // Phase-dependent component (tilt strongest at quarters)
        const phase = phaseForDate(date);
        const phaseRad = (phase * Math.PI) / 180;
        const phaseMod = Math.sin(phaseRad);   // ±1 at quarters, 0 at new/full

        // Combined tilt (capped for visual clarity)
        const tilt = seasonal * phaseMod * 0.6;
        return tilt;   // degrees
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

    function drawEarth(cx, cy, r, phaseDeg, rotDeg, tiltDeg) {
        if (!earthImgLoaded) return;

        /* --- Single circular clip for image + shadow + highlight --- */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        /* -- Image (counterclockwise rotation = east-to-west drift) -- */
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((-rotDeg * Math.PI) / 180);   // negative = CCW = correct
        const imgSize = r * 2.2;
        ctx.drawImage(earthImg, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
        ctx.restore();

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

    function drawLunarSurface(w, h) {
        const hy = h * 0.78;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, hy);
        for (let i = 0; i <= HSEG; i++) ctx.lineTo((i / HSEG) * w, hy + hBumps[i]);
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        const gg = ctx.createLinearGradient(0, hy, 0, h);
        gg.addColorStop(0, C.groundWarm); gg.addColorStop(0.4, C.groundDeep);
        gg.addColorStop(1, '#A0643A');
        ctx.fillStyle = gg; ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath(); ctx.rect(0, hy - 4, w, h - hy + 4); ctx.clip();
        ctx.strokeStyle = 'rgba(160,90,40,0.30)'; ctx.lineWidth = 1.2;
        for (const s of scribH) {
            ctx.beginPath();
            for (let j = 0; j < s.segs.length; j++) {
                const px = s.segs[j].xr * w, py = hy + s.yOff + s.segs[j].yr;
                if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(195,120,60,0.18)'; ctx.lineWidth = 1;
        const gH = h - hy;
        for (const d of scribD) {
            const x = d.xr * w, y = hy + 8 + d.yr * (gH - 12);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d.dx, y + d.dy); ctx.stroke();
        }
        ctx.restore();

        ctx.save(); ctx.beginPath(); ctx.moveTo(0, hy);
        for (let i = 0; i <= HSEG; i++) ctx.lineTo((i / HSEG) * w, hy + hBumps[i]);
        ctx.strokeStyle = C.outline; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
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

        currentDate = new Date(lapseStart);
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
        const renderDate = isPlaying ? currentDate : new Date();

        // Compute astronomy
        const phaseDeg = phaseForDate(renderDate);
        const rotDeg = rotationForDate(renderDate);
        const tiltDeg = terminatorTiltForDate(renderDate);

        // Earth position
        const earthR = Math.min(w, h) * 0.14 * current.scale;
        const earthX = w * current.xRatio;
        const earthY = h * current.yRatio;

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

            drawEarth(earthX, earthY, earthR, phaseDeg, rotDeg, tiltDeg);
        } else {
            drawFarSideMsg(w, h, time);
        }

        drawLunarSurface(w, h);

        // On-canvas date + phase label
        if (target.yRatio >= 0) {
            drawDateLabel(w, h, renderDate, phaseDeg);
        }

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();
