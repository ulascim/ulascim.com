/**
 * Position Map: visual overview of the song structure.
 * Each position is a colored cell showing its pattern number.
 * The current position is highlighted. Clicking jumps to that position.
 * Repeated patterns share colors to reveal song form (verse/chorus/bridge).
 */
const PositionMap = (() => {
    let container = null;
    let infoEl = null;
    let currentPos = -1;
    let mod = null;

    const PATTERN_COLORS = [
        "#4488ff", "#44dd44", "#ddaa44", "#dd4488",
        "#44dddd", "#dd44dd", "#88dd44", "#ff8844",
        "#8888ff", "#88ffaa", "#ffdd44", "#ff88aa",
        "#44aaff", "#aaff44", "#ffaa44", "#ff44aa",
        "#6666cc", "#66cc66", "#cccc66", "#cc6666",
        "#66cccc", "#cc66cc", "#99cc33", "#cc9933",
        "#5577bb", "#55bb77", "#bbbb55", "#bb5577",
        "#55bbbb", "#bb55bb", "#77bb55", "#bb7755",
    ];

    function init() {
        container = document.getElementById("position-cells");
        infoEl = document.getElementById("pos-info");
    }

    function render(parsedMod) {
        mod = parsedMod;
        if (!mod || !container) return;

        infoEl.textContent = `(${mod.songLength} positions, ${mod.numPatterns} unique patterns)`;

        let html = "";
        for (let i = 0; i < mod.songLength; i++) {
            const pat = mod.usedPatternOrder[i];
            const color = PATTERN_COLORS[pat % PATTERN_COLORS.length];
            const cls = i === currentPos ? "pos-cell current" : "pos-cell";
            html += `<div class="${cls}" data-pos="${i}" style="background:${color}" title="Pos ${i}: Pattern ${pat}">${pat.toString(16).toUpperCase().padStart(2,"0")}</div>`;
        }
        container.innerHTML = html;

        container.querySelectorAll(".pos-cell").forEach(cell => {
            cell.addEventListener("click", () => {
                // Could emit a seek event in the future
            });
        });
    }

    function update(position) {
        if (position === currentPos) return;
        currentPos = position;
        if (!container) return;

        container.querySelectorAll(".pos-cell").forEach(cell => {
            const pos = parseInt(cell.dataset.pos);
            cell.classList.toggle("current", pos === position);
        });

        // Scroll the current cell into view
        const currentCell = container.querySelector(".pos-cell.current");
        if (currentCell) {
            currentCell.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    function clear() {
        if (container) container.innerHTML = "";
        if (infoEl) infoEl.textContent = "";
        currentPos = -1;
        mod = null;
    }

    return { init, render, update, clear };
})();
