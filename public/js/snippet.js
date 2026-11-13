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
        <span>${escapeHtml(snippet.owner.display_name)}</span>
        <span>${new Date(snippet.created_at).toLocaleString()}</span>
        <span>浏览 ${snippet.view_count}</span>
      </div>
      <div class="actions">
        ${user ? `<button id="fav-btn">收藏</button>` : `<a class="button" href="login.html">登录后收藏</a>`}
        ${isOwner ? `<a class="button" href="edit.html?id=${snippet.id}">编辑</a><button id="del-btn" class="danger">删除</button>` : ""}
      </div>
      ${descHtml ? `<section class="markdown">${descHtml}</section>` : ""}
      <pre><code id="code" class="hljs language-${highlightLanguage(snippet.language)}"></code></pre>
      <button id="copy-btn">复制代码</button>
    </article>
  `;

  const codeEl = document.getElementById("code");
  codeEl.textContent = snippet.code;
  hljs.highlightElement(codeEl);

  document.getElementById("copy-btn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      document.getElementById("copy-btn").textContent = "已复制";
    } catch {
      alert("复制失败，请手动选择代码复制");
    }
  };

  const favBtn = document.getElementById("fav-btn");
  if (favBtn) {
    favBtn.onclick = async () => {
      try {
        await snippetApi.favorite(snippet.id);
        favBtn.textContent = "已收藏";
      } catch (error) {
        alert(error.message);
      }
    };
  }

  const delBtn = document.getElementById("del-btn");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirm("确认删除？")) return;
      try {
        await snippetApi.remove(snippet.id);
        location.href = "index.html";
      } catch (error) {
        alert(error.message);
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

      return `
        <div class="comment-item" style="border-bottom: 1px solid #334155; padding: 12px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <strong style="color: #38bdf8;">${escapeHtml(c.display_name)}</strong>
            <span class="muted" style="font-size: 12px;">${new Date(c.created_at).toLocaleString()}</span>
          </div>
          <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(c.content)}</p>
          ${canDelete ? `<button class="danger" onclick="deleteComment(${c.id}, ${snippetId})" style="font-size: 12px; padding: 4px 10px; margin-top: 8px; border-radius: 4px;">删除</button>` : ""}
        </div>
      `;
    }).join("");
  } catch (error) {
    listEl.innerHTML = `<p class="message error">加载评论失败</p>`;
  }
}

// 绑定发表评论事件
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

// 删除评论
window.deleteComment = async (commentId, snippetId) => {
  if (!confirm("确认删除这条评论吗？")) return;
  try {
    await request(`/api/snippets/comments/${commentId}`, { method: "DELETE" });
    await loadComments(snippetId);
  } catch (error) {
    alert(error.message);
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