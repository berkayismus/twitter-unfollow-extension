// Twitter/X Auto Unfollow - Content Script

let isRunning = false;
let isPaused = false;
let testMode = true;
let testComplete = false;
let unfollowQueue = [];
let processedUsers = new Set();
let sessionCount = 0;
let totalUnfollowed = 0;

const CONFIG = {
    MAX_SESSION: 100,
    MIN_DELAY: 2000,
    MAX_DELAY: 5000,
    SCROLL_AMOUNT: 400,
    SCROLL_DELAY: 1500,
    BATCH_SIZE: 50, // First batch 50, then another 50
    SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
};

// Initialize storage
async function initStorage() {
    const data = await chrome.storage.local.get([
        'sessionCount',
        'sessionStart',
        'totalUnfollowed',
        'lastRun',
        'testMode',
        'testComplete'
    ]);

    const now = Date.now();

    // Reset session if 24 hours passed
    if (data.sessionStart && (now - data.sessionStart) > CONFIG.SESSION_DURATION) {
        sessionCount = 0;
        await chrome.storage.local.set({ sessionCount: 0, sessionStart: now });
    } else {
        sessionCount = data.sessionCount || 0;
    }

    totalUnfollowed = data.totalUnfollowed || 0;
    testMode = data.testMode !== undefined ? data.testMode : true;
    testComplete = data.testComplete || false;

    if (!data.sessionStart) {
        await chrome.storage.local.set({ sessionStart: now });
    }
}

// Send status update to popup
function sendStatus(status, data = {}) {
    chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        status,
        sessionCount,
        totalUnfollowed,
        testMode,
        testComplete,
        ...data
    });
}

// Random delay
function randomDelay(min, max) {
    return new Promise(resolve =>
        setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
    );
}

// Check if user follows back
function hasFollowsYouBadge(userCell) {
    const text = userCell.innerText || userCell.textContent;
    return text.includes('Follows you') || text.includes('Seni takip ediyor');
}

// Find following button in user cell
function findFollowingButton(userCell) {
    // Try to find "Following" button
    const buttons = userCell.querySelectorAll('button[role="button"]');
    for (const button of buttons) {
        const text = button.innerText || button.textContent;
        if (text.includes('Following') || text.includes('Takip ediliyor')) {
            return button;
        }
    }
    return null;
}

// Unfollow a user
async function unfollowUser(userCell) {
    try {
        // Find and click Following button
        const followingBtn = findFollowingButton(userCell);
        if (!followingBtn) {
            console.log('Following button not found');
            return false;
        }

        followingBtn.click();
        await randomDelay(500, 1000);

        // Find and click confirmation button
        const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
        if (confirmBtn) {
            confirmBtn.click();
            await randomDelay(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY);

            sessionCount++;
            totalUnfollowed++;

            await chrome.storage.local.set({
                sessionCount,
                totalUnfollowed,
                lastRun: new Date().toISOString()
            });

            sendStatus('unfollowed', { username: getUsernameFromCell(userCell) });
            return true;
        }

        return false;
    } catch (error) {
        console.error('Unfollow error:', error);
        return false;
    }
}

// Get username from user cell
function getUsernameFromCell(userCell) {
    const link = userCell.querySelector('a[role="link"][href*="/"]');
    if (link) {
        const href = link.getAttribute('href');
        return href.split('/')[1];
    }
    return 'Unknown';
}

// Scan current visible users
function scanUsers() {
    const userCells = document.querySelectorAll('[data-testid="UserCell"]');
    let newUsersFound = 0;

    userCells.forEach(cell => {
        const username = getUsernameFromCell(cell);
        if (processedUsers.has(username)) return;

        processedUsers.add(username);

        if (!hasFollowsYouBadge(cell)) {
            unfollowQueue.push(cell);
            newUsersFound++;
        }
    });

    if (newUsersFound > 0) {
        console.log(`Found ${newUsersFound} non-followers`);
        sendStatus('scanning', { found: newUsersFound, queueSize: unfollowQueue.length });
    }
}

