/**
 * Transport controls and keyboard shortcuts.
 */
const Transport = (() => {
    let shuffleMode = false;
    let onAction = null;

    function init(actionCallback) {
        onAction = actionCallback;

        document.getElementById("btn-play").addEventListener("click", () => onAction("play"));
        document.getElementById("btn-stop").addEventListener("click", () => onAction("stop"));
        document.getElementById("btn-prev").addEventListener("click", () => onAction("prev"));
        document.getElementById("btn-next").addEventListener("click", () => onAction("next"));
        document.getElementById("btn-random").addEventListener("click", () => onAction("random"));
        document.getElementById("btn-shuffle").addEventListener("click", () => {
            shuffleMode = !shuffleMode;
            document.getElementById("btn-shuffle").classList.toggle("active", shuffleMode);
            onAction("shuffle-toggle");
        });

        document.addEventListener("keydown", (e) => {
            if (e.target.tagName === "INPUT") return;

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    onAction("play");
                    break;
                case "n": case "N":
                    onAction("next");
                    break;
                case "p": case "P":
                    onAction("prev");
                    break;
                case "r": case "R":
                    onAction("random");
                    break;
                case "s": case "S":
                    shuffleMode = !shuffleMode;
                    document.getElementById("btn-shuffle").classList.toggle("active", shuffleMode);
                    onAction("shuffle-toggle");
                    break;
                case "Escape":
                    onAction("stop");
                    break;
                case "/":
                    e.preventDefault();
                    document.getElementById("search-box").focus();
                    break;
            }
        });
    }

    function isShuffleOn() {
        return shuffleMode;
    }

    return { init, isShuffleOn };
})();
