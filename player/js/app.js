/**
 * Main application controller.
 * Wires together all modules: Player, ModParser, PatternView,
 * SampleTable, PositionMap, ChannelStrips, Spectrum, FileBrowser, MetadataPanel, Transport.
 */
const App = (() => {
    let updateInterval = null;
    let currentMod = null;
    let sampleNames = [];
    let sampleCycleIdx = 0;
    let sampleCycleInterval = null;

    async function init() {
        _setLoadingStatus("Initializing...");

        PatternView.init();
        Spectrum.init();
        ChannelStrips.init();
        PositionMap.init();

        FileBrowser.init(onFileSelected);
        Transport.init(onTransportAction);

        Player.onEnd(() => {
            if (Transport.isShuffleOn()) {
                onTransportAction("random");
            } else {
                onTransportAction("next");
            }
        });

        await _waitForStats();
        _hideLoading();
    }

    async function _waitForStats() {
        try {
            const res = await fetch(apiUrl("/api/stats"));
            const stats = await res.json();
            _setLoadingStatus(`Ready: ${stats.total_files.toLocaleString()} files, ${stats.total_artists.toLocaleString()} artists`);
            await new Promise(r => setTimeout(r, 400));
        } catch {
            _setLoadingStatus("Backend not ready, retrying...");
            await new Promise(r => setTimeout(r, 2000));
            return _waitForStats();
        }
    }

    async function onFileSelected(relativePath) {
        try {
            // Stop any current playback FIRST to prevent overlapping audio
            Player.stop();
            Spectrum.stop();
            ChannelStrips.stop();
            _stopUpdateLoop();

            document.getElementById("display-samplename").textContent = "Loading...";

            const modRes = await fetch(modUrl(relativePath));
            if (!modRes.ok) throw new Error(`HTTP ${modRes.status} for ${relativePath}`);
            const modBuffer = await modRes.arrayBuffer();

            // Deep parse: extract every piece of information
            currentMod = ModParser.parse(modBuffer);

            if (!currentMod) {
                document.getElementById("display-samplename").textContent = "Error: Not a valid MOD file";
                return;
            }

            // Load into chiptune2.js for audio playback
            await Player.load(relativePath);

            // Populate all visual components from the parsed data
            _populateSongInfo(relativePath, currentMod);
            SampleTable.render(currentMod);
            PositionMap.render(currentMod);
            PatternView.loadMod(currentMod);
            ChannelStrips.loadMod(currentMod);

            // Start playback
            Player.play();

            FileBrowser.setPlaying(relativePath);
            MetadataPanel.loadForFile(relativePath);

            Spectrum.start();
            ChannelStrips.start();
            _startUpdateLoop();
            _startSampleCycle(currentMod);

        } catch (err) {
            console.error("Failed to load:", err);
            document.getElementById("display-samplename").textContent = "Error: " + err.message;
        }
    }

    function _populateSongInfo(path, mod) {
        const parts = path.split("/");
        const artist = parts.length > 1 ? parts[0] : "Unknown";
        const filename = parts[parts.length - 1];

        document.getElementById("display-songname").textContent =
            `${artist} - ${mod.title || filename.replace(".mod", "")}`;

        document.getElementById("si-format").textContent = mod.formatTag;
        document.getElementById("si-title").textContent = mod.title || "(untitled)";
        document.getElementById("si-filesize").textContent = _formatBytes(mod.fileSize);
        document.getElementById("si-channels").textContent = mod.numChannels;
        document.getElementById("si-positions").textContent = mod.songLength;
        document.getElementById("si-patterns").textContent = mod.numPatterns;
        document.getElementById("si-samples-used").textContent =
            `${mod.samplesWithData} / 31`;
        document.getElementById("si-sample-bytes").textContent =
            _formatBytes(mod.totalSampleBytes);

        // Effect usage summary in sample name bar
        const topEffects = mod.effectStats.slice(0, 3)
            .map(e => `${e.name}(${e.count})`).join(", ");
        if (topEffects) {
            document.getElementById("display-samplename").textContent =
                `Effects: ${topEffects}`;
        }
    }

    function _startSampleCycle(mod) {
        if (sampleCycleInterval) clearInterval(sampleCycleInterval);
        const nonEmpty = mod.samples.filter(s => s.name);
        if (nonEmpty.length === 0) return;

        sampleCycleIdx = 0;
        _showSampleName(nonEmpty[0]);

        sampleCycleInterval = setInterval(() => {
            sampleCycleIdx = (sampleCycleIdx + 1) % nonEmpty.length;
            _showSampleName(nonEmpty[sampleCycleIdx]);
        }, 2000);
    }

    function _showSampleName(sample) {
        const prefix = sample.index.toString().padStart(2, "0");
        const vol = `v${sample.volume.toString().padStart(2, "0")}`;
        const len = sample.hasData ? _formatBytes(sample.length) : "---";
        const loop = sample.hasLoop ? " [LOOP]" : "";
        document.getElementById("display-samplename").textContent =
            `${prefix}: ${sample.name}  ${vol}  ${len}${loop}`;
    }

    async function onTransportAction(action) {
        switch (action) {
            case "play":
                if (Player.currentPath) {
                    Player.togglePlay();
                    if (Player.isPlaying) {
                        Spectrum.start();
                        ChannelStrips.start();
                        _startUpdateLoop();
                    } else {
                        Spectrum.stop();
                        ChannelStrips.stop();
                        _stopUpdateLoop();
                    }
                }
                break;

            case "stop":
                Player.stop();
                Spectrum.stop();
                ChannelStrips.stop();
                _stopUpdateLoop();
                PatternView.clear();
                PositionMap.clear();
                SampleTable.clear();
                _clearSongInfo();
                break;

            case "next": {
                const next = FileBrowser.getNextFile(Player.currentPath);
                if (next) onFileSelected(next);
                else if (Transport.isShuffleOn()) onTransportAction("random");
                break;
            }

            case "prev": {
                const prev = FileBrowser.getPrevFile(Player.currentPath);
                if (prev) onFileSelected(prev);
                break;
            }

            case "random": {
                try {
                    const res = await fetch("/api/random");
                    const data = await res.json();
                    if (data.files?.length) {
                        onFileSelected(data.files[0].path);
                    }
                } catch (err) {
                    console.error("Random failed:", err);
                }
                break;
            }

            case "shuffle-toggle":
                break;
        }
    }

    function _startUpdateLoop() {
        if (updateInterval) return;
        updateInterval = setInterval(_updateDisplay, 50);
    }

    function _stopUpdateLoop() {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }

    function _updateDisplay() {
        const pos = Player.getPosition();
        if (pos) {
            document.getElementById("val-pos").textContent =
                pos.position.toString().padStart(2, "0");
            document.getElementById("val-pattern").textContent =
                pos.pattern.toString().padStart(2, "0");
            document.getElementById("val-row").textContent =
                pos.row.toString().padStart(2, "0");

            PatternView.render(pos.position, pos.row);
            PositionMap.update(pos.position);
        }

        // Real speed/tempo/BPM from libopenmpt
        const tempo = Player.getTempo();
        if (tempo.speed > 0) {
            document.getElementById("val-speed").textContent = tempo.speed;
            document.getElementById("val-tempo").textContent = tempo.tempo;
            const siTempo = document.getElementById("si-tempo");
            if (siTempo) {
                siTempo.textContent = `${tempo.tempo} / ${tempo.speed}` +
                    (tempo.bpm > 0 ? ` (${tempo.bpm.toFixed(1)} BPM)` : "");
            }
        }

        const elapsed = Player.getCurrentTime();
        const duration = Player.getDuration();
        const eMins = Math.floor(elapsed / 60).toString().padStart(2, "0");
        const eSecs = Math.floor(elapsed % 60).toString().padStart(2, "0");
        const dMins = Math.floor(duration / 60).toString().padStart(2, "0");
        const dSecs = Math.floor(duration % 60).toString().padStart(2, "0");
        document.getElementById("display-time").textContent =
            `${eMins}:${eSecs} / ${dMins}:${dSecs}`;
    }

    function _clearSongInfo() {
        document.getElementById("display-songname").textContent = "No song loaded";
        document.getElementById("display-time").textContent = "00:00 / 00:00";
        document.getElementById("val-pos").textContent = "00";
        document.getElementById("val-pattern").textContent = "00";
        document.getElementById("val-row").textContent = "00";
        if (sampleCycleInterval) clearInterval(sampleCycleInterval);
        document.getElementById("display-samplename").textContent = "RetroPlayer v1.0";

        ["si-format","si-title","si-filesize","si-channels","si-positions","si-patterns","si-tempo","si-samples-used","si-sample-bytes"]
            .forEach(id => document.getElementById(id).textContent = "---");

        MetadataPanel.clear();
        currentMod = null;
    }

    function _formatBytes(bytes) {
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
        return bytes + " B";
    }

    function _setLoadingStatus(text) {
        const el = document.getElementById("loading-status");
        if (el) el.textContent = text;
    }

    function _hideLoading() {
        const el = document.getElementById("loading");
        if (el) el.classList.add("hidden");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    return { onFileSelected };
})();
