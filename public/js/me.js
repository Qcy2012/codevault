let currentScope = "mine";
let currentPage = 1;
const pageSize = 10;

function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadMySnippets() {
  const listEl = document.getElementById("list");
  const pagerEl = document.getElementById("pager");
  listEl.innerHTML = `<p class="muted">加载中...</p>`;

  try {
    let data;
    if (currentScope === "trash") {
      // 请求回收站专属接口
      data = await request("/api/snippets/trash");
    } else {
      // 请求普通列表接口
      data = await snippetApi.list({ scope: currentScope, page: currentPage, page_size: pageSize });
    }
    
    if (!data.items.length) {
      listEl.innerHTML = `<p class="empty">这里空空如也</p>`;
      pagerEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = data.items.map(snippet => {
      // 回收站专属操作按钮
      const trashActions = currentScope === "trash" ? `
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button onclick="restoreSnippet(${snippet.id})" style="padding: 4px 10px; font-size: 12px; background: linear-gradient(180deg, #10b981 0%, #059669 100%);">恢复</button>
          <button class="danger" onclick="permanentDelete(${snippet.id})" style="padding: 4px 10px; font-size: 12px;">彻底删除</button>
        </div>
      ` : "";

      return `
        <article class="card snippet-card">
          <h2>${currentScope === "trash" ? escapeHtml(snippet.title) : `<a href="snippet.html?id=${snippet.id}">${escapeHtml(snippet.title)}</a>`}</h2>
          <div class="meta">
            <span class="lang">${escapeHtml(snippet.language)}</span>
            ${snippet.tags.map(t => `<span class="tag">${escapeHtml(t.name)}</span>`).join("")}
            <span>${snippet.is_public ? "公开" : "私有"}</span>
          </div>
          ${trashActions}
        </article>
      `;
    }).join("");

    if (currentScope !== "trash") {
      const pages = Math.max(1, Math.ceil(data.total / pageSize));
      pagerEl.innerHTML = `
        <button id="prev" ${data.page <= 1 ? "disabled" : ""}>上一页</button>
        <span>第 ${data.page} / ${pages} 页</span>
        <button id="next" ${data.page >= pages ? "disabled" : ""}>下一页</button>
      `;
      document.getElementById("prev").onclick = () => { currentPage--; loadMySnippets(); };
      document.getElementById("next").onclick = () => { currentPage++; loadMySnippets(); };
    } else {
      pagerEl.innerHTML = ""; // 回收站不分页
    }
    
  } catch (error) {
    listEl.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

// 绑定 Tab 切换
function initMe() {
  if (!getUser()) {
    location.href = "login.html";
    return;
  }

  const tabs = {
    mine: document.getElementById("tab-mine"),
    favorites: document.getElementById("tab-fav"),
    trash: document.getElementById("tab-trash")
  };

  const setActiveTab = (scope) => {
    currentScope = scope;
    currentPage = 1;
    Object.keys(tabs).forEach(k => {
      if (k === scope) {
        tabs[k].classList.add("active");
        tabs[k].style.background = "#0284c7";
      } else {
        tabs[k].classList.remove("active");
        tabs[k].style.background = "#475569";
      }
    });
    loadMySnippets();
  };

  tabs.mine.onclick = () => setActiveTab("mine");
  tabs.favorites.onclick = () => setActiveTab("favorites");
  tabs.trash.onclick = () => setActiveTab("trash");

  loadMySnippets();
}

// 全局操作函数
window.restoreSnippet = async (id) => {
  try {
    await request(`/api/snippets/${id}/restore`, { method: "POST" });
    showToast("✅ 已恢复到你的片段中");
    loadMySnippets();
  } catch (e) { showAlert(e.message); }
};

window.permanentDelete = async (id) => {
  const confirm = await showConfirm("彻底删除后将无法找回，确认吗？");
  if (!confirm) return;
  try {
    await request(`/api/snippets/${id}/permanent`, { method: "DELETE" });
    showToast("🗑️ 已彻底删除");
    loadMySnippets();
  } catch (e) { showAlert(e.message); }
};

document.addEventListener("DOMContentLoaded", initMe);