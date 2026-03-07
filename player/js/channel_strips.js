/**
 * ChannelStrips: 4 scrolling timeline canvases, one per MOD channel.
 *
 * Each strip scrolls left every frame, painting a new column on the right edge.
 * A column encodes: VU amplitude (filled bar from center), note triggers
 * (bright tick), effect indicators (colored marks), and the current sample
 * waveform as a small inset thumbnail pulsing with VU.
 *
 * All data comes from real libopenmpt per-channel VU and parsed MOD pattern data.
 */
const ChannelStrips = (() => {
    const COLORS = ["#4488ff", "#44ddaa", "#ddaa44", "#dd4488"];
    const COLORS_DIM = ["rgba(68,136,255,0.35)", "rgba(68,221,170,0.35)", "rgba(221,170,68,0.35)", "rgba(221,68,136,0.35)"];
    const COLORS_GLOW = ["rgba(68,136,255,0.08)", "rgba(68,221,170,0.08)", "rgba(221,170,68,0.08)", "rgba(221,68,136,0.08)"];
    const BG = "#000014";
    const GRID_COLOR = "#0a1020";
    const NOTE_TRIGGER_COLOR = "#ffffff";

    const EFFECT_COLORS = {
        0x0: "#ccaaff",  // arpeggio
        0x1: "#88ccff",  // slide up
        0x2: "#88ccff",  // slide down
        0x3: "#ffcc44",  // tone portamento
        0x4: "#44ffaa",  // vibrato
        0x5: "#ffcc44",  // tone+volslide
        0x6: "#44ffaa",  // vibrato+volslide
        0x7: "#ff88aa",  // tremolo
        0x9: "#aaaaff",  // sample offset
        0xA: "#ffaa44",  // volume slide
        0xC: "#ffff66",  // set volume
        0xE: "#ff66ff",  // extended
        0xF: "#66ffff",  // set speed/tempo
    };

    const canvases = [];
    const contexts = [];
    let animId = null;
    let mod = null;
    let resized = false;
    let scrollSpeed = 2; // pixels per frame

    // Per-channel state
    const chState = [null, null, null, null];
    let prevPos = -1;
    let prevRow = -1;

    // Note label fade queue per channel: [{text, x, alpha}, ...]
    const noteLabels = [[], [], [], []];

    function _initChState(ch) {
        return {
            sampleIdx: -1,
            lastNote: "---",
            lastEffectType: 0,
            lastEffectVal: 0,
            vu: 0,
            vuSmooth: 0,
            noteTrigger: 0, // countdown frames for trigger flash
        };
    }

    function init() {
        for (let i = 0; i < 4; i++) {
            canvases.push(document.getElementById(`strip-${i}`));
            contexts.push(canvases[i] ? canvases[i].getContext("2d") : null);
            chState[i] = _initChState(i);
        }
        window.addEventListener("resize", () => { resized = false; });
    }

    function _ensureSize() {
        if (resized) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let anyChanged = false;
        for (let i = 0; i < 4; i++) {
            const c = canvases[i];
            if (!c) continue;
            const rect = c.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const newW = Math.floor(rect.width * dpr);
            const newH = Math.floor(rect.height * dpr);
            if (Math.abs(c.width - newW) > 2 || Math.abs(c.height - newH) > 2) {
                c.width = newW;
                c.height = newH;
                const ctx = contexts[i];
                if (ctx) {
                    ctx.fillStyle = BG;
                    ctx.fillRect(0, 0, newW, newH);
                }
                anyChanged = true;
            }
        }
        resized = true;
    }

    function loadMod(parsedMod) {
        mod = parsedMod;
        for (let i = 0; i < 4; i++) {
            chState[i] = _initChState(i);
            noteLabels[i] = [];
        }
        prevPos = -1;
        prevRow = -1;
        _clearAll();
    }

    function start() {
        if (animId) cancelAnimationFrame(animId);
        resized = false;
        animId = requestAnimationFrame(_loop);
    }

    function stop() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        for (let i = 0; i < 4; i++) {
            chState[i] = _initChState(i);
            noteLabels[i] = [];
        }
        _ensureSize();
        _clearAll();
    }

    function _loop() {
        _ensureSize();
        _trackPattern();

        const vus = Player.getAllChannelVU();
        for (let i = 0; i < 4; i++) {
            const st = chState[i];
            st.vu = vus[i];
            // Smooth VU: fast attack, slow decay
            if (st.vu > st.vuSmooth) {
                st.vuSmooth += (st.vu - st.vuSmooth) * 0.6;
            } else {
                st.vuSmooth *= 0.94;
            }
            if (st.vuSmooth < 0.001) st.vuSmooth = 0;

            _scrollAndDraw(i);
        }

        animId = requestAnimationFrame(_loop);
    }

    function _trackPattern() {
        if (!mod) return;
        const pos = Player.getPosition();
        if (!pos) return;
        if (pos.position === prevPos && pos.row === prevRow) return;
        prevPos = pos.position;
        prevRow = pos.row;

        const patIdx = pos.pattern;
        if (patIdx < 0 || patIdx >= mod.patterns.length) return;
        const row = mod.patterns[patIdx][pos.row];
        if (!row) return;

        for (let ch = 0; ch < Math.min(4, row.length); ch++) {
            const cell = row[ch];
            const st = chState[ch];

            if (cell.sampleNum > 0) {
                const sIdx = cell.sampleNum - 1;
                if (sIdx < mod.samples.length) {
                    st.sampleIdx = sIdx;
                }
            }

            if (cell.period > 0 && cell.note !== "---") {
                st.lastNote = cell.note;
                st.noteTrigger = 12; // flash for 12 frames
                // Add floating note label
                const c = canvases[ch];
                if (c) {
                    noteLabels[ch].push({
                        text: cell.note,
                        x: c.width - 2,
                        alpha: 1.0,
                    });
                }
            }

            st.lastEffectType = cell.effectType;
            st.lastEffectVal = cell.effectVal;
        }
    }

    function _scrollAndDraw(ch) {
        const ctx = contexts[ch];
        const canvas = canvases[ch];
        if (!ctx || !canvas || canvas.width < 4) return;

        const w = canvas.width;
        const h = canvas.height;
        const mid = h / 2;
        const st = chState[ch];

        // Scroll: shift existing content left by scrollSpeed pixels
        const imgData = ctx.getImageData(scrollSpeed, 0, w - scrollSpeed, h);
        ctx.putImageData(imgData, 0, 0);

        // Clear the new column area on the right
        ctx.fillStyle = BG;
        ctx.fillRect(w - scrollSpeed, 0, scrollSpeed, h);

        // Draw center grid line in new area
        ctx.fillStyle = GRID_COLOR;
        ctx.fillRect(w - scrollSpeed, mid, scrollSpeed, 1);

        // Draw VU amplitude bar from center
        const amp = Math.min(st.vuSmooth * 2.0, 1.0);
        if (amp > 0.001) {
            const barH = amp * (mid - 2);

            // Filled amplitude bar (symmetric from center)
            ctx.fillStyle = COLORS_DIM[ch];
            ctx.fillRect(w - scrollSpeed, mid - barH, scrollSpeed, barH * 2);

            // Brighter core line
            const coreH = barH * 0.6;
            ctx.fillStyle = COLORS[ch];
            ctx.globalAlpha = 0.5 + amp * 0.5;
            ctx.fillRect(w - scrollSpeed, mid - coreH, scrollSpeed, coreH * 2);
            ctx.globalAlpha = 1.0;

            // Glow at peaks
            if (amp > 0.5) {
                ctx.fillStyle = COLORS_GLOW[ch];
                ctx.fillRect(w - scrollSpeed, mid - barH - 2, scrollSpeed, barH * 2 + 4);
            }
        }

        // Note trigger: thin bright line at center, not full-height flood
        if (st.noteTrigger > 0) {
            const trigAlpha = st.noteTrigger / 12;
            ctx.fillStyle = COLORS[ch];
            ctx.globalAlpha = trigAlpha * 0.9;
            // Bright thin line at the VU peak
            const peakH = Math.max(2, amp * (mid - 2));
            ctx.fillRect(w - scrollSpeed, mid - peakH, scrollSpeed, peakH * 2);
            // Small bright tick at top edge
            ctx.fillStyle = NOTE_TRIGGER_COLOR;
            ctx.globalAlpha = trigAlpha * 0.6;
            ctx.fillRect(w - scrollSpeed, 0, scrollSpeed, 2);
            ctx.fillRect(w - scrollSpeed, h - 2, scrollSpeed, 2);
            ctx.globalAlpha = 1.0;
            st.noteTrigger--;
        }

        // Effect indicator marks in the new column
        if (st.lastEffectType > 0 || (st.lastEffectType === 0 && st.lastEffectVal > 0)) {
            const effColor = EFFECT_COLORS[st.lastEffectType] || "#666688";

            if (st.lastEffectType === 0x4 || st.lastEffectType === 0x6) {
                // Vibrato: small dot near top
                ctx.fillStyle = effColor;
                ctx.globalAlpha = 0.7;
                ctx.fillRect(w - scrollSpeed, 3, scrollSpeed, 2);
                ctx.globalAlpha = 1.0;
            } else if (st.lastEffectType === 0xA) {
                // Volume slide: mark near bottom
                ctx.fillStyle = effColor;
                ctx.globalAlpha = 0.6;
                ctx.fillRect(w - scrollSpeed, h - 5, scrollSpeed, 2);
                ctx.globalAlpha = 1.0;
            } else if (st.lastEffectType === 0x3) {
                // Portamento: diagonal hint
                ctx.fillStyle = effColor;
                ctx.globalAlpha = 0.5;
                ctx.fillRect(w - scrollSpeed, mid - 1, scrollSpeed, 2);
                ctx.globalAlpha = 1.0;
            } else if (st.lastEffectType === 0x0 && st.lastEffectVal > 0) {
                // Arpeggio: triple dots
                ctx.fillStyle = effColor;
                ctx.globalAlpha = 0.6;
                const spacing = Math.floor(h / 4);
                ctx.fillRect(w - 1, spacing, 1, 2);
                ctx.fillRect(w - 1, spacing * 2, 1, 2);
                ctx.fillRect(w - 1, spacing * 3, 1, 2);
                ctx.globalAlpha = 1.0;
            } else if (st.lastEffectType > 0) {
                // Generic effect: small dot at bottom
                ctx.fillStyle = effColor;
                ctx.globalAlpha = 0.4;
                ctx.fillRect(w - scrollSpeed, h - 3, scrollSpeed, 1);
                ctx.globalAlpha = 1.0;
            }
        }

        // Update and draw floating note labels (scroll with the canvas)
        const labels = noteLabels[ch];
        const fs = Math.max(8, Math.floor(h / 7));
        ctx.font = `bold ${fs}px monospace`;
        for (let i = labels.length - 1; i >= 0; i--) {
            const lbl = labels[i];
            lbl.x -= scrollSpeed;
            lbl.alpha -= 0.008;
            if (lbl.alpha <= 0 || lbl.x < -40) {
                labels.splice(i, 1);
                continue;
            }
            ctx.fillStyle = COLORS[ch];
            ctx.globalAlpha = Math.min(lbl.alpha, 0.9);
            ctx.fillText(lbl.text, lbl.x, fs + 2);
            ctx.globalAlpha = 1.0;
        }

        // Sample waveform inset (bottom-right corner)
        _drawSampleInset(ch, ctx, canvas, st);

        // dB label (top-right)
        if (st.vuSmooth > 0.001) {
            const db = (20 * Math.log10(st.vuSmooth)).toFixed(0);
            const dbFs = Math.max(7, Math.floor(h / 9));
            ctx.font = `${dbFs}px monospace`;
            ctx.fillStyle = COLORS[ch];
            ctx.globalAlpha = 0.5;
            ctx.textAlign = "right";
            ctx.fillText(`${db}dB`, w - 4, h - 4);
            ctx.textAlign = "left";
            ctx.globalAlpha = 1.0;
        }
    }

    function _drawSampleInset(ch, ctx, canvas, st) {
        if (!mod || st.sampleIdx < 0) return;
        const sample = mod.samples[st.sampleIdx];
        if (!sample || !sample.pcmData || sample.pcmData.length < 4) return;

        const insetW = Math.min(60, Math.floor(canvas.width / 6));
        const insetH = Math.min(24, Math.floor(canvas.height / 3));
        const ix = canvas.width - insetW - 4;
        const iy = canvas.height - insetH - 14;

        // Background
        ctx.fillStyle = "rgba(0,0,20,0.7)";
        ctx.fillRect(ix, iy, insetW, insetH);

        // Border
        ctx.strokeStyle = COLORS[ch];
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.strokeRect(ix, iy, insetW, insetH);
        ctx.globalAlpha = 1.0;

        // Waveform
        const pcm = sample.pcmData;
        const midY = iy + insetH / 2;
        const amp = Math.min(st.vuSmooth * 2.5, 1.0);
        if (amp < 0.01) return;

        ctx.strokeStyle = COLORS[ch];
        ctx.globalAlpha = 0.4 + amp * 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < insetW; x++) {
            const si = Math.floor((x / insetW) * pcm.length);
            let v = pcm[si];
            if (v > 127) v -= 256;
            const y = midY - (v / 128) * amp * (insetH / 2 - 1);
            if (x === 0) ctx.moveTo(ix + x, y);
            else ctx.lineTo(ix + x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    function _clearAll() {
        for (let i = 0; i < 4; i++) {
            const ctx = contexts[i];
            const c = canvases[i];
            if (!ctx || !c) continue;
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, c.width, c.height);
            // Center line
            ctx.fillStyle = GRID_COLOR;
            ctx.fillRect(0, c.height / 2, c.width, 1);
        }
    }

    return { init, loadMod, start, stop };
})();
