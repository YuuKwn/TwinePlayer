const iframe = document.getElementById('game-frame');
        const params = new URLSearchParams(window.location.search);
        let gameUrl = params.get('url');
        const title = params.get('title') || 'Twine Game';

        const CONSOLE_HISTORY_KEY = 'twine_player_console_history';
        let currentIfid = null;
        const TRUSTED_MESSAGE_TYPES = new Set(['twine-save', 'twine-load', 'twine-scene-text']);
        const MAX_MESSAGE_TEXT_LENGTH = 2000;
        const MAX_MESSAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
        const MAX_MESSAGE_BASE64_LENGTH = 50 * 1024 * 1024;

        /**
         * Prevents keyboard events from bubbling up to the game engine.
         * Twine engines often capture keys at the global level, which can 
         * block typing in our custom UI fields.
         */
        const isolateInput = (el) => {
            if (!el) return;
            ['keydown', 'keyup', 'keypress'].forEach(evt => {
                el.addEventListener(evt, (e) => e.stopPropagation());
            });
        };

