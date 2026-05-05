        /* --- Console Logic --- */
        const consoleEl = document.getElementById('dev-console');
        const outputEl = document.getElementById('console-output');
        const inputEl = document.getElementById('console-input');
        const savedListEl = document.getElementById('saved-list');

        isolateInput(inputEl);
        isolateInput(document.getElementById('illus-scene-text'));
        isolateInput(document.getElementById('illus-prompt-text'));

        document.getElementById('toggle-console').addEventListener('click', () => {
            consoleEl.classList.add('open');
            inputEl.focus();
        });
        document.getElementById('close-console').addEventListener('click', () => {
            consoleEl.classList.remove('open');
        });

        const LAYOUT_KEY = 'twine_player_console_layout';
        let isSideMode = localStorage.getItem(LAYOUT_KEY) === 'side';
        const iconSide = document.getElementById('layout-icon-side');
        const iconOverlay = document.getElementById('layout-icon-overlay');
        const layoutContainer = document.getElementById('layout-container');

        const applyLayout = () => {
            if (isSideMode) {
                document.body.classList.add('console-side');
                layoutContainer.appendChild(consoleEl);
                iconSide.style.display = 'block';
                iconOverlay.style.display = 'none';
            } else {
                document.body.classList.remove('console-side');
                document.body.appendChild(consoleEl);
                iconSide.style.display = 'none';
                iconOverlay.style.display = 'block';
            }
        };

        document.getElementById('layout-toggle').addEventListener('click', () => {
            isSideMode = !isSideMode;
            localStorage.setItem(LAYOUT_KEY, isSideMode ? 'side' : 'overlay');
            applyLayout();
        });

        applyLayout();

        const BAR_PIN_KEY = 'twine_player_bar_pinned';
        let isBarPinned = localStorage.getItem(BAR_PIN_KEY) === 'true';

        const applyBarPin = () => {
            if (isBarPinned) {
                document.body.classList.add('bar-pinned');
            } else {
                document.body.classList.remove('bar-pinned');
            }
        };

        document.getElementById('pin-bar-btn').addEventListener('click', () => {
            isBarPinned = !isBarPinned;
            localStorage.setItem(BAR_PIN_KEY, isBarPinned);
            applyBarPin();
        });

        applyBarPin();

        const hashString = (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString();
        };

        const printLog = (msg, type = 'normal') => {
            const div = document.createElement('div');
            div.className = `log-entry ${type}`;
            div.textContent = msg;
            outputEl.appendChild(div);
            outputEl.scrollTop = outputEl.scrollHeight;
        };

        const getSavedCommandsForAllGames = () => {
            return JSON.parse(localStorage.getItem(CONSOLE_HISTORY_KEY) || '{}');
        };

        const saveCommandsForAllGames = (data) => {
            localStorage.setItem(CONSOLE_HISTORY_KEY, JSON.stringify(data));
        };

        const renderSavedCommands = () => {
            savedListEl.innerHTML = '';
            if (!currentIfid) return;

            const allSaved = getSavedCommandsForAllGames();
            const myCmds = allSaved[currentIfid] || [];

            if (myCmds.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'saved-command-item';
                empty.style.color = '#64748b';
                empty.textContent = 'No saved commands yet.';
                savedListEl.appendChild(empty);
                return;
            }

            myCmds.forEach((cmd, idx) => {
                const div = document.createElement('div');
                div.className = 'saved-command-item';

                const textSpan = document.createElement('span');
                textSpan.className = 'cmd-text';
                textSpan.textContent = cmd;
                textSpan.title = cmd;

                textSpan.addEventListener('click', () => {
                    inputEl.value = cmd;
                    inputEl.focus();
                });

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '4px';

                const runBtn = document.createElement('button');
                runBtn.className = 'cmd-run';
                runBtn.title = 'Run command';
                runBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                runBtn.addEventListener('click', () => executeCommand(cmd));

                const delBtn = document.createElement('button');
                delBtn.className = 'cmd-del';
                delBtn.title = 'Delete saved command';
                delBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
                delBtn.addEventListener('click', () => {
                    myCmds.splice(idx, 1);
                    allSaved[currentIfid] = myCmds;
                    saveCommandsForAllGames(allSaved);
                    renderSavedCommands();
                });

                actions.appendChild(runBtn);
                actions.appendChild(delBtn);

                div.appendChild(textSpan);
                div.appendChild(actions);
                savedListEl.appendChild(div);
            });
        };

        const executeCommand = (cmd) => {
            if (!cmd.trim()) return;
            printLog(`> ${cmd}`, 'input');
            try {
                const cw = iframe.contentWindow;
                const result = cw.eval(cmd);

                if (typeof result === 'object' && result !== null) {
                    printLog(`<- ${JSON.stringify(result, null, 2)}`, 'result');
                } else if (result !== undefined) {
                    printLog(`<- ${String(result)}`, 'result');
                } else {
                    printLog(`<- undefined`, 'result');
                }
            } catch (err) {
                printLog(`Err: ${err.message}`, 'error');
            }
            inputEl.value = '';
        };

        document.getElementById('console-execute').addEventListener('click', () => executeCommand(inputEl.value));

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                executeCommand(inputEl.value);
            }
        });

        document.getElementById('console-save').addEventListener('click', () => {
            const cmd = inputEl.value.trim();
            if (!cmd || !currentIfid) return;

            const allSaved = getSavedCommandsForAllGames();
            if (!allSaved[currentIfid]) {
                allSaved[currentIfid] = [];
            }

            if (!allSaved[currentIfid].includes(cmd)) {
                allSaved[currentIfid].push(cmd);
                saveCommandsForAllGames(allSaved);
                renderSavedCommands();
                printLog(`// Command saved.`, 'normal');
            }
        });

        iframe.onload = () => {
            try {
                const cw = iframe.contentWindow;
                const storyData = cw.document.querySelector('tw-storydata');

                if (storyData && storyData.getAttribute('ifid')) {
                    currentIfid = storyData.getAttribute('ifid');
                    printLog(`// Game linked by IFID: ${currentIfid}`, 'result');
                } else {
                    currentIfid = 'fallback_' + hashString(gameUrl || title);
                    printLog(`// No IFID found. Falling back to path hash: ${currentIfid}`, 'normal');
                }
                renderSavedCommands();
            } catch (err) {
                printLog(`Err reading game data (CORS?): ${err.message}`, 'error');
            }

            // --- Illustrator Feature: init after iframe loads ---
            try {
                initIllustrator();
            } catch (err) {
                // Non-fatal: illustrator failure must never affect the game
                console.warn('Illustrator init error (non-fatal):', err);
            }
            // --- End Illustrator Feature init ---
        };

        /* --- Autocomplete Logic --- */
        const autocompleteList = document.getElementById('autocomplete-list');
        let suggestions = [];
        let selectedSuggestionIndex = -1;

        const getCompletions = (inputText) => {
            if (!inputText) return [];
            try {
                const cw = iframe.contentWindow;
                const match = inputText.match(/(([a-zA-Z_$][0-9a-zA-Z_$]*\.)*)([a-zA-Z_$][0-9a-zA-Z_$]*)$/);

                let baseObj = cw;
                let prefix = inputText;
                let pathStr = "";

                if (match) {
                    pathStr = match[1] || "";
                    const baseStr = pathStr.slice(0, -1);
                    prefix = match[3] || "";

                    if (baseStr) {
                        baseObj = cw.eval(baseStr);
                    }
                } else if (inputText.endsWith('.')) {
                    pathStr = inputText;
                    const baseStr = pathStr.slice(0, -1);
                    prefix = "";
                    baseObj = cw.eval(baseStr);
                }

                if (baseObj == null) return [];

                let props = [];
                let currentObj = baseObj;
                while (currentObj) {
                    props = props.concat(Object.getOwnPropertyNames(currentObj));
                    currentObj = Object.getPrototypeOf(currentObj);
                }

                const uniqueProps = [...new Set(props)];
                const filtered = uniqueProps.filter(p => p.startsWith(prefix) && p !== prefix);
                filtered.sort();

                return filtered.map(prop => ({
                    propName: prop,
                    fullPath: pathStr + prop,
                    prefix: prefix
                })).slice(0, 50);

            } catch (e) {
                return [];
            }
        };

        const renderAutocomplete = () => {
            const val = inputEl.value;
            suggestions = getCompletions(val);
            selectedSuggestionIndex = -1;

            if (suggestions.length === 0) {
                autocompleteList.classList.remove('active');
                autocompleteList.innerHTML = '';
                return;
            }

            autocompleteList.innerHTML = '';
            suggestions.forEach((item, index) => {
                const li = document.createElement('li');
                li.className = 'suggestion-item';

                const matchSpan = document.createElement('span');
                matchSpan.className = 'suggestion-match';
                matchSpan.textContent = item.prefix;

                const restSpan = document.createElement('span');
                restSpan.textContent = item.propName.substring(item.prefix.length);

                li.appendChild(matchSpan);
                li.appendChild(restSpan);

                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    insertSuggestion(item.fullPath);
                });

                autocompleteList.appendChild(li);
            });
            autocompleteList.classList.add('active');
        };

        const updateSuggestionHighlight = () => {
            const items = autocompleteList.querySelectorAll('.suggestion-item');
            items.forEach((item, idx) => {
                if (idx === selectedSuggestionIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('selected');
                }
            });
        };

        const insertSuggestion = (fullPath) => {
            const val = inputEl.value;
            const match = val.match(/([a-zA-Z_$][0-9a-zA-Z_$.]*)$/);
            if (match) {
                inputEl.value = val.substring(0, val.length - match[0].length) + fullPath;
            } else {
                inputEl.value += fullPath;
            }
            autocompleteList.classList.remove('active');
            inputEl.focus();
        };

        inputEl.addEventListener('input', () => {
            renderAutocomplete();
        });

        inputEl.addEventListener('keydown', (e) => {
            if (autocompleteList.classList.contains('active')) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selectedSuggestionIndex < suggestions.length - 1) {
                        selectedSuggestionIndex++;
                        updateSuggestionHighlight();
                    }
                    return;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectedSuggestionIndex > 0) {
                        selectedSuggestionIndex--;
                        updateSuggestionHighlight();
                    }
                    return;
                } else if (e.key === 'Tab') {
                    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
                        e.preventDefault();
                        insertSuggestion(suggestions[selectedSuggestionIndex].fullPath);
                        return;
                    }
                } else if (e.key === 'Escape') {
                    autocompleteList.classList.remove('active');
                    return;
                } else if (e.key === 'Enter') {
                    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
                        e.preventDefault();
                        insertSuggestion(suggestions[selectedSuggestionIndex].fullPath);
                        return;
                    }
                }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                executeCommand(inputEl.value);
                autocompleteList.classList.remove('active');
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== inputEl && !autocompleteList.contains(e.target)) {
                autocompleteList.classList.remove('active');
            }
        });

