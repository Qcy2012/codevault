function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadSnippets() {
  const tbody = document.getElementById("admin-table-body");
  try {
    const res = await fetch(`${API_BASE}/api/admin/snippets`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error("获取列表失败");
    const rows = await res.json();

    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${row.id}</td>
        <td><a href="snippet.html?id=${row.id}" target="_blank">${escapeHtml(row.title)}</a></td>
        <td>${escapeHtml(row.display_name)}</td>
        <td>
          <span class="tag" style="background: ${row.is_public ? '#166534' : '#991b1b'};">
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
    tbody.innerHTML = `<tr><td colspan="5" class="message error">${error.message}</td></tr>`;
  }
}

async function loadLogs() {
  const tbody = document.getElementById("logs-table-body");
  tbody.innerHTML = `<tr><td colspan="5">加载中...</td></tr>`;
  try {
    const res = await fetch(`${API_BASE}/api/admin/logs`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error("获取日志失败");
    const rows = await res.json();

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;">暂无日志记录</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      let timeStr = row.created_at ? row.created_at.replace(' ', 'T') + 'Z' : '';
      let displayTime = timeStr ? new Date(timeStr).toLocaleString('zh-CN', { hour12: false }) : '';
      
      // 给不同的动作上不同的颜色
      let actionColor = '#38bdf8';
      if (row.action.includes("DELETE")) actionColor = '#f87171';
      if (row.action.includes("CREATE")) actionColor = '#10b981';

      return `
        <tr>
          <td style="font-size: 12px; color: var(--muted);">${displayTime}</td>
          <td><strong>${escapeHtml(row.display_name || 'System')}</strong></td>
          <td><span style="color: ${actionColor}; font-family: monospace; font-weight: bold;">${row.action}</span></td>
          <td>${escapeHtml(row.details)}</td>
          <td style="font-size: 12px; color: var(--muted);">${row.ip_address || '-'}</td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="message error">${error.message}</td></tr>`;
  }
}

function initAdmin() {
  const user = getUser();
  if (!user || !user.is_admin) {
    alert("无权访问");
    location.href = "index.html";
    return;
  }

  const tabSnippets = document.getElementById("tab-snippets");
  const tabLogs = document.getElementById("tab-logs");
  const panelSnippets = document.getElementById("panel-snippets");
  const panelLogs = document.getElementById("panel-logs");

  const switchTab = (tab) => {
    if (tab === 'snippets') {
      tabSnippets.style.background = "#0284c7";
      tabLogs.style.background = "#475569";
      panelSnippets.classList.remove("hidden");
      panelLogs.classList.add("hidden");
      loadSnippets();
    } else {
      tabSnippets.style.background = "#475569";
      tabLogs.style.background = "#0284c7";
      panelSnippets.classList.add("hidden");
      panelLogs.classList.remove("hidden");
      loadLogs();
    }
  };

  tabSnippets.onclick = () => switchTab('snippets');
  tabLogs.onclick = () => switchTab('logs');

  switchTab('snippets');
}

// 全局动作函数
window.toggleVisibility = async (id, currentIsPublic) => {
  try {
    await fetch(`${API_BASE}/api/admin/snippets/${id}/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
      body: JSON.stringify({ is_public: !currentIsPublic })
    });
    loadSnippets();
  } catch (e) { alert("操作失败"); }
};

window.deleteSnippet = async (id) => {
  const isConfirmed = await showConfirm(`确认强制删除片段 #${id}？`);
  if (!isConfirmed) return;
  try {
    await fetch(`${API_BASE}/api/admin/snippets/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    loadSnippets();
  } catch (e) { alert("删除失败"); }
};

document.addEventListener("DOMContentLoaded", initAdmin);