'use strict';

// ============================================================
// AUTH
// ============================================================
async function loginUser() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  errEl.style.display = 'none';
  btn.textContent = 'Signing in…';
  btn.disabled = true;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btn.textContent = 'Sign In';
  btn.disabled = false;
  if (error) {
    errEl.textContent = error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message;
    errEl.style.display = 'block';
    return;
  }
  document.getElementById('auth-screen').style.display = 'none';
  initApp();
}

async function logoutUser() {
  await supabaseClient.auth.signOut();
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-user-email').textContent = '';
}

// ============================================================
// UTILITIES
// ============================================================
const fmt = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayStr = () => new Date().toISOString().split('T')[0];
const daysDiff = dateStr => { const d = new Date(dateStr + 'T00:00:00'), now = new Date(); now.setHours(0,0,0,0); return Math.floor((now - d) / 86400000); };
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);
function esc(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

// ============================================================
// IN-MEMORY CACHE + SUPABASE DB
// ============================================================
const CACHE = {
  customers: [], vendors: [], invoices: [], receipts: [], payments: [], transactions: [],
  profile: {}, counters: { invoice: 0, receipt: 0, payment: 0 }
};

async function _sbUpsert(table, records) {
  if (!records.length) return;
  const { error } = await supabaseClient.from(table).upsert(records);
  if (error) { console.error('upsert', table, error); toast('Save error — check console', 'error'); }
}
async function _sbDelete(table, ids) {
  if (!ids.length) return;
  const { error } = await supabaseClient.from(table).delete().in('id', ids);
  if (error) { console.error('delete', table, error); toast('Delete error — check console', 'error'); }
}
async function _sbSetting(key, value) {
  const { error } = await supabaseClient.from('settings').upsert({ key, value });
  if (error) console.error('setting', key, error);
}

const DB = {
  load(key) { return JSON.parse(JSON.stringify(CACHE[key] || [])); },
  loadObj(key) { return { ...(CACHE[key] || {}) }; },

  save(key, newData) {
    const oldData = CACHE[key] || [];
    const oldMap = Object.fromEntries(oldData.map(r => [r.id, r]));
    const newIds = new Set(newData.map(r => r.id));
    const deletedIds = oldData.map(r => r.id).filter(id => !newIds.has(id));
    const toUpsert = newData.filter(r => JSON.stringify(oldMap[r.id]) !== JSON.stringify(r));
    CACHE[key] = newData;
    if (toUpsert.length) _sbUpsert(key, toUpsert);
    if (deletedIds.length) _sbDelete(key, deletedIds);
  },

  saveObj(key, data) {
    CACHE[key] = data;
    _sbSetting(key, data);
  },

  nextNumber(type) {
    const c = CACHE.counters;
    c[type] = (c[type] || 0) + 1;
    _sbSetting('counters', c);
    const prefix = type === 'invoice' ? 'INV' : type === 'payment' ? 'PAY' : 'REC';
    return prefix + '-' + String(c[type]).padStart(3, '0');
  }
};

// ============================================================
// SAMPLE DATA
// ============================================================
async function loadSampleData() {
  const { data } = await supabaseClient.from('settings').select('value').eq('key', 'seeded').maybeSingle();
  if (data) return;

  const customers = [
    { id: 'c1', companyName: 'Tech Ventures Pvt Ltd', contactPerson: 'Arjun Mehta', email: 'arjun@techventures.in', phone: '+91 98200 11234', address: '42 Linking Road, Bandra\nMumbai — 400050', gstin: '27AABCT1332L1ZV', notes: 'Preferred client. Net 15 payment terms.' },
    { id: 'c2', companyName: 'Design Studio Co', contactPerson: 'Priya Sharma', email: 'priya@designstudio.in', phone: '+91 90000 56789', address: '12 Koramangala\nBangalore — 560034', gstin: '', notes: 'Creative agency. Pays via UPI.' },
    { id: 'c3', companyName: 'Global Exports Ltd', contactPerson: 'Rahul Gupta', email: 'rahul@globalexports.co', phone: '+91 98760 34567', address: '7 Nehru Place\nNew Delhi — 110019', gstin: '07AAACG2115H1ZG', notes: 'Requires GST invoice always.' },
  ];
  const vendors = [
    { id: 'v1', company: 'SupplyPro Pvt Ltd', contact: 'Kiran Rao', email: 'kiran@supplypro.in', phone: '+91 98100 77001', address: '55 Industrial Estate, Pune — 411019', gstin: '27AABCS1429B1ZQ', paymentTerms: 'Net 30' },
    { id: 'v2', company: 'CloudHost Solutions', contact: 'Anita Nair', email: 'anita@cloudhost.io', phone: '+91 80000 22334', address: '8 Cyber Towers, Hyderabad — 500081', gstin: '36AACCC8909E1ZP', paymentTerms: 'Net 15' },
  ];
  const invoices = [
    { id: 'i1', number: 'INV-001', customerId: 'c1', date: '2026-01-15', dueDate: '2026-01-30', items: [{ desc: 'Web Development Services', qty: 1, price: 40000, tax: 18 }, { desc: 'Domain & Hosting Setup', qty: 1, price: 2500, tax: 18 }], notes: 'Thank you for your business!', status: 'paid' },
    { id: 'i2', number: 'INV-002', customerId: 'c2', date: '2026-03-01', dueDate: '2026-03-30', items: [{ desc: 'UI/UX Design Consultation', qty: 10, price: 2500, tax: 18 }], notes: 'Please pay by due date.', status: 'overdue' },
    { id: 'i3', number: 'INV-003', customerId: 'c3', date: '2026-04-01', dueDate: '2026-04-30', items: [{ desc: 'Export Documentation Services', qty: 1, price: 35000, tax: 18 }, { desc: 'Trade Compliance Review', qty: 1, price: 25000, tax: 18 }], notes: 'GST invoice as requested.', status: 'draft' },
    { id: 'i4', number: 'INV-004', customerId: 'c1', date: '2026-04-05', dueDate: '2026-04-20', items: [{ desc: 'Monthly Retainer — April', qty: 1, price: 15000, tax: 5 }], notes: '', status: 'paid' },
  ];
  const receipts = [
    { id: 'r1', number: 'REC-001', invoiceId: 'i1', date: '2026-01-28', customer: 'Arjun Mehta', amount: 49030, method: 'bank', reference: 'NEFT/2026/01/8890', notes: 'Full payment received.' },
    { id: 'r2', number: 'REC-002', invoiceId: 'i4', date: '2026-04-10', customer: 'Arjun Mehta', amount: 15750, method: 'upi', reference: 'UPI/2026/04/TXN99887', notes: '' },
  ];
  const transactions = [
    { id: 't1', date: '2026-01-28', type: 'income', category: 'Services', amount: 49030, description: 'Payment from Arjun Mehta — INV-001', invoiceId: 'i1', receiptId: 'r1' },
    { id: 't2', date: '2026-01-20', type: 'expense', category: 'Software', amount: 8200, description: 'Annual SaaS subscriptions (CloudHost)', invoiceId: null, receiptId: null },
    { id: 't3', date: '2026-02-05', type: 'expense', category: 'Office Supplies', amount: 3450, description: 'Stationery and office supplies', invoiceId: null, receiptId: null },
    { id: 't4', date: '2026-02-14', type: 'income', category: 'Consulting', amount: 22000, description: 'Strategy consulting session — Priya Sharma', invoiceId: null, receiptId: null },
    { id: 't5', date: '2026-03-10', type: 'expense', category: 'Marketing', amount: 15000, description: 'Social media ads campaign Q1', invoiceId: null, receiptId: null },
    { id: 't6', date: '2026-03-22', type: 'expense', category: 'Utilities', amount: 4800, description: 'Electricity and internet bill', invoiceId: null, receiptId: null },
    { id: 't7', date: '2026-04-10', type: 'income', category: 'Services', amount: 15750, description: 'Monthly retainer — Arjun Mehta (INV-004)', invoiceId: 'i4', receiptId: 'r2' },
    { id: 't8', date: '2026-04-12', type: 'expense', category: 'Software', amount: 5600, description: 'Design tools subscription renewal', invoiceId: null, receiptId: null },
  ];

  await Promise.all([
    _sbUpsert('customers', customers),
    _sbUpsert('vendors', vendors),
    _sbUpsert('invoices', invoices),
    _sbUpsert('receipts', receipts),
    _sbUpsert('transactions', transactions),
    _sbSetting('counters', { invoice: 4, receipt: 2 }),
    _sbSetting('seeded', true),
  ]);

  CACHE.customers = customers;
  CACHE.vendors = vendors;
  CACHE.invoices = invoices;
  CACHE.receipts = receipts;
  CACHE.transactions = transactions;
  CACHE.counters = { invoice: 4, receipt: 2 };
}

// ============================================================
// ROUTER
// ============================================================
let currentSection = 'dashboard';
let _modalSaveFn = null;

function navigate(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === section));
  document.querySelectorAll('.tab-item').forEach(el => el.classList.toggle('active', el.dataset.tab === section));
  const renderers = { dashboard: renderDashboard, customers: renderCustomers, vendors: renderVendors, invoices: renderInvoices, receipts: renderReceipts, payments: renderPayments, transactions: renderTransactions, reports: renderReports, tax: renderTaxReports, profile: renderProfile };
  if (renderers[section]) renderers[section]();
  window.scrollTo(0, 0);
}

function triggerModalSave() { if (_modalSaveFn) _modalSaveFn(); }

// ============================================================
// TOAST
// ============================================================
function toast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||'✓'}</span>${esc(msg)}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ============================================================
// CONFIRM
// ============================================================
function showConfirm(msg, onConfirm, title = 'Are you sure?', btnLabel = 'Delete') {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok-btn').textContent = btnLabel;
  document.getElementById('confirm-overlay').classList.add('open');
  document.getElementById('confirm-ok-btn').onclick = () => { onConfirm(); closeConfirm(); };
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); }

// ============================================================
// MODAL
// ============================================================
function openModal(title, bodyHTML, onSave, opts = {}) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const box = document.getElementById('modal-box');
  box.className = 'modal' + (opts.large ? ' modal-lg' : '');
  const footer = document.getElementById('modal-footer');
  const saveBtn = document.getElementById('modal-save-btn');
  if (opts.noFooter) { footer.style.display = 'none'; }
  else {
    footer.style.display = '';
    saveBtn.textContent = opts.saveLabel || 'Save';
  }
  _modalSaveFn = onSave || null;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-body').innerHTML = '';
  _modalSaveFn = null;
}
function handleOverlayClick(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }

// ============================================================
// INVOICE HELPERS
// ============================================================
let _colHeaders = { desc: 'Description', qty: 'Qty', price: 'Unit Price', extra: '' };

function calcInvoiceTotals(items, taxRate) {
  const subtotal = (items || []).reduce((s, item) => s + (item.qty || 0) * (item.price || 0), 0);
  const taxTotal = subtotal * ((taxRate || 0) / 100);
  return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
}
function getCustomerName(id) { const c = DB.load('customers').find(x => x.id === id); return c ? (c.companyName || c.contactPerson || c.name || '—') : '—'; }
function statusBadge(s) { return `<span class="badge badge-${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</span>`; }
function thCol(label, col, sortState, section) {
  const cls = sortState.col === col ? (sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
  return `<th class="${cls}" onclick="sortTable('${col}','${section}')">${label}</th>`;
}
function sortTable(col, section) {
  if (section === 'customers') { if (customerSort.col === col) customerSort.dir = customerSort.dir === 'asc' ? 'desc' : 'asc'; else { customerSort.col = col; customerSort.dir = 'asc'; } renderCustomers(); }
  else if (section === 'vendors') { if (vendorSort.col === col) vendorSort.dir = vendorSort.dir === 'asc' ? 'desc' : 'asc'; else { vendorSort.col = col; vendorSort.dir = 'asc'; } renderVendors(); }
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const txns = DB.load('transactions');
  const invoices = DB.load('invoices');
  const totalRevenue = txns.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const totalExpenses = txns.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
  const outstandingTotal = outstanding.reduce((s,i) => s + calcInvoiceTotals(i.items, i.taxRate).grandTotal, 0);
  const net = totalRevenue - totalExpenses;
  const recentTxns = [...txns].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 6);
  const recentInvs = [...invoices].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 4);

  const profile = getProfile();
  const companyDisplay = profile.companyName || profile.userName || null;

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Dashboard</h2><p>Your financial overview</p></div>
      <div>
        ${companyDisplay ? `
        <div style="display:flex;align-items:center;gap:10px">
          ${profile.logo ? `<img src="${profile.logo}" style="height:36px;width:auto;max-width:80px;object-fit:contain;border-radius:5px">` : ''}
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--gray-800);line-height:1.2">${esc(companyDisplay)}</div>
            ${profile.industry ? `<div style="font-size:12px;color:var(--gray-500);margin-top:1px">${esc(profile.industry)}</div>` : ''}
          </div>
        </div>` : `<button class="btn btn-secondary btn-sm" onclick="navigate('profile')">+ Set up company profile</button>`}
      </div>
    </div>
    <div class="page-body">
      <div class="summary-cards">
        <div class="summary-card">
          <div class="icon icon-green">💰</div>
          <div class="label">Total Revenue</div>
          <div class="value font-mono" style="color:var(--green-d)">${fmt(totalRevenue)}</div>
          <div class="change">All-time income</div>
        </div>
        <div class="summary-card">
          <div class="icon icon-red">📤</div>
          <div class="label">Total Expenses</div>
          <div class="value font-mono" style="color:var(--red)">${fmt(totalExpenses)}</div>
          <div class="change">All-time expenses</div>
        </div>
        <div class="summary-card">
          <div class="icon icon-amber">⏳</div>
          <div class="label">Outstanding</div>
          <div class="value font-mono" style="color:var(--red)">${fmt(outstandingTotal)}</div>
          <div class="change">${outstanding.length} unpaid invoice${outstanding.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="summary-card">
          <div class="icon icon-blue">⚖</div>
          <div class="label">Net Balance</div>
          <div class="value font-mono" style="${net >= 0 ? 'color:var(--green-d)' : 'color:var(--red)'}">${fmt(net)}</div>
          <div class="change">Revenue minus expenses</div>
        </div>
      </div>

      <div class="two-col-grid">
        <div class="card">
          <div class="card-header">
            <h3>Recent Transactions</h3>
            <button class="btn btn-ghost btn-sm" onclick="navigate('transactions')">View All</button>
          </div>
          ${recentTxns.length === 0 ? `<div class="empty-state"><div class="empty-icon">↕</div><p>No transactions yet</p></div>` :
            recentTxns.map(t => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 20px;border-bottom:1px solid var(--gray-100)">
              <div style="min-width:0;flex:1">
                <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.description)}</div>
                <div style="font-size:11px;color:var(--gray-400);margin-top:2px">${fmtDate(t.date)} &middot; ${esc(t.category)}</div>
              </div>
              <div style="font-weight:600;font-size:14px;margin-left:12px;font-variant-numeric:tabular-nums;white-space:nowrap;${t.type==='income'?'color:var(--green-d)':'color:var(--red)'}">
                ${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}
              </div>
            </div>`).join('')}
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Recent Invoices</h3>
            <button class="btn btn-ghost btn-sm" onclick="navigate('invoices')">View All</button>
          </div>
          ${recentInvs.length === 0 ? `<div class="empty-state"><div class="empty-icon">📄</div><p>No invoices yet</p></div>` :
            recentInvs.map(inv => {
              const t = calcInvoiceTotals(inv.items, inv.taxRate);
              return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 20px;border-bottom:1px solid var(--gray-100)">
                <div>
                  <div style="font-size:13px;font-weight:600;color:var(--gray-800)">${esc(inv.number)}</div>
                  <div style="font-size:11px;color:var(--gray-400);margin-top:2px">${esc(getCustomerName(inv.customerId))} &middot; ${fmtDate(inv.date)}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:600;font-size:13px;font-variant-numeric:tabular-nums">${fmt(t.grandTotal)}</div>
                  <div style="margin-top:3px">${statusBadge(inv.status)}</div>
                </div>
              </div>`;
            }).join('')}
        </div>
      </div>
    </div>`;
}

// ============================================================
// CUSTOMERS
// ============================================================
let customerSort = { col: 'companyName', dir: 'asc' };
let customerSearch = '';

function renderCustomers() {
  const customers = DB.load('customers');
  const filtered = customers
    .filter(c => [c.companyName,c.contactPerson,c.email,c.phone,c.gstin].join(' ').toLowerCase().includes(customerSearch.toLowerCase()))
    .sort((a,b) => (a[customerSort.col]||'').localeCompare(b[customerSort.col]||'') * (customerSort.dir==='asc'?1:-1));

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Customers</h2><p>${customers.length} customer${customers.length!==1?'s':''} total</p></div>
      <button class="btn btn-primary" onclick="openCustomerModal()">+ Add Customer</button>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search customers..." value="${esc(customerSearch)}" oninput="customerSearch=this.value;renderCustomers()">
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            ${thCol('Company Name','companyName',customerSort,'customers')}
            ${thCol('Contact Person','contactPerson',customerSort,'customers')}
            ${thCol('Email','email',customerSort,'customers')}
            <th>Phone</th>
            <th>GSTIN</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👤</div><p>No customers found</p></div></td></tr>` :
              filtered.map(c => `
              <tr>
                <td>
                  <div style="font-weight:600;color:var(--gray-800)">${esc(c.companyName||'—')}</div>
                  ${c.notes ? `<div class="text-sm text-muted" style="margin-top:2px">${esc(c.notes.slice(0,60))}${c.notes.length>60?'…':''}</div>` : ''}
                </td>
                <td>${esc(c.contactPerson||'—')}</td>
                <td><a href="mailto:${esc(c.email)}" style="color:var(--emerald-d);text-decoration:none">${esc(c.email)}</a></td>
                <td>${esc(c.phone||'—')}</td>
                <td class="font-mono text-sm">${c.gstin ? esc(c.gstin) : '<span class="text-muted">—</span>'}</td>
                <td><div class="td-actions">
                  <button class="btn btn-secondary btn-sm btn-icon" onclick="openCustomerModal('${c.id}')" title="Edit">✎</button>
                  <button class="btn btn-danger btn-sm btn-icon" onclick="deleteCustomer('${c.id}')" title="Delete">🗑</button>
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openCustomerModal(id) {
  const c = id ? DB.load('customers').find(x => x.id === id) : null;
  openModal(c ? 'Edit Customer' : 'Add Customer', `
    <div class="form-row">
      <div class="form-group"><label>Company Name</label><input id="cf-company" value="${c?esc(c.companyName||''):''}" placeholder="Tech Ventures Pvt Ltd"></div>
      <div class="form-group"><label>Contact Person</label><input id="cf-contact" value="${c?esc(c.contactPerson||''):''}" placeholder="Arjun Mehta"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input id="cf-email" type="email" value="${c?esc(c.email):''}" placeholder="email@example.com"></div>
      <div class="form-group"><label>Phone</label><input id="cf-phone" value="${c?esc(c.phone):''}" placeholder="+91 98200 11234"></div>
    </div>
    <div class="form-group"><label>Billing Address</label><textarea id="cf-address" rows="2" placeholder="Street, City, State, PIN">${c?esc(c.address):''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>GSTIN (optional)</label><input id="cf-gstin" value="${c?esc(c.gstin):''}" placeholder="22AAAAA0000A1Z5"></div>
      <div class="form-group"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="cf-notes" rows="2" placeholder="Additional notes...">${c?esc(c.notes||''):''}</textarea></div>
  `, () => {
    const companyName = document.getElementById('cf-company').value.trim();
    const contactPerson = document.getElementById('cf-contact').value.trim();
    const email = document.getElementById('cf-email').value.trim();
    const list = DB.load('customers');
    const rec = { id: c?c.id:uid(), companyName, contactPerson, email, phone: document.getElementById('cf-phone').value.trim(), address: document.getElementById('cf-address').value.trim(), gstin: document.getElementById('cf-gstin').value.trim(), notes: document.getElementById('cf-notes').value.trim() };
    if (c) list[list.findIndex(x=>x.id===c.id)] = rec; else list.push(rec);
    DB.save('customers', list);
    closeModal(); toast(c?'Customer updated':'Customer added'); renderCustomers();
  });
}

function deleteCustomer(id) {
  const c = DB.load('customers').find(x => x.id === id);
  showConfirm(`Delete customer "${c?.companyName || c?.contactPerson}"? This cannot be undone.`, () => {
    DB.save('customers', DB.load('customers').filter(x => x.id !== id));
    toast('Customer deleted'); renderCustomers();
  });
}

// ============================================================
// VENDORS
// ============================================================
let vendorSort = { col: 'company', dir: 'asc' };
let vendorSearch = '';

function renderVendors() {
  const vendors = DB.load('vendors');
  const filtered = vendors
    .filter(v => [v.company,v.contact,v.email,v.phone].join(' ').toLowerCase().includes(vendorSearch.toLowerCase()))
    .sort((a,b) => (a[vendorSort.col]||'').localeCompare(b[vendorSort.col]||'') * (vendorSort.dir==='asc'?1:-1));

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Vendors</h2><p>${vendors.length} vendor${vendors.length!==1?'s':''} total</p></div>
      <button class="btn btn-primary" onclick="openVendorModal()">+ Add Vendor</button>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search vendors..." value="${esc(vendorSearch)}" oninput="vendorSearch=this.value;renderVendors()">
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            ${thCol('Company','company',vendorSort,'vendors')}
            ${thCol('Contact','contact',vendorSort,'vendors')}
            ${thCol('Email','email',vendorSort,'vendors')}
            <th>Phone</th>
            <th>Terms</th>
            <th>GSTIN</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🏢</div><p>No vendors found</p></div></td></tr>` :
              filtered.map(v => `
              <tr>
                <td><div style="font-weight:600;color:var(--gray-800)">${esc(v.company)}</div></td>
                <td>${esc(v.contact||'—')}</td>
                <td><a href="mailto:${esc(v.email)}" style="color:var(--emerald-d);text-decoration:none">${esc(v.email)}</a></td>
                <td>${esc(v.phone||'—')}</td>
                <td><span class="badge badge-draft">${esc(v.paymentTerms)}</span></td>
                <td class="font-mono text-sm">${v.gstin?esc(v.gstin):'<span class="text-muted">—</span>'}</td>
                <td><div class="td-actions">
                  <button class="btn btn-secondary btn-sm btn-icon" onclick="openVendorModal('${v.id}')" title="Edit">✎</button>
                  <button class="btn btn-danger btn-sm btn-icon" onclick="deleteVendor('${v.id}')" title="Delete">🗑</button>
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openVendorModal(id) {
  const v = id ? DB.load('vendors').find(x => x.id === id) : null;
  openModal(v ? 'Edit Vendor' : 'Add Vendor', `
    <div class="form-row">
      <div class="form-group"><label>Company Name</label><input id="vf-company" value="${v?esc(v.company):''}" placeholder="SupplyPro Pvt Ltd"></div>
      <div class="form-group"><label>Contact Person</label><input id="vf-contact" value="${v?esc(v.contact):''}" placeholder="Kiran Rao"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input id="vf-email" type="email" value="${v?esc(v.email):''}" placeholder="vendor@company.com"></div>
      <div class="form-group"><label>Phone</label><input id="vf-phone" value="${v?esc(v.phone):''}" placeholder="+91 98100 77001"></div>
    </div>
    <div class="form-group"><label>Address</label><textarea id="vf-address" rows="2">${v?esc(v.address):''}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>GSTIN (optional)</label><input id="vf-gstin" value="${v?esc(v.gstin):''}" placeholder="22AAAAA0000A1Z5"></div>
      <div class="form-group"><label>Payment Terms</label>
        <select id="vf-terms">${['Net 15','Net 30','Net 45','Net 60','Immediate'].map(t=>`<option ${v?.paymentTerms===t?'selected':''}>${t}</option>`).join('')}</select>
      </div>
    </div>
  `, () => {
    const company = document.getElementById('vf-company').value.trim();
    const email = document.getElementById('vf-email').value.trim();
    const list = DB.load('vendors');
    const rec = { id: v?v.id:uid(), company, contact: document.getElementById('vf-contact').value.trim(), email, phone: document.getElementById('vf-phone').value.trim(), address: document.getElementById('vf-address').value.trim(), gstin: document.getElementById('vf-gstin').value.trim(), paymentTerms: document.getElementById('vf-terms').value };
    if (v) list[list.findIndex(x=>x.id===v.id)] = rec; else list.push(rec);
    DB.save('vendors', list);
    closeModal(); toast(v?'Vendor updated':'Vendor added'); renderVendors();
  });
}

function deleteVendor(id) {
  const v = DB.load('vendors').find(x => x.id === id);
  showConfirm(`Delete vendor "${v?.company}"?`, () => {
    DB.save('vendors', DB.load('vendors').filter(x => x.id !== id));
    toast('Vendor deleted'); renderVendors();
  });
}

// ============================================================
// INVOICES
// ============================================================
let invoiceSearch = '';
let invoiceStatusFilter = 'all';

function renderInvoices() {
  const invoices = DB.load('invoices');
  // Auto-flag overdue
  const invoicesUpdated = invoices.map(inv =>
    (inv.status === 'sent' && inv.dueDate && daysDiff(inv.dueDate) > 0) ? { ...inv, status: 'overdue' } : inv
  );
  if (invoicesUpdated.some((inv, i) => inv !== invoices[i])) {
    DB.save('invoices', invoicesUpdated);
    invoices.splice(0, invoices.length, ...invoicesUpdated);
  }

  const filtered = invoices
    .filter(inv => {
      const ok = [inv.number, getCustomerName(inv.customerId)].join(' ').toLowerCase().includes(invoiceSearch.toLowerCase());
      return ok && (invoiceStatusFilter === 'all' || inv.status === invoiceStatusFilter);
    })
    .sort((a,b) => b.date.localeCompare(a.date));

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Invoices</h2><p>${invoices.length} invoice${invoices.length!==1?'s':''} total</p></div>
      <button class="btn btn-primary" onclick="openInvoiceForm()">+ New Invoice</button>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search invoices..." value="${esc(invoiceSearch)}" oninput="invoiceSearch=this.value;renderInvoices()">
        </div>
        <select style="padding:8px 12px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:13px;background:var(--white);outline:none;font-family:inherit" onchange="invoiceStatusFilter=this.value;renderInvoices()">
          <option value="all" ${invoiceStatusFilter==='all'?'selected':''}>All Statuses</option>
          <option value="draft" ${invoiceStatusFilter==='draft'?'selected':''}>Draft</option>
          <option value="sent" ${invoiceStatusFilter==='sent'?'selected':''}>Sent</option>
          <option value="paid" ${invoiceStatusFilter==='paid'?'selected':''}>Paid</option>
          <option value="overdue" ${invoiceStatusFilter==='overdue'?'selected':''}>Overdue</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Invoice #</th><th>Customer</th><th>Date</th><th>Due Date</th>
            <th class="text-right">Amount</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📄</div><p>No invoices found</p></div></td></tr>` :
              filtered.map(inv => {
                const t = calcInvoiceTotals(inv.items, inv.taxRate);
                return `<tr>
                  <td style="font-weight:600;font-variant-numeric:tabular-nums">${esc(inv.number)}</td>
                  <td>${esc(getCustomerName(inv.customerId))}</td>
                  <td class="text-muted">${fmtDate(inv.date)}</td>
                  <td class="${inv.status==='overdue'?'text-red':''}">${fmtDate(inv.dueDate)}</td>
                  <td class="text-right font-mono" style="font-weight:600">${fmt(t.grandTotal)}</td>
                  <td>${statusBadge(inv.status)}</td>
                  <td><div class="td-actions">
                    <button class="btn btn-secondary btn-sm" onclick="viewInvoice('${inv.id}')">👁 View</button>
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="openInvoiceForm('${inv.id}')" title="Edit">✎</button>
                    ${inv.status!=='paid'?`<button class="btn btn-primary btn-sm" onclick="markInvoicePaid('${inv.id}')">✓ Paid</button>`:''}
                    <button class="btn btn-danger btn-sm btn-icon" onclick="deleteInvoice('${inv.id}')" title="Delete">🗑</button>
                  </div></td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// Line item helpers
function lineItemHTML(item) {
  const hasExtra = !!_colHeaders.extra;
  return `<div class="line-item-row${hasExtra ? ' has-extra' : ''}">
    <input type="text" class="li-desc" value="${esc(item.desc||'')}" placeholder="${esc(_colHeaders.desc)}" oninput="updateInvTotals()">
    <input type="number" class="li-qty" value="${item.qty??1}" min="0" step="0.01" oninput="updateInvTotals()">
    <input type="number" class="li-price" value="${item.price??0}" min="0" step="0.01" oninput="updateInvTotals()">
    ${hasExtra ? `<input type="text" class="li-extra" value="${esc(item.extra||'')}" placeholder="${esc(_colHeaders.extra)}">` : ''}
    <button class="remove-line" onclick="this.closest('.line-item-row').remove();updateInvTotals()" title="Remove">✕</button>
  </div>`;
}

function collectLineItems() {
  return Array.from(document.querySelectorAll('#line-items-container .line-item-row')).map(row => ({
    desc: row.querySelector('.li-desc').value.trim(),
    qty: parseFloat(row.querySelector('.li-qty').value) || 0,
    price: parseFloat(row.querySelector('.li-price').value) || 0,
    extra: row.querySelector('.li-extra')?.value.trim() || '',
  }));
}

function buildTotalsHTML(items, taxRate) {
  const subtotal = (items || []).reduce((s, i) => s + (i.qty||0)*(i.price||0), 0);
  const rate = taxRate || 0;
  const taxAmount = subtotal * rate / 100;
  return `<div class="totals-row"><span>Subtotal</span><span class="font-mono" id="inv-subtotal">${fmt(subtotal)}</span></div>
          <div class="totals-row">
            <span style="display:flex;align-items:center;gap:6px">Tax / GST <input type="number" id="inv-tax-rate" value="${rate}" min="0" max="100" step="0.1" style="width:52px;padding:3px 6px;border:1px solid var(--gray-200);border-radius:4px;font-size:12px;text-align:right;font-family:inherit" oninput="updateInvTotals()"> %</span>
            <span class="font-mono" id="inv-tax-amount">${fmt(taxAmount)}</span>
          </div>
          <div class="totals-row grand"><span>Grand Total</span><span class="font-mono" id="inv-grand-total">${fmt(subtotal + taxAmount)}</span></div>`;
}

function updateInvTotals() {
  const items = collectLineItems();
  const subtotal = items.reduce((s, i) => s + (i.qty||0)*(i.price||0), 0);
  const taxRate = parseFloat(document.getElementById('inv-tax-rate')?.value) || 0;
  const taxAmount = subtotal * taxRate / 100;
  const s = document.getElementById('inv-subtotal');
  const t = document.getElementById('inv-tax-amount');
  const g = document.getElementById('inv-grand-total');
  if (s) s.textContent = fmt(subtotal);
  if (t) t.textContent = fmt(taxAmount);
  if (g) g.textContent = fmt(subtotal + taxAmount);
}

function syncColHeader(el, col) {
  _colHeaders[col] = el.innerText.trim() || (col === 'extra' ? '' : _colHeaders[col]);
}

function activateExtraCol() {
  _colHeaders.extra = 'Extra';
  const header = document.getElementById('line-items-header');
  if (!header) return;
  header.className = 'line-items-header has-extra';
  const addBtn = header.querySelector('.col-add-btn');
  if (addBtn) {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.spellcheck = false;
    div.innerText = 'Extra';
    div.oninput = () => { _colHeaders.extra = div.innerText.trim(); document.querySelectorAll('#line-items-container .li-extra').forEach(i => i.placeholder = _colHeaders.extra || ''); };
    addBtn.replaceWith(div);
  }
  document.querySelectorAll('#line-items-container .line-item-row').forEach(row => {
    if (row.querySelector('.li-extra')) return;
    row.className = 'line-item-row has-extra';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'li-extra'; inp.placeholder = _colHeaders.extra;
    row.insertBefore(inp, row.querySelector('.remove-line'));
  });
  header.querySelector('[contenteditable]:last-of-type')?.focus();
}

function openInvoiceForm(id) {
  const inv = id ? DB.load('invoices').find(x => x.id === id) : null;
  const customers = DB.load('customers');
  const p = getProfile();
  const customerOptions = customers.map(c => `<option value="${c.id}" ${inv?.customerId===c.id?'selected':''}>${esc(c.companyName || c.contactPerson || c.name || '')}</option>`).join('');
  const defaultItems = inv ? inv.items : [{ desc: '', qty: 1, price: 0 }];
  _colHeaders = { desc: inv?.colHeaders?.desc||'Description', qty: inv?.colHeaders?.qty||'Qty', price: inv?.colHeaders?.price||'Unit Price', extra: inv?.colHeaders?.extra||'' };

  openModal(inv ? `Edit Invoice ${inv.number}` : 'New Invoice', `
    <div class="form-row">
      <div class="form-group">
        <label>Invoice Number *</label>
        <input id="if-number" value="${inv?.number || ''}" placeholder="INV-${''+String((CACHE.counters.invoice||0)+1).padStart(3,'0')}" style="font-weight:600;font-variant-numeric:tabular-nums">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="if-status">${['draft','sent','paid','overdue'].map(s=>`<option value="${s}" ${(inv?.status||'draft')===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Customer *</label>
        <select id="if-customer"><option value="">Select customer...</option>${customerOptions}</select>
      </div>
      <div class="form-group"><label>Invoice Date *</label><input type="date" id="if-date" value="${inv?.date||todayStr()}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Due Date</label><input type="date" id="if-due" value="${inv?.dueDate||''}"></div>
      <div class="form-group"></div>
    </div>
    <hr class="divider">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:var(--gray-600)">Line Items</label>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('line-items-container').insertAdjacentHTML('beforeend',lineItemHTML({desc:'',qty:1,price:0}));updateInvTotals()">+ Add Row</button>
    </div>
    <div class="line-items-header${inv?.colHeaders?.extra ? ' has-extra' : ''}" id="line-items-header">
      <div contenteditable="true" spellcheck="false" oninput="syncColHeader(this,'desc')" title="Click to rename">${esc(inv?.colHeaders?.desc||'Description')}</div>
      <div contenteditable="true" spellcheck="false" oninput="syncColHeader(this,'qty')" title="Click to rename">${esc(inv?.colHeaders?.qty||'Qty')}</div>
      <div contenteditable="true" spellcheck="false" oninput="syncColHeader(this,'price')" title="Click to rename">${esc(inv?.colHeaders?.price||'Unit Price')}</div>
      ${inv?.colHeaders?.extra ? `<div contenteditable="true" spellcheck="false" oninput="syncColHeader(this,'extra')">${esc(inv.colHeaders.extra)}</div>` : `<div class="col-add-btn" onclick="activateExtraCol()" title="Add extra column">+ Col</div>`}
      <div></div>
    </div>
    <div id="line-items-container">${defaultItems.map(item => lineItemHTML(item)).join('')}</div>
    <div class="line-items-totals" id="invoice-totals">${buildTotalsHTML(defaultItems, inv?.taxRate||0)}</div>
    <hr class="divider">
    <div class="form-group"><label>Notes</label><textarea id="if-notes" rows="2">${inv?esc(inv.notes):''}</textarea></div>
    <hr class="divider">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--gray-500);margin-bottom:12px">Bank Details (shown on invoice)</div>
    <div class="form-row">
      <div class="form-group"><label>Bank Name</label><input id="if-bank-name" value="${esc(inv?.bankName||p.bankName||'')}" placeholder="HDFC Bank"></div>
      <div class="form-group"><label>Account Holder</label><input id="if-bank-holder" value="${esc(inv?.bankHolder||p.bankHolder||p.companyName||'')}" placeholder="Your Company Name"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Account Number</label><input id="if-bank-acct" value="${esc(inv?.bankAccount||p.bankAccount||'')}" placeholder="XXXX XXXX XXXX"></div>
      <div class="form-group"><label>IFSC Code</label><input id="if-ifsc" value="${esc(inv?.ifsc||p.ifsc||'')}" placeholder="HDFC0001234"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Branch</label><input id="if-branch" value="${esc(inv?.branch||p.branch||'')}" placeholder="Bandra West, Mumbai"></div>
      <div class="form-group"><label>UPI ID</label><input id="if-upi" value="${esc(inv?.upi||p.upi||'')}" placeholder="company@hdfcbank"></div>
    </div>
  `, () => {
    const typedInvNum = document.getElementById('if-number').value.trim();
    const number = typedInvNum || (inv ? inv.number : DB.nextNumber('invoice'));
    const customerId = document.getElementById('if-customer').value;
    const date = document.getElementById('if-date').value;
    if (!number) { toast('Invoice number is required', 'error'); return; }
    if (!customerId) { toast('Please select a customer', 'error'); return; }
    if (!date) { toast('Invoice date is required', 'error'); return; }
    const items = collectLineItems().filter(i => i.desc || i.price > 0);
    if (items.length === 0) { toast('Add at least one line item', 'error'); return; }
    const list = DB.load('invoices');
    const duplicate = list.find(x => x.number === number && (!inv || x.id !== inv.id));
    if (duplicate) { toast(`Invoice number "${number}" already exists`, 'error'); return; }
    const rec = {
      id: inv?inv.id:uid(), number, customerId, date,
      dueDate: document.getElementById('if-due').value,
      taxRate: parseFloat(document.getElementById('inv-tax-rate')?.value) || 0,
      colHeaders: { ..._colHeaders },
      items, notes: document.getElementById('if-notes').value.trim(),
      status: document.getElementById('if-status').value,
      bankName: document.getElementById('if-bank-name').value.trim(),
      bankHolder: document.getElementById('if-bank-holder').value.trim(),
      bankAccount: document.getElementById('if-bank-acct').value.trim(),
      ifsc: document.getElementById('if-ifsc').value.trim().toUpperCase(),
      branch: document.getElementById('if-branch').value.trim(),
      upi: document.getElementById('if-upi').value.trim(),
    };
    if (inv) list[list.findIndex(x=>x.id===inv.id)] = rec; else list.push(rec);
    DB.save('invoices', list);
    closeModal(); toast(inv?'Invoice updated':'Invoice created'); renderInvoices();
  }, { large: true });
}

function buildInvoiceHTML(inv, customer, t, forPrint) {
  const profile = getProfile();
  const fromPersonName = profile.userName || '';
  const fromCompanyName = profile.companyName || 'Your Business';
  const fromLines = [
    profile.address ? profile.address.replace(/\n/g, '<br>') : '',
    profile.gstin ? 'GSTIN: ' + profile.gstin : '',
  ].filter(Boolean).join('<br>');

  const topLeft = profile.logo
    ? `<img src="${profile.logo}" style="max-height:60px;max-width:160px;object-fit:contain;display:block">`
    : `<div style="font-size:22px;font-weight:800;color:#1b2d45">${esc(fromCompanyName)}</div>`;

  const ch = inv.colHeaders || {};
  const colDesc  = ch.desc  || 'Description';
  const colQty   = ch.qty   || 'Qty';
  const colPrice = ch.price || 'Unit Price';
  const colExtra = ch.extra || '';
  const thS = 'color:white;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px';

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px">
        <div>${topLeft}</div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:700;color:#64748b;letter-spacing:2px">INVOICE</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px">${esc(inv.number)}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px">Date: ${fmtDate(inv.date)}</div>
          ${inv.dueDate ? `<div style="font-size:13px;color:#64748b;margin-top:2px">Due Date: ${fmtDate(inv.dueDate)}</div>` : ''}
        </div>
      </div>

      <!-- Parties -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;padding:18px;background:#f8fafc;border-radius:8px">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:6px">Billed From</div>
          ${fromPersonName ? `<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:2px">${esc(fromPersonName)}</div>` : ''}
          <div style="font-size:13px;font-weight:600;color:#334155;margin-bottom:4px">${esc(fromCompanyName)}</div>
          <div style="font-size:13px;color:#475569;line-height:1.6">${fromLines}</div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:6px">Billed To</div>
          ${customer.contactPerson ? `<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:2px">${esc(customer.contactPerson)}</div>` : ''}
          <div style="font-size:13px;font-weight:600;color:#334155;margin-bottom:4px">${esc(customer.companyName || customer.name || '—')}</div>
          <div style="font-size:13px;color:#475569;line-height:1.6">
            ${esc(customer.address||'').replace(/\n/g,'<br>')}
            ${customer.gstin ? '<br>GSTIN: ' + esc(customer.gstin) : ''}
          </div>
        </div>
      </div>

      <!-- Line Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:0;font-size:13px">
        <thead>
          <tr style="background:#1b2d45">
            <th style="${thS};text-align:left">#</th>
            <th style="${thS};text-align:left">${esc(colDesc)}</th>
            <th style="${thS};text-align:right">${esc(colQty)}</th>
            <th style="${thS};text-align:right">${esc(colPrice)}</th>
            ${colExtra ? `<th style="${thS};text-align:left">${esc(colExtra)}</th>` : ''}
            <th style="${thS};text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${inv.items.map((item,i) => {
            const line = item.qty * item.price;
            return `<tr style="background:${i%2===0?'#ffffff':'#f8fafc'}">
              <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9">${i+1}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9">${esc(item.desc)}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right">${item.qty}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-variant-numeric:tabular-nums">${fmt(item.price)}</td>
              ${colExtra ? `<td style="padding:10px 14px;border-bottom:1px solid #f1f5f9">${esc(item.extra||'')}</td>` : ''}
              <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmt(line)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="background:#f8fafc;padding:14px 16px;border-radius:0 0 8px 8px">
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#64748b"><span>Subtotal</span><span style="font-variant-numeric:tabular-nums">${fmt(t.subtotal)}</span></div>
        ${t.taxTotal > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#64748b"><span>Tax / GST (${inv.taxRate || 0}%)</span><span style="font-variant-numeric:tabular-nums">${fmt(t.taxTotal)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding:10px 0 4px;border-top:2px solid #e2e8f0;margin-top:6px;color:#1e293b"><span>Grand Total</span><span style="font-variant-numeric:tabular-nums">${fmt(t.grandTotal)}</span></div>
      </div>

      ${inv.notes ? `<p style="margin-top:14px;font-size:13px;color:#64748b"><strong>Notes:</strong> ${esc(inv.notes)}</p>` : ''}

      <!-- Bank Details -->
      ${(inv.bankName || inv.bankAccount) ? `
      <div style="margin-top:20px;padding:16px 18px;background:#f8fafc;border-radius:8px;border-left:3px solid #0ea5e9">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:10px">Payment Details</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:#475569">
          ${inv.bankName ? `<div style="display:flex;gap:8px"><span style="color:#94a3b8;min-width:140px">Bank</span><span style="font-weight:600;color:#1e293b">${esc(inv.bankName)}</span></div>` : ''}
          ${inv.bankHolder ? `<div style="display:flex;gap:8px"><span style="color:#94a3b8;min-width:140px">Account Holder</span><span style="font-weight:600;color:#1e293b">${esc(inv.bankHolder)}</span></div>` : ''}
          ${inv.bankAccount ? `<div style="display:flex;gap:8px"><span style="color:#94a3b8;min-width:140px">Account Number</span><span style="font-weight:600;color:#1e293b">${esc(inv.bankAccount)}</span></div>` : ''}
          ${inv.ifsc ? `<div style="display:flex;gap:8px"><span style="color:#94a3b8;min-width:140px">IFSC Code</span><span style="font-weight:600;color:#1e293b">${esc(inv.ifsc)}</span></div>` : ''}
          ${inv.branch ? `<div style="display:flex;gap:8px"><span style="color:#94a3b8;min-width:140px">Branch</span><span style="font-weight:600;color:#1e293b">${esc(inv.branch)}</span></div>` : ''}
          ${inv.upi ? `<div style="display:flex;gap:8px"><span style="color:#94a3b8;min-width:140px">UPI ID</span><span style="font-weight:600;color:#1e293b">${esc(inv.upi)}</span></div>` : ''}
        </div>
      </div>` : ''}

    </div>`;
}

function viewInvoice(id) {
  const inv = DB.load('invoices').find(x => x.id === id);
  if (!inv) return;
  const customer = DB.load('customers').find(c => c.id === inv.customerId) || { companyName: '—', contactPerson: '', address: '', gstin: '', email: '' };
  const t = calcInvoiceTotals(inv.items, inv.taxRate);

  openModal(`Invoice ${inv.number}`, buildInvoiceHTML(inv, customer, t, false),
    () => downloadInvoicePDF(id),
    { large: true, saveLabel: '⬇ Download PDF' }
  );

  // Inject Send Email button (remove any previous one first to avoid duplicates)
  const footer = document.getElementById('modal-footer');
  footer.querySelectorAll('.inv-send-btn').forEach(b => b.remove());
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn btn-secondary inv-send-btn';
  sendBtn.innerHTML = '✉ Send Email';
  sendBtn.onclick = () => sendInvoiceEmail(id);
  footer.insertBefore(sendBtn, document.getElementById('modal-save-btn'));
}

function downloadInvoicePDF(id) {
  const inv = DB.load('invoices').find(x => x.id === id);
  if (!inv) return;
  const customer = DB.load('customers').find(c => c.id === inv.customerId) || { companyName: '—', contactPerson: '', address: '', gstin: '', email: '' };
  const t = calcInvoiceTotals(inv.items, inv.taxRate);

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Invoice ${esc(inv.number)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; background: white; color: #1e293b; }
      @media print {
        body { padding: 20px; }
        .no-print { display: none !important; }
        @page { margin: 1cm; size: A4; }
      }
    </style>
  </head><body>
    <div class="no-print" style="margin-bottom:20px;display:flex;gap:10px">
      <button onclick="window.print()" style="padding:8px 18px;background:#0ea5e9;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600">⬇ Save as PDF / Print</button>
      <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:6px;font-size:14px;cursor:pointer">Close</button>
    </div>
    ${buildInvoiceHTML(inv, customer, t, true)}
  </body></html>`);
  win.document.close();
  win.focus();
}

function sendInvoiceEmail(id) {
  const inv = DB.load('invoices').find(x => x.id === id);
  if (!inv) return;
  const customer = DB.load('customers').find(c => c.id === inv.customerId) || {};
  const profile = getProfile();
  const t = calcInvoiceTotals(inv.items, inv.taxRate);

  const to = customer.email || '';
  const subject = `Invoice ${inv.number} from ${profile.companyName || profile.userName || 'Zedger'}`;
  const itemLines = inv.items.map((item, i) =>
    `  ${i+1}. ${item.desc} — Qty: ${item.qty} × ${fmt(item.price)} + ${item.tax}% tax`
  ).join('\n');

  const body = `Dear ${customer.contactPerson || customer.companyName || 'Customer'},

Please find below the details for Invoice ${inv.number}.

Invoice Number : ${inv.number}
Invoice Date   : ${fmtDate(inv.date)}
Due Date       : ${inv.dueDate ? fmtDate(inv.dueDate) : 'N/A'}
Status         : ${inv.status.toUpperCase()}

Items:
${itemLines}

Subtotal       : ${fmt(t.subtotal)}
Tax            : ${fmt(t.taxTotal)}
Grand Total    : ${fmt(t.grandTotal)}
${profile.bankName ? `\nPayment Details:\nBank: ${profile.bankName}\nAccount: ${profile.bankAccount || 'N/A'}\nIFSC: ${profile.ifsc || 'N/A'}${profile.upi ? '\nUPI: ' + profile.upi : ''}` : ''}
${inv.notes ? '\nNotes: ' + inv.notes : ''}

Thank you for your business.

Regards,
${profile.userName || profile.companyName || 'Zedger User'}`;

  const mailtoLink = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailtoLink, '_blank');
  toast('Opening email client…', 'info');
}

function markInvoicePaid(id) {
  showConfirm('Mark this invoice as Paid?', async () => {
    // Update cache immediately
    const list = DB.load('invoices');
    const idx = list.findIndex(x => x.id === id);
    if (idx !== -1) list[idx] = { ...list[idx], status: 'paid' };
    CACHE.invoices = list;
    // Targeted single-field update — avoids any schema mismatch with other columns
    const { error } = await supabaseClient.from('invoices').update({ status: 'paid' }).eq('id', id);
    if (error) { console.error('mark paid error:', error); toast('Save error — check console', 'error'); }
    toast('Invoice marked as paid'); renderInvoices();
  }, 'Mark as Paid', 'Mark Paid');
}

function deleteInvoice(id) {
  const inv = DB.load('invoices').find(x => x.id === id);
  showConfirm(`Delete invoice ${inv?.number}? This cannot be undone.`, () => {
    DB.save('invoices', DB.load('invoices').filter(x => x.id !== id));
    toast('Invoice deleted'); renderInvoices();
  });
}

// ============================================================
// RECEIPTS
// ============================================================
let receiptSearch = '';

function renderReceipts() {
  const receipts = DB.load('receipts');
  const invoices = DB.load('invoices');
  const filtered = receipts
    .filter(r => [r.number,r.customer,r.reference||''].join(' ').toLowerCase().includes(receiptSearch.toLowerCase()))
    .sort((a,b) => b.date.localeCompare(a.date));

  const methodLabel = { cash:'Cash', upi:'UPI', bank:'Bank Transfer', card:'Card' };

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Receipts</h2><p>${receipts.length} receipt${receipts.length!==1?'s':''} total</p></div>
      <button class="btn btn-primary" onclick="openReceiptModal()">+ New Receipt</button>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search receipts..." value="${esc(receiptSearch)}" oninput="receiptSearch=this.value;renderReceipts()">
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Receipt #</th><th>Date</th><th>Customer</th>
            <th class="text-right">Amount</th><th>Method</th><th>Reference</th>
            <th>Invoice</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🧾</div><p>No receipts found</p></div></td></tr>` :
              filtered.map(r => {
                const ids = r.invoiceIds || (r.invoiceId ? [r.invoiceId] : []);
                const linkedInvs = ids.map(id => invoices.find(i => i.id === id)).filter(Boolean);
                const invCell = linkedInvs.length
                  ? linkedInvs.map(i => `<span style="color:var(--blue);font-weight:500;margin-right:4px">${esc(i.number)}</span>`).join('')
                  : '<span class="text-muted">—</span>';
                return `<tr>
                  <td style="font-weight:600">${esc(r.number)}</td>
                  <td class="text-muted">${fmtDate(r.date)}</td>
                  <td>${esc(r.customer)}</td>
                  <td class="text-right font-mono text-green" style="font-weight:600">${fmt(r.amount)}</td>
                  <td><span class="badge badge-paid">${methodLabel[r.method]||r.method}</span></td>
                  <td class="font-mono text-sm text-muted">${r.reference?esc(r.reference):'—'}</td>
                  <td>${invCell}</td>
                  <td><div class="td-actions">
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="openReceiptModal('${r.id}')" title="Edit">✎</button>
                    <button class="btn btn-danger btn-sm btn-icon" onclick="deleteReceipt('${r.id}')" title="Delete">🗑</button>
                  </div></td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openReceiptModal(id) {
  const r = id ? DB.load('receipts').find(x => x.id === id) : null;
  const customers = DB.load('customers');
  const allInvs = DB.load('invoices').sort((a,b) => (a.number||'').localeCompare(b.number||'', undefined, { numeric: true }));
  // Support both old single invoiceId and new invoiceIds array
  const linkedIds = new Set(r ? (r.invoiceIds || (r.invoiceId ? [r.invoiceId] : [])) : []);
  const invCheckboxes = allInvs.map(i => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;cursor:pointer;font-weight:normal;margin:0;transition:background 0.15s" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${i.id}" ${linkedIds.has(i.id)?'checked':''} style="width:15px;height:15px;accent-color:var(--blue)">
      <span style="font-weight:600;color:var(--blue)">${esc(i.number)}</span>
      <span class="text-muted">— ${esc(getCustomerName(i.customerId))}</span>
      <span class="badge badge-${i.status}" style="margin-left:auto">${i.status}</span>
    </label>`).join('');

  // Determine if saved customer matches a registered one or is custom
  const registeredNames = customers.map(c => c.companyName||c.contactPerson||c.name||'');
  const isOther = r && r.customer && !registeredNames.includes(r.customer);
  const custOptions = customers.map(c => {
    const name = c.companyName||c.contactPerson||c.name||'';
    const label = c.companyName && c.contactPerson ? `${c.companyName} (${c.contactPerson})` : name;
    return `<option value="${esc(name)}" ${(!isOther && r?.customer===name)?'selected':''}>${esc(label)}</option>`;
  }).join('');

  const nextRecNum = 'REC-' + String((CACHE.counters.receipt||0) + 1).padStart(3,'0');
  openModal(r ? `Edit Receipt ${r.number}` : 'New Receipt', `
    <div class="form-row">
      <div class="form-group"><label>Receipt #</label><input id="rf-number" value="${r?esc(r.number):''}" placeholder="${nextRecNum}"></div>
      <div class="form-group"><label>Date *</label><input type="date" id="rf-date" value="${r?.date||todayStr()}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount Received *</label><input type="number" id="rf-amount" value="${r?.amount||''}" placeholder="0.00" min="0" step="0.01"></div>
    </div>
    <div class="form-group">
      <label>Customer *</label>
      <select id="rf-customer-select" onchange="document.getElementById('rf-customer-other').style.display=this.value==='__other__'?'block':'none'">
        <option value="">— Select customer —</option>
        ${custOptions}
        <option value="__other__" ${isOther?'selected':''}>— Other (not in list) —</option>
      </select>
      <input id="rf-customer-other" style="margin-top:6px;display:${isOther?'block':'none'}" value="${isOther?esc(r.customer):''}" placeholder="Enter customer name">
    </div>
    <div class="form-row">
      <div class="form-group"><label>Payment Method</label>
        <select id="rf-method">${[['cash','Cash'],['upi','UPI'],['bank','Bank Transfer'],['card','Card']].map(([v,l])=>`<option value="${v}" ${r?.method===v?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Reference Number</label><input id="rf-ref" value="${r?esc(r.reference||''):''}" placeholder="UPI/NEFT/Cheque no."></div>
    </div>
    <div class="form-group">
      <label>Linked Invoices (optional — select one or more)</label>
      <div id="rf-invoices" style="max-height:160px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:6px;padding:4px 6px;background:#fff">
        ${allInvs.length ? invCheckboxes : '<p style="color:var(--gray-400);font-size:13px;padding:6px">No invoices found</p>'}
      </div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="rf-notes" rows="2">${r?esc(r.notes||''):''}</textarea></div>
  `, () => {
    const date = document.getElementById('rf-date').value;
    const amount = parseFloat(document.getElementById('rf-amount').value);
    const sel = document.getElementById('rf-customer-select');
    const customer = sel.value === '__other__'
      ? document.getElementById('rf-customer-other').value.trim()
      : sel.value;
    if (!date || !amount || !customer) { toast('Date, amount, and customer are required', 'error'); return; }
    const list = DB.load('receipts');
    const typedNum = document.getElementById('rf-number').value.trim();
    const number = r ? (typedNum || r.number) : (typedNum || DB.nextNumber('receipt'));
    const invoiceIds = Array.from(document.querySelectorAll('#rf-invoices input[type=checkbox]:checked')).map(cb => cb.value);
    const rec = { id: r?r.id:uid(), number, invoiceIds, date, customer, amount, method: document.getElementById('rf-method').value, reference: document.getElementById('rf-ref').value.trim(), notes: document.getElementById('rf-notes').value.trim() };
    if (r) list[list.findIndex(x=>x.id===r.id)] = rec; else list.push(rec);
    DB.save('receipts', list);
    syncReceiptTransaction(rec);
    closeModal(); toast(r?'Receipt updated':'Receipt created'); renderReceipts();
  });
}

function deleteReceipt(id) {
  const r = DB.load('receipts').find(x => x.id === id);
  showConfirm(`Delete receipt ${r?.number}?`, () => {
    DB.save('receipts', DB.load('receipts').filter(x => x.id !== id));
    DB.save('transactions', DB.load('transactions').filter(x => x.receiptId !== id));
    toast('Receipt deleted'); renderReceipts();
  });
}

// ============================================================
// PAYMENTS (payments made to vendors)
// ============================================================
let paymentSearch = '';

function renderPayments() {
  const payments = DB.load('payments');
  const vendors = DB.load('vendors');
  const filtered = payments
    .filter(p => [p.number, p.vendor, p.reference||''].join(' ').toLowerCase().includes(paymentSearch.toLowerCase()))
    .sort((a,b) => b.date.localeCompare(a.date));

  const methodLabel = { cash:'Cash', upi:'UPI', bank:'Bank Transfer', card:'Card' };

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Payments</h2><p>${payments.length} payment${payments.length!==1?'s':''} total</p></div>
      <button class="btn btn-primary" onclick="openPaymentModal()">+ New Payment</button>
    </div>
    <div class="page-body">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search payments..." value="${esc(paymentSearch)}" oninput="paymentSearch=this.value;renderPayments()">
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Payment #</th><th>Date</th><th>Vendor / Payee</th>
            <th class="text-right">Amount</th><th>Method</th><th>Reference</th>
            <th>Category</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">💸</div><p>No payments found</p></div></td></tr>` :
              filtered.map(p => `<tr>
                <td style="font-weight:600">${esc(p.number)}</td>
                <td class="text-muted">${fmtDate(p.date)}</td>
                <td>${esc(p.vendor)}</td>
                <td class="text-right font-mono" style="font-weight:600;color:var(--red)">${fmt(p.amount)}</td>
                <td><span class="badge badge-draft">${methodLabel[p.method]||p.method}</span></td>
                <td class="font-mono text-sm text-muted">${p.reference?esc(p.reference):'—'}</td>
                <td class="text-muted">${p.category?esc(p.category):'—'}</td>
                <td><div class="td-actions">
                  <button class="btn btn-secondary btn-sm btn-icon" onclick="openPaymentModal('${p.id}')" title="Edit">✎</button>
                  <button class="btn btn-danger btn-sm btn-icon" onclick="deletePayment('${p.id}')" title="Delete">🗑</button>
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openPaymentModal(id) {
  const p = id ? DB.load('payments').find(x => x.id === id) : null;
  const vendors = DB.load('vendors');
  const categories = ['Rent','Utilities','Software','Salary','Marketing','Office Supplies','Travel','Taxes','Event','Equipment','Other'];
  const catOptions = categories.map(c => `<option value="${c}" ${p?.category===c?'selected':''}>${c}</option>`).join('');

  // Determine if saved vendor matches a registered one or is custom
  const registeredVendors = vendors.map(v => v.company||v.contact||'');
  const isOther = p && p.vendor && !registeredVendors.includes(p.vendor);
  const vendorOptions = vendors.map(v => {
    const name = v.company||v.contact||'';
    const label = v.company && v.contact ? `${v.company} (${v.contact})` : name;
    return `<option value="${esc(name)}" ${(!isOther && p?.vendor===name)?'selected':''}>${esc(label)}</option>`;
  }).join('');

  const nextPayNum = 'PAY-' + String((CACHE.counters.payment||0) + 1).padStart(3,'0');
  openModal(p ? `Edit Payment ${p.number}` : 'New Payment', `
    <div class="form-row">
      <div class="form-group"><label>Payment #</label><input id="pf-number" value="${p?esc(p.number):''}" placeholder="${nextPayNum}"></div>
      <div class="form-group"><label>Date *</label><input type="date" id="pf-date" value="${p?.date||todayStr()}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Amount Paid *</label><input type="number" id="pf-amount" value="${p?.amount||''}" placeholder="0.00" min="0" step="0.01"></div>
    </div>
    <div class="form-group">
      <label>Vendor / Payee *</label>
      <select id="pf-vendor-select" onchange="document.getElementById('pf-vendor-other').style.display=this.value==='__other__'?'block':'none'">
        <option value="">— Select vendor —</option>
        ${vendorOptions}
        <option value="__other__" ${isOther?'selected':''}>— Other (not in list) —</option>
      </select>
      <input id="pf-vendor-other" style="margin-top:6px;display:${isOther?'block':'none'}" value="${isOther?esc(p.vendor):''}" placeholder="Enter vendor or payee name">
    </div>
    <div class="form-row">
      <div class="form-group"><label>Payment Method</label>
        <select id="pf-method">${[['cash','Cash'],['upi','UPI'],['bank','Bank Transfer'],['card','Card']].map(([v,l])=>`<option value="${v}" ${p?.method===v?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Reference Number</label><input id="pf-ref" value="${p?esc(p.reference||''):''}" placeholder="UPI/NEFT/Cheque no."></div>
    </div>
    <div class="form-group"><label>Category</label>
      <select id="pf-category"><option value="">— Select category —</option>${catOptions}</select>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="pf-notes" rows="2">${p?esc(p.notes||''):''}</textarea></div>
  `, () => {
    const date = document.getElementById('pf-date').value;
    const amount = parseFloat(document.getElementById('pf-amount').value);
    const sel = document.getElementById('pf-vendor-select');
    const vendor = sel.value === '__other__'
      ? document.getElementById('pf-vendor-other').value.trim()
      : sel.value;
    if (!date || !amount || !vendor) { toast('Date, amount, and vendor are required', 'error'); return; }
    const list = DB.load('payments');
    const typedPayNum = document.getElementById('pf-number').value.trim();
    const payNumber = p ? (typedPayNum || p.number) : (typedPayNum || DB.nextNumber('payment'));
    const rec = {
      id: p?p.id:uid(),
      number: payNumber,
      date, vendor, amount,
      method: document.getElementById('pf-method').value,
      reference: document.getElementById('pf-ref').value.trim(),
      category: document.getElementById('pf-category').value,
      notes: document.getElementById('pf-notes').value.trim(),
    };
    if (p) list[list.findIndex(x=>x.id===p.id)] = rec; else list.push(rec);
    DB.save('payments', list);
    syncPaymentTransaction(rec);
    closeModal(); toast(p?'Payment updated':'Payment recorded'); renderPayments();
  });
}

function deletePayment(id) {
  const p = DB.load('payments').find(x => x.id === id);
  showConfirm(`Delete payment ${p?.number}?`, () => {
    DB.save('payments', DB.load('payments').filter(x => x.id !== id));
    DB.save('transactions', DB.load('transactions').filter(x => x.paymentId !== id));
    toast('Payment deleted'); renderPayments();
  });
}

// ============================================================
// RECEIPT / PAYMENT → TRANSACTION AUTO-SYNC
// ============================================================
function syncReceiptTransaction(rec) {
  const txns = DB.load('transactions');
  const existing = txns.findIndex(t => t.receiptId === rec.id);
  const txn = {
    id: existing !== -1 ? txns[existing].id : uid(),
    date: rec.date,
    type: 'income',
    category: 'Receipt',
    amount: rec.amount,
    description: `${rec.number} — ${rec.customer}${rec.reference ? ' (' + rec.reference + ')' : ''}`,
    receiptId: rec.id,
    paymentId: null,
  };
  if (existing !== -1) txns[existing] = txn; else txns.push(txn);
  DB.save('transactions', txns);
}

function syncPaymentTransaction(pay) {
  const txns = DB.load('transactions');
  const existing = txns.findIndex(t => t.paymentId === pay.id);
  const txn = {
    id: existing !== -1 ? txns[existing].id : uid(),
    date: pay.date,
    type: 'expense',
    category: pay.category || 'Payment',
    amount: pay.amount,
    description: `${pay.number} — ${pay.vendor}${pay.reference ? ' (' + pay.reference + ')' : ''}`,
    receiptId: null,
    paymentId: pay.id,
  };
  if (existing !== -1) txns[existing] = txn; else txns.push(txn);
  DB.save('transactions', txns);
}

// ============================================================
// TRANSACTIONS
// ============================================================
let txnFilters = { type: 'all', category: 'all', from: '', to: '' };
let txnSearch = '';
const TXN_CATS = ['Services','Consulting','Software','Hardware','Office Supplies','Utilities','Marketing','Salaries','Rent','Travel','Miscellaneous'];

function renderTransactions() {
  const txns = DB.load('transactions');
  const cats = [...new Set(txns.map(t => t.category))].sort();

  const filtered = txns.filter(t => {
    if (txnFilters.type !== 'all' && t.type !== txnFilters.type) return false;
    if (txnFilters.category !== 'all' && t.category !== txnFilters.category) return false;
    if (txnFilters.from && t.date < txnFilters.from) return false;
    if (txnFilters.to && t.date > txnFilters.to) return false;
    if (txnSearch && ![t.description,t.category,t.type].join(' ').toLowerCase().includes(txnSearch.toLowerCase())) return false;
    return true;
  }).sort((a,b) => b.date.localeCompare(a.date));

  const totalIn = filtered.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalEx = filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Transactions</h2><p>Financial ledger</p></div>
      <button class="btn btn-primary" onclick="openTxnModal()">+ Add Transaction</button>
    </div>
    <div class="page-body">
      <div class="filter-bar">
        <div class="search-box" style="max-width:260px">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search..." value="${esc(txnSearch)}" oninput="txnSearch=this.value;renderTransactions()">
        </div>
        <select onchange="txnFilters.type=this.value;renderTransactions()">
          <option value="all" ${txnFilters.type==='all'?'selected':''}>All Types</option>
          <option value="income" ${txnFilters.type==='income'?'selected':''}>Income</option>
          <option value="expense" ${txnFilters.type==='expense'?'selected':''}>Expense</option>
        </select>
        <select onchange="txnFilters.category=this.value;renderTransactions()">
          <option value="all" ${txnFilters.category==='all'?'selected':''}>All Categories</option>
          ${cats.map(c=>`<option value="${c}" ${txnFilters.category===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
        <input type="date" title="From" value="${txnFilters.from}" onchange="txnFilters.from=this.value;renderTransactions()">
        <input type="date" title="To" value="${txnFilters.to}" onchange="txnFilters.to=this.value;renderTransactions()">
        <button class="btn btn-secondary btn-sm" onclick="txnFilters={type:'all',category:'all',from:'',to:''};txnSearch='';renderTransactions()">Reset</button>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div class="card" style="flex:1;min-width:140px"><div class="card-body" style="padding:14px 18px">
          <div class="text-sm text-muted">Income</div>
          <div style="font-size:20px;font-weight:700;color:var(--green-d);font-variant-numeric:tabular-nums">${fmt(totalIn)}</div>
        </div></div>
        <div class="card" style="flex:1;min-width:140px"><div class="card-body" style="padding:14px 18px">
          <div class="text-sm text-muted">Expenses</div>
          <div style="font-size:20px;font-weight:700;color:var(--red);font-variant-numeric:tabular-nums">${fmt(totalEx)}</div>
        </div></div>
        <div class="card" style="flex:1;min-width:140px"><div class="card-body" style="padding:14px 18px">
          <div class="text-sm text-muted">Net</div>
          <div style="font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;${totalIn-totalEx>=0?'color:var(--green-d)':'color:var(--red)'}">${fmt(totalIn-totalEx)}</div>
        </div></div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Date</th><th>Type</th><th>Category</th>
            <th class="text-right">Amount</th><th>Description</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">↕</div><p>No transactions found</p></div></td></tr>` :
              filtered.map(t => `
              <tr>
                <td class="text-muted">${fmtDate(t.date)}</td>
                <td><span class="badge badge-${t.type}">${t.type.charAt(0).toUpperCase()+t.type.slice(1)}</span></td>
                <td style="color:var(--gray-600)">${esc(t.category)}</td>
                <td class="text-right font-mono" style="font-weight:600;${t.type==='income'?'color:var(--green-d)':'color:var(--red)'}">
                  ${t.type==='income'?'+':'-'}${fmt(t.amount)}
                </td>
                <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.description)}">${esc(t.description)}</td>
                <td><div class="td-actions">
                  <button class="btn btn-secondary btn-sm btn-icon" onclick="openTxnModal('${t.id}')" title="Edit">✎</button>
                  <button class="btn btn-danger btn-sm btn-icon" onclick="deleteTxn('${t.id}')" title="Delete">🗑</button>
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openTxnModal(id) {
  const t = id ? DB.load('transactions').find(x => x.id === id) : null;
  openModal(t ? 'Edit Transaction' : 'Add Transaction', `
    <div class="form-row">
      <div class="form-group"><label>Date *</label><input type="date" id="tf-date" value="${t?.date||todayStr()}"></div>
      <div class="form-group"><label>Type *</label>
        <select id="tf-type">
          <option value="income" ${t?.type==='income'?'selected':''}>Income</option>
          <option value="expense" ${t?.type==='expense'?'selected':''}>Expense</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Category *</label>
        <select id="tf-category">${TXN_CATS.map(c=>`<option ${t?.category===c?'selected':''}>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Amount *</label><input type="number" id="tf-amount" value="${t?.amount||''}" placeholder="0.00" min="0" step="0.01"></div>
    </div>
    <div class="form-group"><label>Description</label><input id="tf-desc" value="${t?esc(t.description):''}" placeholder="Brief description..."></div>
  `, () => {
    const date = document.getElementById('tf-date').value;
    const amount = parseFloat(document.getElementById('tf-amount').value);
    if (!date || !amount) { toast('Date and amount are required', 'error'); return; }
    const list = DB.load('transactions');
    const rec = { id: t?t.id:uid(), date, type: document.getElementById('tf-type').value, category: document.getElementById('tf-category').value, amount, description: document.getElementById('tf-desc').value.trim(), invoiceId: t?.invoiceId||null, receiptId: t?.receiptId||null };
    if (t) list[list.findIndex(x=>x.id===t.id)] = rec; else list.push(rec);
    DB.save('transactions', list);
    closeModal(); toast(t?'Transaction updated':'Transaction added'); renderTransactions();
  });
}

function deleteTxn(id) {
  showConfirm('Delete this transaction? This cannot be undone.', () => {
    DB.save('transactions', DB.load('transactions').filter(x => x.id !== id));
    toast('Transaction deleted'); renderTransactions();
  });
}

// ============================================================
// TAX REPORTS
// ============================================================
let _taxPeriod = 'month';
let _taxYear = new Date().getFullYear();
let _taxMonth = new Date().getMonth() + 1;
let _taxQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
let _taxTab = 'gstr1';

function renderTaxReports() {
  const profile = getProfile();
  const invoices  = DB.load('invoices');
  const payments  = DB.load('payments');
  const receipts  = DB.load('receipts');
  const customers = DB.load('customers');
  const transactions = DB.load('transactions');

  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T00:00:00');
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (_taxPeriod === 'month')   return y === _taxYear && m === _taxMonth;
    if (_taxPeriod === 'quarter') return y === _taxYear && Math.ceil(m / 3) === _taxQuarter;
    return y === _taxYear;
  }

  const pInvs  = invoices.filter(i => inPeriod(i.date));
  const pPays  = payments.filter(p => inPeriod(p.date));
  const pRecs  = receipts.filter(r => inPeriod(r.date));
  const pTxns  = transactions.filter(t => inPeriod(t.date));

  const compState = profile.gstin ? profile.gstin.substring(0, 2) : null;
  function gstSplit(custGstin, taxAmt) {
    const cs = custGstin ? custGstin.substring(0, 2) : null;
    if (compState && cs) {
      return compState === cs
        ? { cgst: taxAmt/2, sgst: taxAmt/2, igst: 0 }
        : { cgst: 0, sgst: 0, igst: taxAmt };
    }
    return { cgst: null, sgst: null, igst: null, raw: taxAmt };
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const periodLabel = _taxPeriod === 'month' ? months[_taxMonth-1]+' '+_taxYear
    : _taxPeriod === 'quarter' ? 'Q'+_taxQuarter+' '+_taxYear : 'Year '+_taxYear;

  const yearOpts  = [2024,2025,2026,2027].map(y => `<option value="${y}" ${y===_taxYear?'selected':''}>${y}</option>`).join('');
  const monthOpts = months.map((m,i) => `<option value="${i+1}" ${(i+1)===_taxMonth?'selected':''}>${m}</option>`).join('');
  const qOpts     = [1,2,3,4].map(q => `<option value="${q}" ${q===_taxQuarter?'selected':''}>Q${q}</option>`).join('');

  // ── Tab: GSTR-1 Sales Register ──────────────────────────────
  let tabContent = '';
  if (_taxTab === 'gstr1') {
    const rows = pInvs.map((inv, i) => {
      const cust = customers.find(c => c.id === inv.customerId) || {};
      const t = calcInvoiceTotals(inv.items, inv.taxRate);
      const sp = gstSplit(cust.gstin, t.taxTotal);
      const splitCells = sp.cgst !== null
        ? `<td class="text-right font-mono">${fmt(sp.cgst)}</td><td class="text-right font-mono">${fmt(sp.sgst)}</td><td class="text-right font-mono">${fmt(sp.igst)}</td>`
        : `<td class="text-right font-mono text-muted" colspan="3">${fmt(sp.raw)} <span style="font-size:10px">(no GSTIN split)</span></td>`;
      return `<tr>
        <td>${i+1}</td>
        <td style="font-weight:600">${esc(inv.number)}</td>
        <td class="text-muted">${fmtDate(inv.date)}</td>
        <td>${esc(cust.companyName||cust.contactPerson||'—')}</td>
        <td class="font-mono text-sm">${cust.gstin?esc(cust.gstin):'<span class="text-muted">—</span>'}</td>
        <td class="text-right font-mono">${fmt(t.subtotal)}</td>
        <td class="text-right">${inv.taxRate||0}%</td>
        ${splitCells}
        <td class="text-right font-mono" style="font-weight:600">${fmt(t.grandTotal)}</td>
        <td><span class="badge badge-${inv.status}">${inv.status}</span></td>
      </tr>`;
    }).join('');
    const totSub = pInvs.reduce((s,inv)=>s+calcInvoiceTotals(inv.items,inv.taxRate).subtotal,0);
    const totTax = pInvs.reduce((s,inv)=>s+calcInvoiceTotals(inv.items,inv.taxRate).taxTotal,0);
    const totGrand = pInvs.reduce((s,inv)=>s+calcInvoiceTotals(inv.items,inv.taxRate).grandTotal,0);
    tabContent = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>#</th><th>Invoice No</th><th>Date</th><th>Customer</th><th>GSTIN</th>
            <th class="text-right">Taxable Value</th><th class="text-right">GST%</th>
            <th class="text-right">CGST</th><th class="text-right">SGST</th><th class="text-right">IGST</th>
            <th class="text-right">Total</th><th>Status</th></tr></thead>
          <tbody>${pInvs.length===0?`<tr><td colspan="12"><div class="empty-state"><div class="empty-icon">📋</div><p>No invoices in this period</p></div></td></tr>`:rows}</tbody>
          ${pInvs.length>0?`<tfoot><tr style="font-weight:700;background:#f8fafc">
            <td colspan="5" style="padding:10px 14px">Total — ${pInvs.length} invoice${pInvs.length!==1?'s':''}</td>
            <td class="text-right font-mono" style="padding:10px 14px">${fmt(totSub)}</td>
            <td></td><td colspan="3" class="text-right font-mono" style="padding:10px 14px">${fmt(totTax)}</td>
            <td class="text-right font-mono" style="padding:10px 14px">${fmt(totGrand)}</td><td></td>
          </tr></tfoot>`:''}
        </table>
      </div>
      <p style="margin-top:10px;font-size:12px;color:var(--gray-400)">ℹ CGST/SGST vs IGST is determined by comparing your company GSTIN state code with the customer GSTIN. Fill in GSTINs in Company Profile and Customer records for the split to appear.</p>`;
  }

  // ── Tab: GSTR-3B Summary ─────────────────────────────────────
  else if (_taxTab === 'gstr3b') {
    const outputTax   = pInvs.reduce((s,inv)=>s+calcInvoiceTotals(inv.items,inv.taxRate).taxTotal,0);
    const totalSales  = pInvs.reduce((s,inv)=>s+calcInvoiceTotals(inv.items,inv.taxRate).grandTotal,0);
    const totalPurchases = pPays.reduce((s,p)=>s+p.amount,0);
    tabContent = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#16a34a;margin-bottom:10px">3.1 — Output Tax Liability</div>
          <div style="font-size:13px;margin-bottom:6px">Total Taxable Sales: <strong>${fmt(pInvs.reduce((s,inv)=>s+calcInvoiceTotals(inv.items,inv.taxRate).subtotal,0))}</strong></div>
          <div style="font-size:13px;margin-bottom:6px">Total GST Collected: <strong>${fmt(outputTax)}</strong></div>
          <div style="font-size:13px">Invoices: <strong>${pInvs.length}</strong></div>
        </div>
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:20px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#d97706;margin-bottom:10px">4 — Input Tax Credit (ITC)</div>
          <div style="font-size:13px;margin-bottom:8px">Total Purchases: <strong>${fmt(totalPurchases)}</strong></div>
          <div style="font-size:12px;color:#92400e">⚠ GST paid on purchases is not tracked. Enter ITC manually from your purchase invoices/bills.</div>
        </div>
      </div>
      <div style="background:#1b2d45;color:white;border-radius:8px;padding:20px;margin-bottom:20px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;margin-bottom:8px">Net Tax Payable (before ITC deduction)</div>
        <div style="font-size:32px;font-weight:800">${fmt(outputTax)}</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:4px">Subtract your eligible ITC to arrive at the final amount payable to the government.</div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="text-right">Taxable</th><th class="text-right">GST%</th><th class="text-right">GST Amount</th></tr></thead>
          <tbody>${pInvs.length===0?`<tr><td colspan="6"><div class="empty-state"><p>No invoices in this period</p></div></td></tr>`:
            pInvs.map(inv=>{const c=customers.find(x=>x.id===inv.customerId)||{};const t=calcInvoiceTotals(inv.items,inv.taxRate);
              return `<tr><td style="font-weight:600">${esc(inv.number)}</td><td class="text-muted">${fmtDate(inv.date)}</td>
                <td>${esc(c.companyName||c.contactPerson||'—')}</td>
                <td class="text-right font-mono">${fmt(t.subtotal)}</td><td class="text-right">${inv.taxRate||0}%</td>
                <td class="text-right font-mono" style="font-weight:600">${fmt(t.taxTotal)}</td></tr>`;}).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Tab: P&L Statement ───────────────────────────────────────
  else if (_taxTab === 'pl') {
    const revenue   = pInvs.filter(i=>i.status!=='draft').reduce((s,inv)=>s+calcInvoiceTotals(inv.items,inv.taxRate).grandTotal,0);
    const cashIn    = pRecs.reduce((s,r)=>s+r.amount,0);
    const expByCat  = {};
    pPays.forEach(p=>{ const c=p.category||'Other'; expByCat[c]=(expByCat[c]||0)+p.amount; });
    pTxns.filter(t=>t.type==='expense'&&!t.paymentId).forEach(t=>{ const c=t.category||'Other'; expByCat[c]=(expByCat[c]||0)+t.amount; });
    const totalExp  = Object.values(expByCat).reduce((s,v)=>s+v,0);
    const netProfit = revenue - totalExp;
    tabContent = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div style="border:1px solid var(--gray-200);border-radius:8px;padding:20px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--gray-100)">INCOME</div>
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gray-100)">
            <span>Revenue from Invoices</span><span class="font-mono" style="font-weight:600;color:var(--green)">${fmt(revenue)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 0;color:var(--gray-400);font-size:12px">
            <span>Cash Received (Receipts)</span><span class="font-mono">${fmt(cashIn)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;margin-top:6px;font-weight:700;border-top:2px solid var(--gray-200)">
            <span>Total Income</span><span class="font-mono" style="color:var(--green)">${fmt(revenue)}</span>
          </div>
        </div>
        <div style="border:1px solid var(--gray-200);border-radius:8px;padding:20px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--gray-100)">EXPENSES</div>
          ${Object.entries(expByCat).length===0?'<div style="color:var(--gray-400);font-size:13px;padding:8px 0">No expenses in this period</div>':
            Object.entries(expByCat).map(([cat,amt])=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gray-100)"><span>${esc(cat)}</span><span class="font-mono" style="color:var(--red)">${fmt(amt)}</span></div>`).join('')}
          <div style="display:flex;justify-content:space-between;padding:10px 0;margin-top:6px;font-weight:700;border-top:2px solid var(--gray-200)">
            <span>Total Expenses</span><span class="font-mono" style="color:var(--red)">${fmt(totalExp)}</span>
          </div>
        </div>
      </div>
      <div style="background:${netProfit>=0?'#f0fdf4':'#fef2f2'};border:2px solid ${netProfit>=0?'#86efac':'#fca5a5'};border-radius:8px;padding:20px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${netProfit>=0?'#16a34a':'#dc2626'}">Net ${netProfit>=0?'Profit':'Loss'} — ${periodLabel}</div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:3px">Revenue − Total Expenses</div>
        </div>
        <div style="font-size:30px;font-weight:800;color:${netProfit>=0?'#16a34a':'#dc2626'}">${fmt(Math.abs(netProfit))}</div>
      </div>
      <p style="margin-top:10px;font-size:12px;color:var(--gray-400)">ℹ Revenue is from non-draft invoices (accrual basis). Expenses sourced from Payments + standalone expense transactions.</p>`;
  }

  // ── Tab: TDS Reference ───────────────────────────────────────
  else if (_taxTab === 'tds') {
    const highPays = pPays.filter(p=>p.amount>=30000);
    tabContent = `
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#92400e">
        <strong>⚠ TDS fields not yet tracked.</strong> The table below flags payments above ₹30,000 that <em>may</em> attract TDS. Maintain a separate TDS register with: TAN, deductee PAN, section (194C/194J etc.), amount paid, TDS deducted, and challan details.
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Payment #</th><th>Date</th><th>Vendor / Payee</th><th>Category</th><th class="text-right">Amount</th><th>Reference</th></tr></thead>
          <tbody>${highPays.length===0
            ?`<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">✅</div><p>No payments above ₹30,000 in this period</p></div></td></tr>`
            :highPays.map(p=>`<tr>
              <td style="font-weight:600">${esc(p.number)}</td>
              <td class="text-muted">${fmtDate(p.date)}</td>
              <td>${esc(p.vendor)}</td>
              <td>${esc(p.category||'—')}</td>
              <td class="text-right font-mono" style="font-weight:600;color:var(--red)">${fmt(p.amount)}</td>
              <td class="font-mono text-sm text-muted">${p.reference?esc(p.reference):'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  const exportBtn = _taxTab==='gstr1'?`<button class="btn btn-secondary" onclick="exportTaxCSV('gstr1')">⬇ Export CSV</button>`
    :_taxTab==='pl'?`<button class="btn btn-secondary" onclick="exportTaxCSV('pl')">⬇ Export CSV</button>`:'';

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Tax Reports</h2><p>${periodLabel}</p></div>
      <div style="display:flex;gap:8px">${exportBtn}</div>
    </div>
    <div class="page-body">
      <div class="toolbar" style="flex-wrap:wrap;gap:8px;margin-bottom:16px">
        <select style="padding:8px 12px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:13px;background:var(--white);font-family:inherit"
          onchange="_taxPeriod=this.value;document.getElementById('tx-m').style.display=this.value==='month'?'':'none';document.getElementById('tx-q').style.display=this.value==='quarter'?'':'none';renderTaxReports()">
          <option value="month" ${_taxPeriod==='month'?'selected':''}>Monthly</option>
          <option value="quarter" ${_taxPeriod==='quarter'?'selected':''}>Quarterly</option>
          <option value="year" ${_taxPeriod==='year'?'selected':''}>Annual</option>
        </select>
        <select style="padding:8px 12px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:13px;background:var(--white);font-family:inherit" onchange="_taxYear=parseInt(this.value);renderTaxReports()">${yearOpts}</select>
        <select id="tx-m" style="padding:8px 12px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:13px;background:var(--white);font-family:inherit;display:${_taxPeriod==='month'?'':'none'}" onchange="_taxMonth=parseInt(this.value);renderTaxReports()">${monthOpts}</select>
        <select id="tx-q" style="padding:8px 12px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:13px;background:var(--white);font-family:inherit;display:${_taxPeriod==='quarter'?'':'none'}" onchange="_taxQuarter=parseInt(this.value);renderTaxReports()">${qOpts}</select>
      </div>
      <div style="display:flex;gap:0;border-bottom:2px solid var(--gray-200);margin-bottom:20px;overflow-x:auto">
        ${[['gstr1','GSTR-1 Sales Register'],['gstr3b','GSTR-3B Summary'],['pl','P&L Statement'],['tds','TDS Reference']].map(([k,l])=>
          `<div onclick="_taxTab='${k}';renderTaxReports()" style="padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;border-bottom:2px solid ${_taxTab===k?'var(--blue)':'transparent'};margin-bottom:-2px;color:${_taxTab===k?'var(--blue)':'var(--gray-500)'}">${l}</div>`
        ).join('')}
      </div>
      ${tabContent}
    </div>`;
}

function exportTaxCSV(type) {
  const invoices  = DB.load('invoices');
  const payments  = DB.load('payments');
  const receipts  = DB.load('receipts');
  const customers = DB.load('customers');
  const transactions = DB.load('transactions');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function inPeriod(d) {
    if (!d) return false;
    const dt = new Date(d+'T00:00:00'), y=dt.getFullYear(), m=dt.getMonth()+1;
    if (_taxPeriod==='month') return y===_taxYear && m===_taxMonth;
    if (_taxPeriod==='quarter') return y===_taxYear && Math.ceil(m/3)===_taxQuarter;
    return y===_taxYear;
  }

  let rows = [], filename = '';
  if (type === 'gstr1') {
    filename = `GSTR1_Sales_Register_${_taxYear}_${_taxPeriod==='month'?months[_taxMonth-1]:'Q'+_taxQuarter}.csv`;
    rows.push(['Invoice No','Date','Customer Name','Customer GSTIN','Taxable Value','GST Rate%','CGST','SGST','IGST','Invoice Total','Status']);
    const profile = getProfile();
    const compState = profile.gstin ? profile.gstin.substring(0,2) : null;
    invoices.filter(i=>inPeriod(i.date)).forEach(inv=>{
      const c = customers.find(x=>x.id===inv.customerId)||{};
      const t = calcInvoiceTotals(inv.items,inv.taxRate);
      const cs = c.gstin?c.gstin.substring(0,2):null;
      let cgst='',sgst='',igst='';
      if (compState&&cs) { if(compState===cs){cgst=t.taxTotal/2;sgst=t.taxTotal/2;igst=0;}else{cgst=0;sgst=0;igst=t.taxTotal;} }
      rows.push([inv.number,inv.date,c.companyName||c.contactPerson||'',c.gstin||'',t.subtotal,inv.taxRate||0,cgst,sgst,igst,t.grandTotal,inv.status]);
    });
  } else if (type === 'pl') {
    filename = `PL_Statement_${_taxYear}_${_taxPeriod==='month'?months[_taxMonth-1]:'Q'+_taxQuarter}.csv`;
    rows.push(['Type','Category/Description','Amount']);
    invoices.filter(i=>inPeriod(i.date)&&i.status!=='draft').forEach(inv=>{
      const c=customers.find(x=>x.id===inv.customerId)||{};
      rows.push(['Income','Invoice '+inv.number+' — '+(c.companyName||c.contactPerson||''),calcInvoiceTotals(inv.items,inv.taxRate).grandTotal]);
    });
    payments.filter(p=>inPeriod(p.date)).forEach(p=>rows.push(['Expense',p.category||'Other',p.amount]));
    transactions.filter(t=>inPeriod(t.date)&&t.type==='expense'&&!t.paymentId).forEach(t=>rows.push(['Expense',t.category||'Other',t.amount]));
  }

  const csv = rows.map(r=>r.map(v=>'"'+(String(v||'').replace(/"/g,'""'))+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

// ============================================================
// REPORTS
// ============================================================
function renderReports() {
  const txns = DB.load('transactions');
  const invoices = DB.load('invoices');

  // P&L
  const income = txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expenses = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const net = income - expenses;

  // Category breakdown
  const catMap = {};
  txns.forEach(t => {
    if (!catMap[t.category]) catMap[t.category] = { income: 0, expense: 0 };
    catMap[t.category][t.type] += t.amount;
  });

  // Aging buckets
  const unpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
  const buckets = [
    { label: 'Current', min: -Infinity, max: 0, count: 0, amount: 0, color: 'var(--emerald)' },
    { label: '1–30 Days', min: 1, max: 30, count: 0, amount: 0, color: 'var(--amber)' },
    { label: '31–60 Days', min: 31, max: 60, count: 0, amount: 0, color: '#f97316' },
    { label: '60+ Days', min: 61, max: Infinity, count: 0, amount: 0, color: 'var(--red)' },
  ];
  unpaid.forEach(inv => {
    const days = daysDiff(inv.dueDate);
    const tot = calcInvoiceTotals(inv.items, inv.taxRate).grandTotal;
    const b = buckets.find(b => days >= b.min && days <= b.max);
    if (b) { b.count++; b.amount += tot; }
  });

  // Outstanding detail
  const unpaidSorted = [...unpaid].sort((a,b) => daysDiff(b.dueDate) - daysDiff(a.dueDate));

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Reports</h2><p>Financial insights & analytics</p></div>
      <button class="btn btn-secondary" onclick="exportTxnCSV()">⬇ Export CSV</button>
    </div>
    <div class="page-body">

      <div class="two-col-grid" style="margin-bottom:24px">
        <!-- P&L Card -->
        <div class="pl-card">
          <h3 style="margin-bottom:16px;font-size:15px;font-weight:700;color:var(--gray-800)">Profit &amp; Loss Summary</h3>
          <div class="pl-row"><span>Total Revenue</span><span class="pl-income font-mono">${fmt(income)}</span></div>
          <div class="pl-row"><span>Total Expenses</span><span class="pl-expense font-mono">${fmt(expenses)}</span></div>
          <div class="pl-row total">
            <span>Net ${net>=0?'Profit':'Loss'}</span>
            <span class="${net>=0?'pl-profit':'pl-loss'} font-mono">${fmt(Math.abs(net))}</span>
          </div>
          <div class="divider"></div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--gray-500);margin-bottom:8px">By Category</div>
          ${Object.entries(catMap).map(([cat, v]) => `
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--gray-100)">
              <span style="color:var(--gray-700)">${esc(cat)}</span>
              <span class="font-mono" style="font-size:12px">
                ${v.income?`<span style="color:var(--green-d)">+${fmt(v.income)}</span>`:''}
                ${v.income&&v.expense?' ':''}
                ${v.expense?`<span style="color:var(--red)">-${fmt(v.expense)}</span>`:''}
              </span>
            </div>`).join('')}
        </div>

        <!-- Aging Cards -->
        <div>
          <div style="margin-bottom:14px">
            <h3 style="font-size:15px;font-weight:700;color:var(--gray-800)">Invoice Aging</h3>
            <p class="text-sm text-muted" style="margin-top:3px">${unpaid.length} outstanding invoice${unpaid.length!==1?'s':''}</p>
          </div>
          <div class="aging-grid">
            ${buckets.map(b => `
              <div class="aging-card" style="border-top:3px solid ${b.color}">
                <div class="aging-label">${b.label}</div>
                <div class="aging-count" style="color:${b.color}">${b.count}</div>
                <div class="aging-amount font-mono">${fmt(b.amount)}</div>
              </div>`).join('')}
          </div>
          ${unpaid.length > 0 ? `
          <div class="table-wrapper" style="margin-top:0">
            <table>
              <thead><tr>
                <th>Invoice</th><th>Customer</th><th>Due</th>
                <th>Overdue</th><th class="text-right">Amount</th>
              </tr></thead>
              <tbody>
                ${unpaidSorted.map(inv => {
                  const days = daysDiff(inv.dueDate);
                  const tot = calcInvoiceTotals(inv.items, inv.taxRate).grandTotal;
                  return `<tr>
                    <td style="font-weight:600">${esc(inv.number)}</td>
                    <td>${esc(getCustomerName(inv.customerId))}</td>
                    <td class="text-muted text-sm">${fmtDate(inv.dueDate)}</td>
                    <td class="${days>0?'text-red':'text-green'} text-sm">${days>0?days+' days':'Current'}</td>
                    <td class="text-right font-mono" style="font-weight:600">${fmt(tot)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}
        </div>
      </div>

      <!-- Chart -->
      <div class="card">
        <div class="card-header"><h3>Monthly Income vs Expenses — Last 6 Months</h3></div>
        <div class="card-body">
          <canvas id="monthly-chart" height="220" style="width:100%"></canvas>
          <div class="chart-legend">
            <div class="legend-item"><div class="legend-dot" style="background:var(--emerald)"></div> Income</div>

            <div class="legend-item"><div class="legend-dot" style="background:#f87171"></div> Expenses</div>
          </div>
        </div>
      </div>

    </div>`;

  // Draw chart after DOM is ready
  requestAnimationFrame(() => drawMonthlyChart(txns));
}

function drawMonthlyChart(txns) {
  const canvas = document.getElementById('monthly-chart');
  if (!canvas) return;

  // Build 6-month buckets
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      income: 0, expense: 0
    });
  }
  txns.forEach(t => {
    const m = months.find(x => x.key === t.date.slice(0,7));
    if (m) t.type === 'income' ? (m.income += t.amount) : (m.expense += t.amount);
  });

  const dpr = window.devicePixelRatio || 1;
  const container = canvas.parentElement;
  const W = container.clientWidth - 2;
  const H = 240;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad = { top: 24, right: 16, bottom: 44, left: 64 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const maxVal = Math.max(...months.map(m => Math.max(m.income, m.expense)), 1);
  const niceMax = Math.ceil(maxVal / 5000) * 5000 || 10000;
  const steps = 5;

  ctx.clearRect(0, 0, W, H);

  // Gridlines + Y axis labels
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${11 * (W < 400 ? 0.85 : 1)}px -apple-system,sans-serif`;
  ctx.textAlign = 'right';
  for (let i = 0; i <= steps; i++) {
    const y = pad.top + cH - (i / steps) * cH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    const val = niceMax * i / steps;
    ctx.fillText(val >= 1000 ? (val/1000).toFixed(0)+'k' : val, pad.left - 8, y + 4);
  }

  // Bars
  const groupW = cW / months.length;
  const barW = Math.min(groupW * 0.34, 26);
  months.forEach((m, i) => {
    const cx = pad.left + (i + 0.5) * groupW;
    // Income
    const iH = Math.max((m.income / niceMax) * cH, m.income > 0 ? 2 : 0);
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - barW - 2, pad.top + cH - iH, barW, iH, [3,3,0,0]);
    else ctx.rect(cx - barW - 2, pad.top + cH - iH, barW, iH);
    ctx.fill();
    // Expense
    const eH = Math.max((m.expense / niceMax) * cH, m.expense > 0 ? 2 : 0);
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx + 2, pad.top + cH - eH, barW, eH, [3,3,0,0]);
    else ctx.rect(cx + 2, pad.top + cH - eH, barW, eH);
    ctx.fill();
    // X label
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, cx, H - 10);
  });

  // Axes
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + cH);
  ctx.lineTo(pad.left + cW, pad.top + cH);
  ctx.stroke();
}

// ============================================================
// PROFILE
// ============================================================
function getProfile() {
  return DB.loadObj('profile');
}

function buildFromBlock() {
  const p = getProfile();
  if (!p.companyName && !p.userName) {
    return `<strong>Your Business</strong><p>Set up your company profile to personalise invoices.</p>`;
  }
  const logo = p.logo ? `<img src="${p.logo}" style="max-width:100px;max-height:50px;object-fit:contain;display:block;margin-bottom:6px;border-radius:4px">` : '';
  const lines = [
    p.companyName ? `<strong>${esc(p.companyName)}</strong>` : '',
    p.userName ? `<p>${esc(p.userName)}</p>` : '',
    p.email ? `<p>${esc(p.email)}</p>` : '',
    p.phone ? `<p>${esc(p.phone)}</p>` : '',
    p.gstin ? `<p>GSTIN: ${esc(p.gstin)}</p>` : '',
  ].filter(Boolean).join('');
  return logo + lines;
}

function updateSidebarFooter() {
  const p = getProfile();
  const el = document.getElementById('sidebar-footer-text');
  if (el) el.textContent = p.companyName ? p.companyName : 'Zedger v1.0 — Data stored locally';
}

function renderProfile() {
  const p = getProfile();
  const logoHTML = p.logo
    ? `<img src="${p.logo}" class="logo-preview" alt="Company Logo">
       <button class="logo-remove-btn" onclick="removeLogo()" title="Remove logo">✕</button>`
    : `<div class="logo-placeholder">🏛</div>`;

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div><h2>Company Profile</h2><p>Your business identity &amp; bank details</p></div>
      <button class="btn btn-primary" onclick="saveProfile()">💾 Save Profile</button>
    </div>
    <div class="page-body">
      <div class="profile-grid">

        <!-- Left: Logo Card -->
        <div>
          <div class="card">
            <div class="card-header"><h3>Company Logo</h3></div>
            <div class="card-body">
              <div class="logo-upload-area ${p.logo ? 'has-logo' : ''}" id="logo-drop-area" onclick="document.getElementById('logo-file-input').click()">
                ${logoHTML}
                ${!p.logo ? `<div class="logo-upload-label">Click to upload logo</div>
                <div class="logo-upload-hint">PNG, JPG, SVG — max 2 MB</div>` : `<div class="logo-upload-label" style="font-size:11px;color:var(--gray-400)">Click to change</div>`}
              </div>
              <input type="file" id="logo-file-input" accept="image/*" style="display:none" onchange="handleLogoUpload(event)">
            </div>
          </div>

          <!-- Bank Preview Card (live) -->
          <div id="bank-preview-wrap">
            ${buildBankPreview(p)}
          </div>
        </div>

        <!-- Right: Details Form -->
        <div class="card">
          <div class="card-body">

            <div class="profile-section-title">Business Information</div>
            <div class="form-row">
              <div class="form-group">
                <label>Company Name</label>
                <input id="pf-company" value="${esc(p.companyName||'')}" placeholder="Zedger Solutions Pvt Ltd" oninput="liveUpdateBankPreview()">
              </div>
              <div class="form-group">
                <label>Your Name</label>
                <input id="pf-name" value="${esc(p.userName||'')}" placeholder="Rohan Verma">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Email Address</label>
                <input id="pf-email" type="email" value="${esc(p.email||'')}" placeholder="hello@company.com">
              </div>
              <div class="form-group">
                <label>Phone Number</label>
                <input id="pf-phone" value="${esc(p.phone||'')}" placeholder="+91 98200 00000">
              </div>
            </div>
            <div class="form-group">
              <label>Business Address</label>
              <textarea id="pf-address" rows="2" placeholder="Street, City, State — PIN">${esc(p.address||'')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>GSTIN (optional)</label>
                <input id="pf-gstin" value="${esc(p.gstin||'')}" placeholder="22AAAAA0000A1Z5">
              </div>
              <div class="form-group">
                <label>Industry / Business Type</label>
                <input id="pf-industry" value="${esc(p.industry||'')}" placeholder="Software / Consulting">
              </div>
            </div>
            <div class="form-group">
              <label>Website</label>
              <input id="pf-website" value="${esc(p.website||'')}" placeholder="https://www.yourcompany.com">
            </div>

            <div class="profile-section-title">Bank Account Details</div>
            <div class="form-row">
              <div class="form-group">
                <label>Bank Name</label>
                <input id="pf-bank-name" value="${esc(p.bankName||'')}" placeholder="HDFC Bank" oninput="liveUpdateBankPreview()">
              </div>
              <div class="form-group">
                <label>Account Holder Name</label>
                <input id="pf-bank-holder" value="${esc(p.bankHolder||'')}" placeholder="Zedger Solutions Pvt Ltd">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Account Number</label>
                <input id="pf-bank-acct" value="${esc(p.bankAccount||'')}" placeholder="XXXX XXXX XXXX XXXX" oninput="liveUpdateBankPreview()">
              </div>
              <div class="form-group">
                <label>Confirm Account Number</label>
                <input id="pf-bank-acct2" type="password" value="${esc(p.bankAccount||'')}" placeholder="Re-enter account number">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>IFSC Code</label>
                <input id="pf-ifsc" value="${esc(p.ifsc||'')}" placeholder="HDFC0001234" oninput="liveUpdateBankPreview()">
              </div>
              <div class="form-group">
                <label>Account Type</label>
                <select id="pf-acct-type">
                  ${['Current','Savings','Overdraft'].map(t=>`<option ${p.accountType===t?'selected':''}>${t}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Branch Name</label>
                <input id="pf-branch" value="${esc(p.branch||'')}" placeholder="Bandra West, Mumbai" oninput="liveUpdateBankPreview()">
              </div>
              <div class="form-group">
                <label>UPI ID (optional)</label>
                <input id="pf-upi" value="${esc(p.upi||'')}" placeholder="company@hdfcbank">
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>`;
}

function buildBankPreview(p) {
  if (!p.bankName && !p.bankAccount) {
    return `<div style="margin-top:16px;padding:16px;background:var(--gray-100);border-radius:10px;text-align:center;color:var(--gray-400);font-size:13px">
      Fill in bank details to see a preview
    </div>`;
  }
  const masked = p.bankAccount ? '•••• •••• ' + String(p.bankAccount).slice(-4) : '•••• •••• ••••';
  return `<div class="bank-preview-card">
    <div class="bp-label">Bank</div>
    <div class="bp-bank">${esc(p.bankName||'Your Bank')}</div>
    <div class="bp-acct">${masked}</div>
    <div class="bp-meta">
      <div class="bp-meta-item"><div class="bm-key">IFSC</div><div class="bm-val">${esc(p.ifsc||'—')}</div></div>
      <div class="bp-meta-item"><div class="bm-key">Branch</div><div class="bm-val">${esc(p.branch||'—')}</div></div>
      <div class="bp-meta-item"><div class="bm-key">Type</div><div class="bm-val">${esc(p.accountType||'Current')}</div></div>
    </div>
  </div>`;
}

function liveUpdateBankPreview() {
  const wrap = document.getElementById('bank-preview-wrap');
  if (!wrap) return;
  const partial = {
    bankName: document.getElementById('pf-bank-name')?.value || '',
    bankAccount: document.getElementById('pf-bank-acct')?.value || '',
    ifsc: document.getElementById('pf-ifsc')?.value || '',
    branch: document.getElementById('pf-branch')?.value || '',
    accountType: document.getElementById('pf-acct-type')?.value || 'Current',
  };
  wrap.innerHTML = buildBankPreview(partial);
}

function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Logo must be under 2 MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const p = getProfile();
    p.logo = e.target.result;
    DB.saveObj('profile', p);
    toast('Logo uploaded');
    renderProfile();
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  const p = getProfile();
  delete p.logo;
  DB.saveObj('profile', p);
  toast('Logo removed');
  renderProfile();
}

function saveProfile() {
  const acct = document.getElementById('pf-bank-acct').value.trim();
  const acct2 = document.getElementById('pf-bank-acct2').value.trim();
  if (acct && acct2 && acct !== acct2) { toast('Account numbers do not match', 'error'); return; }

  const existing = getProfile();
  const p = {
    ...existing,
    companyName: document.getElementById('pf-company').value.trim(),
    userName: document.getElementById('pf-name').value.trim(),
    email: document.getElementById('pf-email').value.trim(),
    phone: document.getElementById('pf-phone').value.trim(),
    address: document.getElementById('pf-address').value.trim(),
    gstin: document.getElementById('pf-gstin').value.trim(),
    industry: document.getElementById('pf-industry').value.trim(),
    website: document.getElementById('pf-website').value.trim(),
    bankName: document.getElementById('pf-bank-name').value.trim(),
    bankHolder: document.getElementById('pf-bank-holder').value.trim(),
    bankAccount: acct,
    ifsc: document.getElementById('pf-ifsc').value.trim().toUpperCase(),
    accountType: document.getElementById('pf-acct-type').value,
    branch: document.getElementById('pf-branch').value.trim(),
    upi: document.getElementById('pf-upi').value.trim(),
  };
  DB.saveObj('profile', p);
  updateSidebarFooter();
  toast('Company profile saved successfully');
}

// ============================================================
// CSV EXPORT
// ============================================================
function exportTxnCSV() {
  const txns = DB.load('transactions').sort((a,b) => b.date.localeCompare(a.date));
  const rows = [
    ['Date', 'Type', 'Category', 'Amount', 'Description'],
    ...txns.map(t => [t.date, t.type, t.category, t.amount, t.description])
  ];
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'zedger-transactions.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported successfully');
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); }
});

// ============================================================
// INIT
// ============================================================
async function initApp() {
  // Check if user is authenticated
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    document.getElementById('auth-screen').style.display = 'flex';
    return;
  }
  // Show logged-in user email in sidebar
  const emailEl = document.getElementById('auth-user-email');
  if (emailEl) emailEl.textContent = session.user.email;

  document.getElementById('content').innerHTML = '';

  const [cust, vend, inv, rec, pay, txns, setts] = await Promise.all([
    supabaseClient.from('customers').select('*'),
    supabaseClient.from('vendors').select('*'),
    supabaseClient.from('invoices').select('*'),
    supabaseClient.from('receipts').select('*'),
    supabaseClient.from('payments').select('*'),
    supabaseClient.from('transactions').select('*'),
    supabaseClient.from('settings').select('*'),
  ]);

  CACHE.customers    = cust.data  || [];
  CACHE.vendors      = vend.data  || [];
  CACHE.invoices     = inv.data   || [];
  CACHE.receipts     = rec.data   || [];
  CACHE.payments     = pay.data   || [];
  CACHE.transactions = txns.data  || [];

  const sm = Object.fromEntries((setts.data || []).map(s => [s.key, s.value]));
  CACHE.profile  = sm.profile  || {};
  CACHE.counters = sm.counters || { invoice: 0, receipt: 0, payment: 0 };

  await loadSampleData();
  updateSidebarFooter();
  navigate('dashboard');
}

initApp();
