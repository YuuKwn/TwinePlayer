        // --- Twine Logic Interceptor ---
        // We attach this BEFORE setting iframe.src to ensure we never miss the 'load' event
        iframe.addEventListener('load', () => {
            try {
                const cw = iframe.contentWindow;
                const doc = cw.document;

                // 1c. Catch-all URL.createObjectURL hook
                cw.blobRegistry = new Map();
                const win = cw.window || cw;

                // --- Store Persistent Engine API Context ---
                // We do this during setup so that the buttons can always find the engine later
                const sc2 = win.Save || (win.SugarCube && win.SugarCube.Save);
                const sc1 = win.save;

                if (sc2) {
                    cw.__twineEngineType = 'sc2';
                    cw.__twineSaveApi = sc2;
                } else if (sc1) {
                    cw.__twineEngineType = 'sc1';
                    cw.__twineSaveApi = sc1;
                }

                const originalCreateObjectURL = cw.URL.createObjectURL;
                cw.URL.createObjectURL = function (obj) {
                    const url = originalCreateObjectURL.call(this, obj);
                    if (obj instanceof cw.Blob || obj instanceof Blob) {
                        cw.blobRegistry.set(url, obj);
                    }
                    return url;
                };

                const processAnchorTrigger = (anchor) => {
                    if (anchor.hasAttribute('download') && anchor.href) {
                        try {
                            if (cw.blobRegistry && cw.blobRegistry.has(anchor.href)) {
                                pendingSaveBlob = cw.blobRegistry.get(anchor.href);
                                openSavesModal('save');
                                return true;
                            }
                            fetch(anchor.href).then(r => r.blob()).then(blob => {
                                pendingSaveBlob = blob;
                                openSavesModal('save');
                            }).catch(err => {
                                console.error("Failed to fetch internal save blob", err);
                            });
                            return true;
                        } catch (e) {
                            return false;
                        }
                    }
                    return false;
                };

                const originalAnchorClick = cw.HTMLAnchorElement.prototype.click;
                cw.HTMLAnchorElement.prototype.click = function () {
                    if (processAnchorTrigger(this)) return;
                    originalAnchorClick.call(this);
                };

                const originalDispatch = cw.EventTarget.prototype.dispatchEvent;
                cw.EventTarget.prototype.dispatchEvent = function (event) {
                    if (this instanceof cw.HTMLAnchorElement && (event.type === 'click' || event.type === 'mousedown')) {
                        if (processAnchorTrigger(this)) {
                            event.stopPropagation();
                            event.preventDefault();
                            return false;
                        }
                    }
                    return originalDispatch.call(this, event);
                };

                // 1b. SugarCube Specific Direct Hook
                if (cw.window && cw.window.Save && typeof cw.window.Save.export === 'function') {
                    const originalExport = cw.window.Save.export;
                    cw.window.Save.export = function (fileName, metadata) {
                        const saveStr = originalExport.call(this, fileName, metadata);
                        if (saveStr) {
                            pendingSaveBlob = new Blob([saveStr], { type: 'text/html;charset=UTF-8' });
                            openSavesModal('save');
                        }
                        return "";
                    };
                    printLog(`// Hooked directly into SugarCube Save API.`, 'normal');
                }

                // 2. Intercept "Load from Disk"
                const originalInputClick = cw.HTMLInputElement.prototype.click;
                cw.HTMLInputElement.prototype.click = function () {
                    if (this.type === 'file') {
                        // Capture the input object even if it is not in the DOM
                        // (SugarCube creates and removes it on the same tick)
                        pendingLoadInput = this;
                        printLog(`// Intercepted file picker click. Ready for load injection.`, 'normal');
                        
                        // We open the modal if we are NOT already in it
                        if (savesModal.style.display !== 'flex') {
                            openSavesModal('load');
                        }
                        return; // Suppress native file picker
                    }
                    originalInputClick.call(this);
                };

                printLog(`// Intercepted Save/Load events on iframe.`, 'normal');
            } catch (err) {
                printLog(`Err injecting interceptors: ${err.message}`, 'error');
            }
        });

        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('undo-btn').addEventListener('click', () => {
            try {
                const cw = iframe.contentWindow;
                // Try several paths for backward() in SugarCube and common Twine engines
                const sc = cw.SugarCube || (cw.window && cw.window.SugarCube);
                if (sc && sc.Engine && typeof sc.Engine.backward === 'function') {
                    sc.Engine.backward();
                } else {
                    // Generic Engine.backward or history.back fallback
                    if (cw.Engine && typeof cw.Engine.backward === 'function') {
                        cw.Engine.backward();
                    } else if (cw.history && typeof cw.history.back === 'function') {
                        // Very last resort: browser history (rarely used in Twine as they are single-page)
                        cw.history.back();
                    }
                }
            } catch (e) {
                printLog(`Undo failed: ${e.message}`, 'error');
            }
        });

