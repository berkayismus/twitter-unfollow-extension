/**
 * @fileoverview Twitter Auto Unfollow - Background Service Worker
 * @description Handles message relay between content script and popup
 * @version 2.0.0
 */

/**
 * Twitter Unfollow Background Module
 * @namespace TwitterUnfollowBackground
 */
const TwitterUnfollowBackground = (function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Relays a message to the runtime
     * @param {Object} message - Message to relay
     * @returns {void}
     */
    function relayMessage(message) {
        try {
            chrome.runtime.sendMessage(message);
        } catch (error) {
            // Popup might not be open, ignore error
            if (!error.message?.includes('Could not establish connection')) {
                console.error('Error relaying message:', error);
            }
        }
    }

    /**
     * Handles incoming messages from content script or popup
     * @param {Object} message - The message object
     * @param {chrome.runtime.MessageSender} sender - The sender information
     * @param {function} sendResponse - Function to send response
     * @returns {boolean} True to indicate async response
     */
    function handleMessage(message, sender, sendResponse) {
        // Log message for debugging
        console.log('Background received message:', message.type || message.action);

        switch (message.type) {
            case 'TEST_COMPLETE':
                // Relay test completion to popup
                relayMessage(message);
                break;

            case 'STATUS_UPDATE':
                // Relay status updates to popup
                relayMessage(message);
                break;

            case 'RATE_LIMIT_HIT':
                // Relay rate limit warning to popup
                relayMessage(message);
                break;

            case 'USER_PROCESSED':
                // Relay user processed notification to popup
                relayMessage(message);
                break;

            default:
                // Unknown message type, log it
                if (message.type) {
                    console.log('Unknown message type:', message.type);
                }
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initializes the background service worker
     * @returns {void}
     */
    function init() {
        console.log('🔵 Twitter Auto Unfollow - Background Service Worker initialized');

        // Set up message listener
        chrome.runtime.onMessage.addListener(handleMessage);

        // Log when service worker starts
        console.log('✅ Message listener attached');
    }

    // ═══════════════════════════════════════════════════════════════
    // RETURN PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    return {
        init
    };
})();

// Auto-initialize
TwitterUnfollowBackground.init();
