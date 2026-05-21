        /* ================================================================
           ILLUSTRATOR FEATURE
           ================================================================ */

        const ILLUSTRATOR_CONFIG_KEY = 'twine_player_illustrator_config';
        const {
            DEFAULT_ILLUSTRATOR_PROJECT_SETTINGS,
            DEFAULT_RENDERER_ILLUSTRATOR_CONFIG,
            classifyEndpointHost,
            createOutputFilename,
            createSceneExcerpt,
            createServiceProfileId,
            getIllustrationDisplayState,
            hashSceneText,
            normalizeIllustratorProjectSettings,
            normalizeRendererIllustratorConfig,
            normalizeSceneContext,
            normalizeServiceProfiles,
            updateSceneContextHistory,
        } = window.TwinePlayerIllustratorHelpers;
        const ILLUSTRATOR_PROFILES_KEY = 'twine_player_illustrator_profiles';
        const ILLUSTRATOR_PROJECT_KEY_PREFIX = 'twine_player_illustrator_project';

        const illusOverlay = document.getElementById('illustrator-modal-overlay');
        const illusStatus = document.getElementById('illus-status');
        const illusSpinner = document.getElementById('illus-spinner');
        const illusPlaceholder = document.getElementById('illus-image-placeholder');
        const illusResultImg = document.getElementById('illus-result-img');
        const illusDownloadBtn = document.getElementById('illus-download-btn');
        const illusHealthSummary = document.getElementById('illus-health-summary');
        const illusSceneText = document.getElementById('illus-scene-text');
        const illusSceneContextSummary = document.getElementById('illus-scene-context-summary');
        const recaptureSceneBtn = document.getElementById('illus-recapture-scene-btn');

        const profileSelect = document.getElementById('illus-profile-select');
        const saveProfileBtn = document.getElementById('illus-save-profile-btn');
        const testConnectionsBtn = document.getElementById('illus-test-connections-btn');
        const promptModeSelect = document.getElementById('illus-prompt-mode-select');
        const promptToneInput = document.getElementById('illus-prompt-tone-input');
        const styleBibleText = document.getElementById('illus-style-bible-text');
        const characterRosterText = document.getElementById('illus-character-roster-text');
        const worldNotesText = document.getElementById('illus-world-notes-text');
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
        const aspectPresetSelect = document.getElementById('illus-aspect-preset-select');
        const seedInput = document.getElementById('illus-seed-input');
        const batchSizeInput = document.getElementById('illus-batch-size-input');
        const workflowModeSelect = document.getElementById('illus-workflow-mode-select');
        const customWorkflowText = document.getElementById('illus-custom-workflow-text');
        const samplerInput = document.getElementById('illus-sampler-input');
        const schedulerInput = document.getElementById('illus-scheduler-input');
        const negativePromptText = document.getElementById('illus-negative-prompt-text');
        const generateImageBtn = document.getElementById('illus-generate-image-btn');
        const cancelImageBtn = document.getElementById('illus-cancel-image-btn');
        const retryImageBtn = document.getElementById('illus-retry-image-btn');
        const illusJobDetails = document.getElementById('illus-job-details');

        let illusOutputDir = null;
        let illusLastFilename = null;
        let previouslyFocusedIllustratorElement = null;
        let illustratorDefaults = { ...DEFAULT_RENDERER_ILLUSTRATOR_CONFIG };
        let illustratorProfiles = [];
        let currentSceneContext = null;
        let sceneContextHistory = [];
        let sceneTextDirty = false;
        let sceneObserver = null;
        let sceneObserverTimer = null;
        let activeJobId = null;
        let activeJobRefreshTimer = null;
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

        const setSceneContextSummary = (message, changed = false) => {
            illusSceneContextSummary.textContent = message;
            illusSceneContextSummary.classList.toggle('changed', changed);
        };

        const getLikelyPassageElement = (doc) => {
            return doc.querySelector('#passage') ||
                doc.querySelector('#passages .passage') ||
                doc.querySelector('#passages') ||
                doc.querySelector('tw-passage') ||
                doc.querySelector('main') ||
                doc.body;
        };

        const readSugarCubePassageName = (win) => {
            const sugarCube = win.SugarCube || (win.window && win.window.SugarCube);
            if (sugarCube && sugarCube.State && typeof sugarCube.State.passage === 'string') {
                return sugarCube.State.passage;
            }
            if (win.State && typeof win.State.passage === 'string') {
                return win.State.passage;
            }
            return null;
        };

        const readPassageNameFromElement = (element) => {
            if (!element) return null;
            return element.getAttribute('data-passage') ||
                element.getAttribute('data-passage-name') ||
                element.getAttribute('name') ||
                null;
        };

        const readTwinePassageNameFromStoryData = (doc, text) => {
            const passages = Array.from(doc.querySelectorAll('tw-storydata tw-passagedata[name]'));
            if (passages.length === 1) return passages[0].getAttribute('name');
            const normalizedText = createSceneExcerpt(text, 2000);
            const matching = passages.find(passage => createSceneExcerpt(passage.textContent || '', 2000) === normalizedText);
            return matching ? matching.getAttribute('name') : null;
        };

        const captureSceneContext = () => {
            const cw = iframe.contentWindow;
            const doc = cw.document;
            const passageEl = getLikelyPassageElement(doc);
            const text = passageEl ? (passageEl.innerText || passageEl.textContent || '') : '';
            const sugarCubePassage = readSugarCubePassageName(cw);
            const passageName = sugarCubePassage ||
                readPassageNameFromElement(passageEl) ||
                readTwinePassageNameFromStoryData(doc, text);

            return normalizeSceneContext({
                text,
                documentTitle: doc.title,
                passageName,
                passageIdentity: passageName || null,
                engine: sugarCubePassage ? 'SugarCube' : null,
            });
        };

        const applyCapturedSceneContext = (context, { force = false, fromObserver = false } = {}) => {
            if (!context || !context.text) return false;

            sceneContextHistory = updateSceneContextHistory(sceneContextHistory, context);
            const currentText = illusSceneText.value.trim();
            const capturedText = currentSceneContext ? currentSceneContext.text.trim() : '';
            const hasManualEdit = sceneTextDirty && currentText && currentText !== capturedText;

            if (hasManualEdit && !force) {
                setSceneContextSummary('Scene changed in the game. Press Recapture to replace your edited scene text.', true);
                return false;
            }

            currentSceneContext = context;
            lastSceneDocumentTitle = context.documentTitle || null;
            illusSceneText.value = createSceneExcerpt(context.text, 2000);
            sceneTextDirty = false;
            const label = context.passageName || context.documentTitle || 'current scene';
            const detail = fromObserver ? 'Auto-captured' : 'Captured';
            setSceneContextSummary(`${detail}: ${label} (${context.textExcerpt.length} chars shown).`);
            return true;
        };

        const recaptureScene = ({ force = false, fromObserver = false } = {}) => {
            try {
                const context = captureSceneContext();
                return applyCapturedSceneContext(context, { force, fromObserver });
            } catch (e) {
                if (!fromObserver) {
                    setSceneContextSummary('Could not access the current game scene.');
                }
                return false;
            }
        };

        const disconnectSceneObserver = () => {
            if (sceneObserver) {
                sceneObserver.disconnect();
                sceneObserver = null;
            }
            if (sceneObserverTimer) {
                clearTimeout(sceneObserverTimer);
                sceneObserverTimer = null;
            }
        };

        const scheduleObservedSceneCapture = () => {
            if (sceneObserverTimer) clearTimeout(sceneObserverTimer);
            sceneObserverTimer = setTimeout(() => {
                sceneObserverTimer = null;
                recaptureScene({ force: false, fromObserver: true });
            }, 300);
        };

        const setupSceneObserver = () => {
            disconnectSceneObserver();
            try {
                const cw = iframe.contentWindow;
                const doc = cw.document;
                const target = getLikelyPassageElement(doc);
                const Observer = cw.MutationObserver || window.MutationObserver;
                if (!target || !Observer) return;

                sceneObserver = new Observer(scheduleObservedSceneCapture);
                sceneObserver.observe(target, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                });
                scheduleObservedSceneCapture();
            } catch (e) {
                disconnectSceneObserver();
            }
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

        const isActiveIllustratorJob = (job) => job && ['queued', 'polling'].includes(job.status);

        const isRetryableIllustratorJob = (job) => job && ['failed', 'timed_out'].includes(job.status);

        const formatElapsedTime = (elapsedMs = 0) => {
            const seconds = Math.max(0, Math.round(Number(elapsedMs) / 1000));
            const minutes = Math.floor(seconds / 60);
            const remainder = seconds % 60;
            if (minutes <= 0) return `${remainder}s`;
            return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
        };

        const stopJobRefresh = () => {
            if (activeJobRefreshTimer) {
                clearInterval(activeJobRefreshTimer);
                activeJobRefreshTimer = null;
            }
        };

        const startJobRefresh = () => {
            stopJobRefresh();
            activeJobRefreshTimer = setInterval(refreshActiveIllustratorJob, 1500);
        };

        const setJobDetails = (message) => {
            illusJobDetails.textContent = message || '';
            illusJobDetails.classList.toggle('is-hidden', !message);
        };

        const describeJobStatus = (job) => {
            const elapsed = formatElapsedTime(job.elapsedMs);
            const promptId = job.promptId ? `ComfyUI ${job.promptId}` : 'ComfyUI queue';
            switch (job.status) {
                case 'queued':
                    return `Queued for ${elapsed}. ${promptId}.`;
                case 'polling':
                    return `Generating for ${elapsed}. ${promptId}.`;
                case 'completed':
                    return `Completed in ${elapsed}. ${job.output && job.output.filename ? job.output.filename : promptId}.`;
                case 'failed':
                    return `Failed after ${elapsed}. ${job.lastError || 'Unknown error'}`;
                case 'timed_out':
                    return `Timed out after ${elapsed}. The ComfyUI job may still finish in its queue.`;
                case 'canceled':
                    return `Canceled after ${elapsed}. The ComfyUI job may still finish in its queue.`;
                default:
                    return '';
            }
        };

        const renderIllustratorJob = (job) => {
            if (!job) {
                activeJobId = null;
                stopJobRefresh();
                generateImageBtn.disabled = false;
                retryImageBtn.classList.add('is-hidden');
                setJobDetails('');
                setIllustrationDisplay('idle');
                return;
            }

            activeJobId = job.jobId;
            const active = isActiveIllustratorJob(job);
            const retryable = isRetryableIllustratorJob(job);
            generateImageBtn.disabled = active;
            retryImageBtn.classList.toggle('is-hidden', !retryable);
            setJobDetails(describeJobStatus(job));

            if (job.output && job.output.dataUrl) {
                illusResultImg.src = job.output.dataUrl;
                illusLastFilename = job.output.filename || illusLastFilename;
            }

            if (active) {
                setIllustrationDisplay('working');
                setIllusStatus(job.status === 'queued' ? 'Queued in ComfyUI...' : `Generating... elapsed ${formatElapsedTime(job.elapsedMs)}`, 'working');
                return;
            }

            stopJobRefresh();
            if (job.status === 'completed') {
                setIllustrationDisplay('done');
                setIllusStatus('Done! Image generated successfully.', 'done');
            } else if (job.status === 'canceled') {
                setIllustrationDisplay('canceled');
                setIllusStatus('Generation canceled.', 'idle');
            } else if (job.status === 'timed_out') {
                setIllustrationDisplay('error');
                setIllusStatus('Generation timed out.', 'error');
            } else if (job.status === 'failed') {
                setIllustrationDisplay('error');
                setIllusStatus(`Generation failed: ${job.lastError || 'Unknown error'}`, 'error');
            }
        };

        const refreshActiveIllustratorJob = async () => {
            if (!activeJobId || !window.illustratorAPI.getJob) return;
            const res = await window.illustratorAPI.getJob(activeJobId);
            if (res.success) {
                renderIllustratorJob(res.job);
            } else {
                stopJobRefresh();
                generateImageBtn.disabled = false;
                setIllustrationDisplay('error');
                setIllusStatus(`Job refresh failed: ${res.error}`, 'error');
            }
        };

        const restoreLatestIllustratorJob = async () => {
            if (!window.illustratorAPI.listJobs || !gameUrl) return;
            const res = await window.illustratorAPI.listJobs({ gamePath: gameUrl, limit: 5 });
            if (!res.success || !res.jobs.length) return;

            const latest = res.jobs.find(isActiveIllustratorJob) || res.jobs[0];
            if (!latest || !window.illustratorAPI.getJob) return;
            const jobRes = await window.illustratorAPI.getJob(latest.jobId);
            if (!jobRes.success) return;

            renderIllustratorJob(jobRes.job);
            if (isActiveIllustratorJob(jobRes.job)) startJobRefresh();
        };

        const readStoredConfig = () => {
            const stored = window.TwinePlayerStorage.readJson(localStorage, ILLUSTRATOR_CONFIG_KEY, {});
            return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        };

        const getIllustratorProjectKey = () => {
            return `${ILLUSTRATOR_PROJECT_KEY_PREFIX}:${hashSceneText(gameUrl || title || 'default')}`;
        };

        const readProjectSettings = () => {
            return normalizeIllustratorProjectSettings(
                window.TwinePlayerStorage.readJson(localStorage, getIllustratorProjectKey(), DEFAULT_ILLUSTRATOR_PROJECT_SETTINGS)
            );
        };

        const getProjectSettings = () => normalizeIllustratorProjectSettings({
            styleBible: styleBibleText.value,
            characterRoster: characterRosterText.value,
            worldNotes: worldNotesText.value,
            shotMode: promptModeSelect.value,
            promptTone: promptToneInput.value,
        });

        const applyProjectSettings = (settings) => {
            const normalized = normalizeIllustratorProjectSettings(settings);
            styleBibleText.value = normalized.styleBible;
            characterRosterText.value = normalized.characterRoster;
            worldNotesText.value = normalized.worldNotes;
            promptModeSelect.value = normalized.shotMode;
            promptToneInput.value = normalized.promptTone;
        };

        const persistProjectSettings = () => {
            window.TwinePlayerStorage.writeJson(localStorage, getIllustratorProjectKey(), getProjectSettings());
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
            seed: seedInput.value,
            batchSize: batchSizeInput.value,
            aspectPreset: aspectPresetSelect.value,
            workflowMode: workflowModeSelect.value,
            customWorkflowJson: customWorkflowText.value,
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
            seedInput.value = config.seed;
            batchSizeInput.value = config.batchSize;
            aspectPresetSelect.value = config.aspectPreset;
            workflowModeSelect.value = config.workflowMode;
            customWorkflowText.value = config.customWorkflowJson;
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
            applyProjectSettings(readProjectSettings());
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
            stopJobRefresh();
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
        recaptureSceneBtn.addEventListener('click', () => {
            if (recaptureScene({ force: true })) {
                lastSceneDocumentTitle = currentSceneContext ? currentSceneContext.documentTitle : null;
            }
        });
        illusSceneText.addEventListener('input', () => {
            sceneTextDirty = true;
        });
        iframe.addEventListener('load', setupSceneObserver);

        [
            promptModeSelect,
            promptToneInput,
            styleBibleText,
            characterRosterText,
            worldNotesText,
        ].forEach(element => {
            element.addEventListener('change', persistProjectSettings);
            element.addEventListener('blur', persistProjectSettings);
        });

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
            aspectPresetSelect,
            seedInput,
            batchSizeInput,
            workflowModeSelect,
            customWorkflowText,
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

            if (recaptureScene({ force: false })) {
                lastSceneDocumentTitle = currentSceneContext ? currentSceneContext.documentTitle : null;
            }

            if (gameUrl && !illusOutputDir) {
                const dirRes = await window.illustratorAPI.ensureOutputDir(gameUrl);
                if (dirRes.success) illusOutputDir = dirRes.path;
            }

            await Promise.all([loadOllamaModels(), loadComfyUIModels()]);
            await restoreLatestIllustratorJob();
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

        const getRecentSceneContextText = () => {
            const currentHash = currentSceneContext ? currentSceneContext.sceneHash : null;
            return sceneContextHistory
                .filter(context => context.sceneHash !== currentHash)
                .slice(0, 4)
                .map(context => {
                    const label = context.passageName || context.documentTitle || 'Scene';
                    return `${label}: ${context.textExcerpt}`;
                })
                .join('\n');
        };

        const getPromptContext = () => {
            const settings = getProjectSettings();
            return {
                mode: settings.shotMode,
                styleBible: settings.styleBible,
                characterNotes: settings.characterRoster,
                worldNotes: settings.worldNotes,
                promptTone: settings.promptTone,
                recentContext: getRecentSceneContextText(),
            };
        };

        document.getElementById('illus-generate-prompt-btn').addEventListener('click', async () => {
            const sceneText = illusSceneText.value.trim();
            if (!sceneText) {
                setIllusStatus('Paste or capture some scene text first.', 'error');
                return;
            }

            persistIllustratorConfig();
            persistProjectSettings();
            const config = getIllustratorConfig();
            const chosenModel = config.textModel;
            const promptContext = getPromptContext();

            document.getElementById('illus-generate-prompt-btn').disabled = true;
            setIllusStatus(`Asking ${chosenModel}...`, 'working');

            const res = await window.illustratorAPI.generatePrompt(sceneText, chosenModel, config, promptContext);

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
            persistProjectSettings();
            const config = getIllustratorConfig();
            const projectSettings = getProjectSettings();
            const checkpoint = config.checkpoint;
            const sourceSceneText = illusSceneText.value.trim();
            const sceneIdentity = currentSceneContext && !sceneTextDirty
                ? currentSceneContext.passageIdentity
                : hashSceneText(sourceSceneText);
            const passageTitle = currentSceneContext && !sceneTextDirty
                ? currentSceneContext.passageName
                : null;
            const documentTitle = currentSceneContext && !sceneTextDirty
                ? currentSceneContext.documentTitle
                : lastSceneDocumentTitle;

            if (!illusOutputDir && gameUrl) {
                const dirRes = await window.illustratorAPI.ensureOutputDir(gameUrl);
                if (dirRes.success) illusOutputDir = dirRes.path;
            }

            const outputFilename = createOutputFilename(Date.now(), sceneIdentity);

            generateImageBtn.disabled = true;
            retryImageBtn.classList.add('is-hidden');
            setJobDetails('');
            setIllusStatus(`Queuing job with ${checkpoint}...`, 'working');
            illusResultImg.removeAttribute('src');
            setIllustrationDisplay('working');

            const metadata = {
                sourceSceneText,
                imagePrompt: prompt,
                promptTemplateMode: projectSettings.shotMode,
                promptGeneratedAt: lastPromptGeneratedAt,
                documentTitle,
                passageIdentity: sceneIdentity,
                passageTitle,
                checkpoint,
            };
            const startRes = window.illustratorAPI.startGeneration
                ? await window.illustratorAPI.startGeneration({
                    imagePrompt: prompt,
                    outputFilename,
                    checkpoint,
                    gamePath: gameUrl,
                    config,
                    metadata,
                })
                : await window.illustratorAPI.queueComfyUI({
                imagePrompt: prompt,
                outputFilename,
                checkpoint,
                config,
                });

            if (!startRes.success) {
                setIllusStatus(`ComfyUI error: ${startRes.error}`, 'error');
                setIllustrationDisplay('error');
                generateImageBtn.disabled = false;
                return;
            }

            if (startRes.job) {
                renderIllustratorJob(startRes.job);
                if (isActiveIllustratorJob(startRes.job)) startJobRefresh();
                return;
            }

            const promptId = startRes.promptId;
            const seed = startRes.seed;
            setIllusStatus('Generating... (polling ComfyUI)', 'working');

            const legacyPollTimer = setInterval(async () => {
                const pollRes = await window.illustratorAPI.pollImage({
                    promptId,
                    gamePath: gameUrl,
                    config,
                    metadata: {
                        ...metadata,
                        seed,
                        width: startRes.width,
                        height: startRes.height,
                        workflowTemplate: startRes.workflowTemplate,
                        workflowVersion: startRes.workflowVersion,
                    },
                });

                if (pollRes.pending) return;

                clearInterval(legacyPollTimer);
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

        cancelImageBtn.addEventListener('click', async () => {
            if (activeJobId && window.illustratorAPI.cancelJob) {
                const res = await window.illustratorAPI.cancelJob(activeJobId);
                if (res.success) {
                    renderIllustratorJob(res.job);
                    return;
                }
                setIllusStatus(`Cancel failed: ${res.error}`, 'error');
                return;
            }
            stopJobRefresh();
            setIllustrationDisplay('canceled');
            generateImageBtn.disabled = false;
            setIllusStatus('Generation canceled. The ComfyUI job may still finish in its queue.', 'idle');
        });

        retryImageBtn.addEventListener('click', async () => {
            if (!activeJobId || !window.illustratorAPI.retryJob) return;
            retryImageBtn.disabled = true;
            generateImageBtn.disabled = true;
            setIllusStatus('Retrying generation...', 'working');
            try {
                const res = await window.illustratorAPI.retryJob(activeJobId);
                if (!res.success) {
                    setIllusStatus(`Retry failed: ${res.error}`, 'error');
                    generateImageBtn.disabled = false;
                    return;
                }
                illusResultImg.removeAttribute('src');
                renderIllustratorJob(res.job);
                if (isActiveIllustratorJob(res.job)) startJobRefresh();
            } finally {
                retryImageBtn.disabled = false;
            }
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
