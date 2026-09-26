// js/app.js

// Global State
const appState = {
  profile: null,
  transactions: [],
  goals: [],
  currentView: 'dashboard',
  selectedDailyDate: getTodayDateString(),
  theme: 'dark'
};

let chartBalanceInstance = null;
let chartExpenseInstance = null;

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth first
  const session = await Auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  
  // Show app container
  document.getElementById('app-container').style.display = 'flex';
  
  // Load data from Supabase
  await loadData();
  
  // Bind UI Events
  bindEvents();
  
  // Initialize view
  switchView('dashboard');
});

async function loadData() {
  const profileData = await Database.getProfile();
  if (profileData) {
    appState.profile = profileData;
    applyTheme(localStorage.getItem('moneyflow_theme') || 'dark');
    document.getElementById('settings-name').textContent = profileData.full_name || 'User';
    document.getElementById('settings-email').textContent = (await Auth.getSession()).user.email;
    document.getElementById('settings-currency').value = profileData.currency || 'Rs.';
  } else {
    // Fallback profile
    appState.profile = { currency: 'Rs.', full_name: 'User' };
  }
  
  const txs = await Database.getTransactions();
  appState.transactions = txs || [];
  
  const goals = await Database.getSavingsGoals();
  appState.goals = goals || [];
}

// ==========================================
// Core State Calculations
// ==========================================
function getTotals() {
  let income = 0, expense = 0, saving = 0;
  appState.transactions.forEach(t => {
    const amt = parseFloat(t.amount);
    if (t.type === 'income') income += amt;
    else if (t.type === 'expense') expense += amt;
    else if (t.type === 'saving') saving += amt;
  });
  // Available Money = Income - Expense - Saving
  // Wait, savings are technically kept by the user, but maybe in a different account.
  // Generally: Available to spend = Income - Expense - Saved
  const available = income - expense - saving;
  return { income, expense, saving, available };
}

function getDailyTotals(dateStr) {
  let income = 0, expense = 0, saving = 0;
  appState.transactions.filter(t => t.transaction_date === dateStr).forEach(t => {
    const amt = parseFloat(t.amount);
    if (t.type === 'income') income += amt;
    else if (t.type === 'expense') expense += amt;
    else if (t.type === 'saving') saving += amt;
  });
  return { income, expense, saving };
}

function getOpeningBalance(dateStr) {
  let balance = 0;
  appState.transactions.forEach(t => {
    if (t.transaction_date < dateStr) {
      const amt = parseFloat(t.amount);
      if (t.type === 'income') balance += amt;
      else if (t.type === 'expense') balance -= amt;
      else if (t.type === 'saving') balance -= amt;
    }
  });
  return balance;
}

