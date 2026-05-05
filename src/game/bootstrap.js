document.getElementById('game-title').innerText = title;

if (gameUrl) {
    window.electronAPI.toFileUrl(gameUrl).then((res) => {
        if (res.success) {
            iframe.src = res.url;
        } else {
            printLog(`Err preparing game URL: ${res.error}`, 'error');
        }
    });
}
