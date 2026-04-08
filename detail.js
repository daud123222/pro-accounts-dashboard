(function () {
    'use strict';

    const ACCOUNT_SPECIFIC_COLS = [
        'Profit Above Buffer', 'Total Paid', 'Payout Count', 'Avg. Payout'
    ];
    const USER_PROFILE_COLS = [
        'User Total Paid', 'User Times Paid', 'User Payout Ratio', 'User Avg. Payout'
    ];

    function parseNumericValue(val) {
        if (val === undefined || val === null) return null;
        const cleaned = val.toString().replace(/[$,%]/g, '').replace(/,/g, '').trim();
        if (cleaned === '' || cleaned === '--' || cleaned === 'undefined') return null;
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    function fmt(num) {
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function init() {
        const params = new URLSearchParams(window.location.search);
        const accountName = params.get('account');

        if (!accountName) {
            showError('No account specified');
            return;
        }

        const stored = sessionStorage.getItem('dashboardData');
        if (!stored) {
            showError('No data loaded. Please go back and upload a CSV first.');
            return;
        }

        const allData = JSON.parse(stored);
        const account = allData.find(r => r['Account Name'] === accountName);
        if (!account) {
            showError(`Account "${accountName}" not found`);
            return;
        }

        const traderName = (account['Name'] || '').trim().toLowerCase();
        const otherAccounts = allData.filter(r =>
            (r['Name'] || '').trim().toLowerCase() === traderName && r['Account Name'] !== accountName
        );

        document.getElementById('pageTitle').textContent = account['Account Name'];
        document.title = `${account['Name']} — ${account['Account Name']}`;

        renderPage(account, otherAccounts, allData);
    }

    function renderPage(account, otherAccounts, allData) {
        const content = document.getElementById('detailContent');
        content.innerHTML = '';

        const totalPaid = parseNumericValue(account['Total Paid']) || 0;
        const profitAbove = parseNumericValue(account['Profit Above Buffer']) || 0;
        const combined = totalPaid + profitAbove;

        // Profile Header
        const initials = (account['Name'] || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const profileHTML = `
            <div class="profile-header">
                <div class="profile-avatar">${initials}</div>
                <div class="profile-info">
                    <h2>${account['Name'] || 'Unknown'}</h2>
                    <div class="profile-account">${account['Account Name'] || ''}</div>
                    <div class="profile-meta">
                        <span class="profile-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Created: ${account['Created'] ? account['Created'].split('T')[0] : 'N/A'}
                        </span>
                        <span class="profile-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            ${account['Broker'] || 'N/A'}
                        </span>
                        <span class="profile-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            ${account['Status'] || 'N/A'}
                        </span>
                        <span class="profile-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            ${otherAccounts.length + 1} account${otherAccounts.length + 1 > 1 ? 's' : ''} in report
                        </span>
                    </div>
                </div>
            </div>
        `;
        content.insertAdjacentHTML('beforeend', profileHTML);

        // This Account Stats Cards
        content.insertAdjacentHTML('beforeend', `
            <div class="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                This Account Stats
            </div>
        `);

        const cardsHTML = `
            <div class="detail-cards">
                <div class="detail-card highlight-green">
                    <div class="dc-label">Total Paid + Profit</div>
                    <div class="dc-value">${fmt(combined)}</div>
                </div>
                <div class="detail-card highlight-green">
                    <div class="dc-label">Profit Above Buffer</div>
                    <div class="dc-value">${account['Profit Above Buffer'] || '$0'}</div>
                </div>
                <div class="detail-card highlight-accent">
                    <div class="dc-label">Total Paid</div>
                    <div class="dc-value">${account['Total Paid'] || '$0'}</div>
                </div>
                <div class="detail-card">
                    <div class="dc-label">Payout Count</div>
                    <div class="dc-value">${account['Payout Count'] || '0'}</div>
                </div>
                <div class="detail-card">
                    <div class="dc-label">Avg. Payout</div>
                    <div class="dc-value">${account['Avg. Payout'] || '$0'}</div>
                </div>
                <div class="detail-card">
                    <div class="dc-label">Balance</div>
                    <div class="dc-value">${account['Balance'] || '$0'}</div>
                </div>
                <div class="detail-card">
                    <div class="dc-label">PnL</div>
                    <div class="dc-value">${account['PnL'] || '$0'}</div>
                </div>
                <div class="detail-card">
                    <div class="dc-label">Next W/D Date</div>
                    <div class="dc-value" style="font-size:18px">${account['Next W/D Date'] || 'N/A'}</div>
                </div>
            </div>
        `;
        content.insertAdjacentHTML('beforeend', cardsHTML);

        // Two-column: Account Info + User Profile Stats
        const accountInfoRows = [
            ['Init. Balance', account['Init. Balance']],
            ['Min. Balance', account['Min. Balance']],
            ['Max W/D Avail.', account['Max W/D Avail.']],
            ['Profitable Days', account['Profitable Days']],
            ['Days Old', account['Days Old']],
            ['Product Category', account['Product Category']],
            ['Plan', account['Plan']],
            ['Funded Status', account['Funded Status']],
            ['Current Step', account['Current Step']],
            ['Order Number', account['Order Number']],
            ['Parent Account', account['Parent Account']],
            ['Free Reset', account['Free Reset']],
            ['Enabled', account['Enabled']],
            ['Risk Params', account['Risk Params']],
            ['Market Data', account['Market Data']],
        ];

        const userProfileRows = [
            ['User Total Paid', account['User Total Paid']],
            ['User Times Paid', account['User Times Paid']],
            ['User Payout Ratio', account['User Payout Ratio']],
            ['User Avg. Payout', account['User Avg. Payout']],
        ];

        const infoTableHTML = (title, icon, rows) => {
            const rowsHTML = rows.map(([label, val]) =>
                `<div class="info-row"><span class="info-label">${label}</span><span class="info-value">${val || 'N/A'}</span></div>`
            ).join('');
            return `<div class="info-table"><div class="info-table-title">${icon} ${title}</div>${rowsHTML}</div>`;
        };

        const acctIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
        const userIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

        content.insertAdjacentHTML('beforeend', `
            <div class="detail-columns">
                ${infoTableHTML('Account Details', acctIcon, accountInfoRows)}
                ${infoTableHTML('User Profile Stats (All-Time, All Accounts)', userIcon, userProfileRows)}
            </div>
        `);

        // Cross-Reference Section
        if (otherAccounts.length > 0) {
            const allUserAccounts = [account, ...otherAccounts];

            let sumProfitAboveBuffer = 0;
            let sumTotalPaid = 0;
            let sumPayoutCount = 0;

            allUserAccounts.forEach(a => {
                sumProfitAboveBuffer += parseNumericValue(a['Profit Above Buffer']) || 0;
                sumTotalPaid += parseNumericValue(a['Total Paid']) || 0;
                sumPayoutCount += parseNumericValue(a['Payout Count']) || 0;
            });

            const sumCombined = sumTotalPaid + sumProfitAboveBuffer;
            const avgPayout = sumPayoutCount > 0 ? sumTotalPaid / sumPayoutCount : 0;

            content.insertAdjacentHTML('beforeend', `
                <div class="cross-ref-section">
                    <div class="section-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                        Cross-Reference: All ${allUserAccounts.length} Accounts in Report (Summed)
                    </div>
                    <div class="cross-ref-summary">
                        <div class="detail-card highlight-green">
                            <div class="dc-label">Combined Total Paid + Profit</div>
                            <div class="dc-value">${fmt(sumCombined)}</div>
                        </div>
                        <div class="detail-card highlight-accent">
                            <div class="dc-label">Sum: Total Paid</div>
                            <div class="dc-value">${fmt(sumTotalPaid)}</div>
                        </div>
                        <div class="detail-card highlight-accent">
                            <div class="dc-label">Sum: Profit Above Buffer</div>
                            <div class="dc-value">${fmt(sumProfitAboveBuffer)}</div>
                        </div>
                        <div class="detail-card">
                            <div class="dc-label">Sum: Payout Count</div>
                            <div class="dc-value">${sumPayoutCount}</div>
                        </div>
                        <div class="detail-card">
                            <div class="dc-label">Avg. Payout (across accounts)</div>
                            <div class="dc-value">${fmt(avgPayout)}</div>
                        </div>
                    </div>

                    <div class="section-title" style="margin-top:8px">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                        All Accounts for ${account['Name'] || 'this Trader'}
                    </div>
                    <div class="other-accounts-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Account Name</th>
                                    <th>Status</th>
                                    <th>Balance</th>
                                    <th>PnL</th>
                                    <th>Profit Above Buffer</th>
                                    <th>Total Paid</th>
                                    <th>Combined</th>
                                    <th>Payout Count</th>
                                    <th>Avg. Payout</th>
                                    <th>Next W/D Date</th>
                                    <th>Broker</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${allUserAccounts.map(a => {
                                    const tp = parseNumericValue(a['Total Paid']) || 0;
                                    const pa = parseNumericValue(a['Profit Above Buffer']) || 0;
                                    const isCurrent = a['Account Name'] === account['Account Name'];
                                    return `
                                        <tr class="${isCurrent ? 'current-row' : ''}">
                                            <td>
                                                ${a['Account Name']}
                                                ${isCurrent ? '<span class="current-badge">Current</span>' : ''}
                                            </td>
                                            <td>${a['Status'] || ''}</td>
                                            <td>${a['Balance'] || '$0'}</td>
                                            <td>${a['PnL'] || '$0'}</td>
                                            <td>${a['Profit Above Buffer'] || '$0'}</td>
                                            <td>${a['Total Paid'] || '$0'}</td>
                                            <td style="color:var(--success);font-weight:600">${fmt(tp + pa)}</td>
                                            <td>${a['Payout Count'] || '0'}</td>
                                            <td>${a['Avg. Payout'] || '$0'}</td>
                                            <td>${a['Next W/D Date'] || 'N/A'}</td>
                                            <td>${a['Broker'] || ''}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `);
        } else {
            content.insertAdjacentHTML('beforeend', `
                <div class="cross-ref-section">
                    <div class="section-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                        Cross-Reference
                    </div>
                    <div class="info-table">
                        <div class="no-other-accounts">
                            <p>This is the only account for <strong>${account['Name']}</strong> in this report.</p>
                        </div>
                    </div>
                </div>
            `);
        }
    }

    function showError(message) {
        const content = document.getElementById('detailContent');
        content.innerHTML = `
            <div class="empty-state" style="padding-top:100px">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <h3>${message}</h3>
                <p><a href="index.html" style="color:var(--accent)">Go back to Dashboard</a></p>
            </div>
        `;
    }

    init();
})();
