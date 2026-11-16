function escapeHtml(str) { 
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); 
}

// 加载代码列表
async function loadSnippets() {
  const tbody = document.getElementById("admin-table-body");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">加载中...</td></tr>`;
  
  try {
    const res = await fetch(`${API_BASE}/api/admin/snippets`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error("获取列表失败");
    const rows = await res.json();

    if (rows.length === 0) {
       tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="muted">暂无数据</td></tr>`;
       return;
    }

    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${row.id}</td>
        <td><a href="snippet.html?id=${row.id}" target="_blank">${escapeHtml(row.title)}</a></td>
        <td>${escapeHtml(row.display_name)}</td>
        <td>
          <span class="tag" style="background: ${row.is_public ? '#166534' : '#991b1b'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px;">
            ${row.is_public ? "公开" : "已隐藏"}
          </span>
        </td>
        <td>
          <button onclick="toggleVisibility(${row.id}, ${row.is_public})" style="padding: 4px 8px; font-size: 12px;">
            ${row.is_public ? "下架" : "恢复"}
          </button>
          <button class="danger" onclick="deleteSnippet(${row.id})" style="padding: 4px 8px; font-size: 12px;">删除</button>
        </td>
      </tr>
    `).join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="message error" style="text-align: center;">${error.message}</td></tr>`;
  }
}

// 加载操作日志
async function loadLogs() {
  const tbody = document.getElementById("logs-table-body");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">加载中...</td></tr>`;
  
  try {
    const res = await fetch(`${API_BASE}/api/admin/logs`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.detail || `请求失败 (${res.status})`);
    }

    const rows = await res.json();

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align: center;">暂无日志记录</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      let timeStr = row.created_at ? row.created_at.replace(' ', 'T') + 'Z' : '';
      let displayTime = timeStr ? new Date(timeStr).toLocaleString('zh-CN', { hour12: false }) : '';
      
      let actionColor = '#38bdf8';
      if (row.action.includes("DELETE")) actionColor = '#f87171';
      if (row.action.includes("CREATE")) actionColor = '#10b981';

      return `
        <tr>
          <td style="font-size: 12px; color: var(--muted);">${displayTime}</td>
          <td><strong>${escapeHtml(row.display_name || 'System')}</strong></td>
          <td><span style="color: ${actionColor}; font-family: monospace; font-weight: bold;">${escapeHtml(row.action)}</span></td>
          <td style="font-size: 14px;">${escapeHtml(row.details)}</td>
          <td style="font-size: 12px; color: var(--muted);">${escapeHtml(row.ip_address || '-')}</td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="message error" style="text-align: center;">${error.message}</td></tr>`;
  }
}

// 初始化
function initAdmin() {
  const user = getUser();
  if (!user || !user.is_admin) {
    showAlert("无权访问，即将跳转回首页");
    setTimeout(() => location.href = "index.html", 1500);
    return;
  }

  const tabSnippets = document.getElementById("tab-snippets");
  const tabLogs = document.getElementById("tab-logs");
  const panelSnippets = document.getElementById("panel-snippets");
  const panelLogs = document.getElementById("panel-logs");

  // 使用最暴力的 style.display 控制面板
  const switchTab = (tab) => {
    if (tab === 'snippets') {
      tabSnippets.classList.add("active");
      tabLogs.classList.remove("active");
      
      panelSnippets.style.display = "block";
      panelLogs.style.display = "none";
      
      loadSnippets();
    } else {
      tabLogs.classList.add("active");
      tabSnippets.classList.remove("active");
      
      panelSnippets.style.display = "none";
      panelLogs.style.display = "block";
      
      loadLogs();
    }
  };

  tabSnippets.onclick = () => switchTab('snippets');
  tabLogs.onclick = () => switchTab('logs');

  // 默认加载代码管理
  switchTab('snippets');
}

// 管理员操作函数
window.toggleVisibility = async (id, currentIsPublic) => {
  try {
    const res = await fetch(`${API_BASE}/api/admin/snippets/${id}/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
      body: JSON.stringify({ is_public: !currentIsPublic })
    });
    if (res.ok) {
      showToast("✅ 状态已更新");
      loadSnippets();
    } else {
      showAlert("操作失败");
    }
  } catch (e) { showAlert(e.message); }
};

window.deleteSnippet = async (id) => {
  const isConfirmed = await showConfirm(`确认强制删除片段 #${id}？此操作不可恢复。`);
  if (!isConfirmed) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/admin/snippets/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    if (res.ok) {
      showToast("🗑️ 已彻底删除");
      loadSnippets();
    } else {
      showAlert("删除失败");
    }
  } catch (e) { showAlert(e.message); }
};

document.addEventListener("DOMContentLoaded", initAdmin);