// Auto scroll to load more users
async function autoScroll() {
    // Scroll to bottom
    window.scrollTo(0, document.documentElement.scrollHeight);
    await randomDelay(CONFIG.SCROLL_DELAY, CONFIG.SCROLL_DELAY + 1000);

    // Check if new content appeared by counting UserCells
    const userCellsCount = document.querySelectorAll('[data-testid="UserCell"]').length;
    return userCellsCount;
}

// Main loop
async function mainLoop() {
    await initStorage();
    sendStatus('started');

    let noNewContentCount = 0;
    let consecutiveEmptyScans = 0;
    let scrollCycles = 0;

    while (isRunning) {
        if (isPaused) {
            await randomDelay(1000, 1000);
            continue;
        }

        if (sessionCount >= CONFIG.MAX_SESSION) {
            isRunning = false;
            sendStatus('limit_reached');
            break;
        }

        // Check if we reached a batch milestone (50 users)
        if (testMode && !testComplete && sessionCount >= CONFIG.BATCH_SIZE) {
            isPaused = true;
            chrome.runtime.sendMessage({ type: 'TEST_COMPLETE' });
            sendStatus('test_complete');
            return;
        }

        // Phase 1: Scroll and scan to build queue (do this multiple times before processing)
        let lastUserCellCount = 0;
        let sameCountStreak = 0;

        for (let i = 0; i < 8 && isRunning; i++) {
            const beforeQueueSize = unfollowQueue.length;
            scanUsers();
            const afterQueueSize = unfollowQueue.length;

            if (afterQueueSize === beforeQueueSize) {
                consecutiveEmptyScans++;
            } else {
                consecutiveEmptyScans = 0;
            }

            // Scroll to load more
            const currentUserCellCount = await autoScroll();
            scrollCycles++;

            // Check if UserCell count stayed the same (means no new users loaded)
            if (currentUserCellCount === lastUserCellCount) {
                sameCountStreak++;
                if (sameCountStreak >= 3) {
                    console.log('No new users loading after multiple scrolls');
                    break;
                }
            } else {
                sameCountStreak = 0;
                lastUserCellCount = currentUserCellCount;
            }
        }

        // Phase 2: Process users from queue (only if we have some)
        if (unfollowQueue.length > 0) {
            const processCount = Math.min(5, unfollowQueue.length);

            for (let i = 0; i < processCount && isRunning && !isPaused; i++) {
                if (sessionCount >= CONFIG.MAX_SESSION) break;

                const userCell = unfollowQueue.shift();
                if (userCell && document.contains(userCell)) {
                    const success = await unfollowUser(userCell);
                    if (!success) {
                        console.log('Unfollow failed, might be rate limited');
                    }
                }

                // Check batch after each unfollow
                if (testMode && !testComplete && sessionCount >= CONFIG.BATCH_SIZE) {
                    isPaused = true;
                    chrome.runtime.sendMessage({ type: 'TEST_COMPLETE' });
                    sendStatus('test_complete');
                    return;
                }
            }
        }

        if (!isRunning) break;

        // Check if we should stop (no queue and can't find more users)
        if (unfollowQueue.length === 0 && consecutiveEmptyScans >= 8) {
            console.log('No more users to process - exhausted following list');
            isRunning = false;
            sendStatus('completed');
            break;
        }

        // Random pause to appear more human
        if (Math.random() < 0.15) { // 15% chance
            await randomDelay(5000, 10000);
        }
    }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START') {
        if (!isRunning) {
            isRunning = true;
            isPaused = false;
            mainLoop();
        }
        sendResponse({ success: true });
    } else if (message.action === 'STOP') {
        isRunning = false;
        isPaused = false;
        sendStatus('stopped');
        sendResponse({ success: true });
    } else if (message.action === 'CONTINUE_TEST') {
        testComplete = true;
        isPaused = false;
        isRunning = true;
        chrome.storage.local.set({ testComplete: true });
        mainLoop();
        sendResponse({ success: true });
    } else if (message.action === 'GET_STATUS') {
        sendStatus('idle');
        sendResponse({ success: true });
    }
    return true;
});

// Check if we're on the following page
function checkPage() {
    const url = window.location.href;
    if (url.includes('/following')) {
        console.log('Twitter Auto Unfollow extension ready');
        initStorage().then(() => {
            sendStatus('ready');
        });
    }
}

// Initialize
checkPage();
