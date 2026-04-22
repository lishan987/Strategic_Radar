// EdTech Radar - App Logic
// 数据驱动渲染，支持搜索、分类筛选、历史期号切换

const CATEGORIES = ['全部', '政策类', '市场类', '产品类', '企业动态类'];

let allReports = [];
let currentIssueIndex = 0;
let activeCategory = '全部';
let searchQuery = '';
let fuse = null;

// ── 数据加载 ──────────────────────────────────────────────
async function loadReports() {
  try {
    const res = await fetch('./data/reports.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allReports = await res.json();
    if (!Array.isArray(allReports) || allReports.length === 0) {
      showError('暂无数据');
      return;
    }
    // 按发布日期降序，最新在前
    allReports.sort((a, b) => b.published_at.localeCompare(a.published_at));
    initFuse();
    renderSidebar();
    renderReport(0);
  } catch (e) {
    showError(`数据加载失败：${e.message}`);
  }
}

// ── Fuse.js 模糊搜索初始化 ────────────────────────────────
function initFuse() {
  const flatItems = allReports.flatMap((report, reportIdx) =>
    report.items.map((item, itemIdx) => ({
      ...item,
      reportIdx,
      itemIdx,
      reportTitle: report.title,
    }))
  );
  fuse = new Fuse(flatItems, {
    keys: ['source', 'insight', 'impact.consumer', 'impact.operation', 'impact.compliance', 'impact.competition'],
    threshold: 0.35,
    includeScore: true,
  });
}

// ── 侧边栏渲染 ────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('issue-list');
  list.innerHTML = allReports.map((r, i) => `
    <li class="issue-item ${i === currentIssueIndex ? 'active' : ''}"
        onclick="switchIssue(${i})" role="button" tabindex="0"
        onkeydown="if(event.key==='Enter')switchIssue(${i})">
      <div class="issue-number">${r.title}</div>
      <div class="issue-date">${formatDate(r.published_at)}</div>
    </li>
  `).join('');
}

// ── 切换期号 ──────────────────────────────────────────────
function switchIssue(idx) {
  currentIssueIndex = idx;
  activeCategory = '全部';
  searchQuery = '';
  document.getElementById('search-input').value = '';
  renderSidebar();
  renderReport(idx);
}

// ── 主报告渲染 ────────────────────────────────────────────
function renderReport(idx) {
  const report = allReports[idx];
  if (!report) return;

  // Header
  document.getElementById('report-title').textContent = report.title;
  document.getElementById('report-date').textContent = `发布于 ${formatDate(report.published_at)}`;
  document.getElementById('report-summary').textContent = report.summary;

  // 筛选 + 搜索
  let items = report.items;
  if (activeCategory !== '全部') {
    items = items.filter(i => i.category === activeCategory);
  }
  if (searchQuery.trim()) {
    const results = fuse.search(searchQuery);
    const matchedSources = new Set(results.map(r => r.item.source));
    items = items.filter(i => matchedSources.has(i.source));
  }

  // 更新筛选 Tab
  renderFilterTabs(report.items);

  // 渲染条目
  const container = document.getElementById('items-container');
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">没有匹配的内容</div>`;
    return;
  }
  container.innerHTML = items.map(item => renderItem(item)).join('');

  // 更新说明
  document.getElementById('update-notes').textContent = report.update_notes;
}

// ── 单条条目渲染 ──────────────────────────────────────────
function renderItem(item) {
  return `
    <article class="report-item category-${item.category}">
      <span class="report-category ${item.category}">${item.category}</span>
      <p class="report-source">${escapeHtml(item.source)}</p>

      <div class="report-insight">
        <div class="report-insight-title">水面下洞察</div>
        <div class="report-insight-content">${escapeHtml(item.insight)}</div>
      </div>

      <div class="impact-grid">
        ${renderImpactItem('消费影响', item.impact.consumer)}
        ${renderImpactItem('运营影响', item.impact.operation)}
        ${renderImpactItem('合规影响', item.impact.compliance)}
        ${renderImpactItem('竞争影响', item.impact.competition)}
      </div>
    </article>
  `;
}

function renderImpactItem(label, content) {
  const level = extractLevel(content);
  return `
    <div class="impact-item">
      <div class="impact-label">${label} <span class="badge badge-${levelClass(level)}">${level}</span></div>
      <div class="impact-content">${escapeHtml(content.replace(/^【(高|中|低)】/, ''))}</div>
    </div>
  `;
}

// ── 筛选 Tab ──────────────────────────────────────────────
function renderFilterTabs(items) {
  const counts = {};
  items.forEach(i => { counts[i.category] = (counts[i.category] || 0) + 1; });

  const container = document.getElementById('filter-tabs');
  container.innerHTML = CATEGORIES.map(cat => {
    const count = cat === '全部' ? items.length : (counts[cat] || 0);
    return `
      <button class="filter-tab ${activeCategory === cat ? 'active' : ''}"
              onclick="setCategory('${cat}')"
              aria-pressed="${activeCategory === cat}">
        ${cat} <span style="opacity:0.7">(${count})</span>
      </button>
    `;
  }).join('');
}

function setCategory(cat) {
  activeCategory = cat;
  renderReport(currentIssueIndex);
}

// ── 搜索 ──────────────────────────────────────────────────
function handleSearch(e) {
  searchQuery = e.target.value;
  renderReport(currentIssueIndex);
}

// ── 工具函数 ──────────────────────────────────────────────
function extractLevel(text) {
  const m = text.match(/^【(高|中|低)】/);
  return m ? m[1] : '低';
}

function levelClass(level) {
  return { '高': 'high', '中': 'medium', '低': 'low' }[level] || 'low';
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  document.getElementById('items-container').innerHTML =
    `<div class="empty-state" style="color:var(--color-danger)">${msg}</div>`;
}

// ── 移动端侧边栏 ──────────────────────────────────────────
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}

// ── 启动 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search-input').addEventListener('input', handleSearch);
  loadReports();
});
