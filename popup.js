// Popup script for Twitter Auto Unfollow extension

let currentTab = null;
let isRunning = false;

// DOM elements
const elements = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    continueBtn: document.getElementById('continueBtn'),
    resetBtn: document.getElementById('resetBtn'),
    sessionCount: document.getElementById('sessionCount'),
    totalCount: document.getElementById('totalCount'),
    lastRun: document.getElementById('lastRun'),
    statusText: document.getElementById('statusText'),
    statusIndicator: document.getElementById('statusIndicator'),
    testModeAlert: document.getElementById('testModeAlert'),
    rateLimitAlert: document.getElementById('rateLimitAlert'),
    limitReachedAlert: document.getElementById('limitReachedAlert')
};

// Initialize popup
async function init() {
    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];

    // Check if on Twitter/X following page
    if (!currentTab.url.includes('twitter.com') && !currentTab.url.includes('x.com')) {
        updateStatus('error', '❌ Twitter/X sayfasında değilsiniz');
        elements.startBtn.disabled = true;
        return;
    }

    if (!currentTab.url.includes('/following')) {
        updateStatus('error', '❌ Following sayfasına gidin');
        elements.startBtn.disabled = true;
        return;
    }

    // Load stats from storage
    await loadStats();

    // Request status from content script
    chrome.tabs.sendMessage(currentTab.id, { action: 'GET_STATUS' }).catch(() => {
        // Content script might not be loaded yet
        console.log('Content script not ready');
    });
}

// Load statistics from storage
async function loadStats() {
    const data = await chrome.storage.local.get([
        'sessionCount',
        'totalUnfollowed',
        'lastRun',
        'sessionStart'
    ]);

    const sessionCount = data.sessionCount || 0;
    const totalUnfollowed = data.totalUnfollowed || 0;
    const lastRun = data.lastRun || '-';

    elements.sessionCount.textContent = `${sessionCount}/100`;
    elements.totalCount.textContent = totalUnfollowed;

    if (lastRun !== '-') {
        const date = new Date(lastRun);
        elements.lastRun.textContent = date.toLocaleString('tr-TR');
    }

    // Check if session limit reached
    if (sessionCount >= 100) {
        const now = Date.now();
        const sessionStart = data.sessionStart || now;
        const timeLeft = 24 * 60 * 60 * 1000 - (now - sessionStart);

        if (timeLeft > 0) {
            elements.limitReachedAlert.style.display = 'block';
            elements.startBtn.disabled = true;
            const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
            elements.limitReachedAlert.querySelector('p:last-child').textContent =
                `Oturum limiti doldu. ${hoursLeft} saat sonra tekrar deneyin.`;
        }
    }
}

// Update status display
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

// Start button handler
elements.startBtn.addEventListener('click', async () => {
    if (!currentTab) return;

    try {
        await chrome.tabs.sendMessage(currentTab.id, { action: 'START' });
        isRunning = true;
        elements.startBtn.style.display = 'none';
        elements.stopBtn.style.display = 'block';
        updateStatus('active', '🔄 Çalışıyor...');
    } catch (error) {
        console.error('Failed to start:', error);
        // Content script not loaded, offer to reload
        if (confirm('Extension henüz yüklenmedi. Sayfayı yenilemek ister misiniz?')) {
            await chrome.tabs.reload(currentTab.id);
            updateStatus('ready', '🔄 Sayfa yenilendi - Tekrar deneyin');
        } else {
            updateStatus('error', '❌ Başlatılamadı - Sayfayı yenileyin');
        }
    }
});

// Stop button handler
elements.stopBtn.addEventListener('click', async () => {
    if (!currentTab) return;

    try {
        await chrome.tabs.sendMessage(currentTab.id, { action: 'STOP' });
        isRunning = false;
        elements.startBtn.style.display = 'block';
        elements.stopBtn.style.display = 'none';
        updateStatus('stopped', '⏸ Durduruldu');
    } catch (error) {
        console.error('Failed to stop:', error);
    }
});

// Continue button handler (batch mode)
elements.continueBtn.addEventListener('click', async () => {
    if (!currentTab) return;

    try {
        await chrome.tabs.sendMessage(currentTab.id, { action: 'CONTINUE_TEST' });
        elements.testModeAlert.style.display = 'none';
        updateStatus('active', '🔄 Devam ediyor...');
    } catch (error) {
        console.error('Failed to continue:', error);
    }
});

// Reset button handler
elements.resetBtn.addEventListener('click', async () => {
    if (confirm('Tüm istatistikler sıfırlanacak. Emin misiniz?')) {
        await chrome.storage.local.set({
            sessionCount: 0,
            totalUnfollowed: 0,
            sessionStart: Date.now(),
            testMode: true,
            testComplete: false
        });

        elements.sessionCount.textContent = '0/100';
        elements.totalCount.textContent = '0';
        elements.lastRun.textContent = '-';
        elements.limitReachedAlert.style.display = 'none';
        elements.startBtn.disabled = false;

        updateStatus('ready', '✓ Sıfırlandı');
    }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
        handleStatusUpdate(message);
    } else if (message.type === 'TEST_COMPLETE') {
        handleTestComplete();
    } else if (message.type === 'RATE_LIMIT_HIT') {
        handleRateLimit();
    }
});

// Handle status updates from content script
function handleStatusUpdate(data) {
    // Update counters
    if (data.sessionCount !== undefined) {
        elements.sessionCount.textContent = `${data.sessionCount}/100`;
    }

    if (data.totalUnfollowed !== undefined) {
        elements.totalCount.textContent = data.totalUnfollowed;
    }

    // Update status message
    switch (data.status) {
        case 'started':
            updateStatus('active', '🔄 Başlatıldı...');
            break;
        case 'scanning':
            updateStatus('active', `🔍 Taranıyor... (${data.queueSize || 0} bulundu)`);
            break;
        case 'unfollowed':
            updateStatus('active', `✓ Takipten çıkıldı: @${data.username || 'user'}`);
            break;
        case 'stopped':
            updateStatus('stopped', '⏸ Durduruldu');
            isRunning = false;
            elements.startBtn.style.display = 'block';
            elements.stopBtn.style.display = 'none';
            break;
        case 'completed':
            updateStatus('ready', '✅ Tamamlandı');
            isRunning = false;
            elements.startBtn.style.display = 'block';
            elements.stopBtn.style.display = 'none';
            break;
        case 'limit_reached':
            updateStatus('stopped', '🚫 Limit doldu');
            elements.limitReachedAlert.style.display = 'block';
            isRunning = false;
            elements.startBtn.style.display = 'block';
            elements.stopBtn.style.display = 'none';
            elements.startBtn.disabled = true;
            break;
        case 'ready':
            updateStatus('ready', '✓ Hazır');
            break;
        case 'test_complete':
            // Handled by handleTestComplete
            break;
    }

    // Reload stats
    loadStats();
}

// Handle test mode completion (50 users batch)
function handleTestComplete() {
    elements.testModeAlert.style.display = 'block';
    updateStatus('stopped', '⏸ 50 kişi tamamlandı - Onay bekleniyor');
}

// Handle rate limit
function handleRateLimit() {
    elements.rateLimitAlert.style.display = 'block';
    updateStatus('stopped', '🚫 Rate limit!');
    isRunning = false;
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';
}

// Initialize on load
init();
