/**
 * Sample Table: all 31 sample slots with name, length, volume,
 * loop indicator, and waveform thumbnail.
 */
const SampleTable = (() => {
    const container = () => document.getElementById("sample-rows");

    function render(mod) {
        if (!mod) return;
        const el = container();
        let html = "";

        for (const s of mod.samples) {
            const cls = s.hasData ? "sample-row has-data" : "sample-row no-data";
            const num = s.index.toString().padStart(2, "0");
            const len = s.hasData ? _formatBytes(s.length) : "---";
            const vol = s.hasData ? s.volume.toString().padStart(2, " ") : "--";
            const loop = s.hasLoop ? "LP" : "--";
            const name = s.name || (s.hasData ? "(unnamed)" : "");

            html += `<div class="${cls}">`;
            html += `<span class="s-num">${num}</span>`;
            html += `<span class="s-name" title="${_esc(s.name)}">${_esc(name)}</span>`;
            html += `<span class="s-len">${len}</span>`;
            html += `<span class="s-vol">${vol}</span>`;
            html += `<span class="s-loop">${loop}</span>`;
            html += `<span class="s-wave"><canvas class="wave-thumb" data-idx="${s.index - 1}" width="200" height="44"></canvas></span>`;
            html += `</div>`;
        }

        el.innerHTML = html;
        requestAnimationFrame(() => _drawAllWaveforms(mod));
    }

    function _drawAllWaveforms(mod) {
        const canvases = document.querySelectorAll(".wave-thumb");
        for (const canvas of canvases) {
            const idx = parseInt(canvas.dataset.idx);
            const sample = mod.samples[idx];
            if (!sample || !sample.pcmData || sample.pcmData.length === 0) {
                _drawEmptyWave(canvas);
                continue;
            }
            _drawWaveform(canvas, sample);
        }
    }

    function _drawWaveform(canvas, sample) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        const mid = h / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#000018";
        ctx.fillRect(0, 0, w, h);

        // Center line
        ctx.strokeStyle = "#1a1a33";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
        ctx.stroke();

        // Loop region highlight
        if (sample.hasLoop && sample.length > 0) {
            const loopStartX = (sample.loopStart / sample.length) * w;
            const loopEndX = ((sample.loopStart + sample.loopLength) / sample.length) * w;
            ctx.fillStyle = "rgba(68, 136, 255, 0.12)";
            ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, h);
            // Loop markers
            ctx.strokeStyle = "rgba(68, 136, 255, 0.4)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(loopStartX, 0); ctx.lineTo(loopStartX, h);
            ctx.moveTo(loopEndX, 0); ctx.lineTo(loopEndX, h);
            ctx.stroke();
        }

        // Draw filled waveform (envelope style)
        const pcm = sample.pcmData;
        const color = sample.hasLoop ? "#4488ff" : "#44dd44";
        const fillColor = sample.hasLoop ? "rgba(68,136,255,0.15)" : "rgba(68,221,68,0.15)";

        // Min/max envelope per pixel column
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        for (let x = 0; x < w; x++) {
            const sStart = Math.floor((x / w) * pcm.length);
            const sEnd = Math.floor(((x + 1) / w) * pcm.length);
            let maxVal = -128;
            for (let s = sStart; s < sEnd && s < pcm.length; s++) {
                let v = pcm[s];
                if (v > 127) v -= 256;
                if (v > maxVal) maxVal = v;
            }
            const y = mid - (maxVal / 128) * (mid - 1);
            ctx.lineTo(x, y);
        }
        // Return along bottom envelope
        for (let x = w - 1; x >= 0; x--) {
            const sStart = Math.floor((x / w) * pcm.length);
            const sEnd = Math.floor(((x + 1) / w) * pcm.length);
            let minVal = 127;
            for (let s = sStart; s < sEnd && s < pcm.length; s++) {
                let v = pcm[s];
                if (v > 127) v -= 256;
                if (v < minVal) minVal = v;
            }
            const y = mid - (minVal / 128) * (mid - 1);
            ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        // Draw center line of waveform
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const sIdx = Math.floor((x / w) * pcm.length);
            let val = pcm[sIdx];
            if (val > 127) val -= 256;
            const y = mid - (val / 128) * (mid - 1);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    function _drawEmptyWave(canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000012";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#111128";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }

    function clear() {
        const el = container();
        if (el) el.innerHTML = "";
    }

    function _formatBytes(bytes) {
        if (bytes >= 65536) return (bytes / 1024).toFixed(1) + "K";
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + "K";
        return bytes.toString();
    }

    function _esc(str) {
        const d = document.createElement("div");
        d.textContent = str || "";
        return d.innerHTML.replace(/"/g, "&quot;");
    }

    return { render, clear };
})();
