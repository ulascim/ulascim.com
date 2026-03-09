/**
 * File Browser with client-side instant search and virtual scroll.
 *
 * On init, fetches a compact search index (~80k entries as parallel arrays).
 * All filtering happens in-memory — zero server round-trips after load.
 * Only visible DOM rows are rendered (virtual scroll).
 */
const FileBrowser = (() => {
    // Full index (parallel arrays, same length)
    let idxPaths = [];
    let idxArtists = [];
    let idxTitles = [];
    let idxLower = [];  // pre-lowercased "artist\0title" for fast search

    // Artist grouping
    let artistNames = [];
    let artistCounts = {};

    // Current view
    let viewItems = [];   // [{path, artist, title, isArtist}]
    let mode = "artists"; // "artists" | "files" | "search" | "top100"
    let currentArtist = null;
    let currentPlayingPath = null;
    let onFileSelect = null;
    let selectedIdx = -1;
    let top100Data = null;
    let curatedLists = null;

    // Virtual scroll
    const ROW_HEIGHT = 20;
    let scrollContainer = null;
    let innerEl = null;
    let visibleStart = 0;
    let visibleEnd = 0;

    const listEl = () => document.getElementById("file-list");
    const searchEl = () => document.getElementById("search-box");

    function init(callback) {
        onFileSelect = callback;

        document.getElementById("btn-artists").addEventListener("click", showArtists);
        document.getElementById("btn-back").addEventListener("click", goBack);

        const listsBtn = document.getElementById("btn-lists");
        const dropdown = document.getElementById("lists-dropdown");
        listsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdown.classList.toggle("hidden");
        });
        document.addEventListener("click", () => dropdown.classList.add("hidden"));
        dropdown.addEventListener("click", (e) => e.stopPropagation());

        scrollContainer = listEl();
        _setupVirtualScroll();

        const search = searchEl();
        search.addEventListener("input", _onSearchInput);
        search.addEventListener("keydown", _onSearchKey);

        _loadIndex();
        _loadCuratedLists();
    }

    async function _loadCuratedLists() {
        try {
            const res = await fetch("/data/curated_lists.json");
            curatedLists = await res.json();
            _buildDropdown();
        } catch (e) {
            console.warn("Curated lists not available, trying top100.json fallback");
            try {
                const res2 = await fetch("/data/top100.json");
                top100Data = await res2.json();
                _buildDropdownFallback();
            } catch (e2) {
                console.warn("No curated data available");
            }
        }
    }

    const ICONS = {
        star: "\u2605", download: "\u2B07", heart: "\u2665",
        comment: "\u270E", gem: "\u25C6", genre: "\u266B",
    };

    function _buildDropdown() {
        const curatedEl = document.getElementById("lists-dropdown-curated");
        const genresEl = document.getElementById("lists-dropdown-genres");
        curatedEl.innerHTML = "";
        genresEl.innerHTML = "";

        for (const list of curatedLists.lists) {
            const item = document.createElement("div");
            item.className = "dropdown-item";
            const icon = ICONS[list.icon] || "\u266B";
            const count = list.tracks.length;
            item.innerHTML = `<span class="dd-icon">${icon}</span>${_esc(list.name)} <span class="dim">(${count})</span>`;
            item.addEventListener("click", () => {
                _showCuratedList(list);
                document.getElementById("lists-dropdown").classList.add("hidden");
            });

            if (list.is_genre) {
                genresEl.appendChild(item);
            } else {
                curatedEl.appendChild(item);
            }
        }
    }

    function _buildDropdownFallback() {
        const curatedEl = document.getElementById("lists-dropdown-curated");
        curatedEl.innerHTML = "";
        const item = document.createElement("div");
        item.className = "dropdown-item";
        item.innerHTML = `<span class="dd-icon">\u2605</span>Top 100 (Most Revered)`;
        item.addEventListener("click", () => {
            _showTop100Fallback();
            document.getElementById("lists-dropdown").classList.add("hidden");
        });
        curatedEl.appendChild(item);
    }

    function _showCuratedList(list) {
        mode = "top100";
        currentArtist = null;
        selectedIdx = -1;
        searchEl().value = "";

        viewItems = list.tracks.map((t, i) => ({
            path: t.path,
            artist: t.artist || t.path.split("/")[0],
            title: t.title || t.path.split("/").pop().replace(".mod", ""),
            stat: t.stat || "",
            isArtist: false,
            isCurated: true,
        }));
        _setView();
    }

    function _showTop100Fallback() {
        if (!top100Data || !top100Data.tracks) return;
        mode = "top100";
        currentArtist = null;
        selectedIdx = -1;
        searchEl().value = "";

        viewItems = top100Data.tracks.map((t, i) => ({
            path: t.path,
            artist: t.path.split("/")[0],
            title: `#${t.rank} ${t.path.split("/").pop().replace(".mod", "")}`,
            isArtist: false,
        }));
        _setView();
    }

    function _setupVirtualScroll() {
        scrollContainer.innerHTML = "";
        scrollContainer.style.position = "relative";

        innerEl = document.createElement("div");
        innerEl.style.position = "relative";
        innerEl.style.width = "100%";
        scrollContainer.appendChild(innerEl);

        scrollContainer.addEventListener("scroll", _renderVisible, { passive: true });
    }

    async function _loadIndex() {
        try {
            const res = await fetch(apiUrl("/api/search-index"));
            const data = await res.json();
            idxPaths = data.paths;
            idxArtists = data.artists;
            idxTitles = data.titles;

            // Pre-build lowercase search strings
            idxLower = new Array(idxPaths.length);
            for (let i = 0; i < idxPaths.length; i++) {
                idxLower[i] = idxArtists[i].toLowerCase() + "\0" + idxTitles[i].toLowerCase();
            }

            // Build artist grouping
            artistCounts = {};
            for (let i = 0; i < idxArtists.length; i++) {
                const a = idxArtists[i];
                artistCounts[a] = (artistCounts[a] || 0) + 1;
            }
            artistNames = Object.keys(artistCounts).sort((a, b) =>
                a.toLowerCase().localeCompare(b.toLowerCase())
            );

            showArtists();
        } catch (err) {
            console.error("Failed to load search index:", err);
            // Fallback: try old paginated API
            _loadArtistsFallback();
        }
    }

    async function _loadArtistsFallback() {
        let page = 0;
        const all = [];
        while (true) {
            const res = await fetch(`/api/artists?page=${page}&per_page=500`);
            const data = await res.json();
            for (const a of data.artists) {
                all.push(a.name);
                artistCounts[a.name] = a.file_count;
            }
            if (all.length >= data.total) break;
            page++;
        }
        artistNames = all;
        showArtists();
    }

    // --- Search ---

    function _onSearchInput() {
        const q = searchEl().value.trim();
        if (q.length === 0) {
            if (currentArtist) {
                _showArtistFiles(currentArtist);
            } else {
                showArtists();
            }
            return;
        }
        _doClientSearch(q);
    }

    function _onSearchKey(e) {
        if (e.key === "Escape") {
            searchEl().value = "";
            searchEl().blur();
            if (currentArtist) {
                _showArtistFiles(currentArtist);
            } else {
                showArtists();
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            _moveSelection(1);
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            _moveSelection(-1);
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            _activateSelected();
            return;
        }
    }

    function _doClientSearch(query) {
        const q = query.toLowerCase();
        const tokens = q.split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) {
            showArtists();
            return;
        }

        mode = "search";
        currentArtist = null;
        selectedIdx = -1;

        // Search: all tokens must match somewhere in the combined string
        const results = [];
        const limit = 500;
        for (let i = 0; i < idxLower.length; i++) {
            const s = idxLower[i];
            let match = true;
            for (let t = 0; t < tokens.length; t++) {
                if (s.indexOf(tokens[t]) === -1) {
                    match = false;
                    break;
                }
            }
            if (match) {
                results.push({
                    path: idxPaths[i],
                    artist: idxArtists[i],
                    title: idxTitles[i],
                    isArtist: false,
                });
                if (results.length >= limit) break;
            }
        }

        // Also search artist names
        const artistMatches = [];
        for (const name of artistNames) {
            const nl = name.toLowerCase();
            let match = true;
            for (const t of tokens) {
                if (nl.indexOf(t) === -1) { match = false; break; }
            }
            if (match) {
                artistMatches.push({
                    path: null,
                    artist: name,
                    title: null,
                    isArtist: true,
                    count: artistCounts[name],
                });
            }
        }

        viewItems = [...artistMatches, ...results];
        _setView();
    }

    // --- Artist / File views ---

    function showArtists() {
        mode = "artists";
        currentArtist = null;
        selectedIdx = -1;
        viewItems = artistNames.map(name => ({
            path: null,
            artist: name,
            title: null,
            isArtist: true,
            count: artistCounts[name],
        }));
        _setView();
    }

    function _showArtistFiles(artist) {
        mode = "files";
        currentArtist = artist;
        selectedIdx = -1;
        const files = [];
        for (let i = 0; i < idxPaths.length; i++) {
            if (idxArtists[i] === artist) {
                files.push({
                    path: idxPaths[i],
                    artist: idxArtists[i],
                    title: idxTitles[i],
                    isArtist: false,
                });
            }
        }
        viewItems = files;
        _setView();
    }

    // --- Virtual scroll rendering ---

    function _setView() {
        innerEl.style.height = (viewItems.length * ROW_HEIGHT) + "px";
        // Clear existing rendered rows
        while (innerEl.firstChild) innerEl.removeChild(innerEl.firstChild);
        visibleStart = -1;
        visibleEnd = -1;
        scrollContainer.scrollTop = 0;
        _renderVisible();
    }

    function _renderVisible() {
        const scrollTop = scrollContainer.scrollTop;
        const containerH = scrollContainer.clientHeight;
        const newStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
        const newEnd = Math.min(viewItems.length, Math.ceil((scrollTop + containerH) / ROW_HEIGHT) + 3);

        if (newStart === visibleStart && newEnd === visibleEnd) return;

        // Remove rows outside new range
        while (innerEl.firstChild) innerEl.removeChild(innerEl.firstChild);

        const frag = document.createDocumentFragment();
        for (let i = newStart; i < newEnd; i++) {
            frag.appendChild(_createRow(i));
        }
        innerEl.appendChild(frag);

        visibleStart = newStart;
        visibleEnd = newEnd;
    }

    function _createRow(idx) {
        const item = viewItems[idx];
        const row = document.createElement("div");
        row.className = "file-item";
        row.style.position = "absolute";
        row.style.top = (idx * ROW_HEIGHT) + "px";
        row.style.left = "0";
        row.style.right = "0";
        row.style.height = ROW_HEIGHT + "px";
        row.style.lineHeight = ROW_HEIGHT + "px";

        if (item.isArtist) {
            row.innerHTML = `<span class="artist-name">${_esc(item.artist)}</span> <span class="file-count">(${item.count})</span>`;
            row.addEventListener("click", () => {
                searchEl().value = "";
                _showArtistFiles(item.artist);
            });
        } else {
            const isPlaying = item.path === currentPlayingPath;
            if (isPlaying) row.classList.add("playing");

            if (item.isCurated) {
                row.classList.add("curated-row");
                row.innerHTML = `<span class="cr-title">${_esc(item.title)}</span><span class="cr-artist">${_esc(item.artist)}</span><span class="cr-stat">${_esc(item.stat)}</span>`;
            } else if (mode === "search") {
                row.innerHTML = `<span class="artist-name">${_esc(item.artist)}</span> / <span class="file-title">${_esc(item.title)}</span>`;
            } else {
                row.innerHTML = `<span class="file-title">${_esc(item.title)}</span>`;
            }
            row.addEventListener("click", () => {
                if (item.path && onFileSelect) onFileSelect(item.path);
            });
        }

        if (idx === selectedIdx) {
            row.classList.add("selected");
        }

        return row;
    }

    // --- Keyboard navigation ---

    function _moveSelection(delta) {
        const newIdx = Math.max(0, Math.min(viewItems.length - 1, selectedIdx + delta));
        if (newIdx === selectedIdx) return;
        selectedIdx = newIdx;

        // Scroll into view
        const rowTop = selectedIdx * ROW_HEIGHT;
        const containerH = scrollContainer.clientHeight;
        if (rowTop < scrollContainer.scrollTop) {
            scrollContainer.scrollTop = rowTop;
        } else if (rowTop + ROW_HEIGHT > scrollContainer.scrollTop + containerH) {
            scrollContainer.scrollTop = rowTop + ROW_HEIGHT - containerH;
        }

        _renderVisible();
    }

    function _activateSelected() {
        if (selectedIdx < 0 || selectedIdx >= viewItems.length) return;
        const item = viewItems[selectedIdx];
        if (item.isArtist) {
            searchEl().value = "";
            _showArtistFiles(item.artist);
        } else if (item.path && onFileSelect) {
            onFileSelect(item.path);
        }
    }

    // --- Navigation ---

    function goBack() {
        searchEl().value = "";
        if (mode === "files" && currentArtist) {
            showArtists();
        } else {
            showArtists();
        }
    }

    function setPlaying(path) {
        currentPlayingPath = path;
        // Re-render visible rows to update highlight
        visibleStart = -1;
        _renderVisible();
    }

    function getNextFile(currentPath) {
        for (let i = 0; i < viewItems.length; i++) {
            if (viewItems[i].path === currentPath && i < viewItems.length - 1) {
                // Find next non-artist item
                for (let j = i + 1; j < viewItems.length; j++) {
                    if (!viewItems[j].isArtist) return viewItems[j].path;
                }
            }
        }
        return null;
    }

    function getPrevFile(currentPath) {
        for (let i = 0; i < viewItems.length; i++) {
            if (viewItems[i].path === currentPath && i > 0) {
                for (let j = i - 1; j >= 0; j--) {
                    if (!viewItems[j].isArtist) return viewItems[j].path;
                }
            }
        }
        return null;
    }

    function _esc(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function getRandomFile() {
        if (idxPaths.length === 0) return null;
        return idxPaths[Math.floor(Math.random() * idxPaths.length)];
    }

    return { init, showArtists, setPlaying, getNextFile, getPrevFile, getRandomFile };
})();
