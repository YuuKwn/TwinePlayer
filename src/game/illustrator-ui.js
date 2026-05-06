        /* ================================================================
           ILLUSTRATOR FEATURE
           ================================================================ */

        const ILLUSTRATOR_CONFIG_KEY = 'twine_player_illustrator_config';
        const DEFAULT_ILLUSTRATOR_CONFIG = {
            textBackend: 'ollama',
            textEndpoint: 'http://localhost:11434',
            textModel: 'llama3.2',
            comfyEndpoint: 'http://localhost:8188',
            checkpoint: 'waiIllustriousSDXL_v160.safetensors',
            imageWidth: 832,
            imageHeight: 1216,
            sampler: 'euler',
            scheduler: 'normal',
            steps: 20,
            cfg: 7,
            negativePrompt: 'blurry, low quality, watermark, text, ugly',
            maxPollingMs: 120000,
        };

        const illusOverlay = document.getElementById('illustrator-modal-overlay');
        const illusStatus = document.getElementById('illus-status');
        const illusSpinner = document.getElementById('illus-spinner');
        const illusPlaceholder = document.getElementById('illus-image-placeholder');
        const illusResultImg = document.getElementById('illus-result-img');
        const illusDownloadBtn = document.getElementById('illus-download-btn');

        const textBackendSelect = document.getElementById('illus-text-backend-select');
        const textEndpointInput = document.getElementById('illus-text-endpoint-input');
        const ollamaModelSelect = document.getElementById('illus-ollama-model-select');
        const comfyEndpointInput = document.getElementById('illus-comfy-endpoint-input');
        const checkpointSelect = document.getElementById('illus-checkpoint-select');
        const reloadOllamaBtn = document.getElementById('illus-reload-ollama-btn');
        const reloadComfyBtn = document.getElementById('illus-reload-comfy-btn');
        const widthInput = document.getElementById('illus-width-input');
        const heightInput = document.getElementById('illus-height-input');
        const stepsInput = document.getElementById('illus-steps-input');
        const cfgInput = document.getElementById('illus-cfg-input');
        const samplerInput = document.getElementById('illus-sampler-input');
        const schedulerInput = document.getElementById('illus-scheduler-input');
        const negativePromptText = document.getElementById('illus-negative-prompt-text');
        const generateImageBtn = document.getElementById('illus-generate-image-btn');
        const cancelImageBtn = document.getElementById('illus-cancel-image-btn');

        let illusOutputDir = null;
        let illusLastFilename = null;
        let previouslyFocusedIllustratorElement = null;
        let illustratorDefaults = { ...DEFAULT_ILLUSTRATOR_CONFIG };
        let activePollTimer = null;
        let activePollStartedAt = 0;

        const setIllusStatus = (msg, type = 'idle') => {
            illusStatus.textContent = msg;
            illusStatus.className = `illus-status ${type}`;
        };

        const setIllusLoading = (on) => {
            illusSpinner.style.display = on ? 'block' : 'none';
            illusPlaceholder.style.display = on ? 'none' : (illusResultImg.style.display === 'none' ? 'flex' : 'none');
        };

        const readStoredConfig = () => {
            const stored = window.TwinePlayerStorage.readJson(localStorage, ILLUSTRATOR_CONFIG_KEY, {});
            return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        };

        const numberFromInput = (input, fallback) => {
            const value = Number(input.value);
            return Number.isFinite(value) ? value : fallback;
        };

        const getIllustratorConfig = () => ({
            ...illustratorDefaults,
            textBackend: textBackendSelect.value || illustratorDefaults.textBackend,
            textEndpoint: textEndpointInput.value.trim() || illustratorDefaults.textEndpoint,
            textModel: ollamaModelSelect.value || illustratorDefaults.textModel,
            comfyEndpoint: comfyEndpointInput.value.trim() || illustratorDefaults.comfyEndpoint,
            checkpoint: checkpointSelect.value || illustratorDefaults.checkpoint,
            imageWidth: numberFromInput(widthInput, illustratorDefaults.imageWidth),
            imageHeight: numberFromInput(heightInput, illustratorDefaults.imageHeight),
            sampler: samplerInput.value.trim() || illustratorDefaults.sampler,
            scheduler: schedulerInput.value.trim() || illustratorDefaults.scheduler,
            steps: numberFromInput(stepsInput, illustratorDefaults.steps),
            cfg: numberFromInput(cfgInput, illustratorDefaults.cfg),
            negativePrompt: negativePromptText.value.trim() || illustratorDefaults.negativePrompt,
        });

        const persistIllustratorConfig = () => {
            window.TwinePlayerStorage.writeJson(localStorage, ILLUSTRATOR_CONFIG_KEY, getIllustratorConfig());
        };

        const addOrSelectOption = (selectEl, value) => {
            if (!value) return;
            if (![...selectEl.options].some(option => option.value === value)) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                selectEl.appendChild(option);
            }
            selectEl.value = value;
        };

        const applyIllustratorConfig = (config) => {
            textBackendSelect.value = config.textBackend;
            textEndpointInput.value = config.textEndpoint;
            addOrSelectOption(ollamaModelSelect, config.textModel);
            comfyEndpointInput.value = config.comfyEndpoint;
            addOrSelectOption(checkpointSelect, config.checkpoint);
            widthInput.value = config.imageWidth;
            heightInput.value = config.imageHeight;
            stepsInput.value = config.steps;
            cfgInput.value = config.cfg;
            samplerInput.value = config.sampler;
            schedulerInput.value = config.scheduler;
            negativePromptText.value = config.negativePrompt;
        };

        const loadIllustratorConfig = async () => {
            if (window.illustratorAPI.getDefaultConfig) {
                const res = await window.illustratorAPI.getDefaultConfig();
                if (res.success && res.config) {
                    illustratorDefaults = { ...DEFAULT_ILLUSTRATOR_CONFIG, ...res.config };
                }
            }
            applyIllustratorConfig({ ...illustratorDefaults, ...readStoredConfig() });
        };

        const getFocusableElements = (container) => {
            return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                .filter(el => !el.disabled && el.offsetParent !== null);
        };

        const focusFirstIllustratorControl = () => {
            const firstControl = getFocusableElements(illusOverlay)[0];
            if (firstControl) firstControl.focus();
        };

        const closeIllustratorModal = () => {
            illusOverlay.classList.remove('active');
            if (previouslyFocusedIllustratorElement && typeof previouslyFocusedIllustratorElement.focus === 'function') {
                previouslyFocusedIllustratorElement.focus();
            }
            previouslyFocusedIllustratorElement = null;
        };

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
            addOrSelectOption(selectEl, fallback);
        };

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

        const loadOllamaModels = async () => {
            await withSpinningReload(reloadOllamaBtn, async () => {
                persistIllustratorConfig();
                const config = getIllustratorConfig();
                const res = window.illustratorAPI.listTextModels
                    ? await window.illustratorAPI.listTextModels(config)
                    : await window.illustratorAPI.listOllamaModels(config);
                if (res.success && res.models.length > 0) {
                    populateSelect(ollamaModelSelect, res.models, config.textModel);
                } else {
                    populateSelect(ollamaModelSelect, null, config.textModel, `${config.textModel} (${config.textBackend} unreachable)`);
                }
            });
        };

        const loadComfyUIModels = async () => {
            await withSpinningReload(reloadComfyBtn, async () => {
                persistIllustratorConfig();
                const config = getIllustratorConfig();
                const res = await window.illustratorAPI.listComfyUIModels(config);
                if (res.success && res.models.length > 0) {
                    populateSelect(checkpointSelect, res.models, config.checkpoint);
                } else {
                    populateSelect(checkpointSelect, null, config.checkpoint, `${config.checkpoint} (ComfyUI unreachable)`);
                }
            });
        };

        reloadOllamaBtn.addEventListener('click', loadOllamaModels);
        reloadComfyBtn.addEventListener('click', loadComfyUIModels);

        [
            textBackendSelect,
            textEndpointInput,
            ollamaModelSelect,
            comfyEndpointInput,
            checkpointSelect,
            widthInput,
            heightInput,
            stepsInput,
            cfgInput,
            samplerInput,
            schedulerInput,
            negativePromptText,
        ].forEach(element => {
            element.addEventListener('change', persistIllustratorConfig);
            element.addEventListener('blur', persistIllustratorConfig);
        });

        document.getElementById('toggle-illustrator').addEventListener('click', async () => {
            previouslyFocusedIllustratorElement = document.activeElement;
            illusOverlay.classList.add('active');
            await loadIllustratorConfig();

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
            } catch (e) {
                // Cross-origin games leave the textarea as-is.
            }

            if (gameUrl && !illusOutputDir) {
                const dirRes = await window.illustratorAPI.ensureOutputDir(gameUrl);
                if (dirRes.success) illusOutputDir = dirRes.path;
            }

            await Promise.all([loadOllamaModels(), loadComfyUIModels()]);
            requestAnimationFrame(focusFirstIllustratorControl);
        });

        document.getElementById('close-illustrator-btn').addEventListener('click', closeIllustratorModal);

        illusOverlay.addEventListener('click', (e) => {
            if (e.target === illusOverlay) closeIllustratorModal();
        });

        illusOverlay.addEventListener('keydown', (e) => {
            if (!illusOverlay.classList.contains('active')) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                closeIllustratorModal();
                return;
            }

            if (e.key !== 'Tab') return;
            const focusable = getFocusableElements(illusOverlay);
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

        document.getElementById('illus-generate-prompt-btn').addEventListener('click', async () => {
            const sceneText = document.getElementById('illus-scene-text').value.trim();
            if (!sceneText) {
                setIllusStatus('Paste or capture some scene text first.', 'error');
                return;
            }

            persistIllustratorConfig();
            const config = getIllustratorConfig();
            const chosenModel = config.textModel;

            document.getElementById('illus-generate-prompt-btn').disabled = true;
            setIllusStatus(`Asking ${chosenModel}...`, 'working');

            const res = await window.illustratorAPI.generatePrompt(sceneText, chosenModel, config);

            document.getElementById('illus-generate-prompt-btn').disabled = false;

            if (res.success) {
                document.getElementById('illus-prompt-text').value = res.prompt;
                setIllusStatus('Prompt ready. Edit it or generate the image directly.', 'done');
            } else {
                setIllusStatus(`Text backend error: ${res.error}`, 'error');
            }
        });

        generateImageBtn.addEventListener('click', async () => {
            const prompt = document.getElementById('illus-prompt-text').value.trim();
            if (!prompt) {
                setIllusStatus('Write or generate a prompt first.', 'error');
                return;
            }

            persistIllustratorConfig();
            const config = getIllustratorConfig();
            const checkpoint = config.checkpoint;

            if (!illusOutputDir && gameUrl) {
                const dirRes = await window.illustratorAPI.ensureOutputDir(gameUrl);
                if (dirRes.success) illusOutputDir = dirRes.path;
            }

            const outputFilename = `twineplayer_${Date.now()}`;

            generateImageBtn.disabled = true;
            cancelImageBtn.style.display = 'inline-flex';
            setIllusStatus(`Queuing job with ${checkpoint}...`, 'working');
            setIllusLoading(true);
            illusResultImg.style.display = 'none';
            illusDownloadBtn.style.display = 'none';

            const queueRes = await window.illustratorAPI.queueComfyUI({
                imagePrompt: prompt,
                outputFilename,
                checkpoint,
                config,
            });

            if (!queueRes.success) {
                setIllusStatus(`ComfyUI error: ${queueRes.error}`, 'error');
                setIllusLoading(false);
                illusPlaceholder.style.display = 'flex';
                generateImageBtn.disabled = false;
                cancelImageBtn.style.display = 'none';
                return;
            }

            const promptId = queueRes.promptId;
            activePollStartedAt = Date.now();
            setIllusStatus('Generating... (polling ComfyUI)', 'working');

            activePollTimer = setInterval(async () => {
                if (Date.now() - activePollStartedAt > config.maxPollingMs) {
                    clearInterval(activePollTimer);
                    activePollTimer = null;
                    setIllusLoading(false);
                    illusPlaceholder.style.display = 'flex';
                    generateImageBtn.disabled = false;
                    cancelImageBtn.style.display = 'none';
                    setIllusStatus('Generation timed out. The ComfyUI job may still finish in its queue.', 'error');
                    return;
                }

                const pollRes = await window.illustratorAPI.pollImage({
                    promptId,
                    gamePath: gameUrl,
                    config,
                });

                if (pollRes.pending) return;

                clearInterval(activePollTimer);
                activePollTimer = null;
                setIllusLoading(false);
                generateImageBtn.disabled = false;
                cancelImageBtn.style.display = 'none';

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

        cancelImageBtn.addEventListener('click', () => {
            if (activePollTimer) {
                clearInterval(activePollTimer);
                activePollTimer = null;
            }
            setIllusLoading(false);
            illusPlaceholder.style.display = illusResultImg.style.display === 'none' ? 'flex' : 'none';
            generateImageBtn.disabled = false;
            cancelImageBtn.style.display = 'none';
            setIllusStatus('Generation canceled. The ComfyUI job may still finish in its queue.', 'idle');
        });

        illusDownloadBtn.addEventListener('click', () => {
            if (!illusResultImg.src) return;
            const a = document.createElement('a');
            a.href = illusResultImg.src;
            a.download = illusLastFilename || `illustration_${Date.now()}.png`;
            a.click();
        });

        function initIllustrator() {
            // Model loading happens on modal open.
        }

        /* ================================================================
           END ILLUSTRATOR FEATURE
           ================================================================ */
