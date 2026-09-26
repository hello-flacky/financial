/**
 * MONEYFLOW — "Know your money. Control your day."
 * Pure Vanilla JavaScript Client-Side Engine
 */

(function () {
  'use strict';

  // ==========================================================================
  // STORAGE KEYS & DEFAULT STATE
  // ==========================================================================
  const STORAGE_KEYS = {
    SETTINGS: 'moneyflow_settings',
    TRANSACTIONS: 'moneyflow_transactions',
    GOALS: 'moneyflow_goals',
    STARTING_BALANCE: 'moneyflow_starting_balance',
    STARTING_SAVINGS: 'moneyflow_starting_savings',
    ONBOARDED: 'moneyflow_onboarded'
  };

  const DEFAULT_SETTINGS = {
    currency: 'Rs.',
    theme: 'dark',
    monthlyBudget: 35000,
    monthlySalary: 65000
  };

  const DEFAULT_GOALS = [
    { id: 'goal_ef', name: 'Emergency Fund', target: 100000, current: 0, icon: '🛡️' },
    { id: 'goal_bike', name: 'Bike Upgrade', target: 150000, current: 0, icon: '🏍️' }
  ];

  // In-memory application state
  let state = {
    settings: { ...DEFAULT_SETTINGS },
    startingBalance: 0,
    startingSavings: 0,
    transactions: [],
    goals: [],
    currentView: 'home',
    selectedDailyDate: getTodayDateString(),
    monthlyChartSelectedMonth: getCurrentMonthString(),
    filterType: 'all',
    filterDate: 'all',
    searchQuery: '',
    confirmCallback: null
  };

  // ==========================================================================
  // DATE & FORMATTING HELPERS
  // ==========================================================================
  function padZero(num) {
    return num < 10 ? '0' + num : String(num);
  }

  function getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
  }

  function getCurrentTimeString() {
    const d = new Date();
    return `${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
  }

  function getCurrentMonthString() {
    const d = new Date();
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}`;
  }

  function formatMoney(amount) {
    const curr = state.settings.currency || 'Rs.';
    const num = Number(amount) || 0;
    const formatted = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    return num < 0 ? `−${curr} ${formatted}` : `${curr} ${formatted}`;
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    const isToday = today.getFullYear() === y && today.getMonth() === m - 1 && today.getDate() === d;
    if (isToday) return 'Today';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hours = h % 12 || 12;
    return `${hours}:${padZero(m)} ${ampm}`;
  }

  // ==========================================================================
  // STATE PERSISTENCE (LocalStorage)
  // ==========================================================================
  async function loadState() {
    try {
      if (typeof Database !== 'undefined') {
        const profile = await Database.getProfile();
        if (profile) {
          if (profile.currency) state.settings.currency = profile.currency;
          if (profile.monthly_salary) state.settings.monthlySalary = profile.monthly_salary;
        }

        const txs = await Database.getTransactions();
        if (txs) {
          state.transactions = txs.map(t => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            category: t.category,
            date: t.transaction_date,
            time: new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}),
            note: t.description || ''
          }));
        }

        const goals = await Database.getSavingsGoals();
        if (goals && goals.length > 0) {
          state.goals = goals.map(g => ({
            id: g.id,
            name: g.name,
            target: g.target_amount,
            current: 0,
            icon: g.icon || '🎯'
          }));
        } else {
          state.goals = JSON.parse(JSON.stringify(DEFAULT_GOALS));
        }
      } else {
        const savedTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        if (savedTx) state.transactions = JSON.parse(savedTx);

        const savedGoals = localStorage.getItem(STORAGE_KEYS.GOALS);
        if (savedGoals) state.goals = JSON.parse(savedGoals);
        else state.goals = JSON.parse(JSON.stringify(DEFAULT_GOALS));
      }

      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };

      const savedStartBal = localStorage.getItem(STORAGE_KEYS.STARTING_BALANCE);
      if (savedStartBal !== null) state.startingBalance = Number(savedStartBal) || 0;

      const savedStartSav = localStorage.getItem(STORAGE_KEYS.STARTING_SAVINGS);
      if (savedStartSav !== null) state.startingSavings = Number(savedStartSav) || 0;

      if (typeof Database !== 'undefined') {
        state.goals.forEach(g => {
          g.current = 0;
          state.transactions.forEach(t => {
            if (t.type === 'savings' && (t.category === g.name || t.category === g.id)) {
              g.current += Number(t.amount);
            }
          });
        });
      }
    } catch (e) {
      console.error('Failed to load state', e);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
      localStorage.setItem(STORAGE_KEYS.STARTING_BALANCE, String(state.startingBalance));
      localStorage.setItem(STORAGE_KEYS.STARTING_SAVINGS, String(state.startingSavings));
      if (typeof Database === 'undefined') {
        localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
        localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(state.goals));
      }
    } catch (e) {
      console.error('Failed to save state', e);
      showToast('⚠️ Storage limit reached or unable to save.', 'warn');
    }
  }

  // ==========================================================================
  // CORE FINANCIAL CALCULATIONS
  // ==========================================================================
  function computeTotals() {
    let totalIncome = 0;
    let totalExpense = 0;
    let totalSaved = 0;

    const todayStr = getTodayDateString();
    let todayIncome = 0;
    let todayExpense = 0;
    let todaySaved = 0;

    state.transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        totalIncome += amt;
        if (t.date === todayStr) todayIncome += amt;
      } else if (t.type === 'expense') {
        totalExpense += amt;
        if (t.date === todayStr) todayExpense += amt;
      } else if (t.type === 'savings') {
        totalSaved += amt;
        if (t.date === todayStr) todaySaved += amt;
      }
    });

    // Available Money formula:
    // Starting Balance + All Money In - All Expenses - All Savings Transfers
    const availableMoney = state.startingBalance + totalIncome - totalExpense - totalSaved;

    // Total Savings formula:
    // Starting Savings + All Savings Transfers
    const totalSavings = state.startingSavings + totalSaved;

    return {
      availableMoney,
      totalSavings,
      totalIncome,
      totalExpense,
      totalSaved,
      todayIncome,
      todayExpense,
      todaySaved
    };
  }

  function computeDailyTotals(dateStr) {
    let inAmt = 0;
    let outAmt = 0;
    let saveAmt = 0;

    // To compute ending balance on dateStr:
    // Starting balance + all transactions up to and including dateStr
    let cumulative = state.startingBalance;

    // Sort all transactions chronologically
    const sorted = [...state.transactions].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return cmp !== 0 ? cmp : (a.time || '').localeCompare(b.time || '');
    });

    sorted.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.date <= dateStr) {
        if (t.type === 'income') cumulative += amt;
        else if (t.type === 'expense') cumulative -= amt;
        else if (t.type === 'savings') cumulative -= amt;
      }
      if (t.date === dateStr) {
        if (t.type === 'income') inAmt += amt;
        else if (t.type === 'expense') outAmt += amt;
        else if (t.type === 'savings') saveAmt += amt;
      }
    });

    return {
      inAmt,
      outAmt,
      saveAmt,
      endingBalance: cumulative
    };
  }

  // ==========================================================================
  // UI TOAST SYSTEM
  // ==========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-pill ${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastSlideUp 0.3s var(--ease-smooth) forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // ==========================================================================
  // MODAL / SHEET CONTROLS
  // ==========================================================================
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Populate dates and times for forms
    const today = getTodayDateString();
    const time = getCurrentTimeString();

    if (modalId === 'modal-income') {
      document.getElementById('income-date').value = today;
      document.getElementById('income-time').value = time;
      document.getElementById('income-amount').value = '';
      document.getElementById('income-note').value = '';
    } else if (modalId === 'modal-expense') {
      document.getElementById('expense-date').value = today;
      document.getElementById('expense-time').value = time;
      document.getElementById('expense-amount').value = '';
      document.getElementById('expense-note').value = '';
      document.getElementById('expense-balance-warning').classList.add('hidden');
      const { availableMoney } = computeTotals();
      document.getElementById('warn-available-val').innerText = formatMoney(availableMoney);
    } else if (modalId === 'modal-save') {
      document.getElementById('save-date').value = today;
      document.getElementById('save-time').value = time;
      document.getElementById('save-amount').value = '';
      document.getElementById('save-note').value = '';
      document.getElementById('save-balance-warning').classList.add('hidden');
      populateSavingsGoalsSelect();
    }

    modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  function showConfirmDialog(title, message, icon, onConfirm) {
    document.getElementById('confirm-dialog-title').innerText = title;
    document.getElementById('confirm-dialog-message').innerText = message;
    document.getElementById('confirm-dialog-icon').innerText = icon || '⚠️';
    state.confirmCallback = onConfirm;
    openModal('modal-confirm');
  }

  // ==========================================================================
  // TRANSACTION SUBMISSIONS
  // ==========================================================================
  function addTransaction(type, amount, category, date, time, note) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid amount greater than 0', 'warn');
      return false;
    }

    const tempId = 'tx_temp_' + Date.now();
    const newTx = {
      id: tempId,
      type,
      amount: numAmount,
      category: category || (type === 'income' ? 'Income' : 'General'),
      date: date || getTodayDateString(),
      time: time || getCurrentTimeString(),
      note: (note || '').trim()
    };

    state.transactions.unshift(newTx);

    if (type === 'savings') {
      const targetGoal = state.goals.find(g => g.name === category);
      if (targetGoal) {
        targetGoal.current = (Number(targetGoal.current) || 0) + numAmount;
      }
    }
    
    if (typeof Database !== 'undefined') {
      Database.addTransaction({
        type: newTx.type,
        amount: newTx.amount,
        category: newTx.category,
        transaction_date: newTx.date,
        description: newTx.note
      }).then(inserted => {
        if (inserted) {
          const idx = state.transactions.findIndex(t => t.id === tempId);
          if (idx !== -1) state.transactions[idx].id = inserted.id;
        } else {
          showToast('Failed to save to cloud database.', 'warn');
        }
      });
    }

    saveState();
    renderAll();
    return true;
  }

  function updateTransaction(id, updatedFields) {
    const idx = state.transactions.findIndex(t => t.id === id);
    if (idx === -1) return false;

    const oldTx = state.transactions[idx];

    if (oldTx.type === 'savings') {
      const oldGoal = state.goals.find(g => g.name === oldTx.category);
      if (oldGoal) oldGoal.current = Math.max(0, (Number(oldGoal.current) || 0) - Number(oldTx.amount));
    }

    state.transactions[idx] = { ...oldTx, ...updatedFields };

    if (state.transactions[idx].type === 'savings') {
      const newGoal = state.goals.find(g => g.name === state.transactions[idx].category);
      if (newGoal) newGoal.current = (Number(newGoal.current) || 0) + Number(state.transactions[idx].amount);
    }

    saveState();
    renderAll();
    showToast('Transaction updated successfully.');
    
    if (typeof Database !== 'undefined' && !id.toString().startsWith('tx_temp_')) {
      const newTx = state.transactions[idx];
      Database.updateTransaction(id, {
        type: newTx.type,
        amount: newTx.amount,
        category: newTx.category,
        transaction_date: newTx.date,
        description: newTx.note
      }).then(success => {
        if (!success) showToast('Failed to update in cloud database.', 'warn');
      });
    }

    return true;
  }

  function deleteTransaction(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;

    if (tx.type === 'savings') {
      const goal = state.goals.find(g => g.name === tx.category);
      if (goal) goal.current = Math.max(0, (Number(goal.current) || 0) - Number(tx.amount));
    }

    state.transactions = state.transactions.filter(t => t.id !== id);
    saveState();
    renderAll();
    showToast('Transaction deleted.');
    
    if (typeof Database !== 'undefined' && !id.toString().startsWith('tx_temp_')) {
      Database.deleteTransaction(id).then(success => {
        if (!success) showToast('Failed to delete from cloud database.', 'warn');
      });
    }
  }

  // ==========================================================================
  // VIEW RENDERING: HOME
  // ==========================================================================
  function renderHome() {
    const totals = computeTotals();

    // Available Money Hero Card
    document.getElementById('hero-available-balance').innerText = formatMoney(totals.availableMoney);
    document.getElementById('hero-total-savings').innerText = formatMoney(totals.totalSavings);
    document.getElementById('hero-starting-balance').innerText = formatMoney(state.startingBalance);

    // Today Summary
    document.getElementById('today-income').innerText = `+${formatMoney(totals.todayIncome)}`;
    document.getElementById('today-expense').innerText = totals.todayExpense > 0 ? `−${formatMoney(totals.todayExpense)}` : formatMoney(0);
    document.getElementById('today-savings').innerText = formatMoney(totals.todaySaved);

    // Monthly Spending Budget Widget
    renderBudgetWidget();

    // Dynamic Smart Insight
    renderSmartInsight(totals);

    // Today's Activity List
    const todayStr = getTodayDateString();
    const todayTx = state.transactions.filter(t => t.date === todayStr);
    document.getElementById('today-tx-count').innerText = `${todayTx.length} items`;
    const todayContainer = document.getElementById('today-tx-list');
    todayContainer.innerHTML = '';

    if (todayTx.length === 0) {
      todayContainer.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">☕</div>
          <div class="empty-title">Your money story starts here.</div>
          <p class="empty-desc">No transactions yet today. Tap + to record money in or out.</p>
        </div>
      `;
    } else {
      todayTx.forEach(t => todayContainer.appendChild(createTransactionElement(t)));
    }

    // Recent Transactions Preview (Latest 5 overall)
    const recentContainer = document.getElementById('recent-tx-list');
    recentContainer.innerHTML = '';
    const recentTx = state.transactions.slice(0, 5);

    if (recentTx.length === 0) {
      recentContainer.innerHTML = `
        <div class="empty-state-box">
          <p class="empty-desc">No past transactions recorded.</p>
        </div>
      `;
    } else {
      recentTx.forEach(t => recentContainer.appendChild(createTransactionElement(t)));
    }
  }

  function renderBudgetWidget() {
    const widget = document.getElementById('home-budget-widget');
    const budget = Number(state.settings.monthlyBudget) || 0;

    if (budget <= 0) {
      widget.classList.add('hidden');
      return;
    }

    widget.classList.remove('hidden');

    // Calculate this month's expenses
    const curMonth = getCurrentMonthString();
    const monthExpenses = state.transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(curMonth))
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const pct = Math.min(100, Math.round((monthExpenses / budget) * 100));
    document.getElementById('budget-progress-text').innerText = `${formatMoney(monthExpenses)} of ${formatMoney(budget)} spent`;
    document.getElementById('budget-percentage-badge').innerText = `${pct}%`;

    const bar = document.getElementById('budget-progress-bar');
    bar.style.width = `${pct}%`;

    const warningBanner = document.getElementById('budget-warning-banner');
    if (monthExpenses > budget) {
      bar.classList.add('warning');
      warningBanner.classList.remove('hidden');
    } else {
      bar.classList.remove('warning');
      warningBanner.classList.add('hidden');
    }
  }

  function renderSmartInsight(totals) {
    const insightBanner = document.getElementById('home-insight-banner');
    const textEl = document.getElementById('home-insight-text');

    const curMonth = getCurrentMonthString();
    const monthTx = state.transactions.filter(t => t.date.startsWith(curMonth));

    let monthIncome = 0;
    let monthExpense = 0;
    let monthSaved = 0;
    let catSpend = {};

    monthTx.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') monthIncome += amt;
      else if (t.type === 'expense') {
        monthExpense += amt;
        catSpend[t.category] = (catSpend[t.category] || 0) + amt;
      } else if (t.type === 'savings') monthSaved += amt;
    });

    let insightMsg = '';

    if (state.transactions.length === 0) {
      insightMsg = 'Welcome to MoneyFlow! Add your first income or expense to generate real-time financial insights.';
    } else if (monthExpense > 0 && catSpend['Fuel'] && catSpend['Fuel'] > 0) {
      insightMsg = `You spent ${formatMoney(catSpend['Fuel'])} on fuel this month.`;
    } else if (monthIncome > 0 && monthSaved > 0) {
      const saveRate = ((monthSaved / monthIncome) * 100).toFixed(0);
      insightMsg = `You saved ${saveRate}% of your income this month. Great discipline!`;
    } else if (Object.keys(catSpend).length > 0) {
      let topCat = '';
      let topAmt = 0;
      for (const [cat, amt] of Object.entries(catSpend)) {
        if (amt > topAmt) {
          topAmt = amt;
          topCat = cat;
        }
      }
      insightMsg = `Your highest spending category this month is ${topCat} (${formatMoney(topAmt)}).`;
    } else if (totals.totalSavings > 0) {
      insightMsg = `Your total protected savings have reached ${formatMoney(totals.totalSavings)}.`;
    } else {
      insightMsg = `You currently have ${formatMoney(totals.availableMoney)} available to spend today.`;
    }

    textEl.innerText = insightMsg;
    insightBanner.classList.remove('hidden');
  }

  // ==========================================================================
  // TRANSACTION DOM ELEMENT CREATOR
  // ==========================================================================
  function createTransactionElement(t) {
    const item = document.createElement('div');
    item.className = 'tx-item';

    const isIncome = t.type === 'income';
    const isExpense = t.type === 'expense';
    const isSavings = t.type === 'savings';

    let iconText = '📦';
    let typeClass = 'expense';
    let amountSign = '−';
    let amountClass = 'text-expense';

    if (isIncome) {
      iconText = '↗';
      typeClass = 'income';
      amountSign = '+';
      amountClass = 'text-income';
    } else if (isSavings) {
      iconText = '💙';
      typeClass = 'savings';
      amountSign = '↓';
      amountClass = 'text-save';
    } else {
      // Map category emoji
      const iconMap = {
        Food: '🍛',
        Fuel: '⛽',
        Bike: '🏍️',
        Housing: '🏠',
        Phone: '📱',
        Shopping: '🛍️',
        Entertainment: '🎮',
        Bills: '💳',
        Education: '📚',
        Health: '❤️',
        Other: '📦'
      };
      iconText = iconMap[t.category] || '💸';
    }

    const title = t.note ? t.note : t.category;
    const subtitle = `${t.category} • ${formatDisplayDate(t.date)} ${t.time ? formatTime(t.time) : ''}`;

    item.innerHTML = `
      <div class="tx-left">
        <div class="tx-icon-wrap ${typeClass}">${iconText}</div>
        <div class="tx-meta">
          <h4>${escapeHTML(title)}</h4>
          <span class="tx-sub">${escapeHTML(subtitle)}</span>
        </div>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${amountClass}">${amountSign}${formatMoney(t.amount)}</span>
        <div class="tx-actions">
          <button class="tx-action-btn edit-btn" title="Edit" data-id="${t.id}">✏️</button>
          <button class="tx-action-btn delete-btn" title="Delete" data-id="${t.id}">🗑️</button>
        </div>
      </div>
    `;

    // Bind item action buttons
    item.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(t.id);
    });

    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirmDialog(
        'Delete this transaction?',
        `Remove "${title}" (${formatMoney(t.amount)}) from your records? Balances will be recalculated.`,
        '🗑️',
        () => deleteTransaction(t.id)
      );
    });

    return item;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ==========================================================================
  // VIEW RENDERING: DAILY
  // ==========================================================================
  function renderDaily() {
    const dateInput = document.getElementById('daily-date-input');
    const dateLabel = document.getElementById('daily-date-label');
    dateInput.value = state.selectedDailyDate;
    dateLabel.innerText = formatDisplayDate(state.selectedDailyDate);

    const totals = computeDailyTotals(state.selectedDailyDate);
    document.getElementById('daily-metric-in').innerText = `+${formatMoney(totals.inAmt)}`;
    document.getElementById('daily-metric-out').innerText = totals.outAmt > 0 ? `−${formatMoney(totals.outAmt)}` : formatMoney(0);
    document.getElementById('daily-metric-saved').innerText = formatMoney(totals.saveAmt);
    document.getElementById('daily-metric-balance').innerText = formatMoney(totals.endingBalance);

    document.getElementById('daily-list-title').innerText = `Transactions for ${formatDisplayDate(state.selectedDailyDate)}`;

    const dailyContainer = document.getElementById('daily-tx-list');
    dailyContainer.innerHTML = '';

    const dayTx = state.transactions.filter(t => t.date === state.selectedDailyDate);

    if (dayTx.length === 0) {
      dailyContainer.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">📅</div>
          <div class="empty-title">No transactions on this date.</div>
          <p class="empty-desc">Money movement for ${formatDisplayDate(state.selectedDailyDate)} will show here.</p>
        </div>
      `;
    } else {
      dayTx.forEach(t => dailyContainer.appendChild(createTransactionElement(t)));
    }
  }

  // ==========================================================================
  // VIEW RENDERING: ALL TRANSACTIONS (FILTER & SEARCH)
  // ==========================================================================
  function renderTransactionsView() {
    const list = document.getElementById('all-transactions-list');
    list.innerHTML = '';

    const query = (state.searchQuery || '').toLowerCase().trim();
    const typeFilter = state.filterType;
    const dateFilter = state.filterDate;

    const todayStr = getTodayDateString();

    const filtered = state.transactions.filter(t => {
      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;

      // Date filter
      if (dateFilter === 'today' && t.date !== todayStr) return false;
      if (dateFilter === 'month' && !t.date.startsWith(getCurrentMonthString())) return false;
      if (dateFilter === 'week') {
        const d = new Date(t.date);
        const now = new Date();
        const diffDays = (now - d) / (1000 * 60 * 60 * 24);
        if (diffDays < 0 || diffDays > 7) return false;
      }

      // Search query filter (matches category, note, or formatted amount)
      if (query) {
        const matchNote = (t.note || '').toLowerCase().includes(query);
        const matchCat = (t.category || '').toLowerCase().includes(query);
        const matchAmt = String(t.amount).includes(query);
        if (!matchNote && !matchCat && !matchAmt) return false;
      }

      return true;
    });

    document.getElementById('filtered-count-label').innerText = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">No matching transactions found.</div>
          <p class="empty-desc">Try clearing filters or search keywords.</p>
        </div>
      `;
    } else {
      filtered.forEach(t => list.appendChild(createTransactionElement(t)));
    }
  }

  // ==========================================================================
  // VIEW RENDERING: SAVINGS & GOALS
  // ==========================================================================
  function renderSavings() {
    const totals = computeTotals();
    document.getElementById('savings-hero-total').innerText = formatMoney(totals.totalSavings);
    document.getElementById('goals-count').innerText = `${state.goals.length} goals`;

    const grid = document.getElementById('savings-goals-grid');
    grid.innerHTML = '';

    if (state.goals.length === 0) {
      grid.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">🎯</div>
          <div class="empty-title">No savings goals yet.</div>
          <p class="empty-desc">Create your first goal to track your savings progress!</p>
        </div>
      `;
      return;
    }

    state.goals.forEach(goal => {
      const cur = Number(goal.current) || 0;
      const target = Number(goal.target) || 1;
      const pct = Math.min(100, Math.round((cur / target) * 100));
      const remaining = Math.max(0, target - cur);

      const card = document.createElement('div');
      card.className = 'goal-card glass-panel';
      card.innerHTML = `
        <div class="goal-card-top">
          <div class="goal-identity">
            <span class="goal-icon">${goal.icon || '🎯'}</span>
            <div>
              <h4>${escapeHTML(goal.name)}</h4>
              <span class="sub-label">${pct}% completed</span>
            </div>
          </div>
          <span class="badge ${pct >= 100 ? 'bg-income' : ''}">${pct >= 100 ? 'Completed 🎉' : `${pct}%`}</span>
        </div>

        <div class="goal-progress-wrap">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%;"></div>
          </div>
          <div class="goal-amounts-row">
            <span>Saved: <strong>${formatMoney(cur)}</strong></span>
            <span class="text-muted">Target: ${formatMoney(target)}</span>
          </div>
        </div>

        <div class="goal-card-footer">
          <span class="sub-label">${remaining > 0 ? `${formatMoney(remaining)} to go` : 'Goal achieved!'}</span>
          <div class="goal-actions">
            <button class="btn btn-sm btn-save add-to-goal-btn" data-goal="${escapeHTML(goal.name)}">+ Save to Goal</button>
            <button class="tx-action-btn delete-goal-btn" data-id="${goal.id}" title="Delete Goal">🗑️</button>
          </div>
        </div>
      `;

      card.querySelector('.add-to-goal-btn').addEventListener('click', () => {
        openModal('modal-save');
        const sel = document.getElementById('save-goal-select');
        if (sel) sel.value = goal.name;
      });

      card.querySelector('.delete-goal-btn').addEventListener('click', () => {
        showConfirmDialog(
          'Delete Savings Goal?',
          `Are you sure you want to remove the goal "${goal.name}"? Existing savings balance won't be lost.`,
          '🎯',
          () => {
            state.goals = state.goals.filter(g => g.id !== goal.id);
            saveState();
            renderSavings();
            showToast('Goal removed.');
          }
        );
      });

      grid.appendChild(card);
    });
  }

  function populateSavingsGoalsSelect() {
    const sel = document.getElementById('save-goal-select');
    if (!sel) return;
    sel.innerHTML = '';
    if (state.goals.length === 0) {
      const opt = document.createElement('option');
      opt.value = 'General Savings';
      opt.innerText = 'General Savings';
      sel.appendChild(opt);
      return;
    }
    state.goals.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.name;
      opt.innerText = `${g.icon || '🎯'} ${g.name}`;
      sel.appendChild(opt);
    });
  }

  // ==========================================================================
  // VIEW RENDERING: INSIGHTS & CHARTS
  // ==========================================================================
  function renderInsights() {
    populateMonthSelector();
    renderMonthlySummary();
    setTimeout(() => {
      drawMonthlyBarChart();
      drawBalanceTimelineChart();
      drawExpenseDonutChart();
    }, 50);
  }

  function populateMonthSelector() {
    const sel = document.getElementById('monthly-chart-select');
    if (!sel) return;

    // Collect all unique months from transactions plus current month
    const monthsSet = new Set();
    monthsSet.add(getCurrentMonthString());
    state.transactions.forEach(t => {
      if (t.date && t.date.length >= 7) monthsSet.add(t.date.substring(0, 7));
    });

    const sortedMonths = Array.from(monthsSet).sort().reverse();
    sel.innerHTML = '';
    sortedMonths.forEach(m => {
      const [y, mm] = m.split('-').map(Number);
      const date = new Date(y, mm - 1, 1);
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const opt = document.createElement('option');
      opt.value = m;
      opt.innerText = label;
      if (m === state.monthlyChartSelectedMonth) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderMonthlySummary() {
    const selMonth = state.monthlyChartSelectedMonth || getCurrentMonthString();
    const [y, mm] = selMonth.split('-').map(Number);
    const date = new Date(y, mm - 1, 1);
    const monthName = date.toLocaleDateString('en-US', { month: 'long' });

    document.getElementById('monthly-summary-heading').innerText = `${monthName} Summary`;

    let totalIn = 0;
    let totalOut = 0;
    let totalSave = 0;
    let catTotals = {};

    const daysCount = new Date(y, mm, 0).getDate();

    state.transactions.forEach(t => {
      if (t.date && t.date.startsWith(selMonth)) {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') totalIn += amt;
        else if (t.type === 'expense') {
          totalOut += amt;
          catTotals[t.category] = (catTotals[t.category] || 0) + amt;
        } else if (t.type === 'savings') totalSave += amt;
      }
    });

    const netAvailable = totalIn - totalOut - totalSave;
    const saveRate = totalIn > 0 ? Math.round((totalSave / totalIn) * 100) : 0;

    let topCategory = '-';
    let topCatAmt = 0;
    for (const [cat, amt] of Object.entries(catTotals)) {
      if (amt > topCatAmt) {
        topCatAmt = amt;
        topCategory = `${cat} (${formatMoney(amt)})`;
      }
    }

    const avgDaily = totalOut > 0 ? Math.round(totalOut / daysCount) : 0;

    document.getElementById('monthly-savings-rate-badge').innerText = `${saveRate}% Saved`;
    document.getElementById('sum-total-income').innerText = formatMoney(totalIn);
    document.getElementById('sum-total-expense').innerText = formatMoney(totalOut);
    document.getElementById('sum-total-savings').innerText = formatMoney(totalSave);
    document.getElementById('sum-net-available').innerText = formatMoney(netAvailable);
    document.getElementById('sum-top-category').innerText = topCategory;
    document.getElementById('sum-avg-daily').innerText = formatMoney(avgDaily);
  }

  // Canvas Bar Chart: Monthly Income vs Expenses vs Savings
  function drawMonthlyBarChart() {
    const canvas = document.getElementById('monthly-flow-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = (canvas.width = canvas.parentElement.clientWidth);
    const height = (canvas.height = 220);

    ctx.clearRect(0, 0, width, height);

    // Get last 4 months
    const curDate = new Date();
    const months = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(curDate.getFullYear(), curDate.getMonth() - i, 1);
      const str = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}`;
      months.push({
        id: str,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        income: 0,
        expense: 0,
        savings: 0
      });
    }

    state.transactions.forEach(t => {
      const mStr = (t.date || '').substring(0, 7);
      const target = months.find(m => m.id === mStr);
      if (target) {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') target.income += amt;
        else if (t.type === 'expense') target.expense += amt;
        else if (t.type === 'savings') target.savings += amt;
      }
    });

    const maxVal = Math.max(1, ...months.flatMap(m => [m.income, m.expense, m.savings]));
    const padding = { top: 20, right: 20, bottom: 35, left: 30 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const groupW = chartW / months.length;
    const barW = Math.max(8, Math.min(22, (groupW - 20) / 3));

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';

    months.forEach((m, idx) => {
      const centerX = padding.left + idx * groupW + groupW / 2;

      // Group labels
      ctx.fillStyle = isLight ? '#64748B' : '#94A3B8';
      ctx.fillText(m.label, centerX, height - 12);

      // Income bar (green)
      const hIn = (m.income / maxVal) * chartH;
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(centerX - barW * 1.6, height - padding.bottom - hIn, barW, hIn, [4, 4, 0, 0]);
      } else {
        ctx.rect(centerX - barW * 1.6, height - padding.bottom - hIn, barW, hIn);
      }
      ctx.fill();

      // Expense bar (rose)
      const hExp = (m.expense / maxVal) * chartH;
      ctx.fillStyle = '#F43F5E';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(centerX - barW * 0.5, height - padding.bottom - hExp, barW, hExp, [4, 4, 0, 0]);
      } else {
        ctx.rect(centerX - barW * 0.5, height - padding.bottom - hExp, barW, hExp);
      }
      ctx.fill();

      // Savings bar (sky blue)
      const hSav = (m.savings / maxVal) * chartH;
      ctx.fillStyle = '#0EA5E9';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(centerX + barW * 0.6, height - padding.bottom - hSav, barW, hSav, [4, 4, 0, 0]);
      } else {
        ctx.rect(centerX + barW * 0.6, height - padding.bottom - hSav, barW, hSav);
      }
      ctx.fill();
    });
  }

  // Canvas Line Chart: Available Balance Progression Over Time
  function drawBalanceTimelineChart() {
    const canvas = document.getElementById('balance-timeline-chart');
    const emptyNotice = document.getElementById('timeline-empty-notice');
    if (!canvas) return;

    if (state.transactions.length < 2) {
      canvas.classList.add('hidden');
      if (emptyNotice) emptyNotice.classList.remove('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    if (emptyNotice) emptyNotice.classList.add('hidden');

    const ctx = canvas.getContext('2d');
    const width = (canvas.width = canvas.parentElement.clientWidth);
    const height = (canvas.height = 220);

    ctx.clearRect(0, 0, width, height);

    // Build timeline points: sort transactions chronologically
    const sorted = [...state.transactions].sort((a, b) => a.date.localeCompare(b.date));
    let running = state.startingBalance;
    const pointsMap = new Map();

    sorted.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') running += amt;
      else if (t.type === 'expense') running -= amt;
      else if (t.type === 'savings') running -= amt;
      pointsMap.set(t.date, running);
    });

    const points = Array.from(pointsMap.entries()).map(([date, val]) => ({ date, val }));
    if (points.length < 2) return;

    const values = points.map(p => p.val);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const padding = { top: 20, right: 25, bottom: 35, left: 25 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = i => padding.left + (i / (points.length - 1)) * chartW;
    const getY = val => padding.top + chartH - ((val - minVal) / range) * chartH;

    // Gradient fill below line
    const grad = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    grad.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0].val));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(getX(i), getY(points[i].val));
    }
    ctx.lineTo(getX(points.length - 1), height - padding.bottom);
    ctx.lineTo(getX(0), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw main stroke line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0].val));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(getX(i), getY(points[i].val));
    }
    ctx.strokeStyle = '#6366F1';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw point dots & labels
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';

    points.forEach((p, i) => {
      const px = getX(i);
      const py = getY(p.val);

      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#6366F1';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isLight ? '#FFFFFF' : '#0B0F19';
      ctx.stroke();

      // Only label first, middle, last to prevent overlap
      if (i === 0 || i === points.length - 1 || (points.length > 4 && i === Math.floor(points.length / 2))) {
        ctx.fillStyle = isLight ? '#64748B' : '#94A3B8';
        const [y, m, d] = p.date.split('-');
        ctx.fillText(`${m}/${d}`, px, height - 12);
      }
    });
  }

  // Canvas Donut Chart: Expenses by Category
  function drawExpenseDonutChart() {
    const canvas = document.getElementById('expense-donut-chart');
    const legendList = document.getElementById('donut-categories-legend');
    if (!canvas || !legendList) return;

    const ctx = canvas.getContext('2d');
    const width = 220;
    const height = 220;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    legendList.innerHTML = '';

    // Calculate category expenses for current month
    const curMonth = getCurrentMonthString();
    const catMap = {};
    let totalExpenses = 0;

    state.transactions.forEach(t => {
      if (t.type === 'expense' && t.date.startsWith(curMonth)) {
        const amt = Number(t.amount) || 0;
        catMap[t.category] = (catMap[t.category] || 0) + amt;
        totalExpenses += amt;
      }
    });

    document.getElementById('donut-center-amount').innerText = formatMoney(totalExpenses);

    const categories = Object.entries(catMap).map(([name, val]) => ({ name, val }));
    categories.sort((a, b) => b.val - a.val);

    if (categories.length === 0 || totalExpenses === 0) {
      legendList.innerHTML = '<p class="empty-chart-text">No expenses yet for this month.</p>';
      return;
    }

    const palette = ['#F43F5E', '#FB923C', '#FBBF24', '#34D399', '#38BDF8', '#818CF8', '#A78BFA', '#F472B6'];

    let startAngle = -Math.PI / 2;
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = 90;
    const innerRadius = 65;

    categories.forEach((cat, idx) => {
      const color = palette[idx % palette.length];
      const sliceAngle = (cat.val / totalExpenses) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      startAngle = endAngle;

      // Legend Item
      const pct = Math.round((cat.val / totalExpenses) * 100);
      const row = document.createElement('div');
      row.className = 'donut-legend-row';
      row.innerHTML = `
        <div class="donut-cat-info">
          <span class="cat-color-dot" style="background-color: ${color};"></span>
          <span>${escapeHTML(cat.name)}</span>
        </div>
        <div class="donut-cat-val">
          ${formatMoney(cat.val)} <small class="text-muted">(${pct}%)</small>
        </div>
      `;
      legendList.appendChild(row);
    });
  }

  // ==========================================================================
  // VIEW RENDERING: SETTINGS
  // ==========================================================================
  function renderSettings() {
    document.getElementById('setting-currency-input').value = state.settings.currency || 'Rs.';
    document.getElementById('setting-budget-input').value = state.settings.monthlyBudget || 0;
    document.getElementById('setting-salary-input').value = state.settings.monthlySalary || 0;
    updateThemeUI();
  }

  // Master Render
  function renderAll() {
    renderHome();
    if (state.currentView === 'daily') renderDaily();
    if (state.currentView === 'transactions') renderTransactionsView();
    if (state.currentView === 'insights') renderInsights();
    if (state.currentView === 'savings') renderSavings();
    if (state.currentView === 'settings') renderSettings();
  }

  // ==========================================================================
  // THEME MANAGEMENT
  // ==========================================================================
  function applyTheme(theme) {
    state.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeUI();
    saveState();
    // Redraw charts with adapted contrast
    if (state.currentView === 'insights') renderInsights();
  }

  function updateThemeUI() {
    const isLight = state.settings.theme === 'light';
    const sidebarPill = document.getElementById('theme-toggle-btn');
    if (sidebarPill) {
      sidebarPill.querySelector('.theme-icon').innerText = isLight ? '☀️' : '🌙';
      sidebarPill.querySelector('.theme-text').innerText = isLight ? 'Light Mode' : 'Dark Mode';
    }

    const mobileBtn = document.getElementById('mobile-theme-btn');
    if (mobileBtn) mobileBtn.innerText = isLight ? '☀️' : '🌙';

    const settingToggle = document.getElementById('setting-theme-toggle');
    if (settingToggle) settingToggle.innerText = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
  }

  // ==========================================================================
  // VIEW NAVIGATION (SPA Switching)
  // ==========================================================================
  function switchView(viewName) {
    state.currentView = viewName;

    // View panels
    document.querySelectorAll('.app-view').forEach(view => {
      view.classList.toggle('active', view.id === `view-${viewName}`);
    });

    // Sidebar items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewName);
    });

    // Mobile tabs
    document.querySelectorAll('.mobile-bottom-nav .nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
    });

    // Render target view
    if (viewName === 'daily') renderDaily();
    else if (viewName === 'transactions') renderTransactionsView();
    else if (viewName === 'insights') renderInsights();
    else if (viewName === 'savings') renderSavings();
    else if (viewName === 'settings') renderSettings();
    else renderHome();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================================================
  // EDIT TRANSACTION MODAL
  // ==========================================================================
  function openEditModal(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;

    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-type').value = tx.type;
    document.getElementById('edit-tx-amount').value = tx.amount;
    document.getElementById('edit-tx-category').value = tx.category;
    document.getElementById('edit-tx-date').value = tx.date;
    document.getElementById('edit-tx-time').value = tx.time || getCurrentTimeString();
    document.getElementById('edit-tx-note').value = tx.note || '';

    openModal('modal-edit-tx');
  }

  // ==========================================================================
  // REALISTIC DEMO DATA LOADER
  // ==========================================================================
  function loadDemoData() {
    state.startingBalance = 28450;
    state.startingSavings = 50000;
    state.settings.currency = 'Rs.';
    state.settings.monthlyBudget = 35000;
    state.settings.monthlySalary = 65000;

    const today = getTodayDateString();
    const curYear = today.substring(0, 4);
    const curMonth = today.substring(5, 7);

    state.goals = [
      { id: 'goal_ef', name: 'Emergency Fund', target: 100000, current: 75000, icon: '🛡️' },
      { id: 'goal_bike', name: 'Bike Upgrade', target: 150000, current: 35000, icon: '🏍️' },
      { id: 'goal_laptop', name: 'Laptop', target: 120000, current: 15000, icon: '💻' }
    ];

    state.transactions = [
      {
        id: 'tx_demo_1',
        type: 'income',
        amount: 65000,
        category: 'Salary',
        date: `${curYear}-${curMonth}-01`,
        time: '09:00',
        note: 'Monthly Corporate Salary'
      },
      {
        id: 'tx_demo_2',
        type: 'expense',
        amount: 10000,
        category: 'Housing',
        date: `${curYear}-${curMonth}-02`,
        time: '11:30',
        note: 'Monthly House Rent'
      },
      {
        id: 'tx_demo_3',
        type: 'expense',
        amount: 20000,
        category: 'Bike',
        date: `${curYear}-${curMonth}-05`,
        time: '14:15',
        note: 'Monthly Bike Lease Installment'
      },
      {
        id: 'tx_demo_4',
        type: 'savings',
        amount: 10000,
        category: 'Emergency Fund',
        date: `${curYear}-${curMonth}-06`,
        time: '10:00',
        note: 'Planned savings reserve transfer'
      },
      {
        id: 'tx_demo_5',
        type: 'expense',
        amount: 4500,
        category: 'Fuel',
        date: `${curYear}-${curMonth}-12`,
        time: '08:45',
        note: 'Full tank petrol'
      },
      {
        id: 'tx_demo_6',
        type: 'expense',
        amount: 2000,
        category: 'Phone',
        date: `${curYear}-${curMonth}-15`,
        time: '16:20',
        note: 'Mobile & Fiber Broadband'
      },
      {
        id: 'tx_demo_7',
        type: 'expense',
        amount: 5200,
        category: 'Food',
        date: `${curYear}-${curMonth}-18`,
        time: '20:10',
        note: 'Supermarket weekly grocery'
      },
      {
        id: 'tx_demo_8',
        type: 'income',
        amount: 3000,
        category: 'Freelance',
        date: today,
        time: '10:15',
        note: 'Logo design project milestone'
      },
      {
        id: 'tx_demo_9',
        type: 'expense',
        amount: 1200,
        category: 'Food',
        date: today,
        time: '13:00',
        note: 'Lunch at office'
      },
      {
        id: 'tx_demo_10',
        type: 'savings',
        amount: 500,
        category: 'Bike Upgrade',
        date: today,
        time: '15:30',
        note: 'Daily round-up saving'
      }
    ];

    if (typeof Database !== 'undefined') {
      state.goals.forEach(async g => {
        await Database.addSavingsGoal({
          name: g.name,
          target_amount: g.target,
          icon: g.icon
        });
      });
      state.transactions.forEach(async t => {
        await Database.addTransaction({
          type: t.type,
          amount: t.amount,
          category: t.category,
          transaction_date: t.date,
          description: t.note
        });
      });
    }

    saveState();
    localStorage.setItem(STORAGE_KEYS.ONBOARDED, 'true');
    closeModal('setup-modal');
    renderAll();
    showToast('✨ Realistic demo data loaded!');
  }

  // ==========================================================================
  // INITIALIZATION & EVENT BINDINGS
  // ==========================================================================
  async function init() {
    try {
      if (typeof Auth !== 'undefined') {
        const session = await Auth.requireAuth();
        if (!session) return;
      }
    } catch(e) {}

    await loadState();
    applyTheme(state.settings.theme);

    // Dynamic greeting & date
    updateGreeting();

    // Check first launch onboarding
    const onboarded = localStorage.getItem(STORAGE_KEYS.ONBOARDED);
    if (!onboarded) {
      openModal('setup-modal');
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && typeof Auth !== 'undefined') {
      logoutBtn.addEventListener('click', () => Auth.logout());
    }

    // Set prefixes
    updateCurrencyPrefixes();

    // Bind all buttons & interactions
    bindEvents();

    // Render Home initially
    renderAll();
  }

  function updateGreeting() {
    const hour = new Date().getHours();
    let text = 'Good Evening 👋';
    if (hour < 12) text = 'Good Morning ☀️';
    else if (hour < 17) text = 'Good Afternoon 🌤️';

    const greetingTitle = document.getElementById('greeting-title');
    if (greetingTitle) greetingTitle.innerText = text;

    const headerDate = document.getElementById('header-date');
    if (headerDate) {
      headerDate.innerText = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  function updateCurrencyPrefixes() {
    const c = state.settings.currency || 'Rs.';
    ['income-currency-prefix', 'expense-currency-prefix', 'save-currency-prefix', 'setup-currency-prefix'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = c;
    });
  }

  function bindEvents() {
    // SPA View Navigation
    document.querySelectorAll('[data-view]').forEach(elem => {
      elem.addEventListener('click', () => {
        const view = elem.getAttribute('data-view');
        switchView(view);
      });
    });

    // Theme toggles
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
      });
    }

    const mobileThemeBtn = document.getElementById('mobile-theme-btn');
    if (mobileThemeBtn) {
      mobileThemeBtn.addEventListener('click', () => {
        applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
      });
    }

    const settingThemeBtn = document.getElementById('setting-theme-toggle');
    if (settingThemeBtn) {
      settingThemeBtn.addEventListener('click', () => {
        applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
      });
    }

    // Close buttons for modals
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        closeModal(modalId);
      });
    });

    // Quick Action Triggers
    document.getElementById('btn-quick-income').addEventListener('click', () => openModal('modal-income'));
    document.getElementById('btn-quick-expense').addEventListener('click', () => openModal('modal-expense'));
    document.getElementById('btn-quick-save').addEventListener('click', () => openModal('modal-save'));

    // Mobile central + trigger
    const mobileActionTrigger = document.getElementById('mobile-quick-action-trigger');
    if (mobileActionTrigger) {
      mobileActionTrigger.addEventListener('click', () => openModal('quick-action-modal'));
    }

    // Action picker options (inside mobile drawer)
    document.getElementById('picker-opt-income').addEventListener('click', () => {
      closeModal('quick-action-modal');
      openModal('modal-income');
    });
    document.getElementById('picker-opt-expense').addEventListener('click', () => {
      closeModal('quick-action-modal');
      openModal('modal-expense');
    });
    document.getElementById('picker-opt-save').addEventListener('click', () => {
      closeModal('quick-action-modal');
      openModal('modal-save');
    });

    // View All button on Home
    document.getElementById('btn-view-all-tx').addEventListener('click', () => switchView('transactions'));

    // Source Chip Selection for Money In
    document.querySelectorAll('#income-source-chips .select-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#income-source-chips .select-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('income-source').value = chip.getAttribute('data-val');
      });
    });

    // Category Chip Selection for Expense
    document.querySelectorAll('#expense-category-chips .cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#expense-category-chips .cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('expense-category').value = chip.getAttribute('data-val');
      });
    });

    // Expense Amount Live Balance Warning
    document.getElementById('expense-amount').addEventListener('input', e => {
      const val = Number(e.target.value) || 0;
      const { availableMoney } = computeTotals();
      const warn = document.getElementById('expense-balance-warning');
      if (val > availableMoney) {
        document.getElementById('warn-available-val').innerText = formatMoney(availableMoney);
        warn.classList.remove('hidden');
      } else {
        warn.classList.add('hidden');
      }
    });

    // Form: Money In
    document.getElementById('form-income').addEventListener('submit', e => {
      e.preventDefault();
      const amount = document.getElementById('income-amount').value;
      const source = document.getElementById('income-source').value;
      const date = document.getElementById('income-date').value;
      const time = document.getElementById('income-time').value;
      const note = document.getElementById('income-note').value;

      if (addTransaction('income', amount, source, date, time, note)) {
        closeModal('modal-income');
        showToast(`Money In added successfully (+${formatMoney(amount)})!`, 'success');
      }
    });

    // Form: Expense
    document.getElementById('form-expense').addEventListener('submit', e => {
      e.preventDefault();
      const amount = Number(document.getElementById('expense-amount').value);
      const category = document.getElementById('expense-category').value;
      const date = document.getElementById('expense-date').value;
      const time = document.getElementById('expense-time').value;
      const note = document.getElementById('expense-note').value;

      const { availableMoney } = computeTotals();

      if (amount > availableMoney) {
        showConfirmDialog(
          'Expense exceeds available balance',
          `This expense of ${formatMoney(amount)} is higher than your available balance of ${formatMoney(availableMoney)}. Do you want to proceed anyway?`,
          '⚠️',
          () => {
            if (addTransaction('expense', amount, category, date, time, note)) {
              closeModal('modal-expense');
              showToast(`Expense recorded (−${formatMoney(amount)})`, 'expense');
            }
          }
        );
      } else {
        if (addTransaction('expense', amount, category, date, time, note)) {
          closeModal('modal-expense');
          showToast(`Expense recorded (−${formatMoney(amount)})`, 'expense');
        }
      }
    });

    // Form: Save Money
    document.getElementById('form-save').addEventListener('submit', e => {
      e.preventDefault();
      const amount = Number(document.getElementById('save-amount').value);
      const goal = document.getElementById('save-goal-select').value;
      const date = document.getElementById('save-date').value;
      const time = document.getElementById('save-time').value;
      const note = document.getElementById('save-note').value;

      const { availableMoney } = computeTotals();

      if (amount > availableMoney) {
        showConfirmDialog(
          'Savings transfer exceeds balance',
          `You only have ${formatMoney(availableMoney)} available. Do you want to move ${formatMoney(amount)} to ${goal}?`,
          '⚠️',
          () => {
            if (addTransaction('savings', amount, goal, date, time, note)) {
              closeModal('modal-save');
              showToast(`${formatMoney(amount)} moved to ${goal}! 💙`, 'save');
            }
          }
        );
      } else {
        if (addTransaction('savings', amount, goal, date, time, note)) {
          closeModal('modal-save');
          showToast(`${formatMoney(amount)} moved to ${goal}! 💙`, 'save');
        }
      }
    });

    // Form: Edit Transaction
    document.getElementById('form-edit-tx').addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('edit-tx-id').value;
      const amount = Number(document.getElementById('edit-tx-amount').value);
      const category = document.getElementById('edit-tx-category').value;
      const date = document.getElementById('edit-tx-date').value;
      const time = document.getElementById('edit-tx-time').value;
      const note = document.getElementById('edit-tx-note').value;

      if (updateTransaction(id, { amount, category, date, time, note })) {
        closeModal('modal-edit-tx');
      }
    });

    // Add New Goal Modal
    document.getElementById('btn-add-savings-goal').addEventListener('click', () => {
      document.getElementById('goal-id').value = '';
      document.getElementById('goal-name-input').value = '';
      document.getElementById('goal-target-input').value = '';
      document.getElementById('goal-current-input').value = '0';
      openModal('modal-goal');
    });

    // Goal Icon Selectors
    document.querySelectorAll('#goal-icon-chips .select-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#goal-icon-chips .select-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('goal-icon-input').value = chip.getAttribute('data-val');
      });
    });

    // Form: Goal
    document.getElementById('form-goal').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('goal-name-input').value.trim();
      const target = Number(document.getElementById('goal-target-input').value) || 0;
      const current = Number(document.getElementById('goal-current-input').value) || 0;
      const icon = document.getElementById('goal-icon-input').value || '🎯';

      if (!name || target <= 0) {
        showToast('Please provide a goal name and valid target amount.', 'warn');
        return;
      }

      const newGoal = {
        id: 'goal_temp_' + Date.now(),
        name,
        target,
        current,
        icon
      };

      state.goals.push(newGoal);

      if (typeof Database !== 'undefined') {
        Database.addSavingsGoal({
          name: newGoal.name,
          target_amount: newGoal.target,
          icon: newGoal.icon
        }).then(inserted => {
          if (inserted) {
            const idx = state.goals.findIndex(g => g.id === newGoal.id);
            if (idx !== -1) state.goals[idx].id = inserted.id;
          } else {
            showToast('Failed to save goal to cloud database.', 'warn');
          }
        });
      }

      saveState();
      closeModal('modal-goal');
      renderSavings();
      showToast(`Goal "${name}" created!`);
    });

    // Confirmation Modal Confirm / Cancel
    document.getElementById('btn-confirm-proceed').addEventListener('click', () => {
      closeModal('modal-confirm');
      if (typeof state.confirmCallback === 'function') {
        state.confirmCallback();
        state.confirmCallback = null;
      }
    });
    document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
      closeModal('modal-confirm');
      state.confirmCallback = null;
    });

    // Daily View Date Navigator
    document.getElementById('btn-daily-prev').addEventListener('click', () => {
      const [y, m, d] = state.selectedDailyDate.split('-').map(Number);
      const date = new Date(y, m - 1, d - 1);
      state.selectedDailyDate = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
      renderDaily();
    });

    document.getElementById('btn-daily-next').addEventListener('click', () => {
      const [y, m, d] = state.selectedDailyDate.split('-').map(Number);
      const date = new Date(y, m - 1, d + 1);
      state.selectedDailyDate = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
      renderDaily();
    });

    document.getElementById('btn-daily-today').addEventListener('click', () => {
      state.selectedDailyDate = getTodayDateString();
      renderDaily();
    });

    document.getElementById('daily-date-input').addEventListener('change', e => {
      if (e.target.value) {
        state.selectedDailyDate = e.target.value;
        renderDaily();
      }
    });

    // Transactions Search & Filters
    const searchInput = document.getElementById('tx-search-input');
    const searchClear = document.getElementById('tx-search-clear');

    searchInput.addEventListener('input', e => {
      state.searchQuery = e.target.value;
      searchClear.classList.toggle('hidden', !e.target.value);
      renderTransactionsView();
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      searchClear.classList.add('hidden');
      renderTransactionsView();
    });

    document.querySelectorAll('#filter-type-chips .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#filter-type-chips .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filterType = chip.getAttribute('data-type');
        renderTransactionsView();
      });
    });

    document.querySelectorAll('#filter-date-chips .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#filter-date-chips .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filterDate = chip.getAttribute('data-date');
        renderTransactionsView();
      });
    });

    // Month Selector in Insights
    const monthSelect = document.getElementById('monthly-chart-select');
    if (monthSelect) {
      monthSelect.addEventListener('change', e => {
        state.monthlyChartSelectedMonth = e.target.value;
        renderInsights();
      });
    }

    // Onboarding Form
    document.getElementById('setup-form').addEventListener('submit', e => {
      e.preventDefault();
      const available = Number(document.getElementById('setup-available').value) || 0;
      const savings = Number(document.getElementById('setup-savings').value) || 0;
      const salary = Number(document.getElementById('setup-salary').value) || 0;

      state.startingBalance = available;
      state.startingSavings = savings;
      if (salary > 0) state.settings.monthlySalary = salary;

      saveState();
      localStorage.setItem(STORAGE_KEYS.ONBOARDED, 'true');
      closeModal('setup-modal');
      renderAll();
      showToast('Welcome to MoneyFlow! 🚀', 'success');
    });

    // Quick Demo Button in Onboarding
    document.getElementById('btn-quick-demo').addEventListener('click', loadDemoData);

    // Settings Inputs Auto-Save
    document.getElementById('setting-currency-input').addEventListener('change', e => {
      state.settings.currency = e.target.value.trim() || 'Rs.';
      updateCurrencyPrefixes();
      saveState();
      renderAll();
      showToast('Currency updated.');
    });

    document.getElementById('setting-budget-input').addEventListener('change', e => {
      state.settings.monthlyBudget = Number(e.target.value) || 0;
      saveState();
      renderAll();
      showToast('Monthly spending budget updated.');
    });

    document.getElementById('setting-salary-input').addEventListener('change', e => {
      state.settings.monthlySalary = Number(e.target.value) || 0;
      saveState();
      showToast('Salary reference saved.');
    });

    // Backup & Restore
    document.getElementById('btn-export-backup').addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `moneyflow_backup_${getTodayDateString()}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Backup JSON downloaded successfully!');
    });

    document.getElementById('import-backup-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed && typeof parsed === 'object') {
            if (parsed.settings) state.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
            if (typeof parsed.startingBalance === 'number') state.startingBalance = parsed.startingBalance;
            if (typeof parsed.startingSavings === 'number') state.startingSavings = parsed.startingSavings;
            if (Array.isArray(parsed.transactions)) state.transactions = parsed.transactions;
            if (Array.isArray(parsed.goals)) state.goals = parsed.goals;

            saveState();
            renderAll();
            showToast('Backup restored successfully!', 'success');
          } else {
            showToast('Invalid backup file format.', 'warn');
          }
        } catch (err) {
          showToast('Failed to parse JSON file.', 'warn');
        }
      };
      reader.readAsText(file);
    });

    // Reset & Demo actions in Settings
    document.getElementById('btn-load-demo-data').addEventListener('click', () => {
      showConfirmDialog(
        'Load Demo Data?',
        'This will replace your current transactions with realistic demo data.',
        '✨',
        loadDemoData
      );
    });

    document.getElementById('btn-wipe-all-data').addEventListener('click', () => {
      showConfirmDialog(
        'Wipe All Data?',
        'This will permanently delete all stored transactions, goals, and settings on this device.',
        '⚠️',
        () => {
          localStorage.clear();
          location.reload();
        }
      );
    });

    // Responsive Canvas Resize
    window.addEventListener('resize', () => {
      if (state.currentView === 'insights') {
        drawMonthlyBarChart();
        drawBalanceTimelineChart();
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
