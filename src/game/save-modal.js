        /* --- Saves UI Integration --- */
        const savesModal = document.getElementById('saves-modal-overlay');
        const savesGrid = document.getElementById('saves-grid');
        const modalTitle = document.getElementById('modal-title');
        const modalLoader = document.getElementById('modal-loader');
        const modalLoaderText = document.getElementById('modal-loader-text');
        const confirmOverlay = document.getElementById('save-confirm-overlay');
        const confirmTitle = document.getElementById('save-confirm-title');
        const confirmMessage = document.getElementById('save-confirm-message');
        const confirmCancel = document.getElementById('save-confirm-cancel');
        const confirmAccept = document.getElementById('save-confirm-accept');

        let pendingSaveBlob = null;
        let pendingLoadInput = null;
        let currentModalMode = 'save';
        let previouslyFocusedElement = null;
        let activeConfirmation = null;

        let savesList = [];
        let currentPage = 1;
        const SAVES_PER_PAGE = 8;
        const { getSaveFilenameError, normalizeSaveFilename } = window.TwinePlayerSaveFilename;
        const { formatBytes, getSaveDisplayName } = window.TwinePlayerGameHelpers;
        const hasCustomConfirmation = () => Boolean(confirmOverlay && confirmTitle && confirmMessage && confirmCancel && confirmAccept);

        const showLoader = (text) => {
            modalLoaderText.textContent = text;
            modalLoader.classList.add('active');
        };
        const hideLoader = () => modalLoader.classList.remove('active');

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

        const getFocusableElements = (container) => {
            return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                .filter(el => !el.disabled && el.offsetParent !== null);
        };

        const focusFirstModalControl = () => {
            const firstControl = getFocusableElements(savesModal)[0];
            if (firstControl) firstControl.focus();
        };

        const closeConfirmation = (accepted) => {
            if (!activeConfirmation) return;
            const { resolve, returnFocusTo } = activeConfirmation;
            activeConfirmation = null;
            if (confirmOverlay) {
                confirmOverlay.hidden = true;
            }
            resolve(accepted);
            if (returnFocusTo && typeof returnFocusTo.focus === 'function') {
                returnFocusTo.focus();
            }
        };

        const requestConfirmation = ({ title, message, acceptLabel, returnFocusTo }) => {
            if (!hasCustomConfirmation()) {
                return Promise.resolve(typeof confirm === 'function' ? confirm(message) : false);
            }

            if (activeConfirmation) {
                closeConfirmation(false);
            }

            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            confirmAccept.textContent = acceptLabel;
            confirmOverlay.hidden = false;

            return new Promise((resolve) => {
                activeConfirmation = { resolve, returnFocusTo };
                confirmCancel.focus();
            });
        };

        if (hasCustomConfirmation()) {
            confirmCancel.addEventListener('click', () => closeConfirmation(false));
            confirmAccept.addEventListener('click', () => closeConfirmation(true));
            confirmOverlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeConfirmation(false);
                    return;
                }

                if (e.key !== 'Tab') return;
                e.stopPropagation();
                const focusable = getFocusableElements(confirmOverlay);
                if (focusable.length === 0) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            });
        }

        const setModalTitle = (mode) => {
            modalTitle.textContent = '';
            const isSaveMode = mode === 'save';
            modalTitle.appendChild(createSvg(
                {
                    width: '24',
                    height: '24',
                    fill: 'none',
                    stroke: 'currentColor',
                    viewBox: '0 0 24 24',
                },
                [{
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-width': '2',
                    d: isSaveMode
                        ? 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4'
                        : 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
                }]
            ));
            modalTitle.appendChild(document.createTextNode(isSaveMode ? ' Save Game' : ' Load Game'));
        };

        const restoreTopBarSaveButton = (btn) => {
            btn.textContent = '';
            btn.appendChild(createSvg(
                {
                    width: '15',
                    height: '15',
                    fill: 'none',
                    stroke: 'currentColor',
                    viewBox: '0 0 24 24',
                },
                [{
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'stroke-width': '2',
                    d: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4',
                }]
            ));
            btn.appendChild(document.createTextNode(' Save'));
        };

        const renderSavesPage = () => {
            savesGrid.textContent = '';

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
                addSlot.tabIndex = 0;
                addSlot.setAttribute('role', 'button');
                addSlot.setAttribute('aria-label', 'Create a new save');
                const addSlotContent = document.createElement('div');
                addSlotContent.className = 'empty-content new-save-content';
                addSlotContent.appendChild(createSvg(
                    {
                        width: '32',
                        height: '32',
                        fill: 'none',
                        stroke: 'currentColor',
                        viewBox: '0 0 24 24',
                    },
                    [{
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round',
                        'stroke-width': '2',
                        d: 'M12 4v16m8-8H4',
                    }]
                ));
                const addSlotText = document.createElement('span');
                addSlotText.className = 'new-save-label';
                addSlotText.textContent = 'New Save';
                addSlotContent.appendChild(addSlotText);
                addSlot.appendChild(addSlotContent);

                const handleNewSaveClick = (e) => {
                    if (addSlot.querySelector('#new-save-input')) return;

                    const defaultName = `save_${new Date().getTime()}.save`;
                    addSlot.textContent = '';

                    const form = document.createElement('div');
                    form.className = 'new-save-form';

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.id = 'new-save-input';
                    input.className = 'new-save-input';
                    input.value = defaultName;
                    input.setAttribute('aria-label', 'Save filename');
                    input.setAttribute('aria-describedby', 'new-save-error');

                    const error = document.createElement('div');
                    error.id = 'new-save-error';
                    error.className = 'save-name-error';

                    const actions = document.createElement('div');
                    actions.className = 'new-save-actions';

                    const saveButton = document.createElement('button');
                    saveButton.id = 'new-save-confirm';
                    saveButton.className = 'new-save-confirm';
                    saveButton.type = 'button';
                    saveButton.textContent = 'Save';

                    const cancelButton = document.createElement('button');
                    cancelButton.id = 'new-save-cancel';
                    cancelButton.className = 'new-save-cancel';
                    cancelButton.type = 'button';
                    cancelButton.textContent = 'Cancel';

                    actions.appendChild(saveButton);
                    actions.appendChild(cancelButton);
                    form.appendChild(input);
                    form.appendChild(error);
                    form.appendChild(actions);
                    addSlot.appendChild(form);

                    const newSaveInputEl = addSlot.querySelector('#new-save-input');
                    const newSaveErrorEl = addSlot.querySelector('#new-save-error');
                    isolateInput(newSaveInputEl);
                    newSaveInputEl.focus();
                    newSaveInputEl.select();

                    const validateNewSaveName = () => {
                        const message = getSaveFilenameError(newSaveInputEl.value);
                        newSaveErrorEl.textContent = message;
                        newSaveInputEl.classList.toggle('invalid-save-name', Boolean(message));
                        return message;
                    };

                    const doSave = async () => {
                        if (validateNewSaveName()) return;
                        await executeSaveWrite(normalizeSaveFilename(newSaveInputEl.value));
                    };

                    newSaveInputEl.addEventListener('input', validateNewSaveName);

                    saveButton.addEventListener('click', async (btnEvent) => {
                        btnEvent.stopPropagation();
                        await doSave();
                    });

                    cancelButton.addEventListener('click', (btnEvent) => {
                        btnEvent.stopPropagation();
                        renderSavesPage();
                    });

                    newSaveInputEl.addEventListener('keydown', async (keyEvent) => {
                        if (keyEvent.key === 'Enter') {
                            keyEvent.preventDefault();
                            await doSave();
                        } else if (keyEvent.key === 'Escape') {
                            keyEvent.stopPropagation();
                            renderSavesPage();
                        }
                    });
                };

                addSlot.addEventListener('click', handleNewSaveClick);
                addSlot.addEventListener('keydown', (keyEvent) => {
                    if (keyEvent.target !== addSlot) return;
                    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        keyEvent.preventDefault();
                        handleNewSaveClick(keyEvent);
                    }
                });
                savesGrid.appendChild(addSlot);
            }

            pageSaves.forEach(save => {
                const slot = document.createElement('div');
                slot.className = 'save-slot';
                slot.tabIndex = 0;
                slot.setAttribute('role', 'button');

                const dateStr = new Date(save.mtime).toLocaleString();
                const displayName = getSaveDisplayName(save.filename);
                slot.setAttribute('aria-label', currentModalMode === 'save'
                    ? `Overwrite save ${displayName}`
                    : `Load save ${displayName}`);

                const title = document.createElement('div');
                title.className = 'slot-title';
                title.title = save.filename;
                title.textContent = displayName;

                const meta = document.createElement('div');
                meta.className = 'slot-meta';
                const date = document.createElement('span');
                date.textContent = dateStr;
                const size = document.createElement('span');
                size.textContent = formatBytes(save.size);
                meta.appendChild(date);
                meta.appendChild(size);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'slot-delete';
                deleteBtn.type = 'button';
                deleteBtn.title = 'Delete Save';
                deleteBtn.setAttribute('aria-label', `Delete save ${displayName}`);
                deleteBtn.appendChild(createSvg(
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
                        d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
                    }]
                ));

                slot.appendChild(title);
                slot.appendChild(meta);
                slot.appendChild(deleteBtn);

                slot.addEventListener('click', async (e) => {
                    if (e.target.closest('.slot-delete')) {
                        e.stopPropagation();
                        const accepted = await requestConfirmation({
                            title: 'Delete Save',
                            message: `Delete save "${displayName}"?`,
                            acceptLabel: 'Delete',
                            returnFocusTo: deleteBtn,
                        });
                        if (accepted) {
                            await window.electronAPI.deleteSave(gameUrl, save.filename);
                            await refreshSaves();
                        }
                        return;
                    }

                    if (currentModalMode === 'save') {
                        const accepted = await requestConfirmation({
                            title: 'Overwrite Save',
                            message: `Overwrite save "${displayName}"?`,
                            acceptLabel: 'Overwrite',
                            returnFocusTo: slot,
                        });
                        if (accepted) {
                            await executeSaveWrite(save.filename);
                        }
                    } else if (currentModalMode === 'load') {
                        await executeLoadRead(save.filename);
                    }
                });

                slot.addEventListener('keydown', (keyEvent) => {
                    if (keyEvent.target !== slot) return;
                    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        keyEvent.preventDefault();
                        slot.click();
                    }
                });

                savesGrid.appendChild(slot);
            });

            if (currentModalMode === 'load' && savesList.length === 0) {
                savesGrid.textContent = '';
                const empty = document.createElement('div');
                empty.className = 'saves-empty-state';
                empty.textContent = 'No saves found. Play the game and save your progress!';
                savesGrid.appendChild(empty);
            }
        };

        const refreshSaves = async () => {
            if (!gameUrl) return;
            try {
                const result = await window.electronAPI.listSaves(gameUrl);
                if (Array.isArray(result)) {
                    savesList = result;
                } else {
                    savesList = [];
                    if (result && result.error) {
                        printLog(`Err listing saves: ${result.error}`, 'error');
                    }
                }
            } catch (err) {
                savesList = [];
                printLog(`Err listing saves: ${err.message}`, 'error');
            }
            renderSavesPage();
        };

        const openSavesModal = async (mode) => {
            currentModalMode = mode;
            previouslyFocusedElement = document.activeElement;
            setModalTitle(mode);

            currentPage = 1;
            await refreshSaves();
            savesModal.classList.add('active');
            requestAnimationFrame(focusFirstModalControl);
        };

        const closeSavesModal = () => {
            savesModal.classList.remove('active');
            pendingSaveBlob = null;
            pendingLoadInput = null;
            if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
                previouslyFocusedElement.focus();
            }
            previouslyFocusedElement = null;
        };

        document.getElementById('close-modal-btn').addEventListener('click', closeSavesModal);

        document.getElementById('prev-page-btn').addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; renderSavesPage(); }
        });

        document.getElementById('next-page-btn').addEventListener('click', () => {
            currentPage++; renderSavesPage();
        });

        savesModal.addEventListener('keydown', (e) => {
            if (!savesModal.classList.contains('active')) return;

            if (e.key === 'Escape') {
                if (activeConfirmation) return;
                e.preventDefault();
                closeSavesModal();
                return;
            }

            if (e.key !== 'Tab') return;
            const focusable = getFocusableElements(savesModal);
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
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
                    restoreTopBarSaveButton(btn);
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

            // Save/load messages are kept as a bonus path for patched games.
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



