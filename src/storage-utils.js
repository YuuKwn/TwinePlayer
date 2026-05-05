(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.TwinePlayerStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const getBackupKey = (key) => `${key}_corrupt_backup`;

  const safeJsonParse = (rawValue, fallback) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return fallback;
    }

    try {
      return JSON.parse(rawValue);
    } catch (err) {
      return fallback;
    }
  };

  const readJson = (storage, key, fallback) => {
    let rawValue = null;

    try {
      rawValue = storage.getItem(key);
    } catch (err) {
      return fallback;
    }

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return fallback;
    }

    try {
      return JSON.parse(rawValue);
    } catch (err) {
      try {
        const backupKey = getBackupKey(key);
        if (storage.getItem(backupKey) === null) {
          storage.setItem(backupKey, rawValue);
        }
      } catch (backupErr) {
        // Best effort only; broken storage should never block startup.
      }
      return fallback;
    }
  };

  const writeJson = (storage, key, value) => {
    storage.setItem(key, JSON.stringify(value));
  };

  return {
    getBackupKey,
    readJson,
    safeJsonParse,
    writeJson,
  };
});
