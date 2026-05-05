        /* --- Saves UI Integration --- */
        const savesModal = document.getElementById('saves-modal-overlay');
        const savesGrid = document.getElementById('saves-grid');
        const modalTitle = document.getElementById('modal-title');
        const modalLoader = document.getElementById('modal-loader');
        const modalLoaderText = document.getElementById('modal-loader-text');

        let pendingSaveBlob = null;
        let pendingLoadInput = null;
        let currentModalMode = 'save';

        let savesList = [];
        let currentPage = 1;
        const SAVES_PER_PAGE = 8;
        const RESERVED_SAVE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

        const showLoader = (text) => {
            modalLoaderText.textContent = text;
            modalLoader.classList.add('active');
        };
        const hideLoader = () => modalLoader.classList.remove('active');

        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const getSaveNameError = (filename) => {
            const trimmed = filename.trim();
            if (!trimmed) return 'Enter a save name.';

            const withExtension = trimmed.toLowerCase().endsWith('.save') ? trimmed : `${trimmed}.save`;
            if (
                withExtension.includes('/') ||
                withExtension.includes('\\') ||
                withExtension.includes('\0') ||
                withExtension === '.' ||
                withExtension === '..' ||
                RESERVED_SAVE_NAMES.test(withExtension)
            ) {
                return 'Use a plain save filename.';
            }

            return '';
        };

        const renderSavesPage = () => {
            savesGrid.innerHTML = '';

            const totalPages = Math.max(1, Math.ceil(savesList.length / SAVES_PER_PAGE));
            if (currentPage > totalPages) currentPage = totalPages;

            document.getElementById('page-indicator').textContent = `Page ${currentPage} / ${totalPages}`;
            document.getElementById('prev-page-btn').disabled = currentPage === 1;
            document.getElementById('next-page-btn').disabled = currentPage === totalPages;
            document.getElementById('saves-info').textContent = `${savesList.length} saves total`;

            const startIdx = (currentPage - 1) * SAVES_PER_PAGE;
            const pageSaves = savesList.slice(startIdx, startIdx + SAVES_PER_PAGE);

            if (currentModalMode === 'save' && currentPage === 1) {
                const addSlot = document.createElement('div');
                addSlot.className = 'save-slot empty';
                addSlot.innerHTML = `
                    <div class="empty-content" style="display:flex; flex-direction:column; align-items:center;">
                        <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        <span style="font-weight: 500;">New Save</span>
                    </div>
                `;

                const handleNewSaveClick = (e) => {
                    if (addSlot.querySelector('#new-save-input')) return;

                    const defaultName = `save_${new Date().getTime()}.save`;
                    addSlot.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; width:100%; gap:8px;">
                            <input type="text" id="new-save-input" value="${defaultName}" style="width: 90%; background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 6px; border-radius: 4px; outline: none; text-align:center; font-family: inherit;" />
                            <div id="new-save-error" class="save-name-error"></div>
                            <div style="display:flex; gap: 8px;">
                                <button id="new-save-confirm" style="background: rgba(59, 130, 246, 0.8); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 4px; cursor: pointer;">Save</button>
                                <button id="new-save-cancel" style="background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 4px; cursor: pointer;">Cancel</button>
                            </div>
                        </div>
                    `;

                    const newSaveInputEl = addSlot.querySelector('#new-save-input');
                    const newSaveErrorEl = addSlot.querySelector('#new-save-error');
                    isolateInput(newSaveInputEl);
                    newSaveInputEl.focus();
                    newSaveInputEl.select();

                    const validateNewSaveName = () => {
                        const message = getSaveNameError(newSaveInputEl.value);
                        newSaveErrorEl.textContent = message;
                        newSaveInputEl.classList.toggle('invalid-save-name', Boolean(message));
                        return message;
                    };

                    const doSave = async () => {
                        let name = newSaveInputEl.value.trim();
                        if (validateNewSaveName()) return;
                        if (!name.endsWith('.save')) name += '.save';
                        await executeSaveWrite(name);
                    };

                    newSaveInputEl.addEventListener('input', validateNewSaveName);

                    addSlot.querySelector('#new-save-confirm').addEventListener('click', async (btnEvent) => {
                        btnEvent.stopPropagation();
                        await doSave();
                    });

                    addSlot.querySelector('#new-save-cancel').addEventListener('click', (btnEvent) => {
                        btnEvent.stopPropagation();
                        renderSavesPage();
                    });

                    newSaveInputEl.addEventListener('keydown', async (keyEvent) => {
                        if (keyEvent.key === 'Enter') {
                            keyEvent.preventDefault();
                            await doSave();
                        } else if (keyEvent.key === 'Escape') {
                            renderSavesPage();
                        }
                    });
                };

                addSlot.addEventListener('click', handleNewSaveClick);
                savesGrid.appendChild(addSlot);
            }

            pageSaves.forEach(save => {
                const slot = document.createElement('div');
                slot.className = 'save-slot';

                const dateStr = new Date(save.mtime).toLocaleString();
                const displayName = save.filename.replace('.save', '');

                slot.innerHTML = `
                    <div class="slot-title" title="${save.filename}">${displayName}</div>
                    <div class="slot-meta">
                        <span>${dateStr}</span>
                        <span>${formatBytes(save.size)}</span>
                    </div>
                    <button class="slot-delete" title="Delete Save">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                `;

                slot.addEventListener('click', async (e) => {
                    if (e.target.closest('.slot-delete')) {
                        e.stopPropagation();
                        if (confirm(`Delete save "${displayName}"?`)) {
                            await window.electronAPI.deleteSave(gameUrl, save.filename);
                            await refreshSaves();
                        }
                        return;
                    }

                    if (currentModalMode === 'save') {
                        if (confirm(`Overwrite save "${displayName}"?`)) {
                            await executeSaveWrite(save.filename);
                        }
                    } else if (currentModalMode === 'load') {
                        await executeLoadRead(save.filename);
                    }
                });

                savesGrid.appendChild(slot);
            });

            if (currentModalMode === 'load' && savesList.length === 0) {
                savesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 3rem;">No saves found. Play the game and save your progress!</div>';
            }
        };

        const refreshSaves = async () => {
            if (!gameUrl) return;
            try {
                savesList = await window.electronAPI.listSaves(gameUrl);
            } catch (err) {
                savesList = [];
                printLog(`Err listing saves: ${err.message}`, 'error');
            }
            renderSavesPage();
        };

        const openSavesModal = async (mode) => {
            currentModalMode = mode;
            modalTitle.innerHTML = mode === 'save'
                ? '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> Save Game'
                : '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> Load Game';

            currentPage = 1;
            await refreshSaves();
            savesModal.classList.add('active');
        };

        const closeSavesModal = () => {
            savesModal.classList.remove('active');
            pendingSaveBlob = null;
            pendingLoadInput = null;
        };

        document.getElementById('close-modal-btn').addEventListener('click', closeSavesModal);

        document.getElementById('prev-page-btn').addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; renderSavesPage(); }
        });

        document.getElementById('next-page-btn').addEventListener('click', () => {
            currentPage++; renderSavesPage();
        });

        /* --- Save button: capture state then open modal --- */
        document.getElementById('save-btn').addEventListener('click', async () => {
            const btn = document.getElementById('save-btn');
            const cw = iframe.contentWindow;
            const engine = detectEngine();
            const api = cw.__twineSaveApi;

            // Use the API we found during setup
            if (engine !== 'unknown' && cw.blobRegistry && api) {
                try {
                    printLog(`// Triggering engine save (${engine})...`, 'normal');
                    if (engine === 'sc2') {
                        if (typeof api.export === 'function') {
                            api.export('twineplayer-save');
                        } else if (api.base64 && typeof api.base64.export === 'function') {
                            api.base64.export();
                        }
                    } else if (engine === 'sc1') {
                        throw new Error("sc1 manual capture required");
                    }
                    return; 
                } catch (e) {
                    console.warn("Native Trigger failed, falling back to manual capture", e);
                }
            }

            // Fallback: manual capture
            btn.disabled = true;
            try {
                pendingSaveBlob = await executeSaveCapture();
                await openSavesModal('save');
            } catch (err) {
                printLog(`Err capturing save: ${err.message}`, 'error');
                // Show error briefly in the button label, then restore
                btn.textContent = 'Error';
                setTimeout(() => {
                    btn.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> Save`;
                }, 2000);
            } finally {
                btn.disabled = false;
            }
        });

        /* --- Load button: always open modal for topbar load --- */
        document.getElementById('load-btn').addEventListener('click', async () => {
            pendingLoadInput = null;

            try {
                const cw = iframe.contentWindow;
                const doc = cw.document;
                const sc = cw.SugarCube || (cw.window && cw.window.SugarCube);

                if (sc && sc.UI && typeof sc.UI.saves === 'function') {
                    printLog(`// Opening native saves dialog for load bridge...`, 'normal');
                    sc.UI.saves();

                    const findNativeDiskLoad = () => {
                        const dialogRoot =
                            doc.getElementById('ui-dialog-body') ||
                            doc.getElementById('ui-dialog') ||
                            doc;

                        const exactLoad =
                            dialogRoot.querySelector('#saves-disk-load') ||
                            dialogRoot.querySelector('[id$="saves-disk-load"]') ||
                            dialogRoot.querySelector('#saves-load') ||
                            dialogRoot.querySelector('[id$="saves-load"]');
                        if (exactLoad && !(exactLoad.id || '').toLowerCase().includes('import')) {
                            return exactLoad;
                        }

                        const candidates = Array.from(dialogRoot.querySelectorAll('button, a, input[type="button"], [role="button"]'));
                        return candidates.find(el => {
                            const text = ((el.textContent || el.value || '') + '').trim().toLowerCase().replace(/\s+/g, ' ');
                            const id = (el.id || '').toLowerCase();
                            const className = (el.className || '').toString().toLowerCase();
                            const label = `${id} ${className} ${text}`;

                            return label.includes('load') &&
                                label.includes('disk') &&
                                !label.includes('import') &&
                                !label.includes('export');
                        });
                    };

                    const waitForNativeDiskLoad = async () => {
                        const startedAt = Date.now();
                        while (Date.now() - startedAt < 1000) {
                            const button = findNativeDiskLoad();
                            if (button) return button;
                            await new Promise(r => setTimeout(r, 50));
                        }
                        return null;
                    };

                    const nativeDiskLoad = await waitForNativeDiskLoad();
                    if (nativeDiskLoad) {
                        printLog(`// Triggering native on-disk load button...`, 'normal');
                        nativeDiskLoad.click();

                        await new Promise(r => setTimeout(r, 150));
                        if (pendingLoadInput) return;
                    }
                }
            } catch (e) {
                console.warn("Native load bridge failed", e);
            }

            printLog(`// Opening TwinePlayer load manager.`, 'normal');
            await openSavesModal('load');
        });

        const executeSaveWrite = async (filename) => {
            if (!pendingSaveBlob) return closeSavesModal();
            showLoader('Saving to disk...');
            let saved = false;

            try {
                const arrayBuffer = await pendingSaveBlob.arrayBuffer();
                const bufferView = new Uint8Array(arrayBuffer);

                const result = await window.electronAPI.writeSave(gameUrl, filename, bufferView);
                if (result.success) {
                    printLog(`// Saved successfully to ${filename}`, 'result');
                    saved = true;
                } else {
                    printLog(`Err saving: ${result.error}`, 'error');
                }
            } catch (err) {
                printLog(`Err saving: ${err.message}`, 'error');
            } finally {
                hideLoader();
                if (saved) {
                    closeSavesModal();
                }
            }
        };

        const executeLoadRead = async (filename) => {
            showLoader('Loading save...');
            let loaded = false;
            try {
                const result = await window.electronAPI.readSave(gameUrl, filename);
                if (result.success && result.data) {
                    if (pendingLoadInput) {
                        // Native in-game interceptor route
                        const loadInput = pendingLoadInput;
                        const fileObj = new File([result.data], filename, { type: 'text/plain' });
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(fileObj);
                        loadInput.files = dataTransfer.files;
                        loadInput.dispatchEvent(new Event('change', { bubbles: true }));
                        printLog(`// Loaded ${filename} into game engine.`, 'result');
                        loaded = true;

                        setTimeout(() => {
                            try {
                                const cw = iframe.contentWindow;
                                const sc = cw.SugarCube || (cw.window && cw.window.SugarCube);
                                if (sc && sc.UI && typeof sc.UI.close === 'function') {
                                    sc.UI.close();
                                } else {
                                    const closeBtn = cw.document.getElementById('ui-overlay-close');
                                    if (closeBtn) closeBtn.click();
                                }
                            } catch (e) {
                                console.warn("Could not close native saves dialog", e);
                            }
                        }, 100);
                    } else {
                        // Top bar fallback path route
                        const bytes = new Uint8Array(result.data.data || result.data);
                        const text = new TextDecoder('utf-8').decode(bytes);
                        restoreSaveData(text);
                        printLog(`// Loaded save: ${filename}`, 'result');
                        loaded = true;
                    }
                } else {
                    printLog(`Err loading: ${result.error}`, 'error');
                }
            } catch (err) {
                printLog(`Err loading: ${err.message}`, 'error');
            } finally {
                hideLoader();
                if (loaded) {
                    closeSavesModal();
                }
            }
        };

        /* --- Message bridge from iframe (saves + illustrator scene capture) --- */
        window.addEventListener('message', async (event) => {
            if (event.source !== iframe.contentWindow) return;

            const msg = event.data;
            if (!msg || typeof msg !== 'object' || Array.isArray(msg) || !TRUSTED_MESSAGE_TYPES.has(msg.type)) return;

            // Save/load messages Ã¢â‚¬â€ kept as bonus path for patched games
            if (msg.type === 'twine-save') {
                pendingSaveBlob = null;
                if (typeof msg.dataUrl === 'string' && msg.dataUrl.length <= MAX_MESSAGE_DATA_URL_LENGTH && msg.dataUrl.startsWith('data:')) {
                    try {
                        const res = await fetch(msg.dataUrl);
                        pendingSaveBlob = await res.blob();
                    } catch (e) {
                        printLog(`Err reading save data URL: ${e.message}`, 'error');
                    }
                } else if (typeof msg.base64 === 'string' && msg.base64.length <= MAX_MESSAGE_BASE64_LENGTH) {
                    try {
                        const byteStr = atob(msg.base64);
                        const bytes = new Uint8Array(byteStr.length);
                        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
                        pendingSaveBlob = new Blob([bytes]);
                    } catch (e) {
                        printLog(`Err decoding base64 save: ${e.message}`, 'error');
                    }
                }
                if (pendingSaveBlob) {
                    await openSavesModal('save');
                }
            } else if (msg.type === 'twine-load') {
                await openSavesModal('load');
            }

            // Illustrator scene capture
            if (msg.type === 'twine-scene-text') {
                const sceneEl = document.getElementById('illus-scene-text');
                if (sceneEl && typeof msg.text === 'string') {
                    sceneEl.value = msg.text.slice(0, MAX_MESSAGE_TEXT_LENGTH);
                }
            }
        });



