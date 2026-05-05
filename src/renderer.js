// Store game history locally
const HISTORY_KEY = 'twine_player_history';
const { readJson, writeJson } = window.TwinePlayerStorage;

let history = readJson(localStorage, HISTORY_KEY, []);
if (!Array.isArray(history)) {
    history = [];
}
const missingGamePaths = new Set();

const loadGameBtn = document.getElementById('load-game-btn');
const historyGrid = document.getElementById('history-grid');

// Formatting dates
const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

const extractTitleFromHtml = async (filePath) => {
    try {
        const filename = filePath.split('\\').pop().split('/').pop();
        const cleanName = filename.replace(/\.html?$/i, '').replace(/[-_]/g, ' ');
        // capitalize first letters
        return cleanName.replace(/\b\w/g, l => l.toUpperCase());
    } catch (e) {
        return "Unknown Game";
    }
};

const renderHistory = () => {
    if (history.length === 0) {
        historyGrid.innerHTML = `
      <div class="history-item glass-panel empty-state">
        <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity:0.5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        <p>No games in your library yet. Load a Twine HTML file to start playing!</p>
      </div>
    `;
        return;
    }

    historyGrid.innerHTML = '';

    const sortedHistory = [...history].sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));

    sortedHistory.forEach((item, displayIndex) => {
        const originalIndex = history.findIndex(h => h.path === item.path);
        const delay = Math.min(displayIndex * 0.1, 0.5); // max delay 0.5s to avoid feeling slow

        const card = document.createElement('div');
        card.className = missingGamePaths.has(item.path)
            ? 'history-item glass-panel missing-game'
            : 'history-item glass-panel';
        card.style.animationDelay = `${delay}s`;

        const titleEl = document.createElement('div');
        titleEl.className = 'history-title';
        titleEl.textContent = item.title || 'Unknown Game';

        const pathEl = document.createElement('div');
        pathEl.className = 'history-path';
        pathEl.title = item.path;
        pathEl.textContent = `...${item.path.slice(-30)}`;

        const dateEl = document.createElement('div');
        dateEl.className = 'history-date';
        dateEl.textContent = missingGamePaths.has(item.path)
            ? 'Missing file. Remove it or load the game from its new location.'
            : `Last played: ${formatDate(item.lastPlayed)}`;

        const removeBtn = document.createElement('div');
        removeBtn.className = 'remove-btn';
        removeBtn.title = 'Remove from Library';
        removeBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';

        card.appendChild(titleEl);
        card.appendChild(pathEl);
        card.appendChild(dateEl);
        card.appendChild(removeBtn);

        card.addEventListener('click', async (e) => {
            if (e.target.closest('.remove-btn')) {
                e.stopPropagation();
                history.splice(originalIndex, 1);
                missingGamePaths.delete(item.path);
                writeJson(localStorage, HISTORY_KEY, history);
                renderHistory();
            } else {
                await playGame(item.path, item.title);
            }
        });

        historyGrid.appendChild(card);
    });
};

const playGame = async (filePath, title) => {
    if (window.electronAPI.fileExists) {
        const existsResult = await window.electronAPI.fileExists(filePath);
        if (!existsResult.success || !existsResult.exists) {
            missingGamePaths.add(filePath);
            renderHistory();
            return;
        }
    }

    // Update last played
    const existingIndex = history.findIndex(h => h.path === filePath);
    if (existingIndex >= 0) {
        history[existingIndex].lastPlayed = new Date().toISOString();
    } else {
        history.push({
            path: filePath,
            title: title,
            lastPlayed: new Date().toISOString()
        });
    }
    missingGamePaths.delete(filePath);
    writeJson(localStorage, HISTORY_KEY, history);

    // Transition to game window
    window.location.href = `game.html?url=${encodeURIComponent(filePath)}&title=${encodeURIComponent(title)}`;
};

loadGameBtn.addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFile();
    if (filePath) {
        const title = await extractTitleFromHtml(filePath);
        playGame(filePath, title);
    }
});

// Init
renderHistory();
