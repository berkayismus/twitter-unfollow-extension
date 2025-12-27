// Twitter Auto Unfollow - Popup Script

let currentTab = null;
let isRunning = false;
let chart = null;
let rateLimitInterval = null;

// DOM Elements
const elements = {
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
  
  progressDetails: document.getElementById('progressDetails'),
  progressBar: document.getElementById('progressBar'),
  progressStats: document.getElementById('progressStats'),
  
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
  themeToggle: document.getElementById('themeToggle')
};

// Initialize
async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  if (!currentTab.url.includes('twitter.com') && !currentTab.url.includes('x.com')) {
    updateStatus('error', '❌ Twitter/X sayfasında değilsiniz');
    elements.startBtn.disabled = true;
    return;
  }

  if (!currentTab.url.includes('/following')) {
    updateStatus('error', '❌ Following sayfasına gidin (örn: x.com/kullaniciadi/following)');
    elements.startBtn.disabled = true;
    return;
  }

  await loadStats();
  await loadKeywords();
  await loadWhitelist();
  await loadTheme();
  await loadDryRunMode();
  await loadUndoQueue();
  
  setupEventListeners();
  
  // Check if content script is loaded
  try {
    await chrome.tabs.sendMessage(currentTab.id, { action: 'GET_STATUS' });
    updateStatus('ready', '✓ Hazır');
  } catch (error) {
    console.log('Content script not loaded yet');
    updateStatus('ready', '⚠️ Hazır (Sayfayı yenilerseniz daha iyi çalışabilir)');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  
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
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(handleMessage);
}

// Tab switching
function switchTab(tabName) {
  elements.tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
  
  if (tabName === 'stats') {
    renderChart();
  }
}

// Load statistics
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

// Load keywords
async function loadKeywords() {
  const data = await chrome.storage.local.get(['keywords']);
  const keywords = data.keywords || [];
  renderKeywordList(keywords);
}

// Load whitelist
async function loadWhitelist() {
  const data = await chrome.storage.local.get(['whitelist']);
  const whitelist = data.whitelist || {};
  renderWhitelistList(whitelist);
}

// Load theme
async function loadTheme() {
  const data = await chrome.storage.local.get(['theme']);
  const theme = data.theme || 'light';
  applyTheme(theme);
}

// Load dry-run mode
async function loadDryRunMode() {
  const data = await chrome.storage.local.get(['dryRunMode']);
  elements.dryRunMode.checked = data.dryRunMode || false;
}

// Load undo queue
async function loadUndoQueue() {
  const data = await chrome.storage.local.get(['undoQueue']);
  const queue = data.undoQueue || [];
  updateUndoButton(queue.length);
}

// Update status
function updateStatus(type, message) {
  elements.statusText.textContent = message;
  elements.statusIndicator.className = 'status-indicator';
  
  switch(type) {
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

// Handlers
async function handleStart() {
  if (!currentTab) return;

  try {
    await chrome.tabs.sendMessage(currentTab.id, { action: 'START' });
    isRunning = true;
    elements.startBtn.style.display = 'none';
    elements.stopBtn.style.display = 'block';
    elements.progressDetails.style.display = 'block';
    elements.userList.innerHTML = '';
    updateStatus('active', '🔄 Çalışıyor...');
  } catch (error) {
    console.error('Failed to start:', error);
    if (confirm('Extension henüz yüklenmedi. Sayfayı yenilemek ister misiniz?')) {
      await chrome.tabs.reload(currentTab.id);
      updateStatus('ready', '🔄 Sayfa yenilendi - Tekrar deneyin');
    } else {
      updateStatus('error', '❌ Başlatılamadı - Sayfayı yenileyin');
    }
  }
}

async function handleStop() {
  if (!currentTab) return;

  try {
    await chrome.tabs.sendMessage(currentTab.id, { action: 'STOP' });
    isRunning = false;
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';
    elements.progressDetails.style.display = 'none';
    updateStatus('stopped', '⏸ Durduruldu');
  } catch (error) {
    console.error('Failed to stop:', error);
  }
}

async function handleContinue() {
  if (!currentTab) return;

  try {
    await chrome.tabs.sendMessage(currentTab.id, { action: 'CONTINUE_TEST' });
    elements.testModeAlert.style.display = 'none';
    updateStatus('active', '🔄 Devam ediyor...');
  } catch (error) {
    console.error('Failed to continue:', error);
  }
}

async function handleReset() {
  if (confirm('Tüm istatistikler sıfırlanacak. Emin misiniz?')) {
    await chrome.storage.local.set({
      sessionCount: 0,
      totalUnfollowed: 0,
      sessionStart: Date.now(),
      testMode: true,
      testComplete: false,
      undoQueue: []
    });
    
    elements.sessionCount.textContent = '0/100';
    elements.totalCount.textContent = '0';
    elements.lastRun.textContent = '-';
    elements.limitReachedAlert.style.display = 'none';
    elements.startBtn.disabled = false;
    elements.userList.innerHTML = '';
    updateUndoButton(0);
    
    updateStatus('ready', '✓ Sıfırlandı');
  }
}

async function handleUndo() {
  if (!currentTab) return;

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'UNDO_LAST' });
    if (response.success) {
      updateStatus('ready', `↶ Geri alındı: @${response.username}`);
      await loadUndoQueue();
    } else {
      alert(response.message || 'Geri alınacak işlem yok');
    }
  } catch (error) {
    console.error('Failed to undo:', error);
  }
}

