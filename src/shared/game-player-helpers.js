(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.TwinePlayerGameHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, index)).toFixed(2))} ${sizes[index]}`;
  };

  const getSaveDisplayName = (filename) => filename.replace(/\.save$/i, '');

  const hashString = (value) => {
    const str = String(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  };

  const getAutocompleteParts = (inputText) => {
    if (!inputText) return null;
    const match = inputText.match(/(([a-zA-Z_$][0-9a-zA-Z_$]*\.)*)([a-zA-Z_$][0-9a-zA-Z_$]*)$/);

    if (match) {
      const pathStr = match[1] || '';
      return {
        baseExpression: pathStr ? pathStr.slice(0, -1) : '',
        pathStr,
        prefix: match[3] || '',
      };
    }

    if (inputText.endsWith('.')) {
      return {
        baseExpression: inputText.slice(0, -1),
        pathStr: inputText,
        prefix: '',
      };
    }

    return null;
  };

  const filterAutocompleteProperties = (properties, prefix, pathStr, limit = 50) => {
    return [...new Set(properties)]
      .filter(prop => prop.startsWith(prefix) && prop !== prefix)
      .sort()
      .slice(0, limit)
      .map(prop => ({
        propName: prop,
        fullPath: pathStr + prop,
        prefix,
      }));
  };

  const normalizeConsoleCommandStore = (saved) => {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};

    const normalized = {};
    Object.entries(saved).forEach(([ifid, commands]) => {
      if (typeof ifid !== 'string' || !ifid.trim() || !Array.isArray(commands)) return;

      const validCommands = commands.filter(command => typeof command === 'string' && command.trim());
      if (validCommands.length > 0) {
        normalized[ifid] = validCommands;
      }
    });

    return normalized;
  };

  const getConsoleCommandsForGame = (saved, ifid) => {
    if (typeof ifid !== 'string' || !ifid.trim()) return [];
    const normalized = normalizeConsoleCommandStore(saved);
    return normalized[ifid] || [];
  };

  const addConsoleCommandForGame = (saved, ifid, command) => {
    const normalized = normalizeConsoleCommandStore(saved);
    const cleanCommand = typeof command === 'string' ? command.trim() : '';
    if (typeof ifid !== 'string' || !ifid.trim() || !cleanCommand) {
      return { saved: normalized, added: false };
    }

    const commands = normalized[ifid] || [];
    if (commands.includes(cleanCommand)) {
      normalized[ifid] = commands;
      return { saved: normalized, added: false };
    }

    normalized[ifid] = commands.concat(cleanCommand);
    return { saved: normalized, added: true };
  };

  const removeConsoleCommandForGame = (saved, ifid, index) => {
    const normalized = normalizeConsoleCommandStore(saved);
    const commands = getConsoleCommandsForGame(normalized, ifid);
    if (!Number.isInteger(index) || index < 0 || index >= commands.length) {
      return { saved: normalized, removed: false };
    }

    normalized[ifid] = commands.slice(0, index).concat(commands.slice(index + 1));
    if (normalized[ifid].length === 0) {
      delete normalized[ifid];
    }
    return { saved: normalized, removed: true };
  };

  return {
    addConsoleCommandForGame,
    filterAutocompleteProperties,
    formatBytes,
    getAutocompleteParts,
    getConsoleCommandsForGame,
    getSaveDisplayName,
    hashString,
    normalizeConsoleCommandStore,
    removeConsoleCommandForGame,
  };
});
