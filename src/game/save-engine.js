        /* ================================================================
           SAVE / LOAD - SugarCube engine bridge
           ================================================================

           detectEngine(): inspects the iframe's contentWindow to identify
           which SugarCube version is running.
             Returns 'sc2' | 'sc1' | 'unknown'

           executeSaveCapture(): reads the current game state directly from
           the iframe via the SugarCube JS API and returns a Blob.
             - SC2: window.Save.serialize() to base64 string to UTF-8 Blob
             - SC1: window.save.serialize() (same pattern, different namespace)
             Throws on failure so the caller can show an error.

           restoreSaveData(text): writes save data back into the game.
             - SC2: window.Save.deserialize(text)
             - SC1: window.save.deserialize(text)
             Throws on failure so the caller can show an error.
        ================================================================ */

        const detectEngine = () => {
            const cw = iframe.contentWindow;
            if (cw && cw.__twineEngineType) return cw.__twineEngineType;

            try {
                if (!cw) return 'unknown';
                const win = cw.window || cw;
                if (!win) return 'unknown';

                // Check SC2 (including Sugarcube namespace fallback)
                const sc2 = win.Save || (win.SugarCube && win.SugarCube.Save);
                if (sc2 && (typeof sc2.serialize === 'function' || typeof sc2.export === 'function' || (sc2.base64 && typeof sc2.base64.export === 'function'))) {
                    cw.__twineEngineType = 'sc2';
                    cw.__twineSaveApi = sc2;
                    return 'sc2';
                }

                // Check SC1
                const sc1 = win.save;
                if (sc1 && typeof sc1.serialize === 'function') {
                    cw.__twineEngineType = 'sc1';
                    cw.__twineSaveApi = sc1;
                    return 'sc1';
                }

                // Diagnostics if unknown: help us identify the engine object
                console.warn("Detection diagnostic: No standard Twine engine found on window.");
            } catch (e) {
                console.warn("Detection diagnostic: access error (likely CORS):", e.message);
            }
            return 'unknown';
        };

        const executeSaveCapture = async () => {
            const cw = iframe.contentWindow;
            const engine = detectEngine();
            const api = cw.__twineSaveApi;
            const nativeSaveFilename = 'twineplayer-save';

            try {
                if (engine === 'sc2' && api) {
                    // Priority: Native Export (HTML wrapped)
                    // This is essential for Strategy 2 (Dialog Proxy) load to work, 
                    // as the engine's internal reader expects the HTML wrapper.
                    if (typeof api.export === 'function') {
                        printLog(`// Capturing via native Save.export...`, 'normal');
                        const htmlData = api.export(nativeSaveFilename);
                        return new Blob([htmlData], { type: 'text/html;charset=UTF-8' });
                    }
                    // Fallback: Base64 Serialization
                    if (typeof api.serialize === 'function') {
                        printLog(`// Capturing via native Save.serialize...`, 'normal');
                        return new Blob([api.serialize()], { type: 'text/plain;charset=utf-8' });
                    }
                    if (api.base64 && typeof api.base64.export === 'function') {
                        printLog(`// Capturing via native Save.base64.export...`, 'normal');
                        return new Blob([api.base64.export()], { type: 'text/plain;charset=utf-8' });
                    }
                } else if (engine === 'sc1' && api) {
                    return new Blob([api.serialize()], { type: 'text/plain;charset=utf-8' });
                }
            } catch (e) {
                printLog(`Capture error: ${e.message}`, 'error');
                throw e;
            }

            throw new Error(`Unsupported engine. Engine detected as: ${engine}`);
        };

        const restoreSaveData = (text) => {
            const cw = iframe.contentWindow;
            const engine = detectEngine();
            const api = cw.__twineSaveApi;

            const applyDeserializedSave = (saveData) => {
                if (!saveData || typeof saveData !== 'object') return false;

                const win = cw.window || cw;
                const sugarCube = win.SugarCube || {};
                const stateApi = win.State || sugarCube.State;
                const stateData = saveData.state || saveData;

                if (stateApi && typeof stateApi.unmarshalForSave === 'function' && stateData && typeof stateData === 'object') {
                    printLog(`// Applying decoded SugarCube state via unmarshalForSave...`, 'normal');
                    stateApi.unmarshalForSave(stateData);
                    return true;
                }

                if (stateApi && typeof stateApi.unmarshal === 'function' && stateData && typeof stateData === 'object') {
                    printLog(`// Applying decoded SugarCube state via unmarshal...`, 'normal');
                    stateApi.unmarshal(stateData);
                    return true;
                }

                return false;
            };

            let data = text.trim();
            printLog(`// Restoring data (${data.length} chars)...`, 'normal');
            
            // Diagnostic logging for troubleshooting
            const start = data.substring(0, 50).replace(/\r\n|\n/g, "\\n");
            const end = data.substring(data.length - 50).replace(/\r\n|\n/g, "\\n");
            printLog(`// Data envelope: [${start}...${end}]`, 'normal');

            // --- Exhaustive Format Sanitization ---
            
            // 1. Detect and strip HTML wrappers (Classic SC2 .html saves)
            if (data.includes('<html') || data.includes('<!DOCTYPE') || data.includes('<tw-serialized-save')) {
                printLog(`// HTML boilerplate detected. Extracting payload...`, 'normal');
                // Regex 1: Content from <tw-serialized-save> tag (most specific)
                const twMatch = data.match(/<tw-serialized-save[^>]*>([\s\S]*?)<\/tw-serialized-save>/i);
                if (twMatch) {
                    data = twMatch[1].trim();
                } else {
                    // Regex 2: Longest contiguous block of Base64 or JSON-safe characters
                    // This is more robust than a simple match because it avoids surrounding HTML
                    const b64Match = data.match(/[A-Za-z0-9+/=]{100,}/);
                    if (b64Match) {
                       data = b64Match[0];
                    } else {
                       const jsonMatch = data.match(/\{[\s\S]*\}/);
                       if (jsonMatch) data = jsonMatch[0];
                    }
                }
            }

            // 2. Clear Whitespace/BOMs and Sanitize
            data = data.replace(/^\s+|\s+$/g, ''); 
            
            try {
                if (engine === 'sc2' && api) {
                    let res = false;
                    
                    // Priority A: JSON Data (State Object)
                    if (data.startsWith('{')) {
                        try {
                            const obj = JSON.parse(data);
                            printLog(`// Loading as JSON State Object...`, 'normal');
                            res = applyDeserializedSave(obj) ? true : obj;
                        } catch (e) {
                            console.warn("JSON parse failed, trying as string", e);
                        }
                    }

                    // Priority B: Base64 String (Modern Standard)
                    // We must filter for STRICT base64 characters only to avoid SC2 rejection
                    if (res === false) {
                        // Strip non-Base64 legal characters (Newlines, spaces, etc are NOT allowed in base64.import)
                        const cleanB64 = data.replace(/[^A-Za-z0-9+/=]/g, '');
                        if (api.base64 && typeof api.base64.decode === 'function') {
                            printLog(`// Decoding via Save.base64.decode(string)...`, 'normal');
                            res = api.base64.decode(cleanB64);
                        } else if (typeof api.deserialize === 'function') {
                            printLog(`// Loading via Save.deserialize(string)...`, 'normal');
                            res = api.deserialize(cleanB64);
                        } else if (api.base64 && typeof api.base64.import === 'function') {
                            printLog(`// Loading via base64.import...`, 'normal');
                            res = api.base64.import(cleanB64);
                        }
                    }

                    if (res && typeof res === 'object') {
                        if (!applyDeserializedSave(res)) {
                            throw new Error('Save decoded, but no SugarCube state API accepted it.');
                        }
                    }

                    // Force refresh (SugarCube doesn't always redraw on manual restoration)
                    if (res !== false && res !== null) {
                        const win = cw.window || cw;
                        if (win.Engine && typeof win.Engine.show === 'function') {
                            printLog(`// Refreshing game UI...`, 'normal');
                            win.Engine.show();
                        }
                        return;
                    }
                    throw new Error('Engine rejected the save data (missing id or state).');
                } else if (engine === 'sc1' && api) {
                    api.deserialize(data);
                    return;
                }
            } catch (e) {
                printLog(`Restore error: ${e.message}`, 'error');
                throw e; // Rethrow to show in the UI
            }
            throw new Error(`Unsupported engine or restore failed. Engine: ${engine}`);
        };

