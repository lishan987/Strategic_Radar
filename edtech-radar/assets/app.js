// EdTech Radar - App Logic
// ui-ux-pro-max compliant: debounced search, skeleton loading, stagger animation

const CATEGORIES = ['全部', '政策类', '市场类', '产品类', '企业动态类'];

let allReports = [];
let currentIssueIndex = 0;
let activeCategory = '全部';
let searchQuery = '';
let fuse = null;
let debounceTimer = null;

// ── Data ──────────────────────────────────────────────────
async function loadReports() {
  showSkeleton();
  try {
    const res = await fetch('./data/reports.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allReports = await res.json();
    if (!Array.isArray(allReports) || allReports.length === 0) {
      showEmpty('暂无数据', '请向 reports.json 中添加期号数据');
      return;
    }
    allReports.sort((a, b) => b.published_at.localeCompare(a.published_at));
    initFuse();
    renderSidebar();
    renderReport(0);
  } catch (e) {
    showError(`数据加载失败：${e.message}`);
  }
}

// ── Fuse.js ───────────────────────────────────────────────
function initFuse() {
  const flat = allReports.flatMap((report, reportIdx) =>
    report.items.map(item => ({
      ...item,
      reportIdx,
      reportTitle: report.title,
      reportIssue: report.issue,
      // 兼容新旧格式的搜索字段
      _searchCategory: item.raw ? item.raw.category : item.category,
      _searchText: item.raw
        ? `${item.raw.topic} ${item.raw.event} ${item.insight}`
        : `${item.source} ${item.insight}`,
    }))
  );
  fuse = new Fuse(flat, {
    keys: ['_searchText', '_searchCategory', 'raw.topic', 'raw.event', 'insight', 'source'],
    threshold: 0.35,
    includeScore: true,
  });
}

// ── Sidebar ───────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('issue-list');
  list.innerHTML = allReports.map((r, i) => `
    <li class="issue-item ${i === currentIssueIndex ? 'active' : ''}"
        role="button" tabindex="0"
        aria-current="${i === currentIssueIndex ? 'page' : 'false'}"
        onclick="switchIssue(${i})"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchIssue(${i})}">
      <div class="issue-number">${escapeHtml(r.title)}</div>
      <div class="issue-date">${formatDate(r.published_at)}</div>
    </li>
  `).join('');
}

function switchIssue(idx) {
  currentIssueIndex = idx;
  activeCategory = '全部';
  searchQuery = '';
  document.getElementById('search-input').value = '';
  renderSidebar();
  renderReport(idx);
  closeSidebar();
  // Return focus to main content on mobile
  document.getElementById('main-content').focus();
}

// ── Report ────────────────────────────────────────────────
function renderReport(idx) {
  const report = allReports[idx];
  if (!report) return;

  // 全局搜索模式
  if (searchQuery.trim()) {
    renderGlobalSearch();
    return;
  }

  // Header
  document.getElementById('report-badge').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M6 4v3M6 8.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    第 ${report.issue} 期
  `;
  document.getElementById('report-title').textContent = report.title;
  document.getElementById('report-date').textContent = `发布于 ${formatDate(report.published_at)}`;
  document.getElementById('report-summary').textContent = report.summary;

  // Filter
  let items = report.items;
  if (activeCategory !== '全部') {
    items = items.filter(i => getItemCategory(i) === activeCategory);
  }

  renderFilterTabs(report.items);

  const container = document.getElementById('items-container');
  if (items.length === 0) {
    showEmpty('没有匹配的内容', '尝试调整搜索词或切换分类');
    return;
  }

  // Stagger animation: each card delayed by 40ms
  container.innerHTML = items.map((item, i) =>
    renderItem(item, i * 40)
  ).join('');

  document.getElementById('update-notes').textContent = report.update_notes;
}

// ── Global Search ─────────────────────────────────────────
function renderGlobalSearch() {
  const results = fuse.search(searchQuery);

  if (results.length === 0) {
    showEmpty('未找到匹配的情报', `关键词"${searchQuery}"无匹配结果`);
    return;
  }

  // 按期号分组
  const grouped = {};
  results.forEach(r => {
    const issueId = r.item.reportIssue;
    if (!grouped[issueId]) grouped[issueId] = [];
    grouped[issueId].push(r.item);
  });

  // Header
  document.getElementById('report-badge').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M10 10L7.5 7.5M8.5 5.5C8.5 7.433 6.933 9 5 9C3.067 9 1.5 7.433 1.5 5.5C1.5 3.567 3.067 2 5 2C6.933 2 8.5 3.567 8.5 5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    全局搜索
  `;
  document.getElementById('report-title').textContent = `搜索结果：${results.length} 条`;
  document.getElementById('report-date').textContent = `关键词"${searchQuery}"`;
  document.getElementById('report-summary').textContent = `跨 ${Object.keys(grouped).length} 期情报的全局搜索结果`;

  // 隐藏分类筛选
  document.getElementById('filter-tabs').innerHTML = '';

  const container = document.getElementById('items-container');
  let html = '';
  let delay = 0;

  Object.keys(grouped).sort((a, b) => b - a).forEach(issueId => {
    const issueReport = allReports.find(r => r.issue == issueId);
    html += `
      <div class="search-group" style="animation-delay:${delay}ms">
        <div class="search-group-header">
          <span class="search-group-badge">第 ${issueId} 期</span>
          <span class="search-group-date">${formatDate(issueReport.published_at)}</span>
          <span class="search-group-count">${grouped[issueId].length} 条</span>
        </div>
    `;
    grouped[issueId].forEach((item, i) => {
      html += renderItem(item, delay + (i + 1) * 40);
    });
    html += `</div>`;
    delay += (grouped[issueId].length + 1) * 40;
  });

  container.innerHTML = html;
  document.getElementById('update-notes').textContent = '';
}

