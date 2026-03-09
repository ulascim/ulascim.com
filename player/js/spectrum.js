/**
 * Meter row: scrolling FFT spectrogram (waterfall heatmap), stereo field
 * Lissajous display, master waveform oscilloscope, and 4 real per-channel VU bars.
 */
const Spectrum = (() => {
    // Elements
    let spectrogramCanvas = null, spectrogramCtx = null;
    let stereoCanvas = null, stereoCtx = null;
    let waveCanvas = null, waveCtx = null;
    const vuFills = [];
    let animId = null;

    // Smooth VU
    const vuSmooth = new Float32Array(4);
    const VU_ATTACK = 0.5;
    const VU_DECAY = 0.92;

    const SPEC_LUT_R = new Uint8Array(256);
    const SPEC_LUT_G = new Uint8Array(256);
    const SPEC_LUT_B = new Uint8Array(256);
    (function _buildSpectrogramLUT() {
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            if (t < 0.25) {
                const s = t / 0.25;
                SPEC_LUT_R[i] = 0; SPEC_LUT_G[i] = 0; SPEC_LUT_B[i] = Math.floor(40 * s);
            } else if (t < 0.5) {
                const s = (t - 0.25) / 0.25;
                SPEC_LUT_R[i] = 0; SPEC_LUT_G[i] = Math.floor(180 * s); SPEC_LUT_B[i] = 40 + Math.floor(60 * s);
            } else if (t < 0.75) {
                const s = (t - 0.5) / 0.25;
                SPEC_LUT_R[i] = Math.floor(255 * s); SPEC_LUT_G[i] = 180 + Math.floor(75 * s); SPEC_LUT_B[i] = Math.floor(100 * (1 - s));
            } else {
                const s = (t - 0.75) / 0.25;
                SPEC_LUT_R[i] = 255; SPEC_LUT_G[i] = 255; SPEC_LUT_B[i] = Math.floor(255 * s);
            }
        }
    })();
    let specColumnData = null;

    function init() {
        spectrogramCanvas = document.getElementById("spectrogram-canvas");
        if (spectrogramCanvas) {
            spectrogramCtx = spectrogramCanvas.getContext("2d");
        }
        stereoCanvas = document.getElementById("stereo-field");
        if (stereoCanvas) {
            stereoCtx = stereoCanvas.getContext("2d");
        }
        waveCanvas = document.getElementById("scope-wave");
        if (waveCanvas) {
            waveCtx = waveCanvas.getContext("2d");
        }
        for (let i = 0; i < 4; i++) {
            vuFills.push(document.getElementById(`vu-${i}`));
        }
        _resize();
        window.addEventListener("resize", _resize);
    }

    function _resize() {
        _resizeCanvas(spectrogramCanvas);
        _resizeCanvas(stereoCanvas);
        _resizeCanvas(waveCanvas);
    }

    function _resizeCanvas(c) {
        if (!c) return;
        const rect = c.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const newW = Math.floor(rect.width * dpr);
        const newH = Math.floor(rect.height * dpr);
        if (Math.abs(c.width - newW) > 2 || Math.abs(c.height - newH) > 2) {
            c.width = newW;
            c.height = newH;
        }
    }

    function _update() {
        const freqData = Player.getFrequencyData();
        const waveData = Player.getTimeDomainData();

        _updateSpectrogram(freqData);
        _updateStereoField();
        _updateWave(waveData);
        _updateVU();

        animId = requestAnimationFrame(_update);
    }

    function _updateSpectrogram(freqData) {
        if (!spectrogramCtx || !spectrogramCanvas || !freqData) return;
        const w = spectrogramCanvas.width;
        const h = spectrogramCanvas.height;
        if (w < 4 || h < 4) return;

        const imgData = spectrogramCtx.getImageData(1, 0, w - 1, h);
        spectrogramCtx.putImageData(imgData, 0, 0);

        if (!specColumnData || specColumnData.height !== h) {
            specColumnData = spectrogramCtx.createImageData(1, h);
        }
        const pixels = specColumnData.data;
        const binCount = freqData.length;
        for (let y = 0; y < h; y++) {
            const normalizedY = 1 - (y / h);
            const binIdx = Math.floor(normalizedY * normalizedY * binCount);
            const val = binIdx < binCount ? freqData[binIdx] : 0;
            const boosted = val * 1.4;
            const idx = boosted < 255 ? (boosted | 0) : 255;
            const off = y << 2;
            pixels[off] = SPEC_LUT_R[idx];
            pixels[off + 1] = SPEC_LUT_G[idx];
            pixels[off + 2] = SPEC_LUT_B[idx];
            pixels[off + 3] = 255;
        }
        spectrogramCtx.putImageData(specColumnData, w - 1, 0);
    }

    function _updateStereoField() {
        if (!stereoCtx || !stereoCanvas) return;
        const w = stereoCanvas.width;
        const h = stereoCanvas.height;
        if (w < 4 || h < 4) return;

        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - 4;

        // Clear fully each frame (no ghost trails that cause split look)
        stereoCtx.fillStyle = "#000014";
        stereoCtx.fillRect(0, 0, w, h);

        // Crosshair
        stereoCtx.strokeStyle = "rgba(34,51,68,0.5)";
        stereoCtx.lineWidth = 1;
        stereoCtx.beginPath();
        stereoCtx.moveTo(cx, 0); stereoCtx.lineTo(cx, h);
        stereoCtx.moveTo(0, cy); stereoCtx.lineTo(w, cy);
        stereoCtx.stroke();

        const stereoVUs = Player.getAllChannelVUStereo();
        const COLORS = ["#4488ff", "#44ddaa", "#ddaa44", "#dd4488"];

        for (let ch = 0; ch < 4; ch++) {
            const sv = stereoVUs[ch];
            if (sv.l < 0.001 && sv.r < 0.001) continue;

            const mid = (sv.l + sv.r) / 2;
            const side = (sv.l - sv.r) / 2;

            // Clamped to stay within the circle
            const px = cx + Math.max(-radius, Math.min(radius, side * radius * 2));
            const py = cy - Math.max(-radius, Math.min(radius, mid * radius * 1.5));

            const dotSize = 1.5 + Math.min(mid * 4, 2.5);
            stereoCtx.fillStyle = COLORS[ch];
            stereoCtx.globalAlpha = 0.9;
            stereoCtx.beginPath();
            stereoCtx.arc(px, py, dotSize, 0, Math.PI * 2);
            stereoCtx.fill();
            stereoCtx.globalAlpha = 1.0;
        }

        // Labels
        const fs = Math.max(7, Math.floor(h / 10));
        stereoCtx.font = `${fs}px monospace`;
        stereoCtx.fillStyle = "#334466";
        stereoCtx.textAlign = "center";
        stereoCtx.fillText("L", 6, cy + 3);
        stereoCtx.fillText("R", w - 6, cy + 3);
        stereoCtx.textAlign = "left";
    }

    function _updateWave(waveData) {
        if (!waveCtx || !waveCanvas || !waveData) return;
        const w = waveCanvas.width;
        const h = waveCanvas.height;
        const mid = h / 2;

        waveCtx.fillStyle = "#000014";
        waveCtx.fillRect(0, 0, w, h);

        // Center line
        waveCtx.strokeStyle = "rgba(34,51,68,0.4)";
        waveCtx.lineWidth = 1;
        waveCtx.beginPath();
        waveCtx.moveTo(0, mid);
        waveCtx.lineTo(w, mid);
        waveCtx.stroke();

        // Waveform with gradient
        waveCtx.strokeStyle = "#4488ff";
        waveCtx.lineWidth = 1.5;
        waveCtx.beginPath();

        const step = waveData.length / w;
        for (let x = 0; x < w; x++) {
            const idx = Math.floor(x * step);
            const val = (waveData[idx] - 128) / 128;
            const y = mid - val * (mid - 2);
            if (x === 0) waveCtx.moveTo(x, y);
            else waveCtx.lineTo(x, y);
        }
        waveCtx.stroke();

        // Filled area under waveform
        waveCtx.fillStyle = "rgba(68,136,255,0.08)";
        waveCtx.beginPath();
        waveCtx.moveTo(0, mid);
        for (let x = 0; x < w; x++) {
            const idx = Math.floor(x * step);
            const val = (waveData[idx] - 128) / 128;
            const y = mid - val * (mid - 2);
            waveCtx.lineTo(x, y);
        }
        waveCtx.lineTo(w, mid);
        waveCtx.closePath();
        waveCtx.fill();
    }

    function _updateVU() {
        for (let ch = 0; ch < 4; ch++) {
            const raw = Player.getChannelVU(ch);
            if (raw > vuSmooth[ch]) {
                vuSmooth[ch] += (raw - vuSmooth[ch]) * VU_ATTACK;
            } else {
                vuSmooth[ch] *= VU_DECAY;
            }
            const pct = Math.min(100, vuSmooth[ch] * 200);
            if (vuFills[ch]) {
                vuFills[ch].style.height = Math.max(0, pct) + "%";
            }
        }
    }

    function start() {
        if (animId) return;
        _resize();
        vuSmooth.fill(0);
        // Clear spectrogram
        if (spectrogramCtx && spectrogramCanvas) {
            spectrogramCtx.fillStyle = "#000014";
            spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        }
        // Clear stereo field
        if (stereoCtx && stereoCanvas) {
            stereoCtx.fillStyle = "#000014";
            stereoCtx.fillRect(0, 0, stereoCanvas.width, stereoCanvas.height);
        }
        animId = requestAnimationFrame(_update);
    }

    function stop() {
        if (animId) {
            cancelAnimationFrame(animId);
            animId = null;
        }
        for (const vu of vuFills) {
            if (vu) vu.style.height = "0%";
        }
        vuSmooth.fill(0);
        if (waveCtx && waveCanvas) {
            waveCtx.fillStyle = "#000014";
            waveCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);
        }
        if (spectrogramCtx && spectrogramCanvas) {
            spectrogramCtx.fillStyle = "#000014";
            spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        }
        if (stereoCtx && stereoCanvas) {
            stereoCtx.fillStyle = "#000014";
            stereoCtx.fillRect(0, 0, stereoCanvas.width, stereoCanvas.height);
        }
    }

    return { init, start, stop };
})();
