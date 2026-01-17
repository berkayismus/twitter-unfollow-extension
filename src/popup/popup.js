/**
 * @fileoverview Twitter Auto Unfollow - Popup Script
 * @description Handles the popup UI, user interactions, and communication with content script
 * @version 2.0.0
 */

/**
 * Twitter Unfollow Popup Module
 * @namespace TwitterUnfollowPopup
 */
const TwitterUnfollowPopup = (function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE STATE
    // ═══════════════════════════════════════════════════════════════

    /** @type {chrome.tabs.Tab|null} Current active tab */
    let currentTab = null;

    /** @type {boolean} Whether unfollow operation is running */
    let isRunning = false;

    /** @type {Chartist.Line|null} Chart instance */
    let chart = null;

    /** @type {number|null} Rate limit countdown interval ID */
    let rateLimitInterval = null;

    /** @type {Object<string, HTMLElement>} Cached DOM elements */
    let elements = {};

    /** @type {Set<string>} Set of displayed users to prevent duplicates */
    let displayedUsers = new Set();

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - DOM Utilities
    // ═══════════════════════════════════════════════════════════════

    /**
     * Caches all DOM elements for efficient access
     * @returns {void}
     */
    function cacheElements() {
        elements = {
            // Tabs
            tabBtns: document.querySelectorAll('.tab-btn'),
            tabContents: document.querySelectorAll('.tab-content'),

            // Main tab
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            continueBtn: document.getElementById('continueBtn'),
            resetBtn: document.getElementById('resetBtn'),
            undoBtn: document.getElementById('undoBtn'),
            undoCount: document.getElementById('undoCount'),
            dryRunMode: document.getElementById('dryRunMode'),

            sessionCount: document.getElementById('sessionCount'),
            totalCount: document.getElementById('totalCount'),
            lastRun: document.getElementById('lastRun'),

            statusText: document.getElementById('statusText'),
            statusIndicator: document.getElementById('statusIndicator'),

            userList: document.getElementById('userList'),

            testModeAlert: document.getElementById('testModeAlert'),
            rateLimitAlert: document.getElementById('rateLimitAlert'),
            rateLimitCountdown: document.getElementById('rateLimitCountdown'),
            limitReachedAlert: document.getElementById('limitReachedAlert'),

            // Filters tab
            keywordInput: document.getElementById('keywordInput'),
            addKeywordBtn: document.getElementById('addKeywordBtn'),
            keywordList: document.getElementById('keywordList'),

            whitelistInput: document.getElementById('whitelistInput'),
            addWhitelistBtn: document.getElementById('addWhitelistBtn'),
            whitelistList: document.getElementById('whitelistList'),

            // Stats tab
            chartContainer: document.getElementById('chart'),
            exportCsvBtn: document.getElementById('exportCsvBtn'),

            // Theme
            themeToggle: document.getElementById('themeToggle'),

            // Language
            langToggle: document.getElementById('langToggle')
        };
    }

    /**
     * Creates a DOM element safely without innerHTML
     * @param {string} tag - HTML tag name
     * @param {Object} [attributes={}] - Element attributes
     * @param {string} [textContent=''] - Text content
     * @returns {HTMLElement} Created element
     */
    function createElement(tag, attributes = {}, textContent = '') {
        const element = document.createElement(tag);

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([dataKey, dataValue]) => {
                    element.dataset[dataKey] = dataValue;
                });
            } else if (key.startsWith('aria')) {
                element.setAttribute(key.replace(/([A-Z])/g, '-$1').toLowerCase(), value);
            } else {
                element.setAttribute(key, value);
            }
        });

        if (textContent) {
            element.textContent = textContent;
        }

        return element;
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Tab Management
    // ═══════════════════════════════════════════════════════════════

    /**
     * Switches to a different tab
     * @param {string} tabName - Name of the tab to switch to
     * @returns {void}
     */
    function switchTab(tabName) {
        elements.tabBtns.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });

        elements.tabContents.forEach(content => {
            const isActive = content.id === `${tabName}-tab`;
            content.classList.toggle('active', isActive);

            if (isActive) {
                content.focus();
            }
        });

        if (tabName === 'stats') {
            renderChart();
        }
    }

    /**
     * Handles keyboard navigation for tabs
     * @param {KeyboardEvent} e - Keyboard event
     * @returns {void}
     */
    function handleTabKeyboard(e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const tabs = Array.from(document.querySelectorAll('.tab-btn'));
            const currentIndex = tabs.findIndex(t => t === document.activeElement);

            if (currentIndex === -1) return;

            const nextIndex = e.key === 'ArrowRight'
                ? (currentIndex + 1) % tabs.length
                : (currentIndex - 1 + tabs.length) % tabs.length;

            tabs[nextIndex].focus();
            tabs[nextIndex].click();
            e.preventDefault();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Status Updates
    // ═══════════════════════════════════════════════════════════════

    /**
     * Updates the status display in the UI
     * @param {string} type - Status type ('active', 'stopped', 'ready', 'error')
     * @param {string} message - Status message to display
     * @returns {void}
     */
    function updateStatus(type, message) {
        elements.statusText.textContent = message;
        elements.statusIndicator.className = 'status-indicator';

        switch (type) {
            case 'active':
                elements.statusIndicator.classList.add('active');
                break;
            case 'stopped':
                elements.statusIndicator.classList.add('stopped');
                break;
            case 'ready':
                elements.statusIndicator.classList.add('ready');
                break;
            case 'error':
                elements.statusIndicator.classList.add('stopped');
                break;
        }
    }

    /**
     * Updates the undo button display
     * @param {number} count - Number of items in undo queue
     * @returns {void}
     */
    function updateUndoButton(count) {
        elements.undoCount.textContent = count;
        elements.undoBtn.style.display = count > 0 ? 'inline-block' : 'none';
        elements.undoBtn.setAttribute('aria-label', I18n.t('aria.undoButton', { count }));
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Data Loading
    // ═══════════════════════════════════════════════════════════════

    /**
     * Loads and displays statistics from storage
     * @async
     * @returns {Promise<void>}
     */
    async function loadStats() {
        const data = await chrome.storage.local.get([
            Constants.STORAGE_KEYS.SESSION_COUNT,
            Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED,
            Constants.STORAGE_KEYS.LAST_RUN,
            Constants.STORAGE_KEYS.SESSION_START
        ]);

        const sessionCount = data[Constants.STORAGE_KEYS.SESSION_COUNT] || 0;
        const totalUnfollowed = data[Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED] || 0;
        const lastRun = data[Constants.STORAGE_KEYS.LAST_RUN] || '-';

        elements.sessionCount.textContent = `${sessionCount}/${Constants.LIMITS.MAX_SESSION}`;
        elements.totalCount.textContent = totalUnfollowed;

        if (lastRun !== '-') {
            const date = new Date(lastRun);
            elements.lastRun.textContent = date.toLocaleString('tr-TR');
        }

        if (sessionCount >= Constants.LIMITS.MAX_SESSION) {
            const now = Date.now();
            const sessionStart = data[Constants.STORAGE_KEYS.SESSION_START] || now;
            const timeLeft = Constants.TIMING.SESSION_DURATION - (now - sessionStart);

            if (timeLeft > 0) {
                elements.limitReachedAlert.style.display = 'block';
                elements.startBtn.disabled = true;
                const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
                const alertText = elements.limitReachedAlert.querySelector('p:last-child');
                if (alertText) {
                    alertText.textContent = I18n.t('alerts.dailyLimitDesc', { hours: hoursLeft });
                }
            }
        }
    }

    /**
     * Loads keywords from storage and renders them
     * @async
     * @returns {Promise<void>}
     */
    async function loadKeywords() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        const keywords = data[Constants.STORAGE_KEYS.KEYWORDS] || [];
        renderKeywordList(keywords);
    }

    /**
     * Loads whitelist from storage and renders it
     * @async
     * @returns {Promise<void>}
     */
    async function loadWhitelist() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        renderWhitelistList(whitelist);
    }

    /**
     * Loads and applies the saved theme
     * @async
     * @returns {Promise<void>}
     */
    async function loadTheme() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.THEME]);
        const theme = data[Constants.STORAGE_KEYS.THEME] || Constants.THEMES.LIGHT;
        applyTheme(theme);
    }

    /**
     * Loads the dry-run mode setting
     * @async
     * @returns {Promise<void>}
     */
    async function loadDryRunMode() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.DRY_RUN_MODE]);
        elements.dryRunMode.checked = data[Constants.STORAGE_KEYS.DRY_RUN_MODE] || false;
    }

    /**
     * Loads the undo queue and updates the button
     * @async
     * @returns {Promise<void>}
     */
    async function loadUndoQueue() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNDO_QUEUE]);
        const queue = data[Constants.STORAGE_KEYS.UNDO_QUEUE] || [];
        updateUndoButton(queue.length);
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Event Handlers
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handles the start button click
     * @async
     * @returns {Promise<void>}
     */
    async function handleStart() {
        if (!currentTab) return;

        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.START });
            isRunning = true;
            elements.startBtn.style.display = 'none';
            elements.stopBtn.style.display = 'block';
            elements.userList.innerHTML = '';
            displayedUsers.clear(); // Clear the tracking Set
            updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
        } catch (error) {
            console.error('Failed to start:', error);
            if (confirm(I18n.t('messages.confirmReload'))) {
                await chrome.tabs.reload(currentTab.id);
                updateStatus('ready', `🔄 ${I18n.t('messages.pageReloaded')}`);
            } else {
                updateStatus('error', `❌ ${I18n.t('messages.startFailed')}`);
            }
        }
    }

    /**
     * Handles the stop button click
     * @async
     * @returns {Promise<void>}
     */
    async function handleStop() {
        if (!currentTab) return;

        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.STOP });
            isRunning = false;
            elements.startBtn.style.display = 'block';
            elements.stopBtn.style.display = 'none';
            updateStatus('stopped', `⏸ ${I18n.t('status.stopped')}`);
        } catch (error) {
            console.error('Failed to stop:', error);
        }
    }

    /**
     * Handles the continue button click after batch confirmation
     * @async
     * @returns {Promise<void>}
     */
    async function handleContinue() {
        if (!currentTab) return;

        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.CONTINUE_TEST });
            elements.testModeAlert.style.display = 'none';
            updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
        } catch (error) {
            console.error('Failed to continue:', error);
        }
    }

    /**
     * Handles the reset button click
     * @async
     * @returns {Promise<void>}
     */
    async function handleReset() {
        if (confirm(I18n.t('messages.confirmReset'))) {
            await chrome.storage.local.set({
                [Constants.STORAGE_KEYS.SESSION_COUNT]: 0,
                [Constants.STORAGE_KEYS.TOTAL_UNFOLLOWED]: 0,
                [Constants.STORAGE_KEYS.SESSION_START]: Date.now(),
                [Constants.STORAGE_KEYS.TEST_MODE]: true,
                [Constants.STORAGE_KEYS.TEST_COMPLETE]: false,
                [Constants.STORAGE_KEYS.UNDO_QUEUE]: []
            });

            elements.sessionCount.textContent = `0/${Constants.LIMITS.MAX_SESSION}`;
            elements.totalCount.textContent = '0';
            elements.lastRun.textContent = '-';
            elements.limitReachedAlert.style.display = 'none';
            elements.startBtn.disabled = false;
            elements.userList.innerHTML = '';
            displayedUsers.clear(); // Clear the tracking Set
            updateUndoButton(0);

            updateStatus('ready', `✓ ${I18n.t('status.reset')}`);
        }
    }

    /**
     * Handles the undo button click
     * @async
     * @returns {Promise<void>}
     */
    async function handleUndo() {
        if (!currentTab) return;

        try {
            const response = await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.UNDO_LAST });
            if (response.success) {
                updateStatus('ready', `↶ ${I18n.t('messages.undone')}: @${response.username}`);
                await loadUndoQueue();
            } else {
                alert(response.message || I18n.t('messages.noUndoAction'));
            }
        } catch (error) {
            console.error('Failed to undo:', error);
        }
    }

    /**
     * Handles dry-run mode toggle
     * @async
     * @param {Event} e - Change event
     * @returns {Promise<void>}
     */
    async function handleDryRunToggle(e) {
        const enabled = e.target.checked;

        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.DRY_RUN_MODE]: enabled });

        try {
            await chrome.tabs.sendMessage(currentTab.id, {
                action: Constants.ACTIONS.TOGGLE_DRY_RUN,
                enabled
            });
        } catch (error) {
            console.log('Content script not loaded, but settings saved');
        }

        if (enabled) {
            updateStatus('ready', `🧪 ${I18n.t('messages.dryRunActive')}`);
        } else {
            updateStatus('ready', `✓ ${I18n.t('messages.normalMode')}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Keyword Handlers
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handles adding a new keyword
     * @async
     * @returns {Promise<void>}
     */
    async function handleAddKeyword() {
        const keyword = elements.keywordInput.value.trim();
        if (!keyword) return;

        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        const keywords = data[Constants.STORAGE_KEYS.KEYWORDS] || [];

        if (!keywords.includes(keyword.toLowerCase())) {
            keywords.push(keyword.toLowerCase());
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: keywords });

            try {
                await chrome.tabs.sendMessage(currentTab.id, {
                    action: Constants.ACTIONS.UPDATE_KEYWORDS,
                    keywords
                });
            } catch (error) {
                console.log('Content script not loaded, but settings saved');
            }

            renderKeywordList(keywords);
        }

        elements.keywordInput.value = '';
    }

    /**
     * Handles removing a keyword
     * @async
     * @param {string} keyword - Keyword to remove
     * @returns {Promise<void>}
     */
    async function handleRemoveKeyword(keyword) {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.KEYWORDS]);
        const keywords = data[Constants.STORAGE_KEYS.KEYWORDS] || [];

        const filtered = keywords.filter(k => k !== keyword);
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.KEYWORDS]: filtered });

        try {
            await chrome.tabs.sendMessage(currentTab.id, {
                action: Constants.ACTIONS.UPDATE_KEYWORDS,
                keywords: filtered
            });
        } catch (error) {
            console.log('Content script not loaded, but settings saved');
        }

        renderKeywordList(filtered);
    }

    /**
     * Renders the keyword list in the UI
     * @param {string[]} keywords - Array of keywords
     * @returns {void}
     */
    function renderKeywordList(keywords) {
        elements.keywordList.innerHTML = '';

        keywords.forEach(keyword => {
            const li = createElement('li');

            const span = createElement('span', {}, keyword);
            li.appendChild(span);

            const removeBtn = createElement('button', {
                className: 'remove-btn',
                'aria-label': I18n.t('aria.removeKeyword', { keyword }),
                dataset: { keyword }
            }, '✕');

            removeBtn.addEventListener('click', () => handleRemoveKeyword(keyword));
            li.appendChild(removeBtn);

            elements.keywordList.appendChild(li);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Whitelist Handlers
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handles adding a user to whitelist
     * @async
     * @returns {Promise<void>}
     */
    async function handleAddWhitelist() {
        let username = elements.whitelistInput.value.trim();
        if (!username) return;

        username = username.replace('@', '').toLowerCase();

        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};

        if (!whitelist[username]) {
            whitelist[username] = { addedDate: Date.now() };
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });

            try {
                await chrome.tabs.sendMessage(currentTab.id, {
                    action: Constants.ACTIONS.UPDATE_WHITELIST,
                    whitelist
                });
            } catch (error) {
                console.log('Content script not loaded, but settings saved');
            }

            renderWhitelistList(whitelist);
        }

        elements.whitelistInput.value = '';
    }

    /**
     * Handles removing a user from whitelist
     * @async
     * @param {string} username - Username to remove
     * @returns {Promise<void>}
     */
    async function handleRemoveWhitelist(username) {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};

        delete whitelist[username];
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });

        try {
            await chrome.tabs.sendMessage(currentTab.id, {
                action: Constants.ACTIONS.UPDATE_WHITELIST,
                whitelist
            });
        } catch (error) {
            console.log('Content script not loaded, but settings saved');
        }

        renderWhitelistList(whitelist);
    }

    /**
     * Renders the whitelist in the UI
     * @param {Object<string, Object>} whitelist - Whitelist object
     * @returns {void}
     */
    function renderWhitelistList(whitelist) {
        elements.whitelistList.innerHTML = '';

        Object.keys(whitelist).forEach(username => {
            const li = createElement('li');

            const span = createElement('span', {}, `@${username}`);
            li.appendChild(span);

            const removeBtn = createElement('button', {
                className: 'remove-btn',
                'aria-label': I18n.t('aria.removeWhitelist', { username }),
                dataset: { username }
            }, '✕');

            removeBtn.addEventListener('click', () => handleRemoveWhitelist(username));
            li.appendChild(removeBtn);

            elements.whitelistList.appendChild(li);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Theme Handlers
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handles theme toggle
     * @async
     * @returns {Promise<void>}
     */
    async function handleThemeToggle() {
        const isDark = document.documentElement.classList.contains('dark-mode');
        const newTheme = isDark ? Constants.THEMES.LIGHT : Constants.THEMES.DARK;

        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.THEME]: newTheme });
        applyTheme(newTheme);
    }

    /**
     * Applies the specified theme to the document
     * @param {string} theme - Theme to apply ('light' or 'dark')
     * @returns {void}
     */
    function applyTheme(theme) {
        const isDark = theme === Constants.THEMES.DARK;

        document.documentElement.classList.toggle('dark-mode', isDark);
        elements.themeToggle.textContent = isDark ? '☀️' : '🌙';
        elements.themeToggle.setAttribute('aria-pressed', isDark);
        elements.themeToggle.setAttribute('aria-label', I18n.t('aria.themeToggle'));
    }

    /**
     * Handles language toggle
     * @async
     * @returns {Promise<void>}
     */
    async function handleLanguageToggle() {
        await I18n.toggleLocale();
        applyAriaLabels();
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Chart & Export
    // ═══════════════════════════════════════════════════════════════

    /**
     * Renders the statistics chart
     * @async
     * @returns {Promise<void>}
     */
    async function renderChart() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_STATS]);
        const stats = data[Constants.STORAGE_KEYS.UNFOLLOW_STATS] || { daily: {} };

        const labels = [];
        const series = [];

        for (let i = Constants.LIMITS.CHART_DAYS - 1; i >= 0; i--) {
            const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
            const dateStr = date.toISOString().split('T')[0];
            labels.push(date.getDate() + '/' + (date.getMonth() + 1));
            series.push(stats.daily[dateStr]?.unfollowed || 0);
        }

        if (chart) {
            chart.update({ labels, series: [series] });
        } else {
            chart = new Chartist.Line(elements.chartContainer, {
                labels,
                series: [series]
            }, {
                fullWidth: true,
                chartPadding: { right: 20 },
                low: 0,
                showArea: true
            });
        }
    }

    /**
     * Handles CSV export
     * @async
     * @returns {Promise<void>}
     */
    async function handleExportCsv() {
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.UNFOLLOW_HISTORY]);
        const history = data[Constants.STORAGE_KEYS.UNFOLLOW_HISTORY] || [];

        if (history.length === 0) {
            alert(I18n.t('messages.noHistory'));
            return;
        }

        const csvContent = '\uFEFF' + [
            ['Username', 'Date', 'Reason'].join(','),
            ...history.map(item => [
                item.username,
                item.date,
                item.reason
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `twitter-unfollow-history-${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - User List
    // ═══════════════════════════════════════════════════════════════

    /**
     * Adds a user to the processed users list
     * @async
     * @param {string} username - Username to add
     * @param {string} action - Action performed (unfollowed, dry-run, skipped)
     * @param {number} timestamp - Timestamp of the action
     * @returns {Promise<void>}
     */
    async function addUserToList(username, action, timestamp) {
        // Create unique key for this user+action combination
        const userKey = `${username}:${action}`;

        // Check for duplicates using Set (more reliable than DOM query)
        if (displayedUsers.has(userKey)) {
            return; // Skip duplicate
        }

        // Add to tracking Set
        displayedUsers.add(userKey);

        const li = createElement('li');
        const time = new Date(timestamp).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Check if user is already in whitelist
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};
        const cleanUsername = username.replace('@', '').toLowerCase();
        const isInWhitelist = !!whitelist[cleanUsername];

        let icon = '';
        let className = '';

        if (action === Constants.USER_ACTIONS.UNFOLLOWED) {
            icon = '✓';
            className = 'unfollowed';
        } else if (action === Constants.USER_ACTIONS.DRY_RUN) {
            icon = '🧪';
            className = 'dry-run';
        } else if (action.startsWith('skipped:')) {
            icon = '⊘';
            className = 'skipped';
        }

        li.className = className;
        li.dataset.username = username;
        li.dataset.action = action;

        // Build the list item using DOM methods
        const iconSpan = createElement('span', { className: 'user-icon' }, icon);
        const nameSpan = createElement('span', { className: 'user-name' }, `@${username}`);
        const timeSpan = createElement('span', { className: 'user-time' }, time);
        const actionsDiv = createElement('div', { className: 'user-actions' });

        li.appendChild(iconSpan);
        li.appendChild(nameSpan);
        li.appendChild(timeSpan);

        // Add undo button for unfollowed users
        if (action === Constants.USER_ACTIONS.UNFOLLOWED) {
            const undoBtn = createElement('button', {
                className: 'action-btn undo-btn',
                title: I18n.t('userList.undoBtn'),
                'aria-label': I18n.t('aria.undoUser', { username })
            }, '↶');
            undoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleUndoSingleUser(username, li);
            });
            actionsDiv.appendChild(undoBtn);
        }

        // Add whitelist button if not in whitelist
        if (!isInWhitelist) {
            const whitelistBtn = createElement('button', {
                className: 'action-btn whitelist-btn',
                title: I18n.t('userList.addToWhitelist'),
                'aria-label': I18n.t('aria.whitelistUser', { username })
            }, '⭐');
            whitelistBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleAddToWhitelistFromList(username, whitelistBtn);
            });
            actionsDiv.appendChild(whitelistBtn);
        }

        li.appendChild(actionsDiv);
        elements.userList.appendChild(li);

        // Limit list size
        if (elements.userList.children.length > Constants.LIMITS.MAX_USER_LIST_DISPLAY) {
            elements.userList.removeChild(elements.userList.firstChild);
        }

        elements.userList.scrollTop = elements.userList.scrollHeight;
    }

    /**
     * Handles undo for a single user from the list
     * @async
     * @param {string} username - Username to undo
     * @param {HTMLElement} liElement - List item element
     * @returns {Promise<void>}
     */
    async function handleUndoSingleUser(username, liElement) {
        if (!currentTab) return;

        try {
            const response = await chrome.tabs.sendMessage(currentTab.id, {
                action: Constants.ACTIONS.UNDO_SINGLE,
                username: username
            });

            if (response.success) {
                updateStatus('ready', `↶ ${I18n.t('messages.undone')}: @${username}`);
                liElement.classList.remove('unfollowed');
                liElement.classList.add('undone');
                liElement.querySelector('.user-icon').textContent = '↶';
                const undoBtn = liElement.querySelector('.undo-btn');
                if (undoBtn) undoBtn.remove();
                await loadUndoQueue();
            } else {
                alert(response.message || I18n.t('messages.undoFailed'));
            }
        } catch (error) {
            console.error('Failed to undo single user:', error);
            alert(I18n.t('messages.undoFailedDetail'));
        }
    }

    /**
     * Handles adding a user to whitelist from the list
     * @async
     * @param {string} username - Username to whitelist
     * @param {HTMLElement} btnElement - Button element
     * @returns {Promise<void>}
     */
    async function handleAddToWhitelistFromList(username, btnElement) {
        const cleanUsername = username.replace('@', '').toLowerCase();

        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.WHITELIST]);
        const whitelist = data[Constants.STORAGE_KEYS.WHITELIST] || {};

        if (!whitelist[cleanUsername]) {
            whitelist[cleanUsername] = { addedDate: Date.now() };
            await chrome.storage.local.set({ [Constants.STORAGE_KEYS.WHITELIST]: whitelist });

            try {
                await chrome.tabs.sendMessage(currentTab.id, {
                    action: Constants.ACTIONS.UPDATE_WHITELIST,
                    whitelist
                });
            } catch (error) {
                console.log('Content script not loaded, but settings saved');
            }

            renderWhitelistList(whitelist);

            btnElement.textContent = '✓';
            btnElement.disabled = true;
            btnElement.classList.add('added');
            btnElement.title = I18n.t('userList.addedToWhitelist');

            updateStatus('ready', `⭐ ${I18n.t('messages.addedToWhitelist')}: @${cleanUsername}`);
        } else {
            btnElement.textContent = '✓';
            btnElement.disabled = true;
            btnElement.classList.add('added');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Message Handling
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handles messages from the content script
     * @param {Object} message - Message object
     * @returns {void}
     */
    function handleMessage(message) {
        switch (message.type) {
            case Constants.MESSAGE_TYPES.STATUS_UPDATE:
                handleStatusUpdate(message);
                break;
            case Constants.MESSAGE_TYPES.TEST_COMPLETE:
                handleTestComplete();
                break;
            case Constants.MESSAGE_TYPES.RATE_LIMIT_HIT:
                handleRateLimitMessage(message.data);
                break;
            case Constants.MESSAGE_TYPES.USER_PROCESSED:
                addUserToList(message.data.username, message.data.action, message.data.timestamp);
                loadUndoQueue();
                break;
        }
    }

    /**
     * Handles status update messages
     * @param {Object} data - Status update data
     * @returns {void}
     */
    function handleStatusUpdate(data) {
        if (data.sessionCount !== undefined) {
            elements.sessionCount.textContent = `${data.sessionCount}/${Constants.LIMITS.MAX_SESSION}`;
        }

        if (data.totalUnfollowed !== undefined) {
            elements.totalCount.textContent = data.totalUnfollowed;
        }

        switch (data.status) {
            case Constants.STATUS.STARTED:
                updateStatus('active', `🔄 ${I18n.t('status.processing')}...`);
                break;
            case Constants.STATUS.SCANNING:
                updateStatus('active', `🔍 ${I18n.t('status.scanning')}... (${data.queueSize || 0} ${I18n.t('aria.found')})`);
                break;
            case Constants.STATUS.UNFOLLOWED:
                const prefix = data.dryRun ? '[DRY RUN] ' : '';
                updateStatus('active', `${prefix}✓ ${I18n.t('messages.undone')}: @${data.username || 'user'}`);
                break;
            case Constants.STATUS.STOPPED:
                updateStatus('stopped', `⏸ ${I18n.t('status.stopped')}`);
                isRunning = false;
                elements.startBtn.style.display = 'block';
                elements.stopBtn.style.display = 'none';
                break;
            case Constants.STATUS.COMPLETED:
                updateStatus('ready', `✅ ${I18n.t('status.completed')}`);
                isRunning = false;
                elements.startBtn.style.display = 'block';
                elements.stopBtn.style.display = 'none';
                break;
            case Constants.STATUS.LIMIT_REACHED:
                updateStatus('stopped', `🚫 ${I18n.t('alerts.dailyLimitReached')}`);
                elements.limitReachedAlert.style.display = 'block';
                isRunning = false;
                elements.startBtn.style.display = 'block';
                elements.stopBtn.style.display = 'none';
                elements.startBtn.disabled = true;
                break;
            case Constants.STATUS.READY:
                updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
                break;
        }

        loadStats();
    }

    /**
     * Handles test completion
     * @returns {void}
     */
    function handleTestComplete() {
        elements.testModeAlert.style.display = 'block';
        updateStatus('stopped', `⏸ ${I18n.t('alerts.batchComplete')}`);
    }

    /**
     * Handles rate limit notification
     * @param {Object} data - Rate limit data
     * @returns {void}
     */
    function handleRateLimitMessage(data) {
        elements.rateLimitAlert.style.display = 'block';
        updateStatus('stopped', `🚫 ${I18n.t('alerts.rateLimit')}`);
        isRunning = false;
        elements.startBtn.style.display = 'block';
        elements.stopBtn.style.display = 'none';

        let remainingSeconds = data.remainingMinutes * 60;

        if (rateLimitInterval) {
            clearInterval(rateLimitInterval);
        }

        rateLimitInterval = setInterval(() => {
            remainingSeconds--;

            if (remainingSeconds <= 0) {
                clearInterval(rateLimitInterval);
                elements.rateLimitAlert.style.display = 'none';
                updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
                return;
            }

            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            elements.rateLimitCountdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} ${I18n.t('aria.rateLimitCountdown')}`;
        }, 1000);
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Accessibility
    // ═══════════════════════════════════════════════════════════════

    /**
     * Applies ARIA labels to interactive elements
     * @returns {void}
     */
    function applyAriaLabels() {
        // Start button
        if (elements.startBtn) {
            elements.startBtn.setAttribute('aria-label', I18n.t('aria.startButton'));
        }

        // Stop button
        if (elements.stopBtn) {
            elements.stopBtn.setAttribute('aria-label', I18n.t('aria.stopButton'));
        }

        // Continue button
        if (elements.continueBtn) {
            elements.continueBtn.setAttribute('aria-label', I18n.t('aria.continueButton'));
        }

        // Reset button
        if (elements.resetBtn) {
            elements.resetBtn.setAttribute('aria-label', I18n.t('aria.resetButton'));
        }

        // Theme toggle
        if (elements.themeToggle) {
            elements.themeToggle.setAttribute('aria-label', I18n.t('aria.themeToggle'));
        }

        // Language toggle
        if (elements.langToggle) {
            elements.langToggle.setAttribute('aria-label', I18n.t('aria.languageToggle'));
        }

        // Export button
        if (elements.exportCsvBtn) {
            elements.exportCsvBtn.setAttribute('aria-label', I18n.t('aria.exportButton'));
        }

        // Keyword input
        if (elements.keywordInput) {
            elements.keywordInput.setAttribute('aria-label', I18n.t('aria.keywordInput'));
        }

        // Whitelist input
        if (elements.whitelistInput) {
            elements.whitelistInput.setAttribute('aria-label', I18n.t('aria.whitelistInput'));
        }

        // Add keyword button
        if (elements.addKeywordBtn) {
            elements.addKeywordBtn.setAttribute('aria-label', I18n.t('aria.addKeywordButton'));
        }

        // Add whitelist button
        if (elements.addWhitelistBtn) {
            elements.addWhitelistBtn.setAttribute('aria-label', I18n.t('aria.addWhitelistButton'));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS - Event Listeners Setup
    // ═══════════════════════════════════════════════════════════════

    /**
     * Sets up all event listeners
     * @returns {void}
     */
    function setupEventListeners() {
        // Tab switching with click
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Tab keyboard navigation
        const tabContainer = document.querySelector('.tabs');
        if (tabContainer) {
            tabContainer.addEventListener('keydown', handleTabKeyboard);
        }

        // Main controls
        elements.startBtn.addEventListener('click', handleStart);
        elements.stopBtn.addEventListener('click', handleStop);
        elements.continueBtn.addEventListener('click', handleContinue);
        elements.resetBtn.addEventListener('click', handleReset);
        elements.undoBtn.addEventListener('click', handleUndo);
        elements.dryRunMode.addEventListener('change', handleDryRunToggle);

        // Filters
        elements.addKeywordBtn.addEventListener('click', handleAddKeyword);
        elements.keywordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAddKeyword();
        });

        elements.addWhitelistBtn.addEventListener('click', handleAddWhitelist);
        elements.whitelistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAddWhitelist();
        });

        // Stats
        elements.exportCsvBtn.addEventListener('click', handleExportCsv);

        // Theme
        elements.themeToggle.addEventListener('click', handleThemeToggle);

        // Language
        elements.langToggle.addEventListener('click', handleLanguageToggle);

        // Listen for messages from content script
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initializes the popup
     * @async
     * @returns {Promise<void>}
     */
    async function init() {
        // Cache DOM elements first
        cacheElements();

        // Initialize i18n
        await I18n.init();

        // Get current tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tabs[0];

        // Check if on correct page
        if (!currentTab.url.includes('twitter.com') && !currentTab.url.includes('x.com')) {
            updateStatus('error', `❌ ${I18n.t('messages.notOnTwitter')}`);
            elements.startBtn.disabled = true;
            return;
        }

        if (!currentTab.url.includes('/following')) {
            updateStatus('error', `❌ ${I18n.t('messages.goToFollowing')}`);
            elements.startBtn.disabled = true;
            return;
        }

        // Load data
        await loadStats();
        await loadKeywords();
        await loadWhitelist();
        await loadTheme();
        await loadDryRunMode();
        await loadUndoQueue();

        // Setup event listeners
        setupEventListeners();

        // Apply ARIA labels
        applyAriaLabels();

        // Check if content script is loaded
        try {
            await chrome.tabs.sendMessage(currentTab.id, { action: Constants.ACTIONS.GET_STATUS });
            updateStatus('ready', `✓ ${I18n.t('status.ready')}`);
        } catch (error) {
            console.log('Content script not loaded yet');
            updateStatus('ready', `⚠️ ${I18n.t('status.ready')}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // RETURN PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    return {
        init
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    TwitterUnfollowPopup.init();
});
