function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadAdminData() {
  const user = getUser();
  if (!user || !user.is_admin) {
    showAlert("无权访问");
    location.href = "index.html";
    return;
  }

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

window.toggleVisibility = async (id, currentIsPublic) => {
  try {
    await fetch(`${API_BASE}/api/admin/snippets/${id}/visibility`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}` 
      },
      body: JSON.stringify({ is_public: !currentIsPublic })
    });
    loadAdminData();
  } catch (e) {
    showAlert("操作失败");
  }
};

window.deleteSnippet = async (id) => {
  if (!confirm(`确认删除片段 #${id}？`)) return;
  try {
    await fetch(`${API_BASE}/api/admin/snippets/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    loadAdminData();
  } catch (e) {
    showAlert("删除失败");
  }
};

document.addEventListener("DOMContentLoaded", loadAdminData);