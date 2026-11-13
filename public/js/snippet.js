function getId() {
  return new URLSearchParams(location.search).get("id");
}

function highlightLanguage(lang) {
  const map = {
    cpp: "cpp",
    python: "python",
    javascript: "javascript",
    html: "xml",
    css: "css",
    other: "plaintext",
  };
  return map[lang] || "plaintext";
}

async function loadSnippet() {
  const id = getId();
  const root = document.getElementById("detail");
  if (!id) {
    root.innerHTML = `<p class="message error">缺少片段 ID</p>`;
    return;
  }

  try {
    const snippet = await snippetApi.get(id);
    renderSnippet(snippet, root);
  } catch (error) {
    root.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

function renderSnippet(snippet, root) {
  const user = getUser();
  const isOwner = user && user.id === snippet.owner.id;
  const tags = snippet.tags
    .map((tag) => `<span class="tag">${escapeHtml(tag.name)}</span>`)
    .join("");
  const descHtml = snippet.description
    ? DOMPurify.sanitize(marked.parse(snippet.description))
    : "";

  root.innerHTML = `
    <article class="card">
      <h1>${escapeHtml(snippet.title)}</h1>
      <div class="meta">
        <span class="lang">${escapeHtml(snippet.language)}</span>
        ${tags}
        <a href="user.html?id=${snippet.owner.id}" style="color: var(--text-color); font-weight: bold;">👤 ${escapeHtml(snippet.owner.display_name)}</a>
        <span>${new Date(snippet.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
        <span>浏览 ${snippet.view_count}</span>
      </div>
      <div class="actions">
        <button id="like-btn" class="${snippet.is_liked ? 'danger' : ''}" style="${snippet.is_liked ? '' : 'background: linear-gradient(180deg, #10b981 0%, #059669 100%); border-color: #047857;'}">
          👍 ${snippet.is_liked ? '已赞' : '点赞'} (<span id="like-count">${snippet.likes_count}</span>)
        </button>
        ${user ? `<button id="fav-btn">收藏</button>` : `<a class="button" href="login.html">登录后收藏</a>`}
        ${isOwner ? `<a class="button" href="edit.html?id=${snippet.id}">编辑</a><button id="del-btn" class="danger">删除</button>` : ""}
      </div>
      ${descHtml ? `<section class="markdown">${descHtml}</section>` : ""}
      
      <pre id="code-pre" style="background: #020617; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0;"><code id="code" class="hljs language-${highlightLanguage(snippet.language)}"></code></pre>
      
      <button id="copy-btn" style="margin-top: 12px;">复制代码</button>
    </article>
  `;

  const codeEl = document.getElementById("code");
  codeEl.textContent = snippet.code;
  hljs.highlightElement(codeEl);

  const preEl = document.getElementById("code-pre");
  preEl.style.setProperty("font-family", "'Consolas', 'Cascadia Code', 'Courier New', monospace", "important");
  preEl.style.setProperty("font-size", "16px", "important");
  preEl.style.setProperty("line-height", "1.6", "important");

  codeEl.style.setProperty("font-family", "'Consolas', 'Cascadia Code', 'Courier New', monospace", "important");
  codeEl.style.setProperty("font-size", "16px", "important");
  codeEl.style.setProperty("line-height", "1.6", "important");

  codeEl.querySelectorAll("*").forEach(child => {
    child.style.setProperty("font-family", "'Consolas', 'Cascadia Code', 'Courier New', monospace", "important");
    child.style.setProperty("font-size", "16px", "important");
    child.style.setProperty("line-height", "1.6", "important");
  });

  document.getElementById("copy-btn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      showToast("✅ 代码已复制到剪贴板！"); // 改用 Toast
    } catch {
      showToast("复制失败，请手动选择代码复制", true);
    }
  };

  const favBtn = document.getElementById("fav-btn");
  if (favBtn) {
    favBtn.onclick = async () => {
      try {
        await snippetApi.favorite(snippet.id);
        favBtn.textContent = "已收藏";
      } catch (error) {
        showAlert(error.message);
      }
    };
  }

  const delBtn = document.getElementById("del-btn");
  if (delBtn) {
    delBtn.onclick = async () => {
      const isConfirmed = await showConfirm("确认删除这个代码片段吗？");
      if (!isConfirmed) return;
      
      try {
        await snippetApi.remove(snippet.id);
        location.href = "index.html";
      } catch (error) {
        showAlert(error.message);
      }
    };
  }

  const likeBtn = document.getElementById("like-btn");
  if (likeBtn && user) {
    likeBtn.onclick = async () => {
      try {
        const res = await request(`/api/snippets/${snippet.id}/like`, { method: "POST" });
        const countEl = document.getElementById("like-count");
        let count = parseInt(countEl.textContent);
        
        if (res.liked) {
          likeBtn.classList.add("danger"); // 添加危险类（用于点击态的内阴影）
          likeBtn.style.background = "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)";
          likeBtn.style.borderColor = "#b91c1c";
          likeBtn.style.boxShadow = "0 2px 6px rgba(220, 38, 38, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)"; // 红色发光阴影
          likeBtn.innerHTML = `👍 已赞 (<span id="like-count">${count + 1}</span>)`;
        } else {
          likeBtn.classList.remove("danger"); // 移除危险类
          likeBtn.style.background = "linear-gradient(180deg, #10b981 0%, #059669 100%)";
          likeBtn.style.borderColor = "#047857";
          likeBtn.style.boxShadow = "0 2px 6px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)"; // 绿色发光阴影
          likeBtn.innerHTML = `👍 点赞 (<span id="like-count">${count - 1}</span>)`;
        }
      } catch (e) {
        showAlert(e.message);
      }
    };
  }
}

// ==========================================
// 评论功能逻辑
// ==========================================

async function loadComments(snippetId) {
  const listEl = document.getElementById("comments-list");
  listEl.innerHTML = `<p class="muted">加载评论中...</p>`;

  try {
    const comments = await request(`/api/snippets/${snippetId}/comments`, { auth: false });
    const user = getUser();

    if (comments.length === 0) {
      listEl.innerHTML = `<p class="muted">暂无评论，快来抢首评！</p>`;
      return;
    }

    listEl.innerHTML = comments.map(c => {
      const isOwner = user && user.id === c.user_id;
      const isAdmin = user && user.is_admin;
      const canDelete = isOwner || isAdmin;

      // 后端现在返回的是标准的 ISO 字符串，直接使用即可
      const displayTime = c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { hour12: false }) : '';

      return `
        <div class="comment-item" style="border-bottom: 1px solid #334155; padding: 12px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <strong style="color: #38bdf8;">${escapeHtml(c.display_name)}</strong>
            <span class="muted" style="font-size: 12px;">${displayTime}</span>
          </div>
          <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${escapeHtml(c.content)}</p>
          ${canDelete ? `<button class="danger" onclick="deleteComment(${c.id}, ${snippetId})" style="font-size: 12px; padding: 4px 10px; margin-top: 8px; border-radius: 4px;">删除</button>` : ""}
        </div>
      `;
    }).join("");
  } catch (error) {
    console.error("获取评论报错详情:", error);
    listEl.innerHTML = `<p class="message error">加载评论失败: ${escapeHtml(error.message)}</p>`;
  }
}

