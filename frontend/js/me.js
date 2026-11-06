let currentScope = "mine";
let currentPage = 1;
const pageSize = 10;

function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadMySnippets() {
  const listEl = document.getElementById("list");
  const pagerEl = document.getElementById("pager");
  listEl.innerHTML = `<p class="muted">加载中...</p>`;

  try {
    const data = await snippetApi.list({ scope: currentScope, page: currentPage, page_size: pageSize });
    
    if (!data.items.length) {
      listEl.innerHTML = `<p class="empty">这里空空如也</p>`;
      pagerEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = data.items.map(snippet => `
      <article class="card snippet-card">
        <h2><a href="snippet.html?id=${snippet.id}">${escapeHtml(snippet.title)}</a></h2>
        <div class="meta">
          <span class="lang">${escapeHtml(snippet.language)}</span>
          ${snippet.tags.map(t => `<span class="tag">${escapeHtml(t.name)}</span>`).join("")}
          <span>${snippet.is_public ? "公开" : "私有"}</span>
          <span>浏览 ${snippet.view_count}</span>
        </div>
      </article>
    `).join("");

    const pages = Math.max(1, Math.ceil(data.total / pageSize));
    pagerEl.innerHTML = `
      <button id="prev" ${data.page <= 1 ? "disabled" : ""}>上一页</button>
      <span>第 ${data.page} / ${pages} 页</span>
      <button id="next" ${data.page >= pages ? "disabled" : ""}>下一页</button>
    `;
    document.getElementById("prev").onclick = () => { currentPage--; loadMySnippets(); };
    document.getElementById("next").onclick = () => { currentPage++; loadMySnippets(); };
    
  } catch (error) {
    listEl.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

function initMe() {
  if (!getUser()) {
    location.href = "login.html";
    return;
  }

  const btnMine = document.getElementById("tab-mine");
  const btnFav = document.getElementById("tab-fav");

  btnMine.onclick = () => {
    currentScope = "mine";
    currentPage = 1;
    btnMine.className = "active";
    btnMine.style.background = "#0284c7";
    btnFav.className = "";
    btnFav.style.background = "#475569";
    loadMySnippets();
  };

  btnFav.onclick = () => {
    currentScope = "favorites";
    currentPage = 1;
    btnFav.className = "active";
    btnFav.style.background = "#0284c7";
    btnMine.className = "";
    btnMine.style.background = "#475569";
    loadMySnippets();
  };

  loadMySnippets();
}

document.addEventListener("DOMContentLoaded", initMe);