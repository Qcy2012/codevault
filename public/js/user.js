//public/js/user.js
const userId = new URLSearchParams(location.search).get("id");

async function loadUserProfile() {
  if (!userId) return location.href = "index.html";

  try {
    const user = await request(`/api/users/${userId}/profile`, { auth: false });
    document.getElementById("user-info").innerHTML = `
      <div style="width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: #fff; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);">
        ${escapeHtml(user.display_name.charAt(0).toUpperCase())}
      </div>
      <div>
        <h2 style="margin: 0; font-size: 24px;">${escapeHtml(user.display_name)}</h2>
        <p class="muted" style="margin: 4px 0 0 0;">用户加入于 ${new Date(user.created_at).toLocaleDateString()}</p>
      </div>
    `;

    const snippets = await request(`/api/users/${userId}/snippets`, { auth: false });

    if (snippets.length === 0) {
      document.getElementById("list").innerHTML = `<p class="muted">该用户暂无公开片段</p>`;
      return;
    }

    document.getElementById("list").innerHTML = snippets.map(s => {
      let tags = [];
      try { tags = JSON.parse(s.tags || "[]"); } catch(e) {}
      
      return `
        <article class="card snippet-card">
          <h2><a href="snippet.html?id=${s.id}">${escapeHtml(s.title)}</a></h2>
          <div class="meta">
            <span class="lang">${escapeHtml(s.language)}</span>
            <span>👍 ${s.likes_count} · 浏览 ${s.view_count}</span>
            <span>${new Date(s.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
          </div>
        </article>
      `;
    }).join("");

  } catch (error) {
    document.getElementById("list").innerHTML = `<p class="message error">${error.message}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", loadUserProfile);