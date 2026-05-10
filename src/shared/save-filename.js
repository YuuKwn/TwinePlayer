(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.TwinePlayerSaveFilename = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

  const normalizeSaveFilename = (filename) => {
    if (typeof filename !== 'string' || filename.trim() === '') {
      throw new Error('Save filename must be a non-empty string');
    }

    const trimmed = filename.trim();
    const withExtension = trimmed.toLowerCase().endsWith('.save') ? trimmed : `${trimmed}.save`;

    if (
      withExtension.includes('/') ||
      withExtension.includes('\\') ||
      withExtension.includes('\0') ||
      withExtension === '.' ||
      withExtension === '..' ||
      RESERVED_WINDOWS_NAMES.test(withExtension)
    ) {
      throw new Error('Save filename must be a plain .save filename');
    }

    if (!withExtension.toLowerCase().endsWith('.save')) {
      throw new Error('Save filename must end with .save');
    }

    return withExtension;
  };

  const getSaveFilenameError = (filename) => {
    try {
      normalizeSaveFilename(filename);
      return '';
    } catch (err) {
      if (typeof filename !== 'string' || filename.trim() === '') {
        return 'Enter a save name.';
      }
      return 'Use a plain save filename.';
    }
  };

  return {
    getSaveFilenameError,
    normalizeSaveFilename,
  };
});
