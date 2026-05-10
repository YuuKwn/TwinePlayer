(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.TwinePlayerLibraryHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const getTitleFromPath = (filePath) => {
    try {
      const filename = filePath.split('\\').pop().split('/').pop();
      const cleanName = filename.replace(/\.html?$/i, '').replace(/[-_]/g, ' ');
      return cleanName.replace(/\b\w/g, letter => letter.toUpperCase()) || 'Unknown Game';
    } catch (err) {
      return 'Unknown Game';
    }
  };

  const isValidDate = (value) => {
    const time = new Date(value).getTime();
    return Number.isFinite(time);
  };

  const normalizeLibraryHistory = (entries, now = new Date()) => {
    if (!Array.isArray(entries)) {
      return { history: [], changed: entries !== undefined };
    }

    const fallbackTime = now.toISOString();
    const byPath = new Map();
    let changed = false;

    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.path !== 'string' || entry.path.trim() === '') {
        changed = true;
        return;
      }

      const itemPath = entry.path.trim();
      const title = typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : getTitleFromPath(itemPath);
      const lastPlayed = isValidDate(entry.lastPlayed) ? new Date(entry.lastPlayed).toISOString() : fallbackTime;
      const normalized = {
        path: itemPath,
        title,
        lastPlayed,
      };

      if (itemPath !== entry.path || title !== entry.title || lastPlayed !== entry.lastPlayed) {
        changed = true;
      }

      const existing = byPath.get(itemPath);
      if (!existing || new Date(normalized.lastPlayed) > new Date(existing.lastPlayed)) {
        if (existing) changed = true;
        byPath.set(itemPath, normalized);
      } else {
        changed = true;
      }
    });

    const history = Array.from(byPath.values());
    if (history.length !== entries.length) {
      changed = true;
    }

    return { history, changed };
  };

  return {
    getTitleFromPath,
    normalizeLibraryHistory,
  };
});
