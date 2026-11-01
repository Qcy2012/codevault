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

document.addEventListener("DOMContentLoaded", loadSnippet);