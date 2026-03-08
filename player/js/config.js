const CONFIG = {
    isStatic: true,
    modBaseUrl: "https://retro-mods.ulascim-8f1.workers.dev/modland",
};

let _bulkMetadata = null;
let _bulkMetadataLoading = null;

function modUrl(relativePath) {
    const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
    if (CONFIG.isStatic) {
        return CONFIG.modBaseUrl + "/" + encoded;
    }
    return "/api/mod/" + encoded;
}

function apiUrl(path) {
    if (!CONFIG.isStatic) return path;
    if (path === "/api/stats") return "data/stats.json";
    if (path === "/api/search-index") return "data/search-index.json";
    return path;
}

function loadBulkMetadata() {
    if (_bulkMetadata) return Promise.resolve(_bulkMetadata);
    if (_bulkMetadataLoading) return _bulkMetadataLoading;
    _bulkMetadataLoading = fetch("data/metadata.json")
        .then(r => r.json())
        .then(index => {
            if (index.chunks) {
                return Promise.all(index.chunks.map(url => fetch(url).then(r => r.json())))
                    .then(parts => {
                        _bulkMetadata = Object.assign({}, ...parts);
                        return _bulkMetadata;
                    });
            }
            _bulkMetadata = index;
            return _bulkMetadata;
        })
        .catch(() => { _bulkMetadata = {}; return {}; });
    return _bulkMetadataLoading;
}

function getMetadataForFile(relativePath) {
    if (!_bulkMetadata) return null;
    return _bulkMetadata[relativePath] || null;
}
