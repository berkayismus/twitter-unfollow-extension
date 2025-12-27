// Twitter/X Auto Unfollow - Content Script

let isRunning = false;
let isPaused = false;
let testMode = true;
let testComplete = false;
let unfollowQueue = [];
let processedUsers = new Set();
let sessionCount = 0;
let totalUnfollowed = 0;
let keywords = [];
let whitelist = {};
let dryRunMode = false;
let undoQueue = [];
let rateLimitUntil = null;
let operationStartTime = null;
let operationSpeeds = [];

const CONFIG = {
    MAX_SESSION: 100,
    MIN_DELAY: 2000,
    MAX_DELAY: 5000,
    SCROLL_AMOUNT: 400,
    SCROLL_DELAY: 1500,
    BATCH_SIZE: 50, // First batch 50, then another 50
    SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    HISTORY_RETENTION_DAYS: 30,
    MAX_UNDO_QUEUE: 10,
};

// Initialize storage
async function initStorage() {
    const data = await chrome.storage.local.get([
        'sessionCount',
        'sessionStart',
        'totalUnfollowed',
        'lastRun',
        'testMode',
        'testComplete',
        'keywords',
        'whitelist',
        'dryRunMode',
        'undoQueue',
        'rateLimitUntil',
        'unfollowStats',
        'unfollowHistory'
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
    keywords = data.keywords || [];
    whitelist = data.whitelist || {};
    dryRunMode = data.dryRunMode || false;
    undoQueue = data.undoQueue || [];
    rateLimitUntil = data.rateLimitUntil || null;

    if (!data.sessionStart) {
        await chrome.storage.local.set({ sessionStart: now });
    }

    // Initialize stats if not exists
    if (!data.unfollowStats) {
        await chrome.storage.local.set({ unfollowStats: { daily: {} } });
    }

    // Initialize history if not exists
    if (!data.unfollowHistory) {
        await chrome.storage.local.set({ unfollowHistory: [] });
    }

    // Check if rate limit is still active
    if (rateLimitUntil && now < rateLimitUntil) {
        const waitTime = Math.ceil((rateLimitUntil - now) / 1000 / 60);
        console.log(`Rate limit active. Waiting ${waitTime} minutes`);
        sendStatus('rate_limit', { remainingMinutes: waitTime });
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

// Check if user should be skipped
function shouldSkipUser(userCell, username) {
    // Check whitelist
    const normalizedUsername = username.toLowerCase().replace('@', '');
    if (whitelist[normalizedUsername]) {
        console.log(`Skipping whitelisted user: ${username}`);
        return { skip: true, reason: 'whitelist' };
    }

    // Check keywords
    const text = (userCell.innerText || userCell.textContent).toLowerCase();
    for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
            console.log(`Skipping user ${username} due to keyword: ${keyword}`);
            return { skip: true, reason: `keyword:${keyword}` };
        }
    }

    return { skip: false, reason: null };
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
    const username = getUsernameFromCell(userCell);

    try {
        // Dry-run mode - simulate without actual unfollowing
        if (dryRunMode) {
            console.log(`[DRY RUN] Would unfollow ${username}`);
            await randomDelay(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY); // Simulate delay

            sessionCount++;
            sendStatus('unfollowed', { username, dryRun: true });
            chrome.runtime.sendMessage({
                type: 'USER_PROCESSED',
                data: { username, action: 'dry-run', timestamp: Date.now() }
            });

            // Update daily stats
            await updateDailyStats();

            return true;
        }

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

            // Add to undo queue
            undoQueue.push({
                username,
                timestamp: Date.now(),
                userCell: username // Store username for refollow
            });

            // Limit undo queue size
            if (undoQueue.length > CONFIG.MAX_UNDO_QUEUE) {
                undoQueue.shift();
            }

            await chrome.storage.local.set({
                sessionCount,
                totalUnfollowed,
                lastRun: new Date().toISOString(),
                undoQueue
            });

            // Update daily stats
            await updateDailyStats();

            // Add to history
            await addToHistory(username, 'manual');

            sendStatus('unfollowed', { username });
            chrome.runtime.sendMessage({
                type: 'USER_PROCESSED',
                data: { username, action: 'unfollowed', timestamp: Date.now() }
            });

            return true;
        }

        return false;
    } catch (error) {
        console.error('Unfollow error:', error);

        // Check for rate limit
        if (error.message && error.message.includes('429')) {
            await handleRateLimit();
        }

        return false;
    }
}
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

// Update daily stats
async function updateDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    const data = await chrome.storage.local.get(['unfollowStats']);
    const stats = data.unfollowStats || { daily: {} };

    if (!stats.daily[today]) {
        stats.daily[today] = { unfollowed: 0, timestamp: Date.now() };
    }

    stats.daily[today].unfollowed++;

    await chrome.storage.local.set({ unfollowStats: stats });
}

