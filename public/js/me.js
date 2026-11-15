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
      data = await request("/api/snippets/trash");
    } else {
      data = await snippetApi.list({ scope: currentScope, page: currentPage, page_size: pageSize });
    }
    
    if (!data.items.length) {
      listEl.innerHTML = `<p class="empty">这里空空如也</p>`;
      pagerEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = data.items.map(snippet => {
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
      pagerEl.innerHTML = "";
    }
    
  } catch (error) {
    listEl.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

function initMe() {
  if (!getUser()) {
    location.href = "login.html";
    return;
  }

  const listEl = document.getElementById("list");
  const pagerEl = document.getElementById("pager");
  const devPanel = document.getElementById("dev-panel");

  const tabs = {
    mine: document.getElementById("tab-mine"),
    favorites: document.getElementById("tab-fav"),
    trash: document.getElementById("tab-trash"),
    dev: document.getElementById("tab-dev")
  };

  const setActiveTab = (scope) => {
    currentScope = scope;
    currentPage = 1;

    if (scope === "dev") {
      listEl.classList.add("hidden");
      pagerEl.classList.add("hidden");
      devPanel.classList.remove("hidden");
    } else {
      devPanel.classList.add("hidden");
      listEl.classList.remove("hidden");
      pagerEl.classList.remove("hidden");
      loadMySnippets();
    }

    Object.keys(tabs).forEach(k => {
      if (k === scope) {
        tabs[k].classList.add("active");
        tabs[k].style.background = "#0284c7";
      } else {
        tabs[k].classList.remove("active");
        tabs[k].style.background = "#475569";
      }
    });
  };

  tabs.mine.onclick = () => setActiveTab("mine");
  tabs.favorites.onclick = () => setActiveTab("favorites");
  tabs.trash.onclick = () => setActiveTab("trash");
  tabs.dev.onclick = () => setActiveTab("dev");

  // 生成 Key 按钮事件
  document.getElementById("gen-key-btn").onclick = async () => {
    const btn = document.getElementById("gen-key-btn");
    btn.disabled = true;
    btn.textContent = "生成中...";
    try {
      const res = await fetch(`${API_BASE}/api/users/api-key`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.api_key) {
        document.getElementById("api-key-input").value = data.api_key;
        showToast("✅ 新 API Key 已生成");
      }
    } catch (e) {
      showAlert("生成失败");
    } finally {
      btn.disabled = false;
      btn.textContent = "生成新 Key";
    }
  };

  setActiveTab("mine");
}

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