// ── Item ──────────────────────────────────────────────────
function renderItem(item, delay = 0) {
  // 兼容旧格式
  if (item.source && !item.raw) {
    return renderItemLegacy(item, delay);
  }

  return `
    <article class="report-item category-${escapeHtml(item.raw.category)}"
             style="animation-delay:${delay}ms">
      ${renderRawInfo(item.raw)}
      ${renderAnalysisFramework(item.analysis)}
      ${renderInsight(item.insight)}
      ${renderImpacts(item.impacts)}
    </article>
  `;
}

// 原始信息：直观简洁呈现
function renderRawInfo(raw) {
  return `
    <div class="raw-info">
      <span class="report-category ${escapeHtml(raw.category)}">${escapeHtml(raw.category)}</span>
      <table class="raw-table">
        <tr><th>时间</th><td>${escapeHtml(raw.date)}</td></tr>
        <tr><th>地点</th><td>${escapeHtml(raw.location)}</td></tr>
        <tr><th>主题</th><td>${escapeHtml(raw.topic)}</td></tr>
        <tr><th>事件</th><td>${escapeHtml(raw.event)}</td></tr>
        ${raw.effect ? `<tr><th>影响</th><td>${escapeHtml(raw.effect)}</td></tr>` : ''}
      </table>
    </div>
  `;
}

