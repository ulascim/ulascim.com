/**
 * MOD Player engine wrapping chiptune2.js / libopenmpt.
 * Exposes real per-channel VU, speed, tempo, and BPM
 * directly from the libopenmpt WASM module.
 */
const Player = (() => {
    let chiptunePlayer = null;
    let analyser = null;
    let isPlaying = false;
    let currentPath = null;
    let currentInfo = null;
    let currentBuffer = null;
    let onEndCallback = null;
    let startTime = 0;
    let pauseTime = 0;
    let freqDataBuf = null;
    let timeDomainBuf = null;

    function _modulePtr() {
        if (!chiptunePlayer || !chiptunePlayer.currentPlayingNode) return 0;
        return chiptunePlayer.currentPlayingNode.modulePtr || 0;
    }

    function init() {
        chiptunePlayer = new ChiptuneJsPlayer(new ChiptuneJsConfig(0, 200));
        chiptunePlayer.onEnded(() => {
            isPlaying = false;
            if (onEndCallback) onEndCallback();
        });
        chiptunePlayer.onError((err) => {
            console.error("Chiptune error:", err);
            isPlaying = false;
        });
    }

    function load(relativePath, arrayBuffer) {
        return new Promise((resolve, reject) => {
            if (!chiptunePlayer) init();
            if (isPlaying || chiptunePlayer.currentPlayingNode) {
                try { chiptunePlayer.stop(); } catch (e) { /* ignore */ }
                isPlaying = false;
            }
            _setupAnalyser();

            if (arrayBuffer) {
                currentBuffer = arrayBuffer;
                currentPath = relativePath;
                isPlaying = false;
                pauseTime = 0;
                currentInfo = {
                    title: relativePath.split("/").pop().replace(".mod", ""),
                };
                resolve(currentInfo);
            } else {
                const url = modUrl(relativePath);
                chiptunePlayer.load(url, (buffer) => {
                    currentBuffer = buffer;
                    currentPath = relativePath;
                    isPlaying = false;
                    pauseTime = 0;
                    currentInfo = {
                        title: relativePath.split("/").pop().replace(".mod", ""),
                    };
                    resolve(currentInfo);
                });
            }
        });
    }

    function _setupAnalyser() {
        if (analyser) return;
        try {
            analyser = chiptunePlayer.context.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.6;
        } catch (e) {
            console.warn("Could not create analyser:", e);
        }
    }

    function play() {
        if (!chiptunePlayer || !currentBuffer) return;
        chiptunePlayer.play(currentBuffer);
        isPlaying = true;
        startTime = Date.now();
        pauseTime = 0;

        if (analyser && chiptunePlayer.currentPlayingNode) {
            try {
                chiptunePlayer.currentPlayingNode.connect(analyser);
            } catch (e) { /* already connected */ }
        }

        try {
            const meta = chiptunePlayer.metadata();
            if (meta.title) currentInfo.title = meta.title;
            currentInfo.numOrders = chiptunePlayer.getTotalOrder();
            currentInfo.numPatterns = chiptunePlayer.getTotalPatterns();
        } catch (e) { /* metadata not available */ }
    }

    function stop() {
        if (!chiptunePlayer) return;
        chiptunePlayer.stop();
        isPlaying = false;
        pauseTime = 0;
        startTime = 0;
    }

    function togglePlay() {
        if (!chiptunePlayer) return;
        if (isPlaying) {
            chiptunePlayer.togglePause();
            isPlaying = false;
            pauseTime = Date.now() - startTime;
        } else if (currentBuffer) {
            if (chiptunePlayer.currentPlayingNode) {
                chiptunePlayer.togglePause();
                isPlaying = true;
                startTime = Date.now() - pauseTime;
            } else {
                play();
            }
        }
    }

    function getPosition() {
        const ptr = _modulePtr();
        if (!ptr) return null;
        try {
            return {
                position: libopenmpt._openmpt_module_get_current_order(ptr),
                pattern: libopenmpt._openmpt_module_get_current_pattern(ptr),
                row: libopenmpt._openmpt_module_get_current_row(ptr),
            };
        } catch {
            return null;
        }
    }

    function getChannelVU(ch) {
        const ptr = _modulePtr();
        if (!ptr) return 0;
        try {
            return libopenmpt._openmpt_module_get_current_channel_vu_mono(ptr, ch);
        } catch {
            return 0;
        }
    }

    function getChannelVUStereo(ch) {
        const ptr = _modulePtr();
        if (!ptr) return { left: 0, right: 0 };
        try {
            return {
                left: libopenmpt._openmpt_module_get_current_channel_vu_left(ptr, ch),
                right: libopenmpt._openmpt_module_get_current_channel_vu_right(ptr, ch),
            };
        } catch {
            return { left: 0, right: 0 };
        }
    }

    function getTempo() {
        const ptr = _modulePtr();
        if (!ptr) return { speed: 0, tempo: 0, bpm: 0 };
        try {
            return {
                speed: libopenmpt._openmpt_module_get_current_speed(ptr),
                tempo: libopenmpt._openmpt_module_get_current_tempo(ptr),
                bpm: libopenmpt._openmpt_module_get_current_estimated_bpm(ptr),
            };
        } catch {
            return { speed: 0, tempo: 0, bpm: 0 };
        }
    }

    function getPlayingChannels() {
        const ptr = _modulePtr();
        if (!ptr) return 0;
        try {
            return libopenmpt._openmpt_module_get_current_playing_channels(ptr);
        } catch {
            return 0;
        }
    }

    function getAllChannelVU() {
        const ptr = _modulePtr();
        if (!ptr) return [0, 0, 0, 0];
        try {
            return [
                libopenmpt._openmpt_module_get_current_channel_vu_mono(ptr, 0),
                libopenmpt._openmpt_module_get_current_channel_vu_mono(ptr, 1),
                libopenmpt._openmpt_module_get_current_channel_vu_mono(ptr, 2),
                libopenmpt._openmpt_module_get_current_channel_vu_mono(ptr, 3),
            ];
        } catch {
            return [0, 0, 0, 0];
        }
    }

    function getAllChannelVUStereo() {
        const ptr = _modulePtr();
        if (!ptr) return [{l:0,r:0},{l:0,r:0},{l:0,r:0},{l:0,r:0}];
        try {
            const out = [];
            for (let ch = 0; ch < 4; ch++) {
                out.push({
                    l: libopenmpt._openmpt_module_get_current_channel_vu_left(ptr, ch),
                    r: libopenmpt._openmpt_module_get_current_channel_vu_right(ptr, ch),
                });
            }
            return out;
        } catch {
            return [{l:0,r:0},{l:0,r:0},{l:0,r:0},{l:0,r:0}];
        }
    }

    function getFrequencyData() {
        if (!analyser) return null;
        if (!freqDataBuf || freqDataBuf.length !== analyser.frequencyBinCount) {
            freqDataBuf = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqDataBuf);
        return freqDataBuf;
    }

    function getTimeDomainData() {
        if (!analyser) return null;
        if (!timeDomainBuf || timeDomainBuf.length !== analyser.fftSize) {
            timeDomainBuf = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteTimeDomainData(timeDomainBuf);
        return timeDomainBuf;
    }

    function getCurrentTime() {
        const ptr = _modulePtr();
        if (!ptr) return 0;
        try {
            return libopenmpt._openmpt_module_get_position_seconds(ptr);
        } catch {
            return 0;
        }
    }

    function getDuration() {
        const ptr = _modulePtr();
        if (!ptr) return 0;
        try {
            return libopenmpt._openmpt_module_get_duration_seconds(ptr);
        } catch {
            return 0;
        }
    }

    function onEnd(callback) {
        onEndCallback = callback;
    }

    return {
        init,
        load,
        play,
        stop,
        togglePlay,
        getPosition,
        getChannelVU,
        getChannelVUStereo,
        getAllChannelVU,
        getAllChannelVUStereo,
        getTempo,
        getPlayingChannels,
        getFrequencyData,
        getTimeDomainData,
        getCurrentTime,
        getDuration,
        onEnd,
        get isPlaying() { return isPlaying; },
        get currentPath() { return currentPath; },
        get currentInfo() { return currentInfo; },
        get currentBuffer() { return currentBuffer; },
        get analyserNode() { return analyser; },
    };
})();
