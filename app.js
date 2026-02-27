/* ============================================================
   Earthview from the Moon — Canvas Renderer  (v2)
   ============================================================
   Fixes:
   - Continent shapes replaced with hand-traced bézier paths
     that actually resemble Africa, Americas, Eurasia, etc.
   - Phase shadow fully covers Earth at 0° (New Earth).
   ============================================================ */

(function () {
    'use strict';

    /* --- DOM refs --- */
    const canvas = document.getElementById('scene');
    const ctx = canvas.getContext('2d');
    const slider = document.getElementById('phase-slider');
    const phaseLbl = document.getElementById('phase-name');
    const locSel = document.getElementById('location-select');

    /* --- Palette --- */
    const C = {
        skyBlack: '#0B0E14',
        starWhite: '#FFFDE7',
        oceanBlue: '#5DADE2',
        oceanDeep: '#3B8DBF',
        landGreen: '#B8D430',
        landDark: '#8DAF18',
        outline: '#2C3E50',
        groundWarm: '#D4905C',
        groundDeep: '#C47A3A',
        shadow: 'rgba(10, 12, 20, 0.88)',
        highlight: 'rgba(255, 255, 240, 0.25)',
    };

    /* ==========================================================
       STARS
       ========================================================== */
    let stars = [];
    function generateStars(count) {
        stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random(), y: Math.random(),
                r: 0.5 + Math.random() * 2,
                baseAlpha: 0.4 + Math.random() * 0.6,
                speed: 0.5 + Math.random() * 2,
                offset: Math.random() * Math.PI * 2,
            });
        }
    }
    generateStars(220);

    function drawStars(w, h, time) {
        for (const s of stars) {
            const tw = 0.5 + 0.5 * Math.sin(time * s.speed + s.offset);
            const a = s.baseAlpha * (0.6 + 0.4 * tw);
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h * 0.78, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,253,231,${a.toFixed(2)})`;
            ctx.fill();
        }
    }

    /* ==========================================================
       LOCATION PRESETS
       ========================================================== */
    const LOCATIONS = {
        procellarum: { yRatio: 0.30, scale: 1.0 },
        tranquility: { yRatio: 0.35, scale: 0.95 },
        southpole: { yRatio: 0.58, scale: 0.85 },
        farside: { yRatio: -1, scale: 0 },
    };

    let current = { yRatio: 0.30, scale: 1.0 };
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
       CONTINENT DATA  (normalised coords, -1…+1, centered on 0,0)
       Each continent is an array of {x,y} control-point sets that
       get drawn as a closed bezier shape.  Longitude (x) rotates;
       latitude (y) stays fixed.
       ========================================================== */

    // Helper: define a continent as an array of points
    // These are authored in a mercator-ish coordinate space:
    //   x: -1 (180°W) … +1 (180°E)     y: -1 (90°N) … +1 (90°S)
    const RAW_CONTINENTS = [
        {
            name: 'africa', color: C.landGreen, points: [
                // Rough outline of Africa
                { x: 0.02, y: -0.15 }, { x: 0.12, y: -0.22 }, { x: 0.15, y: -0.08 },
                { x: 0.18, y: 0.05 }, { x: 0.22, y: 0.15 }, { x: 0.20, y: 0.30 },
                { x: 0.15, y: 0.42 }, { x: 0.10, y: 0.45 }, { x: 0.05, y: 0.38 },
                { x: -0.02, y: 0.25 }, { x: -0.05, y: 0.10 }, { x: -0.05, y: -0.05 },
            ]
        },
        {
            name: 'europe', color: C.landGreen, points: [
                { x: -0.02, y: -0.52 }, { x: 0.06, y: -0.55 }, { x: 0.15, y: -0.50 },
                { x: 0.22, y: -0.42 }, { x: 0.18, y: -0.35 }, { x: 0.12, y: -0.30 },
                { x: 0.05, y: -0.28 }, { x: -0.03, y: -0.30 }, { x: -0.06, y: -0.38 },
                { x: -0.05, y: -0.48 },
            ]
        },
        {
            name: 'asia', color: C.landGreen, points: [
                { x: 0.22, y: -0.55 }, { x: 0.35, y: -0.60 }, { x: 0.50, y: -0.55 },
                { x: 0.62, y: -0.45 }, { x: 0.68, y: -0.30 }, { x: 0.65, y: -0.15 },
                { x: 0.55, y: -0.05 }, { x: 0.42, y: 0.00 }, { x: 0.30, y: -0.05 },
                { x: 0.22, y: -0.15 }, { x: 0.18, y: -0.30 }, { x: 0.20, y: -0.42 },
            ]
        },
        {
            name: 'northAmerica', color: C.landGreen, points: [
                { x: -0.60, y: -0.62 }, { x: -0.50, y: -0.68 }, { x: -0.38, y: -0.60 },
                { x: -0.30, y: -0.48 }, { x: -0.28, y: -0.35 }, { x: -0.32, y: -0.25 },
                { x: -0.40, y: -0.22 }, { x: -0.48, y: -0.28 }, { x: -0.55, y: -0.35 },
                { x: -0.62, y: -0.45 }, { x: -0.65, y: -0.55 },
            ]
        },
        {
            name: 'southAmerica', color: C.landGreen, points: [
                { x: -0.32, y: -0.05 }, { x: -0.25, y: -0.12 }, { x: -0.18, y: -0.05 },
                { x: -0.15, y: 0.10 }, { x: -0.18, y: 0.28 }, { x: -0.22, y: 0.42 },
                { x: -0.28, y: 0.50 }, { x: -0.35, y: 0.45 }, { x: -0.38, y: 0.32 },
                { x: -0.36, y: 0.18 }, { x: -0.35, y: 0.05 },
            ]
        },
        {
            name: 'australia', color: C.landGreen, points: [
                { x: 0.58, y: 0.18 }, { x: 0.65, y: 0.15 }, { x: 0.72, y: 0.20 },
                { x: 0.74, y: 0.30 }, { x: 0.70, y: 0.38 }, { x: 0.62, y: 0.35 },
                { x: 0.56, y: 0.28 },
            ]
        },
    ];

    /**
     * Project a continent point onto the visible sphere.
     * @param {number} px  normalised longitude (-1…+1)
     * @param {number} py  normalised latitude  (-1…+1)
     * @param {number} rot rotation angle in radians (from slider)
     * @param {number} r   sphere radius in pixels
     * @returns {{x,y,visible}} canvas-relative coords + depth flag
     */
    function projectPoint(px, py, rot, r) {
        // Convert normalised coords to spherical angles
        const lon = px * Math.PI;          // -π … +π
        const lat = py * (Math.PI / 2);    // -π/2 … +π/2

        // 3D position on unit sphere
        const cosLat = Math.cos(lat);
        const sx = cosLat * Math.sin(lon + rot);
        const sy = Math.sin(lat);
        const sz = cosLat * Math.cos(lon + rot);

        // sz > 0  →  facing us
        return {
            x: sx * r,
            y: sy * r,
            visible: sz > -0.05,   // slight tolerance
            depth: sz,
        };
    }

    /* ==========================================================
       DRAW EARTH
       ========================================================== */

    /** Wobbly outline for hand-drawn feel */
    function wobbleCircle(cx, cy, r, segments, wobble) {
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const wr = r + Math.sin(a * 7.3 + 1.2) * wobble
                + Math.cos(a * 13.1) * wobble * 0.6;
            const x = cx + Math.cos(a) * wr;
            const y = cy + Math.sin(a) * wr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    function drawEarth(cx, cy, r, phaseDeg) {
        const rot = (phaseDeg / 180) * Math.PI;  // slider drives rotation

        /* --- Ocean base --- */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const og = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
        og.addColorStop(0, '#7EC8E3');
        og.addColorStop(0.5, C.oceanBlue);
        og.addColorStop(1, C.oceanDeep);
        ctx.fillStyle = og;
        ctx.fill();
        ctx.restore();

        /* --- Continents --- */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
        ctx.clip();

        for (const cont of RAW_CONTINENTS) {
            // Project all points
            const pts = cont.points.map(p => projectPoint(p.x, p.y, rot, r));
            // Skip if majority behind sphere
            const visCnt = pts.filter(p => p.visible).length;
            if (visCnt < pts.length * 0.3) continue;

            ctx.beginPath();
            // Use quadratic curves through projected points for smooth shapes
            const first = pts[0];
            ctx.moveTo(cx + first.x, cy + first.y);
            for (let i = 0; i < pts.length; i++) {
                const p0 = pts[i];
                const p1 = pts[(i + 1) % pts.length];
                const mx = (cx + p0.x + cx + p1.x) / 2;
                const my = (cy + p0.y + cy + p1.y) / 2;
                ctx.quadraticCurveTo(cx + p0.x, cy + p0.y, mx, my);
            }
            ctx.closePath();
            ctx.fillStyle = cont.color;
            ctx.fill();
            // Continent outline
            ctx.strokeStyle = C.landDark;
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
        ctx.restore();

        /* --- Specular highlight --- */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
        ctx.clip();
        const hg = ctx.createRadialGradient(
            cx - r * 0.28, cy - r * 0.28, r * 0.02,
            cx - r * 0.1, cy - r * 0.1, r * 0.55
        );
        hg.addColorStop(0, 'rgba(255,255,255,0.38)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.fill();
        ctx.restore();

        /* --- Phase shadow (terminator) --- */
        drawPhaseShadow(cx, cy, r, phaseDeg);

        /* --- Wobbly outline --- */
        wobbleCircle(cx, cy, r, 90, r * 0.012);
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 3.5;
        ctx.stroke();
    }

    /**
     * Draw the phase terminator shadow.
     * phaseDeg 0 = New Earth (fully dark), 180 = Full Earth (fully lit).
     */
    function drawPhaseShadow(cx, cy, r, phaseDeg) {
        // Normalise to 0…360
        const d = ((phaseDeg % 360) + 360) % 360;
        // Map to radians: 0 → π, 180 → 0, 360 → π
        const phaseAngle = Math.PI - (d / 180) * Math.PI;   // π at d=0, 0 at d=180

        ctx.save();
        // Clip to Earth circle
        ctx.beginPath();
        ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
        ctx.clip();

        // The shadow is drawn as:
        //   Half-circle (always dark) + elliptical terminator
        //   Direction flips at d=180

        const terminatorWidth = Math.abs(Math.cos(phaseAngle)) * r;

        ctx.beginPath();

        if (d <= 180) {
            // Shadow on right side, shrinking toward d=180
            // Right semicircle
            ctx.arc(cx, cy, r + 2, -Math.PI / 2, Math.PI / 2, false);
            // Terminator (elliptical arc back)
            ctx.ellipse(cx, cy, terminatorWidth, r + 2, 0,
                Math.PI / 2, -Math.PI / 2, d > 90);
        } else {
            // Shadow on left side, growing past d=180
            // Left semicircle
            ctx.arc(cx, cy, r + 2, Math.PI / 2, -Math.PI / 2, false);
            // Terminator back
            ctx.ellipse(cx, cy, terminatorWidth, r + 2, 0,
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
    // Pre-compute the bumpy horizon so it's stable across frames
    const HORIZON_SEGMENTS = 80;
    let horizonBumps = [];
    function genHorizonBumps() {
        horizonBumps = [];
        for (let i = 0; i <= HORIZON_SEGMENTS; i++) {
            horizonBumps.push(
                Math.sin(i * 0.35) * 8 +
                Math.sin(i * 0.7 + 1) * 5 +
                Math.sin(i * 1.8 + 3) * 3
            );
        }
    }
    genHorizonBumps();

    // Pre-compute scribble lines so they're stable
    let scribbleH = [];
    let scribbleD = [];
    function genScribbles() {
        scribbleH = [];
        scribbleD = [];
        for (let i = 0; i < 22; i++) {
            const segs = [];
            const startX = Math.random() * 0.3;
            const endX = startX + 0.1 + Math.random() * 0.5;
            for (let j = 0; j <= 8; j++) {
                segs.push({
                    xr: startX + ((endX - startX) / 8) * j,
                    yr: (Math.random() - 0.5) * 3,
                });
            }
            scribbleH.push({ yOff: 8 + i * 6 + Math.random() * 3, segs });
        }
        for (let i = 0; i < 50; i++) {
            const len = 6 + Math.random() * 14;
            const angle = -0.5 + Math.random() * 0.4;
            scribbleD.push({
                xr: Math.random(), yr: Math.random(),
                dx: Math.cos(angle) * len,
                dy: Math.sin(angle) * len,
            });
        }
    }
    genScribbles();

    function drawLunarSurface(w, h) {
        const horizonY = h * 0.78;

        /* --- Ground fill --- */
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        for (let i = 0; i <= HORIZON_SEGMENTS; i++) {
            ctx.lineTo((i / HORIZON_SEGMENTS) * w, horizonY + horizonBumps[i]);
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h);
        ctx.closePath();
        const gg = ctx.createLinearGradient(0, horizonY, 0, h);
        gg.addColorStop(0, C.groundWarm);
        gg.addColorStop(0.4, C.groundDeep);
        gg.addColorStop(1, '#A0643A');
        ctx.fillStyle = gg;
        ctx.fill();
        ctx.restore();

        /* --- Cross-hatch texture --- */
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, horizonY - 4, w, h - horizonY + 4);
        ctx.clip();

        // Horizontal scribbles
        ctx.strokeStyle = 'rgba(160,90,40,0.30)';
        ctx.lineWidth = 1.2;
        for (const s of scribbleH) {
            ctx.beginPath();
            for (let j = 0; j < s.segs.length; j++) {
                const px = s.segs[j].xr * w;
                const py = horizonY + s.yOff + s.segs[j].yr;
                if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        // Diagonal hatches
        ctx.strokeStyle = 'rgba(195,120,60,0.18)';
        ctx.lineWidth = 1;
        const groundH = h - horizonY;
        for (const d of scribbleD) {
            const x = d.xr * w;
            const y = horizonY + 8 + d.yr * (groundH - 12);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + d.dx, y + d.dy);
            ctx.stroke();
        }
        ctx.restore();

        /* --- Horizon outline --- */
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        for (let i = 0; i <= HORIZON_SEGMENTS; i++) {
            ctx.lineTo((i / HORIZON_SEGMENTS) * w, horizonY + horizonBumps[i]);
        }
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
    }

    /* ==========================================================
       FAR-SIDE MESSAGE
       ========================================================== */
    function drawFarSideMsg(w, h, time) {
        ctx.save();
        ctx.font = '28px Patrick Hand';
        ctx.fillStyle = C.starWhite;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.65 + 0.15 * Math.sin(time * 1.2);
        ctx.fillText('🌑  Earth is below the horizon here…', w / 2, h * 0.38);
        ctx.font = '18px Patrick Hand';
        ctx.globalAlpha = 0.45;
        ctx.fillText("You're on the Moon's far side!", w / 2, h * 0.44);
        ctx.restore();
    }

    /* ==========================================================
       MAIN LOOP
       ========================================================== */
    function draw(ts) {
        const time = ts / 1000;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width, h = rect.height;

        ctx.clearRect(0, 0, w, h);

        // Sky
        ctx.fillStyle = C.skyBlack;
        ctx.fillRect(0, 0, w, h);

        // Stars
        drawStars(w, h, time);

        // Lerp position
        current.yRatio = lerp(current.yRatio, target.yRatio, LERP);
        current.scale = lerp(current.scale, target.scale, LERP);

        // Earth
        const phaseDeg = parseFloat(slider.value);
        const earthR = Math.min(w, h) * 0.14 * current.scale;
        const earthX = w * 0.5;
        const earthY = h * current.yRatio;

        if (target.yRatio >= 0 && current.scale > 0.05) {
            // Subtle glow (behind Earth)
            ctx.save();
            const glow = ctx.createRadialGradient(earthX, earthY, earthR * 0.9, earthX, earthY, earthR * 1.8);
            glow.addColorStop(0, 'rgba(93,173,226,0.10)');
            glow.addColorStop(1, 'rgba(93,173,226,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(earthX, earthY, earthR * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            drawEarth(earthX, earthY, earthR, phaseDeg);
        } else {
            drawFarSideMsg(w, h, time);
        }

        // Lunar surface (always on top)
        drawLunarSurface(w, h);

        // Phase label
        phaseLbl.textContent = phaseName(phaseDeg);

        requestAnimationFrame(draw);
    }

    /* ==========================================================
       EVENTS
       ========================================================== */
    locSel.addEventListener('change', () => {
        const loc = LOCATIONS[locSel.value];
        if (loc) {
            target.yRatio = loc.yRatio;
            target.scale = loc.scale;
        }
    });

    requestAnimationFrame(draw);
})();
