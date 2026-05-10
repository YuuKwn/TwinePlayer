document.getElementById('game-title').innerText = title;

if (gameUrl) {
    window.electronAPI.fileExists(gameUrl).then((existsResult) => {
        if (existsResult.success && !existsResult.exists) {
            printLog(`Err loading game: file is missing at ${gameUrl}`, 'error');
            document.getElementById('game-title').innerText = 'Missing game file';
            return null;
        }

        if (!window.electronAPI.authorizeGamePath) {
            return { success: true, path: gameUrl };
        }

        return window.electronAPI.authorizeGamePath(gameUrl);
    }).then((authResult) => {
        if (!authResult) return null;
        if (!authResult.success) {
            printLog(`Err authorizing game path: ${authResult.error}`, 'error');
            document.getElementById('game-title').innerText = 'Game file not authorized';
            return null;
        }

        gameUrl = authResult.path;
        return window.electronAPI.toFileUrl(gameUrl);
    }).then((res) => {
        if (!res) return;
        if (res.success) {
            iframe.src = res.url;
        } else {
            printLog(`Err preparing game URL: ${res.error}`, 'error');
        }
    }).catch((err) => {
        printLog(`Err loading game: ${err.message}`, 'error');
    });
}