// 分析框架：HTML可视化（自适应高度）
function renderAnalysisFramework(analysis) {
  return `
    <div class="analysis-framework">
      <div class="framework-title">分析框架</div>

      <!-- 第一行：底层归因 → 利益拆解 → 本质 -->
      <div class="framework-row">
        <div class="framework-node node-causality">
          <div class="node-label">底层归因</div>
          <div class="node-content">${escapeHtml(analysis.causality.root_cause)}</div>
        </div>
        <div class="framework-arrow">→</div>
        <div class="framework-node node-interests">
          <div class="node-label">利益拆解</div>
          <div class="node-content">
            <strong>获益方：</strong>${escapeHtml(analysis.interests.beneficiaries)}
          </div>
        </div>
        <div class="framework-arrow">→</div>
        <div class="framework-node node-essence">
          <div class="node-label">本质</div>
          <div class="node-content">${escapeHtml(analysis.essence.summary)}</div>
        </div>
      </div>

      <!-- 第二行：网络传播放大 | 趋势预测 -->
      <div class="framework-row">
        <div class="framework-node node-amplification">
          <div class="node-label">网络传播放大</div>
          <div class="node-content">${escapeHtml(analysis.causality.amplification)}</div>
        </div>
        <div class="framework-node node-forecast">
          <div class="node-label">3-6月趋势</div>
          <div class="node-content">
            <div class="forecast-item"><span class="forecast-icon">✓</span> ${escapeHtml(analysis.essence.forecast.positive)}</div>
            <div class="forecast-item"><span class="forecast-icon">⚠</span> ${escapeHtml(analysis.essence.forecast.risks)}</div>
          </div>
        </div>
      </div>

      <!-- 第三行：受损与边缘化主体 -->
      <div class="framework-row">
        <div class="framework-node node-marginalized">
          <div class="node-label">受损与边缘化主体</div>
          <div class="node-content">
            <div><strong>受损方：</strong>${escapeHtml(analysis.interests.losers)}</div>
            <div style="margin-top: 8px;"><strong>边缘化：</strong>${escapeHtml(analysis.interests.marginalized)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 水面下深度洞察
function renderInsight(insight) {
  return `
    <div class="report-insight" role="note" aria-label="水面下洞察">
      <div class="report-insight-title" aria-hidden="true">水面下洞察</div>
      <div class="report-insight-content">${escapeHtml(insight)}</div>
    </div>
  `;
}

// 影响层：9选4，带优先级
function renderImpacts(impacts) {
  const priorityClass = { '🔴': 'priority-high', '🟡': 'priority-mid', '🟢': 'priority-low' };
  return `
    <div class="impact-grid" role="list" aria-label="影响分析">
      ${impacts.map(imp => `
        <div class="impact-item ${priorityClass[imp.priority] || ''}" role="listitem">
          <div class="impact-label">
            <span class="impact-dimension">${escapeHtml(imp.dimension)}</span>
            <span class="priority-badge" aria-label="优先级">${imp.priority}</span>
          </div>
          <div class="impact-content">${escapeHtml(imp.content)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// 旧格式兼容渲染
function renderItemLegacy(item, delay = 0) {
  return `
    <article class="report-item category-${escapeHtml(item.category)}"
             style="animation-delay:${delay}ms">
      <span class="report-category ${escapeHtml(item.category)}">${escapeHtml(item.category)}</span>
      <p class="report-source">${escapeHtml(item.source)}</p>
      <div class="report-insight" role="note">
        <div class="report-insight-title" aria-hidden="true">水面下洞察</div>
        <div class="report-insight-content">${escapeHtml(item.insight)}</div>
      </div>
      <div class="impact-grid" role="list">
        ${renderImpactLegacy('消费影响', item.impact.consumer)}
        ${renderImpactLegacy('运营影响', item.impact.operation)}
        ${renderImpactLegacy('合规影响', item.impact.compliance)}
        ${renderImpactLegacy('竞争影响', item.impact.competition)}
      </div>
    </article>
  `;
}

function renderImpactLegacy(label, content) {
  const level = extractLevel(content);
  const text = content.replace(/^【(高|中|低)】/, '').trim();
  return `
    <div class="impact-item" role="listitem">
      <div class="impact-label">
        ${escapeHtml(label)}
        <span class="badge badge-${levelClass(level)}">${level}</span>
      </div>
      <div class="impact-content">${escapeHtml(text)}</div>
    </div>
  `;
}

// ── Filter tabs ───────────────────────────────────────────
function getItemCategory(item) {
  return item.raw ? item.raw.category : item.category;
}

function renderFilterTabs(items) {
  const counts = {};
  items.forEach(i => {
    const cat = getItemCategory(i);
    counts[cat] = (counts[cat] || 0) + 1;
  });

  document.getElementById('filter-tabs').innerHTML = CATEGORIES.map(cat => {
    const count = cat === '全部' ? items.length : (counts[cat] || 0);
    const isActive = activeCategory === cat;
    return `
      <button class="filter-tab ${isActive ? 'active' : ''}"
              onclick="setCategory('${cat}')"
              aria-pressed="${isActive}"
              ${count === 0 && cat !== '全部' ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
        ${escapeHtml(cat)}
        <span aria-label="${count} 条" style="opacity:0.65">(${count})</span>
      </button>
    `;
  }).join('');
}

function setCategory(cat) {
  activeCategory = cat;
  renderReport(currentIssueIndex);
}

// ── Search (debounced 250ms) ──────────────────────────────
function handleSearch(e) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchQuery = e.target.value;
    renderReport(currentIssueIndex);
  }, 250);
}

// ── Skeleton ──────────────────────────────────────────────
function showSkeleton() {
  document.getElementById('items-container').innerHTML = `
    <div class="skeleton-container" aria-busy="true" aria-label="加载中">
      ${[1,2].map(() => `
        <div class="skeleton-card">
          <div class="skeleton-line w-1-4"></div>
          <div class="skeleton-line w-full"></div>
          <div class="skeleton-line w-3-4"></div>
          <div class="skeleton-line h-tall w-full" style="margin-top:1rem"></div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Empty / Error states ──────────────────────────────────
function showEmpty(title, desc) {
  document.getElementById('items-container').innerHTML = `
    <div class="empty-state" role="status">
      <svg class="empty-state-icon" viewBox="0 0 48 48" fill="none"
           aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2"/>
        <path d="M16 24h16M24 16v16" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" opacity="0.4"/>
      </svg>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-desc">${escapeHtml(desc)}</div>
    </div>
  `;
}

function showError(msg) {
  document.getElementById('items-container').innerHTML = `
    <div class="empty-state" role="alert">
      <svg class="empty-state-icon" viewBox="0 0 48 48" fill="none"
           aria-hidden="true" focusable="false" style="color:var(--color-danger)">
        <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2"/>
        <path d="M24 16v10M24 30v2" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round"/>
      </svg>
      <div class="empty-state-title" style="color:var(--color-danger)">加载失败</div>
      <div class="empty-state-desc">${escapeHtml(msg)}</div>
    </div>
  `;
}

// ── Sidebar (mobile) ──────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
  document.getElementById('sidebar-toggle').setAttribute('aria-expanded', 'true');
  document.getElementById('sidebar').focus();
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  const btn = document.getElementById('sidebar-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// ── Helpers ───────────────────────────────────────────────
function extractLevel(text) {
  const m = text.match(/^【(高|中|低)】/);
  return m ? m[1] : '低';
}

function levelClass(level) {
  return { '高': 'high', '中': 'medium', '低': 'low' }[level] || 'low';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search-input').addEventListener('input', handleSearch);

  // Close sidebar on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

  loadReports();
});
