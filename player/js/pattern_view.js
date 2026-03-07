/**
 * Pattern View: the centerpiece. Renders a scrolling 4-channel note display
 * with color-coded notes, sample numbers, and decoded effect commands.
 * Shows the full musical score as it plays.
 */
const PatternView = (() => {
    let mod = null;
    let container = null;
    let visibleRows = 6;
    let lastRenderedKey = "";

    function init() {
        container = document.getElementById("pattern-rows");
        _renderEmpty();
    }

    function loadMod(parsedMod) {
        mod = parsedMod;
        lastRenderedKey = "";
    }

    function render(position, row) {
        if (!mod || !container) return;

        const key = `${position}:${row}`;
        if (key === lastRenderedKey) return;
        lastRenderedKey = key;

        const patIdx = position < mod.usedPatternOrder.length
            ? mod.usedPatternOrder[position] : 0;
        if (patIdx >= mod.patterns.length) return;

        const pattern = mod.patterns[patIdx];
        const half = Math.floor(visibleRows / 2);
        const startRow = Math.max(0, row - half);
        const endRow = Math.min(64, startRow + visibleRows);

        let html = "";
        for (let r = startRow; r < endRow; r++) {
            const isCurrent = r === row;
            const cls = isCurrent ? "prow current" : "prow";
            const channels = pattern[r];

            html += `<div class="${cls}">`;
            html += `<span class="p-rn">${r.toString(16).toUpperCase().padStart(2,"0")}</span>`;

            for (let ch = 0; ch < mod.numChannels && ch < 4; ch++) {
                const c = channels[ch];
                const chCls = `p-ch ch${ch+1}`;

                if (c.isEmpty) {
                    html += `<span class="${chCls} empty">--- .. ...</span>`;
                } else {
                    const noteCls = c.note === "---" ? "dim" : "note";
                    const smpCls = c.sampleHex === ".." ? "dim" : "smp";
                    const effCls = c.effectHex === "..." ? "dim" : "eff";

                    html += `<span class="${chCls}">`;
                    html += `<span class="${noteCls}">${c.note}</span> `;
                    html += `<span class="${smpCls}">${c.sampleHex}</span> `;
                    html += `<span class="${effCls}" title="${c.effectName}">${c.effectHex}</span>`;
                    html += `</span>`;
                }
            }
            html += `</div>`;
        }

        container.innerHTML = html;
    }

    function _renderEmpty() {
        if (!container) return;
        let html = "";
        for (let r = 0; r < visibleRows; r++) {
            html += `<div class="prow">`;
            html += `<span class="p-rn">${r.toString(16).toUpperCase().padStart(2,"0")}</span>`;
            for (let ch = 0; ch < 4; ch++) {
                html += `<span class="p-ch ch${ch+1} empty">--- .. ...</span>`;
            }
            html += `</div>`;
        }
        container.innerHTML = html;
    }

    function clear() {
        mod = null;
        lastRenderedKey = "";
        _renderEmpty();
    }

    return { init, loadMod, render, clear };
})();
