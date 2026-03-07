/**
 * Per-channel oscilloscope scopes.
 *
 * Amplitude: real per-channel VU from libopenmpt (Player.getChannelVU).
 * Waveform shape: actual sample PCM from ModParser data.
 * Pattern tracking: reads current row to know which sample each channel plays.
 */
const Scopes = (() => {
    const COLORS = ["#4488ff", "#44ddaa", "#ddaa44", "#dd4488"];
    const FILLS  = ["rgba(68,136,255,0.15)", "rgba(68,221,170,0.15)", "rgba(221,170,68,0.15)", "rgba(221,68,136,0.15)"];

    const canvases = [];
    const contexts = [];
    let animId = null;
    let mod = null;
    let resized = false;

    // Which sample index is loaded on each channel (-1 = none)
    const chSample = [-1, -1, -1, -1];
    let prevPos = -1;
    let prevRow = -1;

    function init() {
        for (let i = 0; i < 4; i++) {
            canvases.push(document.getElementById(`scope-${i}`));
            contexts.push(canvases[i] ? canvases[i].getContext("2d") : null);
        }
        window.addEventListener("resize", () => { resized = false; });
    }

    function _ensureSize() {
        if (resized) return;
        for (let i = 0; i < 4; i++) {
            const c = canvases[i];
            if (!c) continue;
            const rect = c.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            c.width = Math.floor(rect.width * dpr);
            c.height = Math.floor(rect.height * dpr);
        }
        resized = true;
    }

    function loadMod(parsedMod) {
        mod = parsedMod;
        chSample[0] = chSample[1] = chSample[2] = chSample[3] = -1;
        prevPos = -1;
        prevRow = -1;
    }

    function start() {
        if (animId) cancelAnimationFrame(animId);
        resized = false;
        animId = requestAnimationFrame(_loop);
    }

    function stop() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        chSample[0] = chSample[1] = chSample[2] = chSample[3] = -1;
        _ensureSize();
        _clearAll();
    }

    function _loop() {
        _ensureSize();
        _trackPattern();
        for (let i = 0; i < 4; i++) _drawScope(i);
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
            if (cell.sampleNum > 0) {
                const sIdx = cell.sampleNum - 1;
                if (sIdx < mod.samples.length && mod.samples[sIdx].pcmData) {
                    chSample[ch] = sIdx;
                }
            }
        }
    }

    function _drawScope(ch) {
        const ctx = contexts[ch];
        const canvas = canvases[ch];
        if (!ctx || !canvas || canvas.width < 2) return;

        const w = canvas.width;
        const h = canvas.height;
        const mid = h / 2;

        ctx.fillStyle = "#000014";
        ctx.fillRect(0, 0, w, h);

        // Center line
        ctx.strokeStyle = "#152030";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
        ctx.stroke();

        // Real VU from libopenmpt
        const vu = Player.getChannelVU(ch);

        // No sample loaded or VU is zero -- just show the flat line
        if (chSample[ch] < 0 || !mod || vu < 0.001) return;

        const sample = mod.samples[chSample[ch]];
        if (!sample || !sample.pcmData || sample.pcmData.length < 4) return;

        const pcm = sample.pcmData;
        const amp = Math.min(vu * 2.0, 1.0); // scale VU (0-0.5 typical) to visible range

        // Draw the full sample waveform scaled by real VU
        const len = pcm.length;

        // Filled envelope
        ctx.fillStyle = FILLS[ch];
        ctx.beginPath();
        ctx.moveTo(0, mid);
        for (let x = 0; x < w; x++) {
            const si = Math.floor((x / w) * len);
            let v = pcm[si];
            if (v > 127) v -= 256;
            ctx.lineTo(x, mid - (v / 128) * amp * (mid - 1));
        }
        ctx.lineTo(w, mid);
        ctx.closePath();
        ctx.fill();

        // Waveform line
        ctx.strokeStyle = COLORS[ch];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const si = Math.floor((x / w) * len);
            let v = pcm[si];
            if (v > 127) v -= 256;
            const y = mid - (v / 128) * amp * (mid - 1);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Loop region
        if (sample.hasLoop && sample.loopLength > 2) {
            const lsX = (sample.loopStart / len) * w;
            const leX = ((sample.loopStart + sample.loopLength) / len) * w;
            ctx.fillStyle = "rgba(255,255,255,0.04)";
            ctx.fillRect(lsX, 0, leX - lsX, h);
        }

        // Label: sample name + VU dB
        const db = vu > 0 ? (20 * Math.log10(vu)).toFixed(0) : "-inf";
        const label = (sample.name || `#${chSample[ch] + 1}`) + `  ${db}dB`;
        const fs = Math.max(9, Math.floor(h / 8));
        ctx.font = `${fs}px monospace`;
        ctx.fillStyle = COLORS[ch];
        ctx.fillText(label, 3, fs + 1);
    }

    function _clearAll() {
        for (let i = 0; i < 4; i++) {
            const ctx = contexts[i];
            const c = canvases[i];
            if (!ctx || !c) continue;
            ctx.fillStyle = "#000014";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.strokeStyle = "#152030";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, c.height / 2);
            ctx.lineTo(c.width, c.height / 2);
            ctx.stroke();
        }
    }

    return { init, loadMod, start, stop };
})();
