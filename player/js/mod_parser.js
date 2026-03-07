/**
 * Deep MOD file parser. Extracts every possible piece of information
 * from the raw binary: header, all 31 sample descriptors, pattern order,
 * full pattern data with decoded effects, and raw sample PCM data.
 */
const ModParser = (() => {

    const NOTES = ["C-","C#","D-","D#","E-","F-","F#","G-","G#","A-","A#","B-"];

    const PERIOD_TABLE = [
        1712,1616,1525,1440,1357,1281,1209,1141,1077,1017, 961, 907,
         856, 808, 762, 720, 679, 640, 604, 570, 538, 508, 480, 453,
         428, 404, 381, 360, 340, 320, 302, 285, 269, 254, 240, 226,
         214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
         107, 101,  95,  90,  85,  80,  76,  71,  67,  64,  60,  57,
    ];

    const EFFECT_NAMES = {
        0x0: "Arpeggio",
        0x1: "Slide Up",
        0x2: "Slide Down",
        0x3: "Tone Porta",
        0x4: "Vibrato",
        0x5: "Tone+VolSlide",
        0x6: "Vibr+VolSlide",
        0x7: "Tremolo",
        0x8: "Set Panning",
        0x9: "Sample Offset",
        0xA: "Volume Slide",
        0xB: "Position Jump",
        0xC: "Set Volume",
        0xD: "Pattern Break",
        0xE: "Extended",
        0xF: "Set Speed/Tempo",
    };

    const EXTENDED_EFFECTS = {
        0x0: "Filter On/Off",
        0x1: "Fine Slide Up",
        0x2: "Fine Slide Down",
        0x3: "Glissando Ctrl",
        0x4: "Vibrato Wave",
        0x5: "Set Finetune",
        0x6: "Pattern Loop",
        0x7: "Tremolo Wave",
        0x8: "Karplus Strong",
        0x9: "Retrigger Note",
        0xA: "Fine VolSlide Up",
        0xB: "Fine VolSlide Dn",
        0xC: "Note Cut",
        0xD: "Note Delay",
        0xE: "Pattern Delay",
        0xF: "Invert Loop",
    };

    function parse(buffer) {
        const data = new Uint8Array(buffer);
        if (data.length < 1084) return null;

        const mod = {};

        // Title (bytes 0-19)
        mod.title = _readString(data, 0, 20);

        // 31 Sample descriptors (bytes 20-949)
        mod.samples = [];
        let sampleDataOffset = 0;
        let offset = 20;
        for (let i = 0; i < 31; i++) {
            const name = _readString(data, offset, 22);
            const length = (data[offset+22] << 8 | data[offset+23]) * 2;
            const finetune = data[offset+24] & 0x0F;
            const finetuneS = finetune > 7 ? finetune - 16 : finetune;
            const volume = data[offset+25];
            const loopStart = (data[offset+26] << 8 | data[offset+27]) * 2;
            const loopLength = (data[offset+28] << 8 | data[offset+29]) * 2;
            const hasLoop = loopLength > 2;

            mod.samples.push({
                index: i + 1,
                name,
                length,
                finetune: finetuneS,
                volume,
                loopStart,
                loopLength,
                hasLoop,
                hasData: length > 0,
                pcmOffset: 0,
            });
            offset += 30;
        }

        // Song length (byte 950)
        mod.songLength = data[950];

        // Restart position (byte 951) - used by some trackers
        mod.restartPos = data[951];

        // Pattern order table (bytes 952-1079)
        mod.patternOrder = Array.from(data.slice(952, 952 + 128));
        mod.usedPatternOrder = mod.patternOrder.slice(0, mod.songLength);

        // Format tag (bytes 1080-1083)
        mod.formatTag = _readString(data, 1080, 4);
        mod.numChannels = 4;
        if (mod.formatTag === "6CHN") mod.numChannels = 6;
        if (mod.formatTag === "8CHN") mod.numChannels = 8;

        // Number of patterns
        mod.numPatterns = Math.max(...mod.usedPatternOrder) + 1;

        // Parse all pattern data
        const patternDataStart = 1084;
        const bytesPerRow = mod.numChannels * 4;
        const bytesPerPattern = 64 * bytesPerRow;

        mod.patterns = [];
        for (let p = 0; p < mod.numPatterns; p++) {
            const rows = [];
            for (let r = 0; r < 64; r++) {
                const channels = [];
                for (let ch = 0; ch < mod.numChannels; ch++) {
                    const i = patternDataStart + p * bytesPerPattern + r * bytesPerRow + ch * 4;
                    if (i + 3 >= data.length) {
                        channels.push(_emptyCell());
                        continue;
                    }
                    channels.push(_parseCell(data[i], data[i+1], data[i+2], data[i+3]));
                }
                rows.push(channels);
            }
            mod.patterns.push(rows);
        }

        // Calculate sample PCM offsets and extract waveform previews
        let pcmStart = patternDataStart + mod.numPatterns * bytesPerPattern;
        for (const s of mod.samples) {
            s.pcmOffset = pcmStart;
            if (s.length > 0 && pcmStart + s.length <= data.length) {
                s.pcmData = data.slice(pcmStart, pcmStart + s.length);
            }
            pcmStart += s.length;
        }

        // File stats
        mod.fileSize = data.length;
        mod.totalSampleBytes = mod.samples.reduce((sum, s) => sum + s.length, 0);
        mod.samplesWithData = mod.samples.filter(s => s.hasData).length;
        mod.totalPatternBytes = mod.numPatterns * bytesPerPattern;

        // Hidden data after sample area
        const expectedEnd = patternDataStart + mod.numPatterns * bytesPerPattern + mod.totalSampleBytes;
        mod.hasHiddenData = data.length > expectedEnd + 4;
        mod.hiddenDataSize = Math.max(0, data.length - expectedEnd);

        // Effect usage statistics
        mod.effectStats = _countEffects(mod.patterns);

        return mod;
    }

    function _parseCell(b0, b1, b2, b3) {
        const sampleNum = (b0 & 0xF0) | ((b2 & 0xF0) >> 4);
        const period = ((b0 & 0x0F) << 8) | b1;
        const effectType = b2 & 0x0F;
        const effectVal = b3;

        const note = _periodToNote(period);
        const effectHex = effectType.toString(16).toUpperCase() +
                          effectVal.toString(16).toUpperCase().padStart(2, "0");

        let effectName = "";
        if (effectType > 0 || effectVal > 0) {
            if (effectType === 0xE) {
                const subType = (effectVal >> 4) & 0xF;
                effectName = EXTENDED_EFFECTS[subType] || `E${subType.toString(16).toUpperCase()}?`;
            } else {
                effectName = EFFECT_NAMES[effectType] || `?${effectType.toString(16).toUpperCase()}`;
            }
        }

        return {
            period,
            note,
            sampleNum,
            sampleHex: sampleNum > 0 ? sampleNum.toString(16).toUpperCase().padStart(2, "0") : "..",
            effectType,
            effectVal,
            effectHex: (effectType > 0 || effectVal > 0) ? effectHex : "...",
            effectName,
            isEmpty: period === 0 && sampleNum === 0 && effectType === 0 && effectVal === 0,
            rawBytes: [b0, b1, b2, b3],
        };
    }

    function _emptyCell() {
        return {
            period: 0, note: "---", sampleNum: 0, sampleHex: "..",
            effectType: 0, effectVal: 0, effectHex: "...", effectName: "",
            isEmpty: true, rawBytes: [0,0,0,0],
        };
    }

    function _periodToNote(period) {
        if (period === 0) return "---";
        let closest = 0, minDiff = 99999;
        for (let i = 0; i < PERIOD_TABLE.length; i++) {
            const diff = Math.abs(PERIOD_TABLE[i] - period);
            if (diff < minDiff) { minDiff = diff; closest = i; }
        }
        if (minDiff > 30) return "???";
        return NOTES[closest % 12] + (Math.floor(closest / 12) + 1);
    }

    function _readString(data, offset, length) {
        let s = "";
        for (let i = 0; i < length; i++) {
            const c = data[offset + i];
            s += (c >= 32 && c < 127) ? String.fromCharCode(c) : "";
        }
        return s.trim();
    }

    function _countEffects(patterns) {
        const counts = {};
        for (const pat of patterns) {
            for (const row of pat) {
                for (const cell of row) {
                    if (cell.effectType > 0 || cell.effectVal > 0) {
                        const key = cell.effectType;
                        counts[key] = (counts[key] || 0) + 1;
                    }
                }
            }
        }
        return Object.entries(counts)
            .map(([k, v]) => ({ type: parseInt(k), name: EFFECT_NAMES[parseInt(k)] || "?", count: v }))
            .sort((a, b) => b.count - a.count);
    }

    return { parse, EFFECT_NAMES, EXTENDED_EFFECTS };
})();
