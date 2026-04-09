(function () {
    'use strict';

    let allData = [];
    let filteredData = [];
    let headers = [];
    let newsViolationMap = {};
    let currentPage = 1;
    let pageSize = 50;
    let sortCol = -1;
    let sortDir = 'asc';
    let dateFilter = null;
    let searchTerm = '';
    let flatpickrInstance = null;
    let activeCardFilters = new Set();

    let pendingAccountFile = null;
    let pendingNewsFiles = [];

    const ZERO_EXCLUSION_COLUMNS = [
        'Profit Above Buffer',
        'Total Paid',
        'Payout Count',
        'Avg. Payout',
        'User Total Paid',
        'User Payout Ratio',
        'User Avg. Payout'
    ];

    const DATE_COLUMN = 'Next W/D Date';
    const COMPUTED_COLUMN = 'Total Paid + Profit';
    const NEWS_COLUMN = 'News Violation';

    // DOM refs
    const uploadSection = document.getElementById('uploadSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const newsUploadArea = document.getElementById('newsUploadArea');
    const newsFileInput = document.getElementById('newsFileInput');
    const dateRangeInput = document.getElementById('dateRange');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const searchInput = document.getElementById('searchInput');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const exportBtn = document.getElementById('exportBtn');
    const uploadNewBtn = document.getElementById('uploadNewBtn');

    // ---------- Initialization ----------
    function init() {
        setupUploadHandlers();
        setupFilterHandlers();
        setupPagination();
        setupCardFilters();
    }

    // ---------- Upload ----------
    function setupUploadHandlers() {
        const loadBtn = document.getElementById('loadDashboardBtn');
        const uploadActions = document.getElementById('uploadActions');
        const accountStatus = document.getElementById('accountFileStatus');
        const newsStatus = document.getElementById('newsFileStatus');

        // Account file handlers
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.csv')) {
                pendingAccountFile = file;
                uploadArea.classList.add('file-loaded');
                accountStatus.textContent = file.name;
                checkReadyToLoad();
            } else {
                showToast('Please upload a valid CSV file', 'error');
            }
        });
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                pendingAccountFile = file;
                uploadArea.classList.add('file-loaded');
                accountStatus.textContent = file.name;
                checkReadyToLoad();
            }
        });

        // News file handlers (multiple)
        newsUploadArea.addEventListener('click', () => newsFileInput.click());
        newsUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); newsUploadArea.classList.add('dragover'); });
        newsUploadArea.addEventListener('dragleave', () => newsUploadArea.classList.remove('dragover'));
        newsUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            newsUploadArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
            if (files.length > 0) {
                pendingNewsFiles = files;
                newsUploadArea.classList.add('file-loaded');
                newsStatus.textContent = files.length === 1 ? files[0].name : `${files.length} files selected`;
            } else {
                showToast('Please upload valid CSV files', 'error');
            }
        });
        newsFileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                pendingNewsFiles = files;
                newsUploadArea.classList.add('file-loaded');
                newsStatus.textContent = files.length === 1 ? files[0].name : `${files.length} files selected`;
            }
        });

        function checkReadyToLoad() {
            if (pendingAccountFile) {
                uploadActions.style.display = 'block';
            }
        }

        loadBtn.addEventListener('click', () => {
            processFiles();
        });

        uploadNewBtn.addEventListener('click', () => {
            allData = [];
            filteredData = [];
            headers = [];
            newsViolationMap = {};
            pendingAccountFile = null;
            pendingNewsFiles = [];
            dateFilter = null;
            searchTerm = '';
            activeCardFilters.clear();
            sortCol = -1;
            sortDir = 'asc';
            currentPage = 1;
            if (flatpickrInstance) flatpickrInstance.clear();
            searchInput.value = '';
            fileInput.value = '';
            newsFileInput.value = '';
            uploadArea.classList.remove('file-loaded');
            newsUploadArea.classList.remove('file-loaded');
            accountStatus.textContent = '';
            newsStatus.textContent = '';
            uploadActions.style.display = 'none';
            dashboardSection.style.display = 'none';
            uploadSection.style.display = 'flex';
        });
    }

    function processFiles() {
        showLoading(true);

        const parseCSV = (file) => new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results.data),
                error: (err) => reject(err)
            });
        });

        const accountPromise = parseCSV(pendingAccountFile);
        const newsPromises = pendingNewsFiles.length > 0
            ? Promise.all(pendingNewsFiles.map(f => parseCSV(f)))
            : Promise.resolve(null);

        Promise.all([accountPromise, newsPromises]).then(([accountData, newsDataArrays]) => {
            const newsData = newsDataArrays ? newsDataArrays.flat() : null;
            if (!accountData || accountData.length === 0) {
                showLoading(false);
                showToast('No data found in account CSV', 'error');
                return;
            }

            allData = accountData;
            headers = Object.keys(allData[0]);

            // Build news violation map
            newsViolationMap = {};
            if (newsData && newsData.length > 0) {
                newsData.forEach(row => {
                    const acct = (row['Account Name'] || '').trim();
                    if (!acct) return;
                    const netProfit = parseNumericValue(row['Net Profit']) || 0;
                    newsViolationMap[acct] = (newsViolationMap[acct] || 0) + netProfit;
                });
            }

            // Add computed columns
            allData.forEach(row => {
                const totalPaid = parseNumericValue(row['Total Paid']) || 0;
                const profitAbove = parseNumericValue(row['Profit Above Buffer']) || 0;
                const sum = totalPaid + profitAbove;
                row[COMPUTED_COLUMN] = '$' + sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                const acct = (row['Account Name'] || '').trim();
                if (acct in newsViolationMap) {
                    const val = newsViolationMap[acct];
                    const sign = val >= 0 ? '' : '-';
                    row[NEWS_COLUMN] = sign + '$' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else {
                    row[NEWS_COLUMN] = '';
                }
            });

            // Insert computed columns into headers
            if (!headers.includes(COMPUTED_COLUMN)) {
                const insertIdx = headers.indexOf('Total Paid');
                if (insertIdx !== -1) {
                    headers.splice(insertIdx + 1, 0, COMPUTED_COLUMN);
                } else {
                    headers.push(COMPUTED_COLUMN);
                }
            }
            if (!headers.includes(NEWS_COLUMN)) {
                const insertIdx = headers.indexOf(COMPUTED_COLUMN);
                if (insertIdx !== -1) {
                    headers.splice(insertIdx + 1, 0, NEWS_COLUMN);
                } else {
                    headers.push(NEWS_COLUMN);
                }
            }

            sessionStorage.setItem('dashboardData', JSON.stringify(allData));
            sessionStorage.setItem('newsViolationMap', JSON.stringify(newsViolationMap));

            showLoading(false);
            showDashboard();
            const newsFileCount = pendingNewsFiles.length;
            const newsMsg = newsData ? ` | ${newsFileCount} news file${newsFileCount > 1 ? 's' : ''}, ${Object.keys(newsViolationMap).length} accounts with violations` : '';
            showToast(`Loaded ${allData.length} accounts${newsMsg}`, 'success');
        }).catch(() => {
            showLoading(false);
            showToast('Failed to parse CSV files', 'error');
        });
    }

    // ---------- Dashboard ----------
    function showDashboard() {
        uploadSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        document.getElementById('totalRows').textContent = `${allData.length} accounts`;

        initDatePicker();
        applyFilters();
    }

    function initDatePicker() {
        if (flatpickrInstance) flatpickrInstance.destroy();

        const allDates = allData
            .map(r => r[DATE_COLUMN])
            .filter(d => d && d.trim() !== '' && d !== '$undefined' && !d.startsWith('$'));

        let minDate = null;
        let maxDate = null;
        if (allDates.length > 0) {
            const sorted = allDates.slice().sort();
            minDate = sorted[0];
            maxDate = sorted[sorted.length - 1];
        }

        flatpickrInstance = flatpickr(dateRangeInput, {
            mode: 'range',
            dateFormat: 'Y-m-d',
            theme: 'dark',
            minDate: minDate,
            maxDate: maxDate,
            onChange: function (selectedDates) {
                if (selectedDates.length === 2) {
                    dateFilter = {
                        from: selectedDates[0],
                        to: selectedDates[1]
                    };
                    currentPage = 1;
                    applyFilters();
                } else if (selectedDates.length === 0) {
                    dateFilter = null;
                    currentPage = 1;
                    applyFilters();
                }
            }
        });
    }

    // ---------- Filtering ----------
    function parseNumericValue(val) {
        if (val === undefined || val === null) return null;
        const cleaned = val.toString().replace(/[$,%]/g, '').replace(/,/g, '').trim();
        if (cleaned === '' || cleaned === '--' || cleaned === 'undefined') return null;
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    function isZeroOrEmpty(val) {
        const num = parseNumericValue(val);
        return num === 0 || num === null;
    }

    function buildUserCombinedMap(data) {
        const map = {};
        data.forEach(row => {
            const name = (row['Name'] || '').trim().toLowerCase();
            if (!name) return;
            const tp = parseNumericValue(row['Total Paid']) || 0;
            const pab = parseNumericValue(row['Profit Above Buffer']) || 0;
            map[name] = (map[name] || 0) + tp + pab;
        });
        return map;
    }

    function applyFilters() {
        let data = allData.slice();
        let withDateCount = 0;

        if (dateFilter) {
            const fromDate = new Date(dateFilter.from);
            fromDate.setHours(0, 0, 0, 0);
            const toDate = new Date(dateFilter.to);
            toDate.setHours(23, 59, 59, 999);

            data = data.filter(row => {
                const dateVal = row[DATE_COLUMN];
                if (!dateVal || dateVal.trim() === '' || dateVal === '$undefined' || dateVal.startsWith('$')) {
                    return false;
                }

                const rowDate = new Date(dateVal + 'T00:00:00');
                if (isNaN(rowDate.getTime())) return false;

                if (rowDate < fromDate || rowDate > toDate) return false;
                withDateCount++;

                const allZero = ZERO_EXCLUSION_COLUMNS.every(col => isZeroOrEmpty(row[col]));
                if (allZero) return false;

                return true;
            });

            clearFiltersBtn.style.display = 'inline-flex';
            exportBtn.style.display = 'inline-flex';
        } else {
            clearFiltersBtn.style.display = 'none';
            exportBtn.style.display = data.length > 0 ? 'inline-flex' : 'none';
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            data = data.filter(row =>
                Object.values(row).some(val =>
                    val && val.toString().toLowerCase().includes(term)
                )
            );
        }

        const preCardData = data.slice();

        if (activeCardFilters.has('above20k')) {
            data = data.filter(row => {
                const combined = parseNumericValue(row[COMPUTED_COLUMN]) || 0;
                return combined > 20000;
            });
        }
        if (activeCardFilters.has('above100')) {
            data = data.filter(row => {
                const ratio = parseNumericValue(row['User Payout Ratio']) || 0;
                return ratio > 100;
            });
        }
        if (activeCardFilters.has('newsViolation')) {
            data = data.filter(row => {
                const val = row[NEWS_COLUMN];
                return val && val.trim() !== '';
            });
        }
        let userCombinedMap = null;
        if (activeCardFilters.has('userAbove30k')) {
            userCombinedMap = buildUserCombinedMap(preCardData);
            const qualifyingUsers = new Set(
                Object.keys(userCombinedMap).filter(name => userCombinedMap[name] > 30000)
            );
            data = data.filter(row => {
                const name = (row['Name'] || '').trim().toLowerCase();
                return qualifyingUsers.has(name);
            });
        }

        let activeSortKey = null;
        let activeSortDir = sortDir;

        if (sortCol >= 0 && sortCol < headers.length) {
            activeSortKey = headers[sortCol];
        } else if (dateFilter) {
            activeSortKey = COMPUTED_COLUMN;
            activeSortDir = 'desc';
        }

        if (userCombinedMap && sortCol < 0) {
            data.sort((a, b) => {
                const nameA = (a['Name'] || '').trim().toLowerCase();
                const nameB = (b['Name'] || '').trim().toLowerCase();
                const userTotalA = userCombinedMap[nameA] || 0;
                const userTotalB = userCombinedMap[nameB] || 0;
                if (userTotalB !== userTotalA) return userTotalB - userTotalA;
                const acctA = parseNumericValue(a[COMPUTED_COLUMN]) || 0;
                const acctB = parseNumericValue(b[COMPUTED_COLUMN]) || 0;
                return acctB - acctA;
            });
        } else if (activeSortKey) {
            data.sort((a, b) => {
                let va = a[activeSortKey] || '';
                let vb = b[activeSortKey] || '';

                const na = parseNumericValue(va);
                const nb = parseNumericValue(vb);
                if (na !== null && nb !== null) {
                    return activeSortDir === 'asc' ? na - nb : nb - na;
                }

                va = va.toString().toLowerCase();
                vb = vb.toString().toLowerCase();
                if (va < vb) return activeSortDir === 'asc' ? -1 : 1;
                if (va > vb) return activeSortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        filteredData = data;
        updateStats(withDateCount, preCardData);
        renderTable();
    }

    function updateStats(withDateCount, preCardData) {
        document.getElementById('statTotal').textContent = allData.length.toLocaleString();
        document.getElementById('statFiltered').textContent = filteredData.length.toLocaleString();

        const dateCount = dateFilter
            ? withDateCount
            : allData.filter(r => {
                const d = r[DATE_COLUMN];
                return d && d.trim() !== '' && d !== '$undefined' && !d.startsWith('$');
            }).length;
        document.getElementById('statWithDate').textContent = dateCount.toLocaleString();
        document.getElementById('statCandidates').textContent = (preCardData || filteredData).length.toLocaleString();

        const filteredBadge = document.getElementById('filteredRows');
        if (dateFilter || searchTerm || activeCardFilters.size > 0) {
            filteredBadge.textContent = `${filteredData.length} filtered`;
            filteredBadge.style.display = 'inline-block';
        } else {
            filteredBadge.style.display = 'none';
        }

        const sourceData = preCardData || filteredData;

        const above20kCount = sourceData.filter(row => {
            const combined = parseNumericValue(row[COMPUTED_COLUMN]) || 0;
            return combined > 20000;
        }).length;
        document.getElementById('statAbove20k').textContent = above20kCount.toLocaleString();

        const above100Count = sourceData.filter(row => {
            const ratio = parseNumericValue(row['User Payout Ratio']) || 0;
            return ratio > 100;
        }).length;
        document.getElementById('statAbove100').textContent = above100Count.toLocaleString();

        const userMap = buildUserCombinedMap(sourceData);
        const userAbove30kCount = Object.values(userMap).filter(v => v > 30000).length;
        document.getElementById('statUserAbove30k').textContent = userAbove30kCount.toLocaleString();

        const newsViolationCount = sourceData.filter(row => {
            const val = row[NEWS_COLUMN];
            return val && val.trim() !== '';
        }).length;
        document.getElementById('statNewsViolation').textContent = newsViolationCount.toLocaleString();

        const above20kCard = document.getElementById('above20kCard');
        const above100Card = document.getElementById('above100Card');
        const userAbove30kCard = document.getElementById('userAbove30kCard');
        const newsViolationCard = document.getElementById('newsViolationCard');
        above20kCard.classList.toggle('active', activeCardFilters.has('above20k'));
        above100Card.classList.toggle('active', activeCardFilters.has('above100'));
        userAbove30kCard.classList.toggle('active', activeCardFilters.has('userAbove30k'));
        newsViolationCard.classList.toggle('active', activeCardFilters.has('newsViolation'));
    }

    const FROZEN_COL_COUNT = 4;

    // ---------- Table Rendering ----------
    function renderTable() {
        renderHeaders();
        renderBody();
        applyFrozenColumns();
        updatePagination();
    }

    function applyFrozenColumns() {
        const table = document.getElementById('dataTable');
        const headerCells = table.querySelectorAll('thead th');
        if (headerCells.length === 0) return;

        const offsets = [];
        let cumulative = 0;
        for (let i = 0; i < Math.min(FROZEN_COL_COUNT, headerCells.length); i++) {
            offsets.push(cumulative);
            cumulative += headerCells[i].offsetWidth;
        }

        const applyToRow = (cells) => {
            for (let i = 0; i < Math.min(FROZEN_COL_COUNT, cells.length); i++) {
                cells[i].classList.add('frozen');
                cells[i].style.left = offsets[i] + 'px';
                if (i === FROZEN_COL_COUNT - 1) {
                    cells[i].classList.add('frozen-border');
                }
            }
        };

        applyToRow(headerCells);
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(row => applyToRow(row.querySelectorAll('td')));
    }

    function renderHeaders() {
        tableHead.innerHTML = '';
        const tr = document.createElement('tr');
        const ACTION_INSERT_INDEX = 3;
        headers.forEach((h, i) => {
            if (i === ACTION_INSERT_INDEX) {
                const actionTh = document.createElement('th');
                actionTh.textContent = 'Actions';
                actionTh.style.cursor = 'default';
                tr.appendChild(actionTh);
            }
            const th = document.createElement('th');
            th.textContent = h;
            th.addEventListener('click', () => {
                if (sortCol === i) {
                    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortCol = i;
                    sortDir = 'asc';
                }
                applyFilters();
            });
            if (sortCol === i) {
                th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
            if (h === COMPUTED_COLUMN) {
                th.classList.add('computed-col');
            }
            if (h === NEWS_COLUMN) {
                th.classList.add('news-col');
            }
            tr.appendChild(th);
        });
        tableHead.appendChild(tr);
    }

    function renderBody() {
        tableBody.innerHTML = '';

        const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;

        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredData.length);
        const pageData = filteredData.slice(start, end);

        const ACTION_INSERT_INDEX = 3;

        if (pageData.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = headers.length + 1;
            td.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <h3>No matching accounts</h3>
                    <p>Try adjusting your filters or date range</p>
                </div>
            `;
            tr.appendChild(td);
            tableBody.appendChild(tr);
            document.getElementById('showingCount').textContent = 'No results';
            return;
        }

        pageData.forEach(row => {
            const tr = document.createElement('tr');
            headers.forEach((h, i) => {
                if (i === ACTION_INSERT_INDEX) {
                    const actionTd = document.createElement('td');
                    const btn = document.createElement('button');
                    btn.className = 'btn-detail';
                    btn.textContent = 'View Details';
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const acctName = row['Account Name'] || '';
                        window.open(`detail.html?account=${encodeURIComponent(acctName)}`, '_blank');
                    });
                    actionTd.appendChild(btn);
                    tr.appendChild(actionTd);
                }
                const td = document.createElement('td');
                const val = row[h] || '';
                td.textContent = val;

                if (h === 'Status') {
                    const status = val.toLowerCase().replace(/\s+/g, '-');
                    td.innerHTML = `<span class="status-badge status-${status}">${val}</span>`;
                }

                if (ZERO_EXCLUSION_COLUMNS.includes(h) && isZeroOrEmpty(val)) {
                    td.classList.add('highlight-zero');
                }

                if (h === COMPUTED_COLUMN) {
                    td.classList.add('computed-col');
                }

                if (h === NEWS_COLUMN && val) {
                    const nv = parseNumericValue(val);
                    if (nv !== null && nv > 0) td.classList.add('news-profit');
                    else if (nv !== null && nv < 0) td.classList.add('news-loss');
                }

                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });

        document.getElementById('showingCount').textContent =
            `Showing ${start + 1}–${end} of ${filteredData.length.toLocaleString()} rows`;
    }

    // ---------- Pagination ----------
    function setupPagination() {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderBody();
                updatePagination();
            }
        });

        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredData.length / pageSize);
            if (currentPage < totalPages) {
                currentPage++;
                renderBody();
                updatePagination();
            }
        });

        pageSizeSelect.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value);
            currentPage = 1;
            renderBody();
            updatePagination();
        });
    }

    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    }

    // ---------- Filter Handlers ----------
    function setupFilterHandlers() {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.trim();
            currentPage = 1;
            applyFilters();
        });

        clearFiltersBtn.addEventListener('click', () => {
            dateFilter = null;
            searchTerm = '';
            activeCardFilters.clear();
            searchInput.value = '';
            if (flatpickrInstance) flatpickrInstance.clear();
            currentPage = 1;
            sortCol = -1;
            sortDir = 'asc';
            applyFilters();
        });

        exportBtn.addEventListener('click', exportFilteredCSV);
    }

    // ---------- Export ----------
    function exportFilteredCSV() {
        if (filteredData.length === 0) {
            showToast('No data to export', 'error');
            return;
        }

        const csvContent = Papa.unparse(filteredData, { columns: headers });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        let filename = 'filtered_accounts';
        if (dateFilter) {
            const from = formatDateStr(dateFilter.from);
            const to = formatDateStr(dateFilter.to);
            filename += `_${from}_to_${to}`;
        }
        filename += '.csv';

        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${filteredData.length} rows`, 'success');
    }

    function formatDateStr(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ---------- UI Helpers ----------
    function showLoading(show) {
        const existing = document.querySelector('.loading-overlay');
        if (show && !existing) {
            const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(overlay);
        } else if (!show && existing) {
            existing.remove();
        }
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success'
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        toast.innerHTML = `${icon} ${message}`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ---------- Card Filter Toggles ----------
    function setupCardFilters() {
        document.getElementById('above20kCard').addEventListener('click', () => {
            if (activeCardFilters.has('above20k')) {
                activeCardFilters.delete('above20k');
            } else {
                activeCardFilters.add('above20k');
            }
            sortCol = -1;
            sortDir = 'asc';
            currentPage = 1;
            applyFilters();
        });

        document.getElementById('above100Card').addEventListener('click', () => {
            if (activeCardFilters.has('above100')) {
                activeCardFilters.delete('above100');
            } else {
                activeCardFilters.add('above100');
            }
            sortCol = -1;
            sortDir = 'asc';
            currentPage = 1;
            applyFilters();
        });

        document.getElementById('userAbove30kCard').addEventListener('click', () => {
            if (activeCardFilters.has('userAbove30k')) {
                activeCardFilters.delete('userAbove30k');
            } else {
                activeCardFilters.add('userAbove30k');
            }
            sortCol = -1;
            sortDir = 'asc';
            currentPage = 1;
            applyFilters();
        });

        document.getElementById('newsViolationCard').addEventListener('click', () => {
            if (activeCardFilters.has('newsViolation')) {
                activeCardFilters.delete('newsViolation');
            } else {
                activeCardFilters.add('newsViolation');
            }
            sortCol = -1;
            sortDir = 'asc';
            currentPage = 1;
            applyFilters();
        });
    }

    // Start
    init();
})();