async function handleDryRunToggle(e) {
  const enabled = e.target.checked;
  
  await chrome.storage.local.set({ dryRunMode: enabled });
  
  try {
    await chrome.tabs.sendMessage(currentTab.id, { 
      action: 'TOGGLE_DRY_RUN',
      enabled 
    });
  } catch (error) {
    console.log('Content script not loaded, but settings saved');
  }
  
  if (enabled) {
    updateStatus('ready', '🧪 Dry Run Mode aktif');
  } else {
    updateStatus('ready', '✓ Normal mode');
  }
}

// Keyword handlers
async function handleAddKeyword() {
  const keyword = elements.keywordInput.value.trim();
  if (!keyword) return;
  
  const data = await chrome.storage.local.get(['keywords']);
  const keywords = data.keywords || [];
  
  if (!keywords.includes(keyword.toLowerCase())) {
    keywords.push(keyword.toLowerCase());
    await chrome.storage.local.set({ keywords });
    
    try {
      await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'UPDATE_KEYWORDS',
        keywords 
      });
    } catch (error) {
      console.log('Content script not loaded, but settings saved');
    }
    
    renderKeywordList(keywords);
  }
  
  elements.keywordInput.value = '';
}

async function handleRemoveKeyword(keyword) {
  const data = await chrome.storage.local.get(['keywords']);
  const keywords = data.keywords || [];
  
  const filtered = keywords.filter(k => k !== keyword);
  await chrome.storage.local.set({ keywords: filtered });
  
  try {
    await chrome.tabs.sendMessage(currentTab.id, { 
      action: 'UPDATE_KEYWORDS',
      keywords: filtered 
    });
  } catch (error) {
    console.log('Content script not loaded, but settings saved');
  }
  
  renderKeywordList(filtered);
}

function renderKeywordList(keywords) {
  elements.keywordList.innerHTML = '';
  keywords.forEach(keyword => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${keyword}</span>
      <button class="remove-btn" data-keyword="${keyword}">✕</button>
    `;
    li.querySelector('.remove-btn').addEventListener('click', () => handleRemoveKeyword(keyword));
    elements.keywordList.appendChild(li);
  });
}

// Whitelist handlers
async function handleAddWhitelist() {
  let username = elements.whitelistInput.value.trim();
  if (!username) return;
  
  username = username.replace('@', '').toLowerCase();
  
  const data = await chrome.storage.local.get(['whitelist']);
  const whitelist = data.whitelist || {};
  
  if (!whitelist[username]) {
    whitelist[username] = { addedDate: Date.now() };
    await chrome.storage.local.set({ whitelist });
    
    try {
      await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'UPDATE_WHITELIST',
        whitelist 
      });
    } catch (error) {
      console.log('Content script not loaded, but settings saved');
    }
    
    renderWhitelistList(whitelist);
  }
  
  elements.whitelistInput.value = '';
}

async function handleRemoveWhitelist(username) {
  const data = await chrome.storage.local.get(['whitelist']);
  const whitelist = data.whitelist || {};
  
  delete whitelist[username];
  await chrome.storage.local.set({ whitelist });
  
  try {
    await chrome.tabs.sendMessage(currentTab.id, { 
      action: 'UPDATE_WHITELIST',
      whitelist 
    });
  } catch (error) {
    console.log('Content script not loaded, but settings saved');
  }
  
  renderWhitelistList(whitelist);
}

function renderWhitelistList(whitelist) {
  elements.whitelistList.innerHTML = '';
  Object.keys(whitelist).forEach(username => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>@${username}</span>
      <button class="remove-btn" data-username="${username}">✕</button>
    `;
    li.querySelector('.remove-btn').addEventListener('click', () => handleRemoveWhitelist(username));
    elements.whitelistList.appendChild(li);
  });
}