// Add to history
async function addToHistory(username, reason) {
    const data = await chrome.storage.local.get(['unfollowHistory']);
    const history = data.unfollowHistory || [];

    history.push({
        username,
        date: new Date().toISOString(),
        reason
    });

    // Cleanup old history (30 days)
    const thirtyDaysAgo = Date.now() - (CONFIG.HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const filtered = history.filter(item => new Date(item.date).getTime() > thirtyDaysAgo);

    await chrome.storage.local.set({ unfollowHistory: filtered });
}

// Handle rate limit
async function handleRateLimit() {
    const now = Date.now();
    const waitTime = 15 * 60 * 1000; // 15 minutes
    rateLimitUntil = now + waitTime;

    await chrome.storage.local.set({ rateLimitUntil });

    isPaused = true;
    chrome.runtime.sendMessage({
        type: 'RATE_LIMIT_HIT',
        data: { until: rateLimitUntil, remainingMinutes: 15 }
    });

    sendStatus('rate_limit', { remainingMinutes: 15 });

    // Set timeout to auto-resume
    setTimeout(() => {
        checkRateLimitExpiry();
    }, waitTime);
}

// Check if rate limit expired and resume
function checkRateLimitExpiry() {
    const now = Date.now();
    if (rateLimitUntil && now >= rateLimitUntil) {
        console.log('Rate limit expired, resuming...');
        rateLimitUntil = null;
        isPaused = false;
        chrome.storage.local.set({ rateLimitUntil: null });

        if (isRunning) {
            sendStatus('resumed', { message: 'Rate limit cleared, resuming operation' });
        }
    }
}

// Refollow user (for undo)
async function refollowUser(username) {
    try {
        console.log(`Refollowing ${username}...`);

        // Navigate to user profile
        const profileUrl = `https://twitter.com/${username}`;
        // Note: In content script, we can't navigate directly
        // We'll need to send message to background or user needs to be on profile page

        // For now, just log it - full implementation would require more complex navigation
        console.log(`To refollow, visit: ${profileUrl}`);

        return true;
    } catch (error) {
        console.error('Refollow error:', error);
        return false;
    }
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
            // Check if user should be skipped (whitelist/keywords)
            const skipCheck = shouldSkipUser(cell, username);
            if (skipCheck.skip) {
                chrome.runtime.sendMessage({
                    type: 'USER_PROCESSED',
                    data: { username, action: `skipped:${skipCheck.reason}`, timestamp: Date.now() }
                });
                return;
            }

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
            operationStartTime = Date.now();
            operationSpeeds = [];
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
    } else if (message.action === 'UPDATE_KEYWORDS') {
        keywords = message.keywords || [];
        chrome.storage.local.set({ keywords });
        sendResponse({ success: true });
    } else if (message.action === 'UPDATE_WHITELIST') {
        whitelist = message.whitelist || {};
        chrome.storage.local.set({ whitelist });
        sendResponse({ success: true });
    } else if (message.action === 'TOGGLE_DRY_RUN') {
        dryRunMode = message.enabled;
        chrome.storage.local.set({ dryRunMode });
        sendResponse({ success: true });
    } else if (message.action === 'UNDO_LAST') {
        if (undoQueue.length > 0) {
            const lastUser = undoQueue.pop();
            refollowUser(lastUser.username);
            chrome.storage.local.set({ undoQueue });
            sendResponse({ success: true, username: lastUser.username });
        } else {
            sendResponse({ success: false, message: 'No users to undo' });
        }
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