function initCommentForm(snippetId) {
  const user = getUser();
  const formContainer = document.getElementById("comment-form-container");

  if (!user) {
    formContainer.innerHTML = `<p class="muted"><a href="login.html">登录</a> 后即可发表评论</p>`;
    return;
  }

  const btn = document.getElementById("submit-comment-btn");
  const input = document.getElementById("comment-input");

  btn.onclick = async () => {
    const content = input.value.trim();
    if (!content) return alert("评论不能为空");

    btn.disabled = true;
    btn.textContent = "发送中...";

    try {
      await request(`/api/snippets/${snippetId}/comments`, {
        method: "POST",
        body: { content }
      });
      input.value = "";
      await loadComments(snippetId);
    } catch (error) {
      alert(error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "发送评论";
    }
  };
}

window.deleteComment = async (commentId, snippetId) => {
  // 使用新的自定义弹窗
  const isConfirmed = await showConfirm("确认删除这条评论吗？");
  if (!isConfirmed) return;
  
  try {
    await request(`/api/snippets/comments/${commentId}`, { method: "DELETE" });
    await loadComments(snippetId);
  } catch (error) {
    showAlert(error.message);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const id = getId();
  if (id) {
    loadComments(id);
    initCommentForm(id);
  }
  loadSnippet();
});