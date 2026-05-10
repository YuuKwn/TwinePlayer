// Store game history locally
const HISTORY_KEY = 'twine_player_history';
const { readJson, writeJson } = window.TwinePlayerStorage;
const { getTitleFromPath, normalizeLibraryHistory } = window.TwinePlayerLibraryHistory;

const normalizeHistoryFromStorage = () => {
    const normalized = normalizeLibraryHistory(readJson(localStorage, HISTORY_KEY, []));
    if (normalized.changed) {
        writeJson(localStorage, HISTORY_KEY, normalized.history);
    }
    return normalized.history;
};

let history = normalizeHistoryFromStorage();
const missingGamePaths = new Set();

const loadGameBtn = document.getElementById('load-game-btn');
const historyGrid = document.getElementById('history-grid');
const librarySearch = document.getElementById('library-search');
const librarySort = document.getElementById('library-sort');

let searchQuery = '';
let sortMode = 'lastPlayed';

// Formatting dates
const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

const extractTitleFromHtml = async (filePath) => {
    const fallbackTitle = getTitleFromPath(filePath);
    if (!window.electronAPI.getGameMetadata) {
        return fallbackTitle;
    }

    const metadata = await window.electronAPI.getGameMetadata(filePath);
    return metadata.success && metadata.title ? metadata.title : fallbackTitle;
};

const createSvg = (attributes, paths) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.entries(attributes).forEach(([key, value]) => svg.setAttribute(key, value));
    paths.forEach(pathData => {
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        Object.entries(pathData).forEach(([key, value]) => pathEl.setAttribute(key, value));
        svg.appendChild(pathEl);
    });
    return svg;
};

const renderEmptyState = (message) => {
    historyGrid.textContent = '';
    const emptyState = document.createElement('div');
    emptyState.className = 'history-item glass-panel empty-state';

    const icon = createSvg(
        {
            width: '48',
            height: '48',
            fill: 'none',
            stroke: 'currentColor',
            viewBox: '0 0 24 24',
            style: 'opacity:0.5',
        },
        [{
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-width': '1.5',
            d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
        }]
    );

    const text = document.createElement('p');
    text.textContent = message;

    emptyState.appendChild(icon);
    emptyState.appendChild(text);
    historyGrid.appendChild(emptyState);
};

const getFilteredHistory = () => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = normalizedQuery
        ? history.filter(item => {
            const title = (item.title || '').toLowerCase();
            const itemPath = (item.path || '').toLowerCase();
            return title.includes(normalizedQuery) || itemPath.includes(normalizedQuery);
        })
        : [...history];

    filtered.sort((a, b) => {
        if (sortMode === 'title') {
            return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
        }
        if (sortMode === 'path') {
            return (a.path || '').localeCompare(b.path || '', undefined, { sensitivity: 'base' });
        }
        return new Date(b.lastPlayed || 0) - new Date(a.lastPlayed || 0);
    });

    return filtered;
};

const renderHistory = () => {
    if (history.length === 0) {
        renderEmptyState('No games in your library yet. Load a Twine HTML file to start playing!');
        return;
    }

    historyGrid.textContent = '';

    const sortedHistory = getFilteredHistory();

    if (sortedHistory.length === 0) {
        renderEmptyState('No games match your search.');
        return;
    }

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

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.type = 'button';
        removeBtn.title = 'Remove from Library';
        removeBtn.setAttribute('aria-label', `Remove ${item.title || 'game'} from Library`);
        removeBtn.appendChild(createSvg(
            {
                width: '16',
                height: '16',
                fill: 'none',
                stroke: 'currentColor',
                viewBox: '0 0 24 24',
            },
            [{
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                'stroke-width': '2',
                d: 'M6 18L18 6M6 6l12 12',
            }]
        ));

        card.appendChild(titleEl);
        card.appendChild(pathEl);
        card.appendChild(dateEl);

        if (missingGamePaths.has(item.path)) {
            const actions = document.createElement('div');
            actions.className = 'history-actions';

            const relinkBtn = document.createElement('button');
            relinkBtn.className = 'history-action-btn';
            relinkBtn.type = 'button';
            relinkBtn.textContent = 'Relink';

            relinkBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await relinkGame(item.path);
            });

            actions.appendChild(relinkBtn);
            card.appendChild(actions);
        }

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

const refreshMissingGameStates = async () => {
    if (!window.electronAPI.fileExists || history.length === 0) return;

    const missingBefore = new Set(missingGamePaths);
    missingGamePaths.clear();

    for (const item of history) {
        const existsResult = await window.electronAPI.fileExists(item.path);
        if (!existsResult.success || !existsResult.exists) {
            missingGamePaths.add(item.path);
        }
    }

    const changed =
        missingBefore.size !== missingGamePaths.size ||
        [...missingBefore].some(itemPath => !missingGamePaths.has(itemPath));

    if (changed) {
        renderHistory();
    }
};

const relinkGame = async (oldPath) => {
    const newPath = await window.electronAPI.openFile();
    if (!newPath) return;

    const existingIndex = history.findIndex(h => h.path === oldPath);
    if (existingIndex < 0) return;

    const title = await extractTitleFromHtml(newPath);
    history[existingIndex] = {
        ...history[existingIndex],
        path: newPath,
        title,
        lastPlayed: new Date().toISOString(),
    };

    missingGamePaths.delete(oldPath);
    writeJson(localStorage, HISTORY_KEY, history);
    await playGame(newPath, title);
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

    if (window.electronAPI.authorizeGamePath) {
        const authResult = await window.electronAPI.authorizeGamePath(filePath);
        if (!authResult.success) {
            missingGamePaths.add(filePath);
            renderHistory();
            return;
        }
        filePath = authResult.path;
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
        await playGame(filePath, title);
    }
});

librarySearch.addEventListener('input', () => {
    searchQuery = librarySearch.value;
    renderHistory();
});

librarySort.addEventListener('change', () => {
    sortMode = librarySort.value;
    renderHistory();
});

// Init
renderHistory();
refreshMissingGameStates();
