/**
 * Metadata Panel: displays culture mining data and hidden messages
 * for the currently playing file.
 */
const MetadataPanel = (() => {
    const panel = () => document.getElementById("metadata-content");

    function clear() {
        panel().innerHTML = `<div class="meta-placeholder">Load a song to see its hidden messages...</div>`;
    }

    async function loadForFile(relativePath) {
        try {
            const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
            const res = await fetch(`/api/metadata/${encodedPath}`);
            const data = await res.json();

            if (!data.found) {
                panel().innerHTML = `<div class="meta-placeholder">No culture mining data for this file.</div>`;
                return;
            }

            let html = "";

            if (data.message && data.message.trim()) {
                html += _section("Hidden Message", `<div class="meta-value message">${_esc(data.message)}</div>`);
            }

            if (data.full_raw) {
                html += _section("All 31 Sample Slots (Raw)", `<div class="meta-value message" style="font-size:10px">${_esc(data.full_raw)}</div>`);
            }

            const credits = data.credits || {};
            if (credits.has_credits) {
                let c = "";
                if (credits.authors?.length) c += `By: ${credits.authors.map(_esc).join(", ")}<br>`;
                if (credits.sample_sources?.length) c += `Samples: ${credits.sample_sources.map(_esc).join(", ")}<br>`;
                if (credits.derivative_of?.length) c += `Based on: ${credits.derivative_of.map(_esc).join(", ")}`;
                html += _section("Credits", `<div class="meta-value">${c}</div>`);
            }

            const greetings = data.greetings || {};
            if (greetings.has_greeting && greetings.all_targets?.length) {
                const tags = greetings.all_targets.map(t => `<span class="meta-tag">${_esc(t)}</span>`).join("");
                html += _section("Greetings To", `<div class="meta-value">${tags}</div>`);
            }

            const dates = data.dates || {};
            if (dates.has_date) {
                let d = "";
                if (dates.years?.length) d += `Years: ${dates.years.join(", ")}`;
                if (dates.scene_events?.length) {
                    d += `<br>Events: ${dates.scene_events.map(e => _esc(e.event + (e.year ? ` ${e.year}` : ""))).join(", ")}`;
                }
                html += _section("Dates", `<div class="meta-value">${d}</div>`);
            }

            const lang = data.language || {};
            if (lang.language) {
                html += _section("Language", `<div class="meta-value">${lang.language.toUpperCase()} (${lang.method}, ${(lang.confidence * 100).toFixed(0)}%)</div>`);
            }

            const sentiment = data.sentiment || {};
            let sentTags = "";
            if (sentiment.emotions?.length) sentTags += sentiment.emotions.map(e => `<span class="meta-tag">${e}</span>`).join("");
            if (sentiment.profanity?.length) sentTags += sentiment.profanity.map(p => `<span class="meta-tag" style="background:#442222">${_esc(p)}</span>`).join("");
            if (sentiment.scene_slang?.length) sentTags += sentiment.scene_slang.map(s => `<span class="meta-tag" style="background:#224422">${_esc(s)}</span>`).join("");
            if (sentTags) html += _section("Sentiment", `<div class="meta-value">${sentTags}</div>`);

            const contacts = data.contacts || {};
            if (contacts.has_contact) {
                let c = "";
                if (contacts.emails?.length) c += `Email: ${contacts.emails.join(", ")}<br>`;
                if (contacts.phone_numbers?.length) c += `Phone: ${contacts.phone_numbers.join(", ")}<br>`;
                if (contacts.fidonet_addresses?.length) c += `FidoNet: ${contacts.fidonet_addresses.join(", ")}<br>`;
                if (contacts.bbs_references) c += `BBS: mentioned`;
                html += _section("Contact Info", `<div class="meta-value">${c}</div>`);
            }

            html += _section("Stats", `<div class="meta-value" style="font-size:10px">
                Instrument slots: ${data.num_instrument_slots || 0} |
                Message slots: ${data.num_message_slots || 0} |
                Chars: ${data.message_char_count || 0}
            </div>`);

            panel().innerHTML = html || `<div class="meta-placeholder">No hidden messages in this file.</div>`;
        } catch {
            panel().innerHTML = `<div class="meta-placeholder">Could not load metadata.</div>`;
        }
    }

    function _section(label, content) {
        return `<div class="meta-section"><div class="meta-label">${label}</div>${content}</div>`;
    }

    function _esc(str) {
        const d = document.createElement("div");
        d.textContent = str || "";
        return d.innerHTML;
    }

    return { clear, loadForFile };
})();
