/* ============================================================
   Earthview from the Moon — Canvas Renderer  (v0.5.7)
   ============================================================
   Changes from v0.4.0:
   - Mission Control side-panel dashboard
   - Custom observer lat/lon with presets
   - Orbital bird's-eye mini-map (Sun–Earth–Moon)
   - Synodic cycle timeline bar
   - Extended data readouts (distance, elevation, azimuth)
   ============================================================ */

(function () {
    'use strict';

    /* --- DOM refs --- */
    const canvas = document.getElementById('scene');
    const ctx = canvas.getContext('2d');
    const locSel = document.getElementById('location-select');
    const obsLatIn = document.getElementById('obs-lat');
    const obsLonIn = document.getElementById('obs-lon');
    const startIn = document.getElementById('start-date');
    const endIn = document.getElementById('end-date');
    const playBtn = document.getElementById('play-btn');
    const speedSel = document.getElementById('speed-select');
    const timelineSlider = document.getElementById('timeline-slider');
    const statDate = document.getElementById('stat-date');
    const statPhase = document.getElementById('stat-phase');
    const statIllum = document.getElementById('stat-illum');
    const statDist = document.getElementById('stat-dist');
    const statLibration = document.getElementById('stat-libration');
    const statElev = document.getElementById('stat-elev');
    const statAzimuth = document.getElementById('stat-azimuth');
    const orbitalCvs = document.getElementById('orbital-canvas');
    const orbitalCtx = orbitalCvs.getContext('2d');
    const synodicCvs = document.getElementById('synodic-canvas');
    const synodicCtx = synodicCvs.getContext('2d');

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

    const REF_NEW_MOON = new Date('2025-01-29T12:36:00Z').getTime();
    const SYNODIC_DAYS = 29.53059;
    const SIDEREAL_DAY = 0.99726968;
    const OBLIQUITY = 23.44;
    const MOON_ECC = 0.0549;
    const MOON_INC = 5.145;
    const ANOMALISTIC_MONTH = 27.55455;
    const DRACONIC_MONTH = 27.21222;
    const SIDEREAL_MONTH = 27.32166;
    const MEAN_DISTANCE = 384400;
    const J2000 = new Date('2000-01-01T12:00:00Z').getTime();
    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;

    /* ==========================================================
       EARTH IMAGE — equirectangular map for full-globe scroll
       ========================================================== */
    const earthImg = new Image();
    const earthNightImg = new Image();

    let earthImgLoaded = false;
    let earthCanvas = null;
    let earthNightCanvas = null;
    let surfaceCanvas = null;

    let sphereCanvas = null;
    let sphereCtx = null;
    let sphereNightCanvas = null;
    let sphereNightCtx = null;
    let sphereMap = null; // { u, v } lookup array
    const SPHERE_SIZE = 512;
    const SPHERE_R = SPHERE_SIZE / 2;
    let loadedCount = 0;
    const checkLoad = () => {
        loadedCount++;
        if (loadedCount === 2) initSphereAndCanvases();
    };
    earthImg.onload = checkLoad;
    earthNightImg.onload = checkLoad;

    earthImg.src = 'earth-blue-marble.jpg';
    earthNightImg.src = 'earth-lights.png';

    function initSphereAndCanvases() {
        const w = earthImg.naturalWidth;
        const h = earthImg.naturalHeight;

        earthCanvas = document.createElement('canvas');
        earthCanvas.width = w;
        earthCanvas.height = h;
        const oc1 = earthCanvas.getContext('2d', { willReadFrequently: true });
        oc1.drawImage(earthImg, 0, 0);

        earthNightCanvas = document.createElement('canvas');
        earthNightCanvas.width = earthNightImg.naturalWidth;
        earthNightCanvas.height = earthNightImg.naturalHeight;
        const oc2 = earthNightCanvas.getContext('2d', { willReadFrequently: true });
        oc2.drawImage(earthNightImg, 0, 0);

        // Pre-compute orthographic UV map
        sphereCanvas = document.createElement('canvas');
        sphereCanvas.width = SPHERE_SIZE;
        sphereCanvas.height = SPHERE_SIZE;
        sphereCtx = sphereCanvas.getContext('2d');

        sphereNightCanvas = document.createElement('canvas');
        sphereNightCanvas.width = SPHERE_SIZE;
        sphereNightCanvas.height = SPHERE_SIZE;
        sphereNightCtx = sphereNightCanvas.getContext('2d');

        sphereMap = new Float32Array(SPHERE_SIZE * SPHERE_SIZE * 2);
        let ptr = 0;
        for (let y = 0; y < SPHERE_SIZE; y++) {
            const ny = (y - SPHERE_R) / SPHERE_R;
            for (let x = 0; x < SPHERE_SIZE; x++) {
                const nx = (x - SPHERE_R) / SPHERE_R;
                const d2 = nx * nx + ny * ny;
                if (d2 <= 1.0) {
                    const z = Math.sqrt(1.0 - d2);
                    const lat = Math.asin(-ny); // -pi/2 to pi/2
                    const lon = Math.atan2(nx, z); // -pi/2 to pi/2

                    // Map to equirectangular UV (0.0 to 1.0)
                    const u = (lon / (Math.PI * 2)); // Centered offset
                    const v = 0.5 - (lat / Math.PI);

                    sphereMap[ptr++] = u;
                    sphereMap[ptr++] = v;
                } else {
                    sphereMap[ptr++] = -1;
                    sphereMap[ptr++] = -1;
                }
            }
        }

        earthImgLoaded = true;
    }

    let lastRenderedRot = -999;
    function updateSphereCanvas(rotDeg) {
        if (!earthImgLoaded) return;
        // Optimization: only redraw pixel map if rotation changes significantly (0.1 deg = ~1px)
        if (Math.abs(rotDeg - lastRenderedRot) < 0.1) return;
        lastRenderedRot = rotDeg;

        const srcCtx = earthCanvas.getContext('2d');
        const srcData = srcCtx.getImageData(0, 0, earthCanvas.width, earthCanvas.height);
        const sData = srcData.data;

        const srcNightCtx = earthNightCanvas.getContext('2d');
        const srcNightData = srcNightCtx.getImageData(0, 0, earthNightCanvas.width, earthNightCanvas.height);
        const snData = srcNightData.data;

        const srcW = earthCanvas.width;
        const srcH = earthCanvas.height;
        const snW = earthNightCanvas.width;
        const snH = earthNightCanvas.height;

        const destData = sphereCtx.createImageData(SPHERE_SIZE, SPHERE_SIZE);
        const dData = destData.data;

        const destNightData = sphereNightCtx.createImageData(SPHERE_SIZE, SPHERE_SIZE);
        const dnData = destNightData.data;

        // Base rotation offset U (0.0 to 1.0)
        const rotU = ((rotDeg % 360) + 360) % 360 / 360.0;

        let sPtr = 0; // sphere map pointer
        let dPtr = 0; // dest pixel pointer
        for (let i = 0; i < SPHERE_SIZE * SPHERE_SIZE; i++) {
            let uOff = sphereMap[sPtr++];
            let v = sphereMap[sPtr++];

            if (v >= 0) {
                // Apply rotation
                let u = uOff + rotU;
                if (u > 1.0) u -= 1.0;
                else if (u < 0.0) u += 1.0;

                const px = Math.floor(u * (srcW - 1));
                const py = Math.floor(v * (srcH - 1));
                const pIdx = (py * srcW + px) * 4;

                dData[dPtr] = sData[pIdx];
                dData[dPtr + 1] = sData[pIdx + 1];
                dData[dPtr + 2] = sData[pIdx + 2];
                dData[dPtr + 3] = 255; // solid alpha

                const pnx = Math.floor(u * (snW - 1));
                const pny = Math.floor(v * (snH - 1));
                const pnIdx = (pny * snW + pnx) * 4;

                dnData[dPtr] = snData[pnIdx];
                dnData[dPtr + 1] = snData[pnIdx + 1];
                dnData[dPtr + 2] = snData[pnIdx + 2];
                dnData[dPtr + 3] = 255;

                dPtr += 4;
            } else {
                // Outside sphere
                dData[dPtr] = 0; dData[dPtr + 1] = 0; dData[dPtr + 2] = 0; dData[dPtr + 3] = 0;
                dnData[dPtr] = 0; dnData[dPtr + 1] = 0; dnData[dPtr + 2] = 0; dnData[dPtr + 3] = 0;
                dPtr += 4;
            }
        }
        sphereCtx.putImageData(destData, 0, 0);
        sphereNightCtx.putImageData(destNightData, 0, 0);
    }

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
       OBSERVER SYSTEM  (selenographic lat/lon → sky position)
       ==========================================================
       The sub-Earth point on the Moon is approximately (0°N, 0°E)
       plus libration offsets.

       Angular distance from observer to sub-Earth point determines
       Earth's elevation in the sky:
         elevation = 90° − angular_distance

       Azimuth is the compass bearing from observer to sub-Earth.

       Canvas mapping:
         X: azimuth → LEFT = WEST, RIGHT = EAST
         Y: elevation → TOP = high, BOTTOM = near horizon (78%)

       If angular distance > 90°, Earth is below the horizon.
       ========================================================== */

    const LOCATION_PRESETS = {
        guanghan: { lat: 33, lon: -43, label: '广寒开发区 (Guanghan)' },
        tranquility: { lat: 8, lon: 31, label: 'Sea of Tranquility' },
        procellarum: { lat: 18, lon: -57, label: 'Oceanus Procellarum' },
        southpole: { lat: -90, lon: 0, label: 'Lunar South Pole' },
        farside: { lat: 27, lon: 148, label: 'Far Side — Moscoviense' },
    };

    let obsLat = 8;   // degrees N
    let obsLon = 31;   // degrees E

    /**
     * Compute Earth's sky position from observer selenographic coords.
     * Returns { xRatio, yRatio, scale, elevation, azimuthDeg, visible }.
     */
    function earthSkyPosition(lat, lon, libration) {
        // Sub-Earth point shifted by libration
        const subLat = (libration ? libration.degLat : 0);
        const subLon = (libration ? libration.degLon : 0);

        // Observer coordinates in radians
        const latR = lat * DEG;
        const lonR = lon * DEG;
        const sLatR = subLat * DEG;
        const sLonR = subLon * DEG;

        // Angular distance using spherical law of cosines
        const cosD = Math.sin(latR) * Math.sin(sLatR)
            + Math.cos(latR) * Math.cos(sLatR) * Math.cos(lonR - sLonR);
        const angDist = Math.acos(Math.max(-1, Math.min(1, cosD))) * RAD;

        // Elevation
        const elevation = 90 - angDist;
        const visible = elevation > 0;

        // Azimuth (bearing from observer to sub-Earth point)
        const dLon = sLonR - lonR;
        const azRad = Math.atan2(
            Math.sin(dLon) * Math.cos(sLatR),
            Math.cos(latR) * Math.sin(sLatR) - Math.sin(latR) * Math.cos(sLatR) * Math.cos(dLon)
        );
        const azimuthDeg = ((azRad * RAD) + 360) % 360;

        if (!visible) {
            return { xRatio: 0.5, yRatio: -1, scale: 0, elevation, azimuthDeg, visible };
        }

        // Map elevation to Y: 90° → 0.12 (high), 0° → 0.76 (horizon)
        const yRatio = 0.76 - (elevation / 90) * 0.64;

        // Map azimuth to X: 0° (north) → 0.5, 90° (east) → 0.8, 270° (west) → 0.2
        // East is RIGHT, West is LEFT
        const azNorm = ((azimuthDeg + 180) % 360) - 180; // -180 to 180
        const xRatio = 0.5 + (azNorm / 180) * 0.38;

        // Scale diminishes near horizon
        const scale = Math.max(0.5, Math.min(1.0, elevation / 45));

        return { xRatio, yRatio, scale, elevation, azimuthDeg, visible };
    }

    let current = { xRatio: 0.30, yRatio: 0.25, scale: 1.0 };
    let target = { ...current };
    const LERP = 0.06;
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

    function julianCenturies(date) {
        return (date.getTime() - J2000) / (86400000 * 36525);
    }

    function sunPosition(T) {
        const M = (357.5291 + 35999.0503 * T) % 360;
        const Mrad = M * DEG;
        const C = 1.9146 * Math.sin(Mrad)
            + 0.0200 * Math.sin(2 * Mrad)
            + 0.0003 * Math.sin(3 * Mrad);
        const L0 = (280.4665 + 36000.7698 * T) % 360;
        const sunLon = ((L0 + C) % 360 + 360) % 360;
        return { M, sunLon };
    }

    function moonElements(T) {
        const Lm = (218.3165 + 481267.8813 * T) % 360;
        const Mm = (134.9634 + 477198.8676 * T) % 360;
        const D = (297.8502 + 445267.1115 * T) % 360;
        const F = (93.2720 + 483202.0175 * T) % 360;
        const Om = (125.0446 - 1934.1363 * T) % 360;
        return { Lm, Mm, D, F, Om };
    }

    /** Phase angle 0–360°. 0° = New Earth, 180° = Full Earth.
     *  REF is New Moon (Earth) = Full Earth (Moon), hence +180. */
    function phaseForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        return (((days / SYNODIC_DAYS) * 360 + 180) % 360 + 360) % 360;
    }

    function rotationForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        return ((days / SIDEREAL_DAY) * 360) % 360;
    }

    function terminatorTiltForDate(date) {
        const T = julianCenturies(date);
        const { sunLon } = sunPosition(T);
        const { Lm, Mm, D, F } = moonElements(T);

        const moonLon = Lm
            + 6.289 * Math.sin(Mm * DEG)
            + 1.274 * Math.sin((2 * D - Mm) * DEG)
            + 0.658 * Math.sin(2 * D * DEG)
            - 0.214 * Math.sin(2 * Mm * DEG)
            - 0.186 * Math.sin(Mm * DEG)
            + 0.114 * Math.sin(2 * F * DEG);

        const elong = (sunLon - moonLon) * DEG;
        const sunDec = Math.asin(Math.sin(OBLIQUITY * DEG) * Math.sin(sunLon * DEG));
        const tilt = sunDec * RAD * Math.sin(elong) * 0.7;
        return tilt;
    }

    function earthTiltForDate(date) {
        const T = julianCenturies(date);
        const { sunLon } = sunPosition(T);
        const tiltAngle = -OBLIQUITY * Math.sin(sunLon * DEG) * 0.6;
        return tiltAngle;
    }

    function earthScaleForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        const M = (days / ANOMALISTIC_MONTH) * 2 * Math.PI;
        const distance = MEAN_DISTANCE * (1 - MOON_ECC * Math.cos(M)
            - MOON_ECC * MOON_ECC * 0.5 * Math.cos(2 * M));
        return { scale: MEAN_DISTANCE / distance, distance };
    }

    /* ==========================================================
       LIBRATION
       ========================================================== */
    function librationForDate(date) {
        const ms = date.getTime() - REF_NEW_MOON;
        const days = ms / 86400000;
        const T = julianCenturies(date);
        const { Mm, F } = moonElements(T);

        const MmRad = Mm * DEG;
        const degLon = -(6.289 * Math.sin(MmRad)
            + 1.274 * Math.sin(2 * MmRad)
            + 0.186 * Math.sin(3 * MmRad));

        const FRad = F * DEG;
        const degLat = -(MOON_INC + 1.54) * Math.sin(FRad)
            - 0.28 * Math.sin(2 * FRad);

        const lonOffset = degLon / 60;
        const latOffset = degLat / 80;

        return { xOff: lonOffset, yOff: latOffset, degLon, degLat };
    }

    /**
     * Moon's ecliptic longitude for orbital view position.
     */
    function moonEclipticLon(date) {
        const T = julianCenturies(date);
        const { Lm, Mm, D, F } = moonElements(T);
        return (Lm
            + 6.289 * Math.sin(Mm * DEG)
            + 1.274 * Math.sin((2 * D - Mm) * DEG)
            + 0.658 * Math.sin(2 * D * DEG)
            - 0.214 * Math.sin(2 * Mm * DEG)
            + 0.114 * Math.sin(2 * F * DEG)) % 360;
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
        surfaceCanvas = null; // force redraw
    }
    window.addEventListener('resize', resize);
    resize();

    /* ==========================================================
       DRAW EARTH  (image-based)
       ========================================================== */

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

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(axisTiltDeg * DEG);
        ctx.translate(-cx, -cy);

        // Update the 3D projection matrix map
        updateSphereCanvas(rotDeg);

        // Draw the mapped sphere image
        ctx.drawImage(sphereCanvas, cx - r, cy - r, r * 2, r * 2);

        ctx.restore();

        // Atmospheric rim with a subtle center glow to prevent dark illusion
        const hg = ctx.createRadialGradient(
            cx, cy, 0,
            cx, cy, r
        );
        hg.addColorStop(0, 'rgba(255, 255, 255, 0.08)');  // Very soft center glow
        hg.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
        hg.addColorStop(0.85, 'rgba(80, 180, 255, 0.1)');
        hg.addColorStop(1, 'rgba(100, 200, 255, 0.35)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        drawPhaseShadowInClip(cx, cy, r, phaseDeg, tiltDeg, axisTiltDeg);

        ctx.restore();

        // Earth base outline (subtle)
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawPhaseShadowInClip(cx, cy, r, phaseDeg, tiltDeg, axisTiltDeg) {
        const d = ((phaseDeg % 360) + 360) % 360;
        const phaseAngle = Math.PI - (d / 180) * Math.PI;
        const terminatorW = Math.abs(Math.cos(phaseAngle)) * r;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((tiltDeg * Math.PI) / 180);
        ctx.translate(-cx, -cy);

        ctx.beginPath();
        if (d <= 180) {
            // Waxing: shadow on LEFT side
            ctx.arc(cx, cy, r + 2, Math.PI / 2, -Math.PI / 2, false);
            ctx.ellipse(cx, cy, terminatorW, r + 2, 0,
                -Math.PI / 2, Math.PI / 2, d > 90);
        } else {
            // Waning: shadow on RIGHT side
            ctx.arc(cx, cy, r + 2, -Math.PI / 2, Math.PI / 2, false);
            ctx.ellipse(cx, cy, terminatorW, r + 2, 0,
                Math.PI / 2, -Math.PI / 2, d < 270);
        }
        ctx.closePath();

        ctx.clip(); // Mask everything inside the night-time shadow path

        // 1. Draw the darkening black shadow
        ctx.fillStyle = C.shadow;
        ctx.fill();

        // 2. Draw the glowing city lights (screen blend to keep it bright)
        if (sphereNightCanvas) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            // un-rotate the tilt so the texture aligns with the Earth equator
            ctx.translate(cx, cy);
            ctx.rotate((-tiltDeg * Math.PI) / 180);
            ctx.rotate(axisTiltDeg * DEG); // add back Earth axis tilt
            ctx.translate(-cx, -cy);
            ctx.drawImage(sphereNightCanvas, cx - r, cy - r, r * 2, r * 2);
            ctx.restore();
        }

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
            gg.addColorStop(0, '#2C2F33');
            gg.addColorStop(0.4, '#181A1C');
            gg.addColorStop(1, '#0A0B0C');
            sCtx.fillStyle = gg; sCtx.fill();
            sCtx.restore();

            // Subtle crater/noise texture instead of scribbles
            sCtx.save();
            sCtx.beginPath(); sCtx.rect(0, hy - 4, w, h - hy + 4); sCtx.clip();
            sCtx.strokeStyle = 'rgba(10, 12, 14, 0.4)'; sCtx.lineWidth = 1.5;
            for (const s of scribH) {
                // Draw small crater arcs
                const px = s.segs[0].xr * w;
                const py = hy + s.yOff + 2;
                const cr = 4 + Math.random() * 12;
                sCtx.beginPath();
                sCtx.ellipse(px, py, cr, cr * 0.3, 0, 0, Math.PI);
                sCtx.stroke();
            }
            sCtx.strokeStyle = 'rgba(255, 255, 255, 0.03)'; sCtx.lineWidth = 1;
            const gH = h - hy;
            for (const d of scribD) {
                // Draw light highlights on crater rims
                const x = d.xr * w, y = hy + 4 + d.yr * (gH - 8);
                sCtx.beginPath(); sCtx.moveTo(x, y); sCtx.lineTo(x + d.dx * 0.5, y + d.dy * 0.2); sCtx.stroke();
            }
            sCtx.restore();

            sCtx.save(); sCtx.beginPath(); sCtx.moveTo(0, hy);
            for (let i = 0; i <= HSEG; i++) sCtx.lineTo((i / HSEG) * w, hy + hBumps[i]);
            sCtx.strokeStyle = '#111'; sCtx.lineWidth = 2.5; sCtx.stroke();
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
        ctx.fillText('🌑  Earth is below the horizon…', w / 2, h * 0.38);
        ctx.font = '18px Patrick Hand'; ctx.globalAlpha = 0.45;
        ctx.fillText(`Observer: ${obsLat}°N, ${obsLon}°E`, w / 2, h * 0.44);
        ctx.restore();
    }

    /* ==========================================================
       ORBITAL BIRD'S-EYE VIEW (mini-map)
       ==========================================================
       Top-down view of the Sun–Earth–Moon system.
       Earth at centre, Moon orbiting, Sun direction indicated.
       Both Earth and Moon show day/night shading.
       ========================================================== */
    function drawOrbitalView(date, phaseDeg) {
        const w = orbitalCvs.width;
        const h = orbitalCvs.height;
        const cx = w / 2, cy = h / 2;
        const orbitR = 70;  // Moon orbit radius on canvas

        orbitalCtx.clearRect(0, 0, w, h);

        // Background
        orbitalCtx.fillStyle = 'rgba(6,8,12,0.95)';
        orbitalCtx.beginPath();
        orbitalCtx.arc(cx, cy, 98, 0, Math.PI * 2);
        orbitalCtx.fill();

        // Get Sun direction (ecliptic longitude)
        const T = julianCenturies(date);
        const { sunLon } = sunPosition(T);
        const moonLon = moonEclipticLon(date);

        // Sun direction angle (Sun is far away, direction from Earth)
        // sunLon gives the ecliptic longitude of the Sun.
        // In our top-down view: 0° = right, 90° = up (north ecliptic pole up)
        // But we want 0° at the top for intuitive display.
        const sunAngle = -(sunLon + 90) * DEG;  // rotate so vernal equinox is right

        // Moon position on orbit
        const moonAngle = -(moonLon + 90) * DEG;
        const moonX = cx + Math.cos(moonAngle) * orbitR;
        const moonY = cy + Math.sin(moonAngle) * orbitR;

        // Draw orbit circle
        orbitalCtx.beginPath();
        orbitalCtx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        orbitalCtx.strokeStyle = 'rgba(255,255,255,0.12)';
        orbitalCtx.setLineDash([4, 4]);
        orbitalCtx.lineWidth = 1;
        orbitalCtx.stroke();
        orbitalCtx.setLineDash([]);

        // Sunlight belt (parallel rays)
        const sunDx = Math.cos(sunAngle);
        const sunDy = Math.sin(sunAngle);
        orbitalCtx.save();
        orbitalCtx.strokeStyle = 'rgba(255,220,80,0.45)';
        orbitalCtx.lineWidth = 2.0;

        // Draw 7 parallel lines, stopping outside moon's orbit (r=70)
        for (let i = -3; i <= 3; i++) {
            const offset = i * 11;
            const perpX = -sunDy * offset;
            const perpY = sunDx * offset;
            const x1 = cx + sunDx * 98 + perpX;
            const y1 = cy + sunDy * 98 + perpY;
            const x2 = cx + sunDx * 76 + perpX;
            const y2 = cy + sunDy * 76 + perpY;
            orbitalCtx.beginPath();
            orbitalCtx.moveTo(x1, y1); orbitalCtx.lineTo(x2, y2);
            orbitalCtx.stroke();

            // Draw arrowhead on all lines
            orbitalCtx.beginPath();
            orbitalCtx.moveTo(x2, y2);
            orbitalCtx.lineTo(x2 + sunDx * 5 - sunDy * 3.5, y2 + sunDy * 5 + sunDx * 3.5);
            orbitalCtx.lineTo(x2 + sunDx * 5 + sunDy * 3.5, y2 + sunDy * 5 - sunDx * 3.5);
            orbitalCtx.fillStyle = 'rgba(255,220,80,0.7)';
            orbitalCtx.fill();
        }
        orbitalCtx.restore();

        // "Sun" label at the base of the center ray
        const sunLabelX = cx + sunDx * 87;
        const sunLabelY = cy + sunDy * 87;
        orbitalCtx.font = '10px Patrick Hand';
        orbitalCtx.fillStyle = 'rgba(255,220,80,0.9)';
        orbitalCtx.textAlign = 'center';
        orbitalCtx.fillText('Sun', sunLabelX, sunLabelY - 12);

        // Earth (center) with day/night shading
        const earthR = 18;
        orbitalCtx.save();
        orbitalCtx.beginPath();
        orbitalCtx.arc(cx, cy, earthR, 0, Math.PI * 2);
        orbitalCtx.clip();
        // Lit side (ocean base)
        orbitalCtx.fillStyle = '#3A7BD5';
        orbitalCtx.fillRect(cx - earthR, cy - earthR, earthR * 2, earthR * 2);

        // Simple stylized continents (white/grey)
        orbitalCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        // Americas (approximate)
        orbitalCtx.beginPath();
        orbitalCtx.ellipse(cx - earthR * 0.4, cy - earthR * 0.2, earthR * 0.3, earthR * 0.5, -0.3, 0, Math.PI * 2);
        orbitalCtx.fill();
        orbitalCtx.beginPath();
        orbitalCtx.ellipse(cx - earthR * 0.2, cy + earthR * 0.4, earthR * 0.2, earthR * 0.5, 0.4, 0, Math.PI * 2);
        orbitalCtx.fill();
        // Eurasia/Africa (approximate)
        orbitalCtx.beginPath();
        orbitalCtx.ellipse(cx + earthR * 0.4, cy - earthR * 0.2, earthR * 0.4, earthR * 0.3, 0.2, 0, Math.PI * 2);
        orbitalCtx.fill();
        orbitalCtx.beginPath();
        orbitalCtx.ellipse(cx + earthR * 0.3, cy + earthR * 0.3, earthR * 0.3, earthR * 0.4, 0.1, 0, Math.PI * 2);
        orbitalCtx.fill();
        // Night side: half-circle opposite to Sun
        orbitalCtx.beginPath();
        const nightStartA = sunAngle + Math.PI / 2;
        const nightEndA = sunAngle - Math.PI / 2;
        orbitalCtx.arc(cx, cy, earthR + 1, nightStartA, nightEndA, false);
        orbitalCtx.closePath();
        orbitalCtx.fillStyle = 'rgba(5,8,15,0.75)';
        orbitalCtx.fill();
        orbitalCtx.restore();
        // Earth outline
        orbitalCtx.beginPath();
        orbitalCtx.arc(cx, cy, earthR, 0, Math.PI * 2);
        orbitalCtx.strokeStyle = 'rgba(93,173,226,0.5)';
        orbitalCtx.lineWidth = 1;
        orbitalCtx.stroke();

        // Moon with day/night shading
        const moonR = 8;
        orbitalCtx.save();
        orbitalCtx.beginPath();
        orbitalCtx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        orbitalCtx.clip();
        // Base color
        orbitalCtx.fillStyle = '#B0ADA8';
        orbitalCtx.fillRect(moonX - moonR, moonY - moonR, moonR * 2, moonR * 2);
        // Night side
        orbitalCtx.beginPath();
        orbitalCtx.arc(moonX, moonY, moonR + 1, nightStartA, nightEndA, false);
        orbitalCtx.closePath();
        orbitalCtx.fillStyle = 'rgba(5,8,15,0.8)';
        orbitalCtx.fill();
        orbitalCtx.restore();
        // Moon outline
        orbitalCtx.beginPath();
        orbitalCtx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        orbitalCtx.strokeStyle = 'rgba(180,175,165,0.5)';
        orbitalCtx.lineWidth = 1;
        orbitalCtx.stroke();

        // Labels
        orbitalCtx.font = '10px Patrick Hand';
        orbitalCtx.fillStyle = 'rgba(255,253,231,0.6)';
        orbitalCtx.textAlign = 'center';
        orbitalCtx.fillText('Earth', cx, cy + earthR + 12);
        orbitalCtx.fillText('Moon', moonX, moonY - moonR - 4);

        // Observer indicator on Moon (tiny dot)
        orbitalCtx.beginPath();
        orbitalCtx.arc(moonX + 2, moonY - 2, 1.5, 0, Math.PI * 2);
        orbitalCtx.fillStyle = '#5DADE2';
        orbitalCtx.fill();
    }

    /* ==========================================================
       SYNODIC CYCLE TIMELINE
       ========================================================== */
    function drawSynodicTimeline(phaseDeg) {
        const w = synodicCvs.width;
        const h = synodicCvs.height;
        synodicCtx.clearRect(0, 0, w, h);

        const barY = 18;
        const barH = 14;
        const margin = 14;
        const barW = w - margin * 2;

        // Background bar with phase gradient
        const grad = synodicCtx.createLinearGradient(margin, 0, margin + barW, 0);
        grad.addColorStop(0, '#0B0E14');      // New Earth (0°)
        grad.addColorStop(0.25, '#1a3a5c');   // First Quarter
        grad.addColorStop(0.5, '#5DADE2');    // Full Earth (180°)
        grad.addColorStop(0.75, '#1a3a5c');   // Third Quarter
        grad.addColorStop(1, '#0B0E14');      // New Earth (360°)

        synodicCtx.fillStyle = grad;
        synodicCtx.beginPath();
        synodicCtx.roundRect(margin, barY, barW, barH, 3);
        synodicCtx.fill();

        // Border
        synodicCtx.strokeStyle = 'rgba(93,173,226,0.3)';
        synodicCtx.lineWidth = 1;
        synodicCtx.beginPath();
        synodicCtx.roundRect(margin, barY, barW, barH, 3);
        synodicCtx.stroke();

        // Phase labels
        synodicCtx.font = '9px Patrick Hand';
        synodicCtx.fillStyle = 'rgba(255,253,231,0.45)';
        synodicCtx.textAlign = 'center';
        synodicCtx.fillText('🌑', margin, barY - 3);
        synodicCtx.fillText('🌓', margin + barW * 0.25, barY - 3);
        synodicCtx.fillText('🌕', margin + barW * 0.5, barY - 3);
        synodicCtx.fillText('🌗', margin + barW * 0.75, barY - 3);
        synodicCtx.fillText('🌑', margin + barW, barY - 3);

        // Current position marker
        const frac = ((phaseDeg % 360) + 360) % 360 / 360;
        const markerX = margin + frac * barW;

        synodicCtx.beginPath();
        synodicCtx.moveTo(markerX, barY + barH + 2);
        synodicCtx.lineTo(markerX - 4, barY + barH + 9);
        synodicCtx.lineTo(markerX + 4, barY + barH + 9);
        synodicCtx.closePath();
        synodicCtx.fillStyle = '#FFFDE7';
        synodicCtx.fill();

        // Day count
        const dayInCycle = (frac * SYNODIC_DAYS).toFixed(1);
        synodicCtx.font = '10px Space Mono';
        synodicCtx.fillStyle = 'rgba(255,253,231,0.6)';
        synodicCtx.textAlign = 'center';
        synodicCtx.fillText(`Day ${dayInCycle} / ${SYNODIC_DAYS.toFixed(1)}`, w / 2, barY + barH + 20);
    }

    /* ==========================================================
       TIME-LAPSE ENGINE
       ========================================================== */
    let isPlaying = false;
    let currentDate = new Date();
    let lapseStart = null;
    let lapseEnd = null;
    let lapseTimer = null;
    let isScrubbing = false;

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

        if (!currentDate || currentDate < lapseStart || currentDate > lapseEnd) {
            currentDate = new Date(lapseStart);
        }

        isPlaying = true;
        playBtn.textContent = '⏸ Pause';
        playBtn.classList.add('playing');

        const speed = parseInt(speedSel.value, 10);
        const tickMs = 50;
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
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('playing');
    }

    playBtn.addEventListener('click', () => {
        if (isPlaying) stopLapse(); else startLapse();
    });

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

    startIn.addEventListener('change', () => { timelineSlider.value = 0; updateDateFromSlider(); });
    endIn.addEventListener('change', () => { timelineSlider.value = 0; updateDateFromSlider(); });

    /* ==========================================================
       OBSERVER CONTROLS
       ========================================================== */
    function updateObserverFromInputs() {
        obsLat = Math.max(-90, Math.min(90, parseInt(obsLatIn.value, 10) || 0));
        obsLon = Math.max(-180, Math.min(180, parseInt(obsLonIn.value, 10) || 0));
    }

    function setPreset(key) {
        const p = LOCATION_PRESETS[key];
        if (p) {
            obsLatIn.value = p.lat;
            obsLonIn.value = p.lon;
            updateObserverFromInputs();
        }
    }

    locSel.addEventListener('change', () => {
        if (locSel.value !== 'custom') {
            setPreset(locSel.value);
        }
    });

    obsLatIn.addEventListener('change', () => {
        updateObserverFromInputs();
        locSel.value = 'custom';
    });
    obsLonIn.addEventListener('change', () => {
        updateObserverFromInputs();
        locSel.value = 'custom';
    });

    // Initialize from default preset
    setPreset('guanghan');

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

        // Determine current date
        let renderDate = currentDate;
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
        const { scale: distScale, distance: earthMoonDist } = earthScaleForDate(renderDate);
        const libration = librationForDate(renderDate);

        // Observer → sky position
        const sky = earthSkyPosition(obsLat, obsLon, libration);
        target.xRatio = sky.xRatio;
        target.yRatio = sky.visible ? sky.yRatio : -1;
        target.scale = sky.visible ? sky.scale : 0;

        // Lerp
        current.xRatio = lerp(current.xRatio, target.xRatio, LERP);
        current.yRatio = lerp(current.yRatio, target.yRatio, LERP);
        current.scale = lerp(current.scale, target.scale, LERP);

        // Earth position
        const earthR = Math.min(w, h) * 0.14 * current.scale * distScale;
        const earthX = w * current.xRatio + (libration.xOff * earthR);
        const earthY = h * current.yRatio + (libration.yOff * earthR);

        if (sky.visible && current.scale > 0.05) {
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

        // --- Update stats panel ---
        statDate.textContent = isoDate(renderDate);
        statPhase.textContent = phaseName(phaseDeg) + ` (${Math.round(phaseDeg)}°)`;

        const ill = (1 - Math.cos((phaseDeg / 180) * Math.PI)) / 2;
        statIllum.textContent = `${(ill * 100).toFixed(1)}%`;

        statDist.textContent = `${Math.round(earthMoonDist).toLocaleString()} km`;

        statLibration.textContent = `${libration.degLon > 0 ? '+' : ''}${libration.degLon.toFixed(1)}° / ${libration.degLat > 0 ? '+' : ''}${libration.degLat.toFixed(1)}°`;

        statElev.textContent = sky.visible
            ? `${sky.elevation.toFixed(1)}°`
            : 'below horizon';

        statAzimuth.textContent = sky.visible
            ? `${sky.azimuthDeg.toFixed(1)}°`
            : '—';

        // --- Draw side-panel canvases ---
        drawOrbitalView(renderDate, phaseDeg);
        drawSynodicTimeline(phaseDeg);

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();