// Theme handlers
async function handleThemeToggle() {
  const current = document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light';
  const newTheme = current === 'light' ? 'dark' : 'light';
  
  await chrome.storage.local.set({ theme: newTheme });
  applyTheme(newTheme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-mode');
    elements.themeToggle.textContent = '☀️';
  } else {
    document.documentElement.classList.remove('dark-mode');
    elements.themeToggle.textContent = '🌙';
  }
}

// Chart rendering
async function renderChart() {
  const data = await chrome.storage.local.get(['unfollowStats']);
  const stats = data.unfollowStats || { daily: {} };
  
  const labels = [];
  const series = [];
  
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  for (let i = 29; i >= 0; i--) {
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

// CSV Export
async function handleExportCsv() {
  const data = await chrome.storage.local.get(['unfollowHistory']);
  const history = data.unfollowHistory || [];
  
  if (history.length === 0) {
    alert('Henüz işlem geçmişi yok');
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

// User list
function addUserToList(username, action, timestamp) {
  const li = document.createElement('li');
  const time = new Date(timestamp).toLocaleTimeString('tr-TR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  let icon = '';
  let className = '';
  
  if (action === 'unfollowed') {
    icon = '✓';
    className = 'unfollowed';
  } else if (action === 'dry-run') {
    icon = '🧪';
    className = 'dry-run';
  } else if (action.startsWith('skipped:')) {
    icon = '⊘';
    className = 'skipped';
  }
  
  li.className = className;
  li.innerHTML = `
    <span class="user-icon">${icon}</span>
    <span class="user-name">@${username}</span>
    <span class="user-time">${time}</span>
  `;
  
  elements.userList.appendChild(li);
  
  if (elements.userList.children.length > 100) {
    elements.userList.removeChild(elements.userList.firstChild);
  }
  
  elements.userList.scrollTop = elements.userList.scrollHeight;
}

// Update undo button
function updateUndoButton(count) {
  elements.undoCount.textContent = count;
  elements.undoBtn.style.display = count > 0 ? 'inline-block' : 'none';
}

// Handle messages from content script
function handleMessage(message) {
  if (message.type === 'STATUS_UPDATE') {
    handleStatusUpdate(message);
  } else if (message.type === 'TEST_COMPLETE') {
    handleTestComplete();
  } else if (message.type === 'RATE_LIMIT_HIT') {
    handleRateLimit(message.data);
  } else if (message.type === 'USER_PROCESSED') {
    addUserToList(message.data.username, message.data.action, message.data.timestamp);
    loadUndoQueue();
  }
}

// Handle status updates
function handleStatusUpdate(data) {
  if (data.sessionCount !== undefined) {
    elements.sessionCount.textContent = `${data.sessionCount}/100`;
  }
  
  if (data.totalUnfollowed !== undefined) {
    elements.totalCount.textContent = data.totalUnfollowed;
  }

  switch(data.status) {
    case 'started':
      updateStatus('active', '🔄 Başlatıldı...');
      break;
    case 'scanning':
      updateStatus('active', `🔍 Taranıyor... (${data.queueSize || 0} bulundu)`);
      break;
    case 'unfollowed':
      const prefix = data.dryRun ? '[DRY RUN] ' : '';
      updateStatus('active', `${prefix}✓ Takipten çıkıldı: @${data.username || 'user'}`);
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
      elements.progressDetails.style.display = 'none';
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
    case 'rate_limit':
      // Handled by handleRateLimit
      break;
  }

  loadStats();
}

// Handle test complete
function handleTestComplete() {
  elements.testModeAlert.style.display = 'block';
  updateStatus('stopped', '⏸ 50 kişi tamamlandı - Onay bekleniyor');
}

// Handle rate limit
function handleRateLimit(data) {
  elements.rateLimitAlert.style.display = 'block';
  updateStatus('stopped', '🚫 Rate limit!');
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
      updateStatus('ready', '✓ Rate limit sona erdi');
      return;
    }
    
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    elements.rateLimitCountdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} sonra otomatik devam edilecek`;
  }, 1000);
}

// Initialize on load
init();