// ==========================================
// Formatting Helpers
// ==========================================
function formatMoney(amount) {
  const symbol = appState.profile?.currency || 'Rs.';
  return `${symbol} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getTodayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  if (type === 'error') el.style.borderLeft = '4px solid var(--expense)';
  else if (type === 'warn') el.style.borderLeft = '4px solid var(--saving)';
  else el.style.borderLeft = '4px solid var(--income)';
  
  el.textContent = message;
  container.appendChild(el);
  
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ==========================================
// View Routing & Rendering
// ==========================================
function switchView(viewId) {
  appState.currentView = viewId;
  
  // Hide all sections
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
  
  // Update Nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.target === viewId);
  });
  document.querySelectorAll('.bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.target === viewId);
  });

  // Show target
  const targetEl = document.getElementById(`view-${viewId}`);
  if (targetEl) targetEl.classList.remove('hidden');
  
  // Update Title
  const titles = {
    dashboard: 'Dashboard',
    daily: 'Daily Money',
    transactions: 'Transactions',
    savings: 'Savings',
    analytics: 'Analytics',
    settings: 'Settings'
  };
  document.getElementById('page-title').textContent = titles[viewId] || 'MoneyFlow';

  // Render specific view
  if (viewId === 'dashboard') renderDashboard();
  if (viewId === 'daily') renderDaily();
  if (viewId === 'transactions') renderTransactions();
  if (viewId === 'savings') renderSavings();
  if (viewId === 'analytics') renderAnalytics();
  if (viewId === 'settings') renderSettings();
}

function renderDashboard() {
  const totals = getTotals();
  document.getElementById('dash-available').textContent = formatMoney(totals.available);
  document.getElementById('dash-in').textContent = formatMoney(totals.income);
  document.getElementById('dash-out').textContent = formatMoney(totals.expense);
  document.getElementById('dash-saved').textContent = formatMoney(totals.saving);

  const todayStr = getTodayDateString();
  const today = getDailyTotals(todayStr);
  const openBal = getOpeningBalance(todayStr);
  const endBal = openBal + today.income - today.expense - today.saving;

  document.getElementById('today-in').textContent = formatMoney(today.income);
  document.getElementById('today-out').textContent = formatMoney(today.expense);
  document.getElementById('today-saved').textContent = formatMoney(today.saving);
  document.getElementById('today-end').textContent = formatMoney(endBal);
}

function renderDaily() {
  const dateInput = document.getElementById('daily-date-picker');
  dateInput.value = appState.selectedDailyDate;
  
  const todayTotals = getDailyTotals(appState.selectedDailyDate);
  const openBal = getOpeningBalance(appState.selectedDailyDate);
  const endBal = openBal + todayTotals.income - todayTotals.expense - todayTotals.saving;

  document.getElementById('daily-open').textContent = formatMoney(openBal);
  document.getElementById('daily-in').textContent = formatMoney(todayTotals.income);
  document.getElementById('daily-out').textContent = formatMoney(todayTotals.expense);
  document.getElementById('daily-saved').textContent = formatMoney(todayTotals.saving);
  document.getElementById('daily-end').textContent = formatMoney(endBal);

  // Render lists
  const txs = appState.transactions.filter(t => t.transaction_date === appState.selectedDailyDate);
  
  const buildList = (type, containerId) => {
    const list = txs.filter(t => t.type === type);
    const container = document.getElementById(containerId);
    if (list.length === 0) {
      container.innerHTML = '<div style="opacity: 0.5;">No records</div>';
      return;
    }
    container.innerHTML = list.map(t => `
      <div class="flex justify-between items-center mb-1">
        <span>${t.category || t.description}</span>
        <span class="font-medium">${formatMoney(t.amount)}</span>
      </div>
    `).join('');
  };

  buildList('income', 'daily-in-list');
  buildList('expense', 'daily-out-list');
  buildList('saving', 'daily-saved-list');
}

function renderTransactions() {
  const query = document.getElementById('tx-search').value.toLowerCase();
  const filterType = document.getElementById('tx-filter').value;
  const listEl = document.getElementById('tx-list');
  
  let filtered = appState.transactions;
  
  if (filterType !== 'all') {
    filtered = filtered.filter(t => t.type === filterType);
  }
  
  if (query) {
    filtered = filtered.filter(t => 
      (t.category && t.category.toLowerCase().includes(query)) || 
      (t.description && t.description.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <p>No transactions found.</p>
      </div>`;
    return;
  }

  const icons = {
    income: '↓',
    expense: '↑',
    saving: '💙'
  };

  const cssClasses = {
    income: 'income',
    expense: 'expense',
    saving: 'saving'
  };

  listEl.innerHTML = filtered.map(t => `
    <div class="tx-item">
      <div class="tx-icon ${cssClasses[t.type]}">
        ${icons[t.type]}
      </div>
      <div class="tx-details">
        <div class="tx-title">${t.category || 'Transaction'}</div>
        <div class="tx-sub">${formatDateDisplay(t.transaction_date)} ${t.description ? '• ' + t.description : ''}</div>
      </div>
      <div class="tx-amount text-${cssClasses[t.type]}">
        ${t.type === 'expense' ? '-' : '+'}${formatMoney(t.amount)}
      </div>
      <button class="btn-icon btn-delete-tx text-secondary hover:text-expense" data-id="${t.id}" style="width: 32px; height: 32px; font-size: 0.9rem;">
        ✕
      </button>
    </div>
  `).join('');

  // Bind delete events
  document.querySelectorAll('.btn-delete-tx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      confirmAction("Delete Transaction", "Are you sure you want to permanently delete this transaction?", async () => {
        const success = await Database.deleteTransaction(id);
        if (success) {
          appState.transactions = appState.transactions.filter(t => t.id !== id);
          renderTransactions();
          showToast("Transaction deleted");
        }
      });
    });
  });
}

