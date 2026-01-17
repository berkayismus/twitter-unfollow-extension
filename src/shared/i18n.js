/**
 * @fileoverview Internationalization module for Twitter Auto Unfollow Extension
 * @description Handles loading and applying translations for multiple languages
 * @version 2.0.0
 */

/**
 * Internationalization Module
 * @namespace I18n
 */
const I18n = (function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE STATE
    // ═══════════════════════════════════════════════════════════════

    /** @type {string} Current active locale */
    let currentLocale = 'tr';

    /** @type {Object} Translation strings for current locale */
    let translations = {};

    /** @type {string[]} List of supported locale codes */
    const supportedLocales = ['tr', 'en'];

    /** @type {Object<string, Object>} Cache for loaded translations */
    const translationCache = {};

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Loads translations for a specific locale from JSON file
     * @async
     * @param {string} locale - Locale code to load (e.g., 'en', 'tr')
     * @returns {Promise<boolean>} True if translations loaded successfully
     */
    async function loadTranslations(locale) {
        // Check cache first
        if (translationCache[locale]) {
            translations = translationCache[locale];
            return true;
        }

        try {
            const response = await fetch(chrome.runtime.getURL(`locales/${locale}.json`));

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            translations = await response.json();
            translationCache[locale] = translations;
            return true;
        } catch (error) {
            console.error(`Failed to load translations for ${locale}:`, error);

            // Fallback to Turkish if loading fails
            if (locale !== 'tr') {
                console.log('Falling back to Turkish translations');
                return loadTranslations('tr');
            }

            return false;
        }
    }

    /**
     * Applies translations to all elements with data-i18n attributes
     * @returns {void}
     */
    function applyTranslations() {
        // Translate elements with data-i18n attribute (textContent)
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = t(key);

            if (translation && translation !== key) {
                element.textContent = translation;
            }
        });

        // Translate placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = t(key);

            if (translation && translation !== key) {
                element.placeholder = translation;
            }
        });

        // Translate titles
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = t(key);

            if (translation && translation !== key) {
                element.title = translation;
            }
        });

        // Translate ARIA labels
        document.querySelectorAll('[data-i18n-aria]').forEach(element => {
            const key = element.getAttribute('data-i18n-aria');
            const translation = t(key);

            if (translation && translation !== key) {
                element.setAttribute('aria-label', translation);
            }
        });

        // Update language toggle button
        const langToggle = document.getElementById('langToggle');
        if (langToggle) {
            langToggle.textContent = t('language.current');
            langToggle.title = t('language.toggle');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initializes the i18n system
     * @async
     * @returns {Promise<string>} The current locale after initialization
     */
    async function init() {
        // Load saved language preference
        const data = await chrome.storage.local.get([Constants.STORAGE_KEYS.LANGUAGE]);
        currentLocale = data[Constants.STORAGE_KEYS.LANGUAGE] || 'tr';

        // Validate locale
        if (!supportedLocales.includes(currentLocale)) {
            console.warn(`Unsupported locale: ${currentLocale}, falling back to Turkish`);
            currentLocale = 'tr';
        }

        // Load translations for current locale
        await loadTranslations(currentLocale);

        // Apply translations to the page
        applyTranslations();

        return currentLocale;
    }

    /**
     * Gets a translation string by key path
     * @param {string} keyPath - Dot-separated key path (e.g., 'app.title')
     * @param {Object} [replacements={}] - Placeholder replacements
     * @returns {string} Translated string or the key path if not found
     * @example
     * I18n.t('messages.undone'); // Returns "Geri alındı" in Turkish
     * I18n.t('aria.undoButton', { count: 5 }); // Returns "5 işlem geri alınabilir"
     */
    function t(keyPath, replacements = {}) {
        if (!keyPath || typeof keyPath !== 'string') {
            console.warn('Invalid translation key:', keyPath);
            return keyPath || '';
        }

        const keys = keyPath.split('.');
        let value = translations;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                // Key not found
                if (process?.env?.NODE_ENV !== 'production') {
                    console.warn(`Translation key not found: ${keyPath}`);
                }
                return keyPath;
            }
        }

        // Replace placeholders like {count}
        if (typeof value === 'string') {
            Object.keys(replacements).forEach(placeholder => {
                const regex = new RegExp(`{${placeholder}}`, 'g');
                value = value.replace(regex, replacements[placeholder]);
            });
        }

        return value;
    }

    /**
     * Changes the current language
     * @async
     * @param {string} locale - Locale code to switch to
     * @returns {Promise<boolean>} True if locale was changed successfully
     */
    async function setLocale(locale) {
        if (!supportedLocales.includes(locale)) {
            console.warn(`Unsupported locale: ${locale}`);
            return false;
        }

        currentLocale = locale;
        await chrome.storage.local.set({ [Constants.STORAGE_KEYS.LANGUAGE]: locale });
        await loadTranslations(locale);
        applyTranslations();

        return true;
    }

    /**
     * Toggles between supported languages
     * @async
     * @returns {Promise<string>} The new locale after toggle
     */
    async function toggleLocale() {
        const currentIndex = supportedLocales.indexOf(currentLocale);
        const nextIndex = (currentIndex + 1) % supportedLocales.length;
        const nextLocale = supportedLocales[nextIndex];

        await setLocale(nextLocale);
        return nextLocale;
    }

    /**
     * Gets the current locale code
     * @returns {string} Current locale code
     */
    function getLocale() {
        return currentLocale;
    }

    /**
     * Gets the list of supported locales
     * @returns {string[]} Array of supported locale codes
     */
    function getSupportedLocales() {
        return [...supportedLocales];
    }

    /**
     * Checks if a locale is supported
     * @param {string} locale - Locale code to check
     * @returns {boolean} True if locale is supported
     */
    function isSupported(locale) {
        return supportedLocales.includes(locale);
    }

    // ═══════════════════════════════════════════════════════════════
    // RETURN PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    return {
        init,
        t,
        setLocale,
        toggleLocale,
        getLocale,
        getSupportedLocales,
        isSupported,
        applyTranslations
    };
})();

// Expose globally for other scripts
if (typeof window !== 'undefined') {
    window.I18n = I18n;
}
