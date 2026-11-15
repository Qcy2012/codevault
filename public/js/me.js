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

async function loadApiStats() {
  try {
    const res = await fetch(`${API_BASE}/api/users/api-key`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    const data = await res.json();
    
    if (res.ok) {
      // 更新 Key 输入框
      document.getElementById("api-key-input").value = data.api_key || "";
      
      // 更新统计数据
      document.getElementById("api-usage-count").innerText = data.api_key_usage || 0;
      
      // 格式化时间
      if (data.last_api_call_at) {
        // 补齐时区 Z
        const isoStr = data.last_api_call_at.replace(' ', 'T') + 'Z';
        document.getElementById("api-last-call").innerText = new Date(isoStr).toLocaleString('zh-CN', { hour12: false });
      } else {
        document.getElementById("api-last-call").innerText = "从未调用";
      }
    }
  } catch (e) {
    console.error("加载 API 统计失败", e);
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

    // 使用强制隐藏类，彻底解决重叠
    if (scope === "dev") {
      listEl.classList.add("hidden-force");
      pagerEl.classList.add("hidden-force");
      devPanel.classList.remove("hidden");
      loadApiStats(); // <- 新增：每次切换到面板时加载最新数据
    } else {
      devPanel.classList.add("hidden");
      listEl.classList.remove("hidden-force");
      pagerEl.classList.remove("hidden-force");
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
      if (res.ok) {
        document.getElementById("api-key-input").value = data.api_key;
        showToast("✅ 新 API Key 已生成");
      } else {
        // 把具体的 500 报错原因弹出来
        showAlert(`错误: ${data.detail || data.error || "生成失败"}`);
      }
    } catch (e) {
      showAlert("网络请求失败，请查看控制台");
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