function renderSavings() {
  const totals = getTotals();
  document.getElementById('savings-total').textContent = formatMoney(totals.saving);

  const listEl = document.getElementById('goals-list');
  
  if (appState.goals.length === 0) {
    listEl.innerHTML = `<p class="text-tertiary">No savings goals created yet.</p>`;
    return;
  }

  // To distribute savings amongst goals, we can just assume money saved goes to goals proportionally or user tracks it.
  // For simplicity, let's just divide total savings among goals equally for display, 
  // or just show target. The user hasn't explicitly linked specific savings transactions to specific goals in the schema.
  // Actually, we'll just show the goal target and a placeholder progress if we don't have per-goal tracking yet.
  
  listEl.innerHTML = appState.goals.map(g => {
    // We don't have current_amount in the schema. Let's assume total savings is shared or it's just a visual target.
    // Let's use 0 for now as current. (To be accurate, we'd need a field).
    const target = parseFloat(g.target_amount);
    const perc = 0; 
    
    return `
      <div class="card mb-4 relative">
        <button class="btn-icon btn-delete-goal absolute right-4 top-4" data-id="${g.id}" style="position: absolute; right: 16px; top: 16px; width: 28px; height: 28px;">✕</button>
        <div class="flex items-center gap-4 mb-4">
          <div style="font-size: 2rem;">${g.icon || '🎯'}</div>
          <div>
            <h4 class="font-bold">${g.name}</h4>
            <div class="text-sm text-secondary">Target: ${formatMoney(target)}</div>
          </div>
        </div>
        <div class="flex justify-between text-xs font-medium mb-1">
          <span>0%</span>
          <span>Rs. 0 / ${formatMoney(target)}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${perc}%"></div>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.btn-delete-goal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      confirmAction("Delete Goal", "Are you sure you want to delete this savings goal?", async () => {
        // Since we didn't add deleteSavingsGoal in database.js previously, let's write it via supabase direct
        const { error } = await supabase.from('savings_goals').delete().eq('id', id);
        if (!error) {
          appState.goals = appState.goals.filter(g => g.id !== id);
          renderSavings();
          showToast("Goal deleted");
        }
      });
    });
  });
}

function renderAnalytics() {
  if (appState.transactions.length === 0) return;

  // Aggregate daily balances
  const sorted = [...appState.transactions].sort((a,b) => a.transaction_date.localeCompare(b.transaction_date));
  let runBal = 0;
  const balanceData = {};
  sorted.forEach(t => {
    const amt = parseFloat(t.amount);
    if (t.type === 'income') runBal += amt;
    else if (t.type === 'expense' || t.type === 'saving') runBal -= amt;
    balanceData[t.transaction_date] = runBal;
  });

  const dates = Object.keys(balanceData);
  const balVals = Object.values(balanceData);

  const ctxBal = document.getElementById('chart-balance').getContext('2d');
  if (chartBalanceInstance) chartBalanceInstance.destroy();
  
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#475569' : '#94a3b8';
  const gridColor = isLight ? '#e2e8f0' : '#1e293b';

  Chart.defaults.color = textColor;
  Chart.defaults.font.family = 'Inter';

  chartBalanceInstance = new Chart(ctxBal, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Balance',
        data: balVals,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHitRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });

  // Expense Breakdown
  const expenseCats = {};
  appState.transactions.filter(t => t.type === 'expense').forEach(t => {
    expenseCats[t.category] = (expenseCats[t.category] || 0) + parseFloat(t.amount);
  });

  const ctxExp = document.getElementById('chart-expense').getContext('2d');
  if (chartExpenseInstance) chartExpenseInstance.destroy();

  const colors = ['#F43F5E', '#FB923C', '#FBBF24', '#34D399', '#38BDF8', '#818CF8', '#A78BFA'];

  chartExpenseInstance = new Chart(ctxExp, {
    type: 'doughnut',
    data: {
      labels: Object.keys(expenseCats),
      datasets: [{
        data: Object.values(expenseCats),
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  // Legend
  const legend = document.getElementById('chart-legend');
  legend.innerHTML = Object.entries(expenseCats)
    .sort((a,b) => b[1] - a[1])
    .map(([cat, val], i) => `
      <div class="flex justify-between items-center text-sm">
        <div class="flex items-center gap-2">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${colors[i % colors.length]};"></div>
          <span>${cat}</span>
        </div>
        <span class="font-medium">${formatMoney(val)}</span>
      </div>
    `).join('');
}

function renderSettings() {
  document.getElementById('settings-theme').value = localStorage.getItem('moneyflow_theme') || 'dark';
}

// ==========================================
// User Interactions & Events
// ==========================================
function bindEvents() {
  // Navigation
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      switchView(e.currentTarget.dataset.target);
    });
  });

  // FAB 
  document.getElementById('btn-fab-add').addEventListener('click', () => {
    document.getElementById('modal-add-tx').classList.add('active');
    document.getElementById('form-add-tx').reset();
    document.getElementById('add-date').value = getTodayDateString();
  });

  // Modal Tabs
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      const type = e.target.dataset.type;
      document.getElementById('add-type').value = type;
      
      const catLabel = document.getElementById('label-category');
      if (type === 'income') catLabel.textContent = 'Source';
      else if (type === 'expense') catLabel.textContent = 'Category';
      else if (type === 'saving') catLabel.textContent = 'Savings Goal';
    });
  });

  // Save Transaction
  document.getElementById('form-add-tx').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-tx');
    btn.disabled = true;
    
    const tx = {
      type: document.getElementById('add-type').value,
      amount: parseFloat(document.getElementById('add-amount').value),
      category: document.getElementById('add-category').value,
      transaction_date: document.getElementById('add-date').value,
      description: document.getElementById('add-note').value || null
    };

    const result = await Database.addTransaction(tx);
    if (result) {
      appState.transactions.unshift(result);
      document.getElementById('modal-add-tx').classList.remove('active');
      showToast('Transaction added!');
      // Update active view
      switchView(appState.currentView); 
    } else {
      showToast('Error saving transaction', 'error');
    }
    btn.disabled = false;
  });

  // Daily Navigator
  document.getElementById('daily-date-picker').addEventListener('change', (e) => {
    appState.selectedDailyDate = e.target.value;
    renderDaily();
  });
  document.getElementById('btn-prev-day').addEventListener('click', () => shiftDailyDate(-1));
  document.getElementById('btn-next-day').addEventListener('click', () => shiftDailyDate(1));

  // Transactions Filter/Search
  document.getElementById('tx-search').addEventListener('input', renderTransactions);
  document.getElementById('tx-filter').addEventListener('change', renderTransactions);

  // Add Goal Modal
  document.getElementById('btn-add-goal').addEventListener('click', () => {
    document.getElementById('modal-add-goal').classList.add('active');
    document.getElementById('form-add-goal').reset();
  });

  document.getElementById('form-add-goal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-goal');
    btn.disabled = true;

    // Use raw supabase insert since we didn't review addSavingsGoal
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('savings_goals').insert([{
      user_id: sessionData.session.user.id,
      name: document.getElementById('goal-name').value,
      target_amount: parseFloat(document.getElementById('goal-target').value),
      icon: document.getElementById('goal-icon').value || '🎯'
    }]).select().single();

    if (!error && data) {
      appState.goals.push(data);
      document.getElementById('modal-add-goal').classList.remove('active');
      renderSavings();
      showToast('Goal created!');
    } else {
      showToast('Error creating goal', 'error');
    }
    btn.disabled = false;
  });

  // Settings
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const cur = document.getElementById('settings-currency').value;
    const theme = document.getElementById('settings-theme').value;
    
    applyTheme(theme);
    localStorage.setItem('moneyflow_theme', theme);

    if (cur !== appState.profile.currency) {
      const res = await Database.updateProfile({ currency: cur });
      if (res) {
        appState.profile.currency = cur;
        showToast('Settings saved!');
        switchView(appState.currentView);
      }
    } else {
      showToast('Settings saved!');
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    confirmAction("Log Out", "Are you sure you want to securely log out of your account?", async () => {
      await Auth.signOut();
      window.location.href = 'login.html';
    });
  });

  // Profile icon -> Settings
  document.getElementById('btn-header-profile').addEventListener('click', () => {
    switchView('settings');
  });
}

function shiftDailyDate(days) {
  const d = new Date(appState.selectedDailyDate);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  appState.selectedDailyDate = `${yyyy}-${mm}-${dd}`;
  renderDaily();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Confirmation Modal State
let confirmCallback = null;
function confirmAction(title, msg, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('modal-confirm').classList.add('active');
  confirmCallback = callback;
}
document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
  document.getElementById('modal-confirm').classList.remove('active');
  confirmCallback = null;
});
document.getElementById('btn-confirm-ok').addEventListener('click', () => {
  document.getElementById('modal-confirm').classList.remove('active');
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
});
