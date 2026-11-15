const state = { page: 1, pageSize: 10, q: "", language: "", scope: "public", tag: "" };

async function loadList() {
  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  listEl.innerHTML = `<p class="muted">加载中...</p>`;

  try {
    const data = await snippetApi.list({
      q: state.q, language: state.language, scope: state.scope, tag: state.tag, page: state.page, page_size: state.pageSize,
    });

    if (!data.items.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      listEl.innerHTML = data.items.map(renderCard).join("");
    }
    renderPager(data.total, data.page, data.page_size);
  } catch (error) {
    listEl.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

function renderCard(snippet) {
  const tags = snippet.tags.map((tag) => `<span class="tag">${escapeHtml(tag.name)}</span>`).join("");

  return `
    <article class="card snippet-card">
      <h2><a href="snippet.html?id=${snippet.id}">${escapeHtml(snippet.title)}</a></h2>
      <div class="meta">
        <span class="lang">${escapeHtml(snippet.language)}</span>
        ${tags}
        <a href="user.html?id=${snippet.owner.id}" style="color: var(--muted);">👤 ${escapeHtml(snippet.owner.display_name)}</a>
        <span>${new Date(snippet.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
      </div>
      <p class="muted" style="font-size: 13px; margin-top: 8px;">
        ${snippet.is_public ? "公开" : "私有"} · 👍 ${snippet.likes_count} · 浏览 ${snippet.view_count}
      </p>
    </article>
  `;
}

function renderPager(total, page, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const el = document.getElementById("pager");
  el.innerHTML = `
    <button id="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
    <span>第 ${page} / ${pages} 页，共 ${total} 条</span>
    <button id="next" ${page >= pages ? "disabled" : ""}>下一页</button>
  `;
  document.getElementById("prev").onclick = () => { state.page -= 1; loadList(); };
  document.getElementById("next").onclick = () => { state.page += 1; loadList(); };
}

async function loadRanking() {
  const rankEl = document.getElementById("ranking-list");
  try {
    const res = await request("/api/users/ranking", { auth: false });
    if (!res.length) {
      rankEl.innerHTML = `<p class="muted">暂无数据</p>`;
      return;
    }
    rankEl.innerHTML = res.map((u, i) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
        <div style="display: flex; gap: 8px; align-items: center;">
          <span style="font-weight: bold; color: ${i < 3 ? '#fbbf24' : 'var(--muted)'};">#${i + 1}</span>
          <a href="user.html?id=${u.id}">${escapeHtml(u.display_name)}</a>
        </div>
        <span class="muted" style="font-size: 12px;">👍 ${u.total_likes} · 📝 ${u.snippet_count}</span>
      </div>
    `).join("");
  } catch (error) {
    rankEl.innerHTML = `<p class="message error">加载失败</p>`;
  }
}

function initIndex() {
  const search = document.getElementById("search");
  const language = document.getElementById("language");
  const scope = document.getElementById("scope");

  // -> 新增：检查 URL 中是否带有 q 参数（从全局搜索跳转过来）
  const urlParams = new URLSearchParams(window.location.search);
  const urlQuery = urlParams.get("q");
  if (urlQuery) {
    search.value = urlQuery;
    state.q = urlQuery;
  }

  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = search.value.trim(); state.page = 1; loadList(); }, 300);
  });
  language.addEventListener("change", () => { state.language = language.value; state.page = 1; loadList(); });
  scope.addEventListener("change", () => {
    if (scope.value !== "public" && !getUser()) { location.href = "login.html"; return; }
    state.scope = scope.value; state.page = 1; loadList();
  });

  loadList();
  loadRanking(); // 如果你有排行榜的话
}

document.addEventListener("DOMContentLoaded", initIndex);

// ==========================================
// 全局命令面板逻辑
// ==========================================
document.addEventListener("keydown", (e) => {
  const overlay = document.getElementById("command-palette");
  const commandInput = document.getElementById("command-input");
  if (!overlay || !commandInput) return;

  // 监听 Ctrl+K 或 Cmd+K
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    overlay.classList.remove("hidden");
    // 稍微延迟以配合 CSS 动画聚焦
    setTimeout(() => commandInput.focus(), 50);
  }

  // 监听 Esc 关闭
  if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
    overlay.classList.add("hidden");
    commandInput.blur();
  }
});

// 绑定点击遮罩层关闭
const overlay = document.getElementById("command-palette");
if (overlay) {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      document.getElementById("command-input").blur();
    }
  });

  // 绑定回车搜索事件
  const commandInput = document.getElementById("command-input");
  commandInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = commandInput.value.trim();
      // 1. 将值同步给原搜索框和 state
      document.getElementById("search").value = q;
      state.q = q;
      state.page = 1;
      
      // 2. 触发列表刷新
      loadList();
      
      // 3. 关闭面板
      overlay.classList.add("hidden");
      commandInput.blur();
    }
  });
}