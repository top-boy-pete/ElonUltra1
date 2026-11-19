// Admin Transaction Management for editable tables
(function() {
  // For admin tools, use the dynamic API base (fallback to localhost for dev)
  const apiBase = '/api';
  
  let allTransactions = [];
  
  function fmtMoney(v) {
    if (v >= 1) return `$${v.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    return `$${v.toFixed(6)}`;
  }
  
  function getTypeColor(type) {
    const colors = {
      'deposit': '#10b981',
      'withdrawal': '#f59e0b',
      'trade': '#2563eb'
    };
    return colors[type] || '#6b7280';
  }
  
  function getAdminKey() {
    return sessionStorage.getItem('adminKey') || document.getElementById('admin-key')?.value || '';
  }
  
  async function fetchTransactions(userId = null) {
    const key = getAdminKey();
    if (!key) {
      console.warn('Admin key not set');
      return;
    }
    
    try {
      let url = `${apiBase}/admin/transactions`;
      if (userId) {
        url = `${apiBase}/admin/users/${userId}/transactions`;
      }
      
      const res = await fetch(url, {
        headers: {'x-admin-key': key}
      });
      
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`fetch transactions failed: ${res.status} ${text.slice(0, 80)}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text().catch(() => '');
        console.warn('fetchTransactions: received non-JSON response', text.slice(0, 80));
        return;
      }

      const data = await res.json();
      // Handle both direct array and {success, transactions} format
      let transactions = [];
      if (Array.isArray(data)) {
        transactions = data;
      } else if (data.transactions && Array.isArray(data.transactions)) {
        transactions = data.transactions;
      } else {
        console.warn('fetchTransactions: unexpected response format', data);
        transactions = [];
      }
      transactions = transactions.map(transaction => ({ ...transaction, source: 'transaction' }));
      
      // Also fetch withdrawals
      let withdrawals = [];
      try {
        const withdrawalsRes = await fetch(`${apiBase}/admin/withdrawals`, {
          headers: {'x-admin-key': key}
        });
        if (withdrawalsRes.ok) {
          const withdrawalsData = await withdrawalsRes.json();
          withdrawals = withdrawalsData.withdrawals || [];
          // Convert withdrawals to transaction-like format
          withdrawals = withdrawals.map(w => ({
            id: w.id,
            user: w.user_id,
            type: 'withdrawal',
            amount: parseFloat(w.amount),
            status: w.status,
            method: w.crypto_type,
            date: w.created_at,
            txn_hash: w.txn_hash,
            crypto_address: w.crypto_address,
            fee_amount: w.fee_amount,
            fee_status: w.fee_status,
            source: 'withdrawal'
          }));
        }
      } catch (err) {
        console.warn('Failed to fetch withdrawals:', err);
      }
      
      allTransactions = [...transactions, ...withdrawals];
      renderAllTransactionTables();
    } catch(e) {
      console.warn('fetchTransactions failed', e);
    }
  }
  
  function renderAllTransactionTables() {
    renderAllTransactions();
    renderDeposits();
    renderWithdrawals();
    renderTrades();
  }
  
  function renderAllTransactions() {
    const tbody = document.getElementById('all-transactions-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (!allTransactions.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No transactions yet</td></tr>';
      return;
    }
    
    allTransactions.forEach((t, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${t.id || idx + 1}</td>
        <td>${t.user || '—'}</td>
        <td><span style="padding:2px 6px;border-radius:4px;font-size:11px;background:${getTypeColor(t.type)};color:white">${t.type || 'transfer'}</span></td>
        <td>${fmtMoney(t.amount || 0)}</td>
        <td>${t.date ? new Date(t.date).toLocaleDateString() : '—'}</td>
        <td><span style="padding:3px 8px;border-radius:4px;font-size:11px;background:${t.status==='completed'?'#10b981':'#fbbf24'};color:white">${t.status || 'pending'}</span></td>
        <td>
          ${t.source !== 'withdrawal' ? `<button onclick="editTransaction('${t.id}', 'transaction')" style="padding:4px 8px;font-size:12px;margin-right:4px">Edit</button>` : ''}
          <button onclick="deleteTransaction('${t.id}', '${t.type}')" style="padding:4px 8px;font-size:12px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }
  
  function renderDeposits() {
    const tbody = document.getElementById('deposits-admin-tbody');
    if (!tbody) return;
    
    const deposits = allTransactions.filter(t => t.type === 'deposit');
    tbody.innerHTML = '';
    
    if (!deposits.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No deposits yet</td></tr>';
      return;
    }
    
    deposits.forEach((t, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${t.date ? new Date(t.date).toLocaleDateString() : '—'}</td>
        <td>${t.user_id || t.user || '—'}</td>
        <td>${t.method || t.currency || '—'}</td>
        <td>${fmtMoney(t.amount || 0)}</td>
        <td><span style="padding:3px 8px;border-radius:4px;font-size:11px;background:${t.status==='completed'?'#10b981':'#fbbf24'};color:white">${t.status || 'pending'}</span></td>
        <td style="font-size:11px;font-family:monospace">${(t.txid || t.reference || '—').substring(0,12)}${t.txid && t.txid.length > 12 ? '...' : ''}</td>
        <td>
          <button onclick="editTransaction('${t.id}', 'transaction')" style="padding:2px 4px;font-size:11px;margin-right:2px">Edit</button>
          ${t.status !== 'completed' ? `<button onclick="approveTransaction('${t.id || idx}', '${t.type}')" style="padding:2px 4px;font-size:11px;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:2px">Approve</button>` : ''}
          <button onclick="deleteTransaction('${t.id}')" style="padding:2px 4px;font-size:11px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }
  
  function renderWithdrawals() {
    const tbody = document.getElementById('withdrawals-admin-tbody');
    if (!tbody) return;

    const withdrawals = allTransactions.filter(t => t.type === 'withdrawal');
    tbody.innerHTML = '';

    if (!withdrawals.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No withdrawals yet</td></tr>';
      return;
    }

    withdrawals.forEach((t, idx) => {
      const feeStatusClass = t.fee_status === 'confirmed'
        ? 'status-confirmed'
        : t.fee_status === 'submitted'
          ? 'status-submitted'
          : 'status-required';

      let actionBtns = '';
      const editButton = t.source === 'withdrawal'
        ? ''
        : `<button onclick="editTransaction('${t.id}', 'transaction')" style="padding:2px 4px;font-size:11px;margin-right:2px">Edit</button>`;
      if (t.status === 'pending' || t.status === 'processing') {
        actionBtns = `
          ${editButton}
          <button onclick="approveTransaction('${t.id}', 'withdrawal')" style="padding:2px 4px;font-size:11px;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:2px">Approve</button>
          <button onclick="failWithdrawal(${t.id})" style="padding:2px 4px;font-size:11px;background:#ff9800;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:2px">Failed</button>
          <button onclick="deleteWithdrawal(${t.id})" style="padding:2px 4px;font-size:11px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer">Delete</button>
        `;
      } else {
        actionBtns = `
          ${editButton}
          <button onclick="deleteWithdrawal(${t.id})" style="padding:2px 4px;font-size:11px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer">Delete</button>
        `;
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${t.date ? new Date(t.date).toLocaleString() : '—'}</td>
        <td>${t.user || '—'}</td>
        <td>${t.method || '—'}</td>
        <td>${fmtMoney(t.amount || 0)}</td>
        <td><span style="padding:3px 8px;border-radius:4px;font-size:11px;background:${t.status==='completed'?'#10b981':t.status==='failed'?'#ef4444':'#fbbf24'};color:white">${t.status || 'pending'}</span></td>
        <td><span class="status-pill ${feeStatusClass}">${t.fee_status || 'required'}</span></td>
        <td>${t.txn_hash || '-'}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">${actionBtns}</td>
      `;
      tbody.appendChild(row);
    });
  }
  
  function renderTrades() {
    const tbody = document.getElementById('trades-admin-tbody');
    if (!tbody) return;
    
    const trades = allTransactions.filter(t => t.type === 'trade');
    tbody.innerHTML = '';
    
    if (!trades.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No trades yet</td></tr>';
      return;
    }
    
    trades.forEach((t, idx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${t.date ? new Date(t.date).toLocaleDateString() : '—'}</td>
        <td>${t.user || '—'}</td>
        <td><span style="padding:2px 6px;border-radius:4px;font-size:11px;background:${t.side==='buy'?'#10b981':'#ef4444'};color:white">${t.side || 'buy'}</span></td>
        <td>${t.asset || '—'}</td>
        <td>${t.amount || 0}</td>
        <td>${fmtMoney(t.price || 0)}</td>
        <td>${fmtMoney((t.amount || 0) * (t.price || 0))}</td>
        <td>
          <button onclick="editTransaction('${t.id}', 'transaction')" style="padding:4px 8px;font-size:12px;margin-right:4px">Edit</button>
          <button onclick="deleteTransaction('${t.id}', '${t.type}')" style="padding:4px 8px;font-size:12px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }
  
  // Transaction CRUD functions
  async function deleteTransaction(id, type) {
    if (type === 'withdrawal') {
      return deleteWithdrawal(id);
    }
    if (!confirm('Delete this transaction permanently?')) return;
    
    const key = getAdminKey();
    if (!key) return alert('Admin key required');
    
    try {
      const res = await fetch(`${apiBase}/admin/transactions/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': key }
      });
      if (!res.ok) {
        let errorMsg = 'Unknown error';
        try {
          const errorData = await res.json();
          errorMsg = errorData.details || errorData.error || errorMsg;
        } catch (e) {
          const errorText = await res.text().catch(() => 'Unknown error');
          errorMsg = errorText || errorMsg;
        }
        throw new Error(`Delete failed (${res.status}): ${errorMsg}`);
      }
      alert('Transaction deleted');
      fetchTransactions(); // Refresh
      if (typeof loadAdminDeposits === 'function') loadAdminDeposits(); // Refresh deposits table
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete: ' + err.message);
    }
  }
  
  function toDateTimeLocal(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function editTransaction(id, source = 'transaction') {
    if (source !== 'transaction') {
      return alert('Withdrawal records must be changed through the withdrawal actions.');
    }

    const transaction = allTransactions.find(item =>
      item.source !== 'withdrawal' && String(item.id) === String(id)
    );
    if (!transaction) return alert('Transaction not found. Refresh the table and try again.');

    document.getElementById('transaction-edit-title').textContent = `Edit Transaction #${transaction.id}`;
    document.getElementById('edit-transaction-id').value = transaction.id;
    document.getElementById('edit-transaction-type').value = transaction.type || '';
    document.getElementById('edit-transaction-status').value = transaction.status || 'pending';
    document.getElementById('edit-transaction-amount').value = transaction.amount ?? '';
    document.getElementById('edit-transaction-method').value = transaction.method || transaction.currency || '';
    document.getElementById('edit-transaction-date').value = toDateTimeLocal(transaction.date || transaction.created_at);
    document.getElementById('edit-transaction-txid').value = transaction.txid || transaction.reference || '';
    document.getElementById('modal-edit-transaction').classList.add('open');
  }

  document.getElementById('transaction-edit-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const amount = Number(document.getElementById('edit-transaction-amount').value);
    const dateValue = document.getElementById('edit-transaction-date').value;
    const date = new Date(dateValue);
    if (!Number.isFinite(amount) || amount <= 0) return alert('Enter a valid amount greater than zero.');
    if (!dateValue || Number.isNaN(date.getTime())) return alert('Enter a valid transaction date.');

    const id = document.getElementById('edit-transaction-id').value;
    const payload = {
      type: document.getElementById('edit-transaction-type').value.trim(),
      status: document.getElementById('edit-transaction-status').value.trim(),
      amount,
      method: document.getElementById('edit-transaction-method').value.trim(),
      date: date.toISOString(),
      txid: document.getElementById('edit-transaction-txid').value,
    };
    const key = getAdminKey();
    if (!key) return alert('Admin key required');

    submitButton.disabled = true;
    try {
      const res = await fetch(`${apiBase}/admin/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `Update failed (${res.status})`);
      }
      document.getElementById('modal-edit-transaction').classList.remove('open');
      alert('Transaction updated.');
      await fetchTransactions();
      if (typeof loadAdminDeposits === 'function') loadAdminDeposits();
    } catch (err) {
      console.error('Transaction update error:', err);
      alert('Failed to update transaction: ' + err.message);
    } finally {
      submitButton.disabled = false;
    }
  });
  
  async function approveTransaction(id, type) {
    const key = getAdminKey();
    if (!key) return alert('Admin key required');
    
    try {
      if (type === 'withdrawal') {
        // For withdrawals, first confirm fee, then approve
        await fetch(`${apiBase}/admin/withdrawals/${id}/confirm-fee`, {
          method: 'POST',
          headers: { 'x-admin-key': key }
        });
        const res = await fetch(`${apiBase}/admin/withdrawals/${id}/approve`, {
          method: 'POST',
          headers: { 'x-admin-key': key }
        });
        if (!res.ok) throw new Error('Approve withdrawal failed');
        alert('Withdrawal approved (fee confirmed and completed)');
      } else {
        // For deposits
        const res = await fetch(`${apiBase}/admin/deposits/${id}/approve`, {
          method: 'POST',
          headers: { 'x-admin-key': key }
        });
        if (!res.ok) throw new Error('Approve failed');
        alert('Deposit approved');
      }
      fetchTransactions(); // Refresh
      if (typeof loadAdminDeposits === 'function') loadAdminDeposits(); // Refresh deposits table
    } catch (err) {
      console.error('Approve error:', err);
      alert('Failed to approve: ' + err.message);
    }
  }
  
  async function confirmFee(id) {
    const key = getAdminKey();
    if (!key) return alert('Admin key required');
    
    try {
      const res = await fetch(`${apiBase}/admin/withdrawals/${id}/confirm-fee`, {
        method: 'POST',
        headers: { 'x-admin-key': key }
      });
      if (!res.ok) throw new Error('Confirm fee failed');
      alert('Fee confirmed');
      fetchTransactions(); // Refresh
    } catch (err) {
      console.error('Confirm fee error:', err);
      alert('Failed to confirm fee: ' + err.message);
    }
  }
  
  async function deleteWithdrawal(id) {
    if (!confirm('Delete this withdrawal permanently?')) return;
    
    const key = getAdminKey();
    if (!key) return alert('Admin key required');
    
    try {
      const res = await fetch(`${apiBase}/admin/withdrawals/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': key }
      });
      if (!res.ok) {
        let errorMsg = 'Unknown error';
        try {
          const errorData = await res.json();
          errorMsg = errorData.details || errorData.error || errorMsg;
        } catch (e) {
          const errorText = await res.text().catch(() => 'Unknown error');
          errorMsg = errorText || errorMsg;
        }
        throw new Error(`Delete failed (${res.status}): ${errorMsg}`);
      }
      alert('Withdrawal deleted');
      fetchTransactions(); // Refresh
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete: ' + err.message);
    }
  }
  
  // Expose functions globally
  window.ADMIN_TX = {
    fetchTransactions,
    renderAllTransactionTables,
    allTransactions
  };
  
  // Also expose individual functions
  window.deleteTransaction = deleteTransaction;
  window.editTransaction = editTransaction;
  window.approveTransaction = approveTransaction;
  window.deleteWithdrawal = deleteWithdrawal;
  
  // Auto-load transactions when admin key is available
  document.addEventListener('DOMContentLoaded', () => {
    const adminKey = getAdminKey();
    if (adminKey) {
      // Check if there's a selected user
      const selectedUserId = document.getElementById('current-user-select')?.value;
      fetchTransactions(selectedUserId || null);
    }
    
    // Watch for admin key changes
    const adminKeyInput = document.getElementById('admin-key');
    if (adminKeyInput) {
      adminKeyInput.addEventListener('change', () => {
        if (adminKeyInput.value) {
          sessionStorage.setItem('adminKey', adminKeyInput.value);
          const selectedUserId = document.getElementById('current-user-select')?.value;
          fetchTransactions(selectedUserId || null);
        }
      });
    }
    
    // Watch for user selection changes
    const userSelect = document.getElementById('current-user-select');
    if (userSelect) {
      userSelect.addEventListener('change', () => {
        const selectedUserId = userSelect.value;
        if (getAdminKey()) {
          fetchTransactions(selectedUserId || null);
        }
      });
    }
  });
})();