        /* ================================================================
           ILLUSTRATOR FEATURE
           ================================================================ */

        const ILLUSTRATOR_CONFIG_KEY = 'twine_player_illustrator_config';
        const {
            DEFAULT_RENDERER_ILLUSTRATOR_CONFIG,
            classifyEndpointHost,
            createOutputFilename,
            createSceneExcerpt,
            createServiceProfileId,
            getIllustrationDisplayState,
            hashSceneText,
            normalizeRendererIllustratorConfig,
            normalizeServiceProfiles,
        } = window.TwinePlayerIllustratorHelpers;
        const ILLUSTRATOR_PROFILES_KEY = 'twine_player_illustrator_profiles';

        const illusOverlay = document.getElementById('illustrator-modal-overlay');
        const illusStatus = document.getElementById('illus-status');
        const illusSpinner = document.getElementById('illus-spinner');
        const illusPlaceholder = document.getElementById('illus-image-placeholder');
        const illusResultImg = document.getElementById('illus-result-img');
        const illusDownloadBtn = document.getElementById('illus-download-btn');
        const illusHealthSummary = document.getElementById('illus-health-summary');

        const profileSelect = document.getElementById('illus-profile-select');
        const saveProfileBtn = document.getElementById('illus-save-profile-btn');
        const testConnectionsBtn = document.getElementById('illus-test-connections-btn');
        const textBackendSelect = document.getElementById('illus-text-backend-select');
        const textEndpointInput = document.getElementById('illus-text-endpoint-input');
        const textEndpointClass = document.getElementById('illus-text-endpoint-class');
        const ollamaModelSelect = document.getElementById('illus-ollama-model-select');
        const comfyEndpointInput = document.getElementById('illus-comfy-endpoint-input');
        const comfyEndpointClass = document.getElementById('illus-comfy-endpoint-class');
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
        let illustratorDefaults = { ...DEFAULT_RENDERER_ILLUSTRATOR_CONFIG };
        let illustratorProfiles = [];
        let activePollTimer = null;
        let activePollStartedAt = 0;
        let lastPromptGeneratedAt = null;
        let lastSceneDocumentTitle = null;

        const setIllusStatus = (msg, type = 'idle') => {
            illusStatus.textContent = msg;
            illusStatus.className = `illus-status ${type}`;
        };

        const setHealthSummary = (msg, type = 'idle') => {
            illusHealthSummary.textContent = msg;
            illusHealthSummary.className = `illus-health-summary ${type}`;
        };

        const updateEndpointBadge = (badge, endpoint) => {
            const classification = classifyEndpointHost(endpoint);
            badge.textContent = classification.label;
            badge.className = `illus-endpoint-class ${classification.kind}`;
        };

        const updateEndpointClassifications = () => {
            updateEndpointBadge(textEndpointClass, textEndpointInput.value || illustratorDefaults.textEndpoint);
            updateEndpointBadge(comfyEndpointClass, comfyEndpointInput.value || illustratorDefaults.comfyEndpoint);
        };

        const hasIllustrationImage = () => Boolean(illusResultImg.getAttribute('src'));

        const setIllustrationDisplay = (status) => {
            const state = getIllustrationDisplayState(status, hasIllustrationImage());
            illusSpinner.classList.toggle('is-hidden', !state.showSpinner);
            illusPlaceholder.classList.toggle('is-hidden', !state.showPlaceholder);
            illusResultImg.classList.toggle('is-hidden', !state.showImage);
            illusDownloadBtn.classList.toggle('is-hidden', !state.showDownload);
            cancelImageBtn.classList.toggle('is-hidden', !state.showCancel);
        };

        const readStoredConfig = () => {
            const stored = window.TwinePlayerStorage.readJson(localStorage, ILLUSTRATOR_CONFIG_KEY, {});
            return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        };

        const readStoredProfiles = () => {
            return window.TwinePlayerStorage.readJson(localStorage, ILLUSTRATOR_PROFILES_KEY, {});
        };

        const persistCustomProfiles = () => {
            window.TwinePlayerStorage.writeJson(localStorage, ILLUSTRATOR_PROFILES_KEY, {
                profiles: illustratorProfiles.filter(profile => !profile.builtIn),
            });
        };

        const getIllustratorConfig = () => normalizeRendererIllustratorConfig({
            textBackend: textBackendSelect.value || illustratorDefaults.textBackend,
            textEndpoint: textEndpointInput.value.trim() || illustratorDefaults.textEndpoint,
            textModel: ollamaModelSelect.value || illustratorDefaults.textModel,
            comfyEndpoint: comfyEndpointInput.value.trim() || illustratorDefaults.comfyEndpoint,
            checkpoint: checkpointSelect.value || illustratorDefaults.checkpoint,
            imageWidth: widthInput.value,
            imageHeight: heightInput.value,
            sampler: samplerInput.value.trim() || illustratorDefaults.sampler,
            scheduler: schedulerInput.value.trim() || illustratorDefaults.scheduler,
            steps: stepsInput.value,
            cfg: cfgInput.value,
            negativePrompt: negativePromptText.value.trim() || illustratorDefaults.negativePrompt,
        }, illustratorDefaults);

        const persistIllustratorConfig = () => {
            window.TwinePlayerStorage.writeJson(localStorage, ILLUSTRATOR_CONFIG_KEY, getIllustratorConfig());
            updateEndpointClassifications();
        };

        const renderServiceProfiles = (selectedId = profileSelect.value) => {
            illustratorProfiles = normalizeServiceProfiles(readStoredProfiles());
            profileSelect.textContent = '';

            illustratorProfiles.forEach(profile => {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.name;
                profileSelect.appendChild(option);
            });

            if (selectedId && illustratorProfiles.some(profile => profile.id === selectedId)) {
                profileSelect.value = selectedId;
            }
        };

        const applyServiceProfile = (profileId) => {
            const profile = illustratorProfiles.find(item => item.id === profileId);
            if (!profile) return;
            applyIllustratorConfig(profile.config);
            persistIllustratorConfig();
            setHealthSummary(`Loaded profile: ${profile.name}`, 'idle');
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
            updateEndpointClassifications();
        };

        const loadIllustratorConfig = async () => {
            if (window.illustratorAPI.getDefaultConfig) {
                const res = await window.illustratorAPI.getDefaultConfig();
                if (res.success && res.config) {
                    illustratorDefaults = normalizeRendererIllustratorConfig(res.config, DEFAULT_RENDERER_ILLUSTRATOR_CONFIG);
                }
            }
            renderServiceProfiles();
            applyIllustratorConfig(normalizeRendererIllustratorConfig(readStoredConfig(), illustratorDefaults));
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
            selectEl.textContent = '';
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

        const describeServiceHealth = (health) => {
            const textLabel = health.text.status === 'ok'
                ? `${health.text.backend} text model ready`
                : health.text.status === 'missing_model'
                    ? `${health.text.model} not found at text endpoint`
                    : `Text endpoint unreachable: ${health.text.error}`;
            const comfyLabel = health.comfyUI.status === 'ok'
                ? 'ComfyUI checkpoint ready'
                : health.comfyUI.status === 'missing_checkpoint'
                    ? `${health.comfyUI.checkpoint} not found in ComfyUI`
                    : `ComfyUI unreachable: ${health.comfyUI.error}`;
            const type = health.text.status === 'ok' && health.comfyUI.status === 'ok'
                ? 'done'
                : (health.text.reachable || health.comfyUI.reachable ? 'warning' : 'error');

            return {
                message: `${textLabel}. ${comfyLabel}.`,
                type,
            };
        };

        const testConnections = async () => {
            persistIllustratorConfig();
            const config = getIllustratorConfig();
            testConnectionsBtn.disabled = true;
            setHealthSummary('Testing configured services...', 'idle');
            setIllusStatus('Testing Illustrator connections...', 'working');

            try {
                const res = await window.illustratorAPI.checkHealth(config);
                if (!res.success) {
                    setHealthSummary(`Connection test failed: ${res.error}`, 'error');
                    setIllusStatus(`Connection test failed: ${res.error}`, 'error');
                    return;
                }

                const summary = describeServiceHealth(res.health);
                setHealthSummary(summary.message, summary.type);
                setIllusStatus(summary.type === 'done' ? 'Connections ready.' : 'Connection test found issues.', summary.type === 'done' ? 'done' : 'error');
            } finally {
                testConnectionsBtn.disabled = false;
            }
        };

        const saveCurrentProfile = () => {
            const profileName = window.prompt('Profile name', 'Custom profile');
            if (!profileName || !profileName.trim()) return;

            const profile = {
                id: createServiceProfileId(profileName, String(Date.now())),
                name: profileName.trim().slice(0, 80),
                config: getIllustratorConfig(),
            };
            illustratorProfiles = normalizeServiceProfiles({
                profiles: illustratorProfiles.filter(item => !item.builtIn).concat(profile),
            });
            persistCustomProfiles();
            renderServiceProfiles(profile.id);
            profileSelect.value = profile.id;
            setHealthSummary(`Saved profile: ${profile.name}`, 'idle');
        };

        profileSelect.addEventListener('change', () => applyServiceProfile(profileSelect.value));
        saveProfileBtn.addEventListener('click', saveCurrentProfile);
        testConnectionsBtn.addEventListener('click', testConnections);
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
                lastSceneDocumentTitle = doc.title || null;
                const passageEl =
                    doc.querySelector('#passage') ||
                    doc.querySelector('#passages .passage') ||
                    doc.querySelector('#passages') ||
                    doc.body;
                const sceneText = passageEl ? passageEl.innerText : '';
                if (sceneText.trim()) {
                    document.getElementById('illus-scene-text').value = createSceneExcerpt(sceneText, 2000);
                }
            } catch (e) {
                lastSceneDocumentTitle = null;
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
                lastPromptGeneratedAt = new Date().toISOString();
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
            const sourceSceneText = document.getElementById('illus-scene-text').value.trim();
            const sceneIdentity = hashSceneText(sourceSceneText);

            if (!illusOutputDir && gameUrl) {
                const dirRes = await window.illustratorAPI.ensureOutputDir(gameUrl);
                if (dirRes.success) illusOutputDir = dirRes.path;
            }

            const outputFilename = createOutputFilename(Date.now(), sceneIdentity);

            generateImageBtn.disabled = true;
            setIllusStatus(`Queuing job with ${checkpoint}...`, 'working');
            illusResultImg.removeAttribute('src');
            setIllustrationDisplay('working');

            const queueRes = await window.illustratorAPI.queueComfyUI({
                imagePrompt: prompt,
                outputFilename,
                checkpoint,
                config,
            });

            if (!queueRes.success) {
                setIllusStatus(`ComfyUI error: ${queueRes.error}`, 'error');
                setIllustrationDisplay('error');
                generateImageBtn.disabled = false;
                return;
            }

            const promptId = queueRes.promptId;
            const seed = queueRes.seed;
            activePollStartedAt = Date.now();
            setIllusStatus('Generating... (polling ComfyUI)', 'working');

            activePollTimer = setInterval(async () => {
                if (Date.now() - activePollStartedAt > config.maxPollingMs) {
                    clearInterval(activePollTimer);
                    activePollTimer = null;
                    setIllustrationDisplay('error');
                    generateImageBtn.disabled = false;
                    setIllusStatus('Generation timed out. The ComfyUI job may still finish in its queue.', 'error');
                    return;
                }

                const pollRes = await window.illustratorAPI.pollImage({
                    promptId,
                    gamePath: gameUrl,
                    config,
                    metadata: {
                        sourceSceneText,
                        imagePrompt: prompt,
                        promptGeneratedAt: lastPromptGeneratedAt,
                        documentTitle: lastSceneDocumentTitle,
                        passageIdentity: sceneIdentity,
                        checkpoint,
                        seed,
                        workflowTemplate: queueRes.workflowTemplate,
                        workflowVersion: queueRes.workflowVersion,
                    },
                });

                if (pollRes.pending) return;

                clearInterval(activePollTimer);
                activePollTimer = null;
                generateImageBtn.disabled = false;

                if (pollRes.success) {
                    illusResultImg.src = pollRes.dataUrl;
                    illusLastFilename = pollRes.filename;
                    setIllustrationDisplay('done');
                    setIllusStatus('Done! Image generated successfully.', 'done');
                } else {
                    setIllustrationDisplay('error');
                    setIllusStatus(`Generation failed: ${pollRes.error}`, 'error');
                }
            }, 2000);
        });

        cancelImageBtn.addEventListener('click', () => {
            if (activePollTimer) {
                clearInterval(activePollTimer);
                activePollTimer = null;
            }
            setIllustrationDisplay('canceled');
            generateImageBtn.disabled = false;
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
