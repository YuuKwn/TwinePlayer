        /* ================================================================
           ILLUSTRATOR FEATURE
           ================================================================ */

        // Fallback values used when a service is unreachable on open
        const ILLUS_FALLBACK_OLLAMA_MODEL = 'llama3.2';
        const ILLUS_FALLBACK_CHECKPOINT = 'waiIllustriousSDXL_v160.safetensors';

        const illusOverlay    = document.getElementById('illustrator-modal-overlay');
        const illusStatus     = document.getElementById('illus-status');
        const illusSpinner    = document.getElementById('illus-spinner');
        const illusPlaceholder = document.getElementById('illus-image-placeholder');
        const illusResultImg  = document.getElementById('illus-result-img');
        const illusDownloadBtn = document.getElementById('illus-download-btn');

        // Model / checkpoint selects
        const ollamaModelSelect    = document.getElementById('illus-ollama-model-select');
        const checkpointSelect     = document.getElementById('illus-checkpoint-select');
        const reloadOllamaBtn      = document.getElementById('illus-reload-ollama-btn');
        const reloadComfyBtn       = document.getElementById('illus-reload-comfy-btn');

        let illusOutputDir = null;
        let illusLastFilename = null;

        /* ---------- helpers ---------- */

        const setIllusStatus = (msg, type = 'idle') => {
            illusStatus.textContent = msg;
            illusStatus.className = `illus-status ${type}`;
        };

        const setIllusLoading = (on) => {
            illusSpinner.style.display = on ? 'block' : 'none';
            illusPlaceholder.style.display = on ? 'none' : (illusResultImg.style.display === 'none' ? 'flex' : 'none');
        };

        /** Populate a <select> with a list of strings. Shows an error option on failure. */
        const populateSelect = (selectEl, items, fallback, errorMsg) => {
            selectEl.innerHTML = '';
            if (!items || items.length === 0) {
                const opt = document.createElement('option');
                opt.value = fallback;
                opt.textContent = errorMsg || `${fallback} (service unreachable)`;
                selectEl.appendChild(opt);
                return;
            }
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                opt.textContent = item;
                selectEl.appendChild(opt);
            });
            // Pre-select the fallback value if it exists in the list
            if ([...selectEl.options].some(o => o.value === fallback)) {
                selectEl.value = fallback;
            }
        };

        /** Spin the reload icon while a fetch is in progress */
        const withSpinningReload = async (btn, fn) => {
            btn.classList.add('spinning');
            btn.disabled = true;
            try {
                await fn();
            } finally {
                btn.classList.remove('spinning');
                btn.disabled = false;
            }
        };

        /* ---------- model list loaders ---------- */

        const loadOllamaModels = async () => {
            await withSpinningReload(reloadOllamaBtn, async () => {
                const res = await window.illustratorAPI.listOllamaModels();
                if (res.success && res.models.length > 0) {
                    populateSelect(ollamaModelSelect, res.models, ILLUS_FALLBACK_OLLAMA_MODEL);
                } else {
                    populateSelect(ollamaModelSelect, null, ILLUS_FALLBACK_OLLAMA_MODEL,
                        `${ILLUS_FALLBACK_OLLAMA_MODEL} (Ollama unreachable)`);
                }
            });
        };

        const loadComfyUIModels = async () => {
            await withSpinningReload(reloadComfyBtn, async () => {
                const res = await window.illustratorAPI.listComfyUIModels();
                if (res.success && res.models.length > 0) {
                    populateSelect(checkpointSelect, res.models, ILLUS_FALLBACK_CHECKPOINT);
                } else {
                    populateSelect(checkpointSelect, null, ILLUS_FALLBACK_CHECKPOINT,
                        `${ILLUS_FALLBACK_CHECKPOINT} (ComfyUI unreachable)`);
                }
            });
        };

        /* ---------- reload buttons ---------- */
        reloadOllamaBtn.addEventListener('click', loadOllamaModels);
        reloadComfyBtn.addEventListener('click', loadComfyUIModels);

        /* ---------- open / close ---------- */

        document.getElementById('toggle-illustrator').addEventListener('click', async () => {
            illusOverlay.classList.add('active');

            // Capture current scene text from the iframe, targeting only the story passage.
            try {
                const cw = iframe.contentWindow;
                const doc = cw.document;
                const passageEl =
                    doc.querySelector('#passage') ||
                    doc.querySelector('#passages .passage') ||
                    doc.querySelector('#passages') ||
                    doc.body;
                const sceneText = passageEl ? passageEl.innerText : '';
                if (sceneText.trim()) {
                    document.getElementById('illus-scene-text').value = sceneText.trim().slice(0, 2000);
                }
            } catch (e) { /* cross-origin Ã¢â‚¬â€ leave textarea as-is */ }

            // Ensure output dir exists
            if (gameUrl && !illusOutputDir) {
                const dirRes = await window.illustratorAPI.ensureOutputDir(gameUrl);
                if (dirRes.success) illusOutputDir = dirRes.path;
            }

            // Populate model dropdowns (parallel)
            await Promise.all([loadOllamaModels(), loadComfyUIModels()]);
        });

        document.getElementById('close-illustrator-btn').addEventListener('click', () => {
            illusOverlay.classList.remove('active');
        });

        illusOverlay.addEventListener('click', (e) => {
            if (e.target === illusOverlay) illusOverlay.classList.remove('active');
        });

        /* ---------- generate prompt via Ollama ---------- */

        document.getElementById('illus-generate-prompt-btn').addEventListener('click', async () => {
            const sceneText = document.getElementById('illus-scene-text').value.trim();
            if (!sceneText) {
                setIllusStatus('Paste or capture some scene text first.', 'error');
                return;
            }

            const chosenModel = ollamaModelSelect.value || ILLUS_FALLBACK_OLLAMA_MODEL;

            document.getElementById('illus-generate-prompt-btn').disabled = true;
            setIllusStatus(`Asking ${chosenModel}Ã¢â‚¬Â¦`, 'working');

            const res = await window.illustratorAPI.generatePrompt(sceneText, chosenModel);

            document.getElementById('illus-generate-prompt-btn').disabled = false;

            if (res.success) {
                document.getElementById('illus-prompt-text').value = res.prompt;
                setIllusStatus('Prompt ready. Edit it or generate the image directly.', 'done');
            } else {
                setIllusStatus(`Ollama error: ${res.error}`, 'error');
            }
        });

        /* ---------- generate image via ComfyUI ---------- */

        document.getElementById('illus-generate-image-btn').addEventListener('click', async () => {
            const prompt = document.getElementById('illus-prompt-text').value.trim();
            if (!prompt) {
                setIllusStatus('Write or generate a prompt first.', 'error');
                return;
            }

            const checkpoint = checkpointSelect.value || ILLUS_FALLBACK_CHECKPOINT;

            if (!illusOutputDir && gameUrl) {
                const dirRes = await window.illustratorAPI.ensureOutputDir(gameUrl);
                if (dirRes.success) illusOutputDir = dirRes.path;
            }

            const outputFilename = `illus_${Date.now()}`;

            document.getElementById('illus-generate-image-btn').disabled = true;
            setIllusStatus(`Queuing job with ${checkpoint}Ã¢â‚¬Â¦`, 'working');
            setIllusLoading(true);
            illusResultImg.style.display = 'none';
            illusDownloadBtn.style.display = 'none';

            const queueRes = await window.illustratorAPI.queueComfyUI({
                imagePrompt: prompt,
                outputFilename,
                checkpoint
            });

            if (!queueRes.success) {
                setIllusStatus(`ComfyUI error: ${queueRes.error}`, 'error');
                setIllusLoading(false);
                illusPlaceholder.style.display = 'flex';
                document.getElementById('illus-generate-image-btn').disabled = false;
                return;
            }

            const promptId = queueRes.promptId;
            setIllusStatus('GeneratingÃ¢â‚¬Â¦ (polling ComfyUI)', 'working');

            // Poll until done or error
            const pollInterval = setInterval(async () => {
                const pollRes = await window.illustratorAPI.pollImage({
                    promptId,
                    gamePath: gameUrl
                });

                if (pollRes.pending) return; // still working

                clearInterval(pollInterval);
                setIllusLoading(false);
                document.getElementById('illus-generate-image-btn').disabled = false;

                if (pollRes.success) {
                    illusResultImg.src = pollRes.dataUrl;
                    illusResultImg.style.display = 'block';
                    illusPlaceholder.style.display = 'none';
                    illusLastFilename = pollRes.filename;
                    illusDownloadBtn.style.display = 'block';
                    setIllusStatus('Done! Image generated successfully.', 'done');
                } else {
                    illusPlaceholder.style.display = 'flex';
                    setIllusStatus(`Generation failed: ${pollRes.error}`, 'error');
                }
            }, 2000);
        });

        /* ---------- download ---------- */

        illusDownloadBtn.addEventListener('click', () => {
            if (!illusResultImg.src) return;
            const a = document.createElement('a');
            a.href = illusResultImg.src;
            a.download = illusLastFilename || `illustration_${Date.now()}.png`;
            a.click();
        });

        /* ---------- init (called after iframe loads) ---------- */

        function initIllustrator() {
            // Nothing async needed here Ã¢â‚¬â€ model loading happens on modal open.
            // This hook exists so future per-game init logic can live here.
        }

        /* ================================================================
           END ILLUSTRATOR FEATURE
           ================================================================ */

