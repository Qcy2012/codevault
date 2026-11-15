function getId() {
  return new URLSearchParams(location.search).get("id");
}

function highlightLanguage(lang) {
  const map = { cpp: "cpp", python: "python", javascript: "javascript", html: "xml", css: "css", other: "plaintext" };
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
  const tags = snippet.tags.map((tag) => `<span class="tag">${escapeHtml(tag.name)}</span>`).join("");
  const descHtml = snippet.description ? DOMPurify.sanitize(marked.parse(snippet.description)) : "";

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
      
      <!-- 两栏布局：代码区 + 大纲区 -->
      <div class="code-layout">
        <div class="code-area">
          <pre id="code-pre" style="background: var(--pre-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 0;"><code id="code" class="hljs language-${highlightLanguage(snippet.language)}"></code></pre>
          <button id="copy-btn" style="margin-top: 12px;">复制代码</button>
        </div>
        <div class="outline-area" id="outline-panel">
          <div class="outline-title">📑 代码大纲</div>
          <div id="outline-list"><p class="muted" style="font-size: 12px;">暂无大纲</p></div>
        </div>
      </div>
    </article>
  `;

  const codeEl = document.getElementById("code");
  codeEl.textContent = snippet.code;
  
  // 1. 执行语法高亮
  hljs.highlightElement(codeEl);

  // 2. 强拆 DOM，给每一行加上 ID（为了实现跳转）
  const rawHtml = codeEl.innerHTML;
  const lines = rawHtml.split('\n');
  let newHtml = "";
  for (let i = 0; i < lines.length; i++) {
    newHtml += `<span class="code-line" id="line-${i + 1}" style="display:block; min-height: 1.6em;">${lines[i] || ' '}</span>`;
  }
  codeEl.innerHTML = newHtml;

  // 3. 生成大纲
  generateOutline(snippet.code, snippet.language);

  // 绑定其他事件...
  initActions(snippet, user, isOwner);
}

// ==========================================
// 核心：提取代码大纲 (单字母标识版)
// ==========================================
function generateOutline(code, lang) {
  const lines = code.split('\n');
  const outlineList = document.getElementById('outline-list');
  const outlineData = [];
  
  const seenSymbols = new Set();
  const declaredVariables = new Set();

  // 收集所有被声明过的变量名
  lines.forEach(line => {
    const varMatch = line.match(/(?:int|double|float|char|bool|void|auto|size_t|string|vector|ifstream|ofstream|stringstream|CURL|CURLcode|fs::path|struct\s+\w+)\s*[\*&]?\s*([a-zA-Z_]\w*)/);
    if (varMatch) declaredVariables.add(varMatch[1]);
  });

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // 过滤空行、注释、预处理，注意：把 namespace 从黑名单里去掉了
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) return;
    if (/^(return|if|for|while|switch|catch|else|using|typedef|template)\b/.test(trimmed)) return;

    let type = null;
    let name = null;

    if (lang === 'cpp' || lang === 'other') {
      // 1. 匹配命名空间
      if (/^namespace\s+([a-zA-Z_]\w*)/.test(trimmed)) {
        name = trimmed.match(/^namespace\s+([a-zA-Z_]\w*)/)[1];
        type = 'namespace';
      }
      // 2. 匹配 Class / Struct
      else if (/(?:^|\s)(?:class|struct)\s+([a-zA-Z_]\w*)\s*(?:\{|:|$)/.test(trimmed) && !trimmed.includes(';')) {
        name = trimmed.match(/(?:class|struct)\s+([a-zA-Z_]\w*)/)[1];
        type = 'class';
      } 
      // 3. 匹配函数
      else if (/([a-zA-Z_]\w*)\s*\([^)]*\)\s*(?:const)?\s*\{/.test(trimmed)) {
        name = trimmed.match(/([a-zA-Z_]\w*)\s*\(/)[1];
        type = 'func';
      }
      // 4. 匹配变量
      else if (/(?:int|double|float|char|bool|auto|size_t|string|vector|map|ifstream|ofstream|stringstream|CURL|CURLcode|fs::path|struct\s+\w+)\s*[\*&]?\s*([a-zA-Z_]\w*)\s*(?:=|\(|;)/.test(trimmed)) {
        name = trimmed.match(/(?:int|double|float|char|bool|auto|size_t|string|vector|map|ifstream|ofstream|stringstream|CURL|CURLcode|fs::path|struct\s+\w+)\s*[\*&]?\s*([a-zA-Z_]\w*)/)[1];
        type = 'var';
      }
    } 
    else if (lang === 'python') {
      const match = trimmed.match(/^(?:def|class)\s+([a-zA-Z_]\w*)/);
      if (match) {
        name = match[1];
        type = trimmed.startsWith('class') ? 'class' : 'func';
      } else if (/^[a-zA-Z_]\w*\s*=[^=]/.test(trimmed)) {
        name = trimmed.split('=')[0].trim();
        type = 'var';
      }
    } 
    else if (lang === 'javascript') {
      const classMatch = trimmed.match(/^class\s+([a-zA-Z_]\w*)/);
      const funcMatch = trimmed.match(/^(?:function|const|let|var)\s+([a-zA-Z_]\w*)\s*(?:=|=>|\()/);
      if (classMatch) { name = classMatch[1]; type = 'class'; }
      else if (funcMatch) { name = funcMatch[1]; type = 'func'; }
    }

    // 最终校验与排重
    if (name && !seenSymbols.has(name)) {
      if (type === 'var' && !declaredVariables.has(name)) return;
      seenSymbols.add(name);
      outlineData.push({ name, line: index + 1, type });
    }
  });

  if (outlineData.length === 0) {
    outlineList.innerHTML = `<p class="muted" style="font-size: 12px;">未能识别出任何符号</p>`;
    return;
  }

  // 渲染大纲：用 F, C, V, N 代替原本的 Emoji
  outlineList.innerHTML = outlineData.map(item => {
    let letter = 'F'; 
    let color = '#38bdf8'; // 默认蓝色
    let title = 'Function';

    if (item.type === 'class') { letter = 'C'; color = '#fbbf24'; title = 'Class/Struct'; }
    if (item.type === 'var') { letter = 'V'; color = '#10b981'; title = 'Variable'; }
    if (item.type === 'namespace') { letter = 'N'; color = '#a78bfa'; title = 'Namespace'; }

    return `
      <div class="outline-item" onclick="scrollToLine(${item.line})" title="${title}: Line ${item.line}">
        <span style="color: ${color}; font-weight: 900; font-family: monospace; margin-right: 6px;">${letter}</span> 
        <span style="font-family: monospace;">${escapeHtml(item.name)}</span>
      </div>
    `;
  }).join("");
}

// 点击大纲平滑滚动并高亮
window.scrollToLine = (lineNum) => {
  const lineEl = document.getElementById(`line-${lineNum}`);
  if (!lineEl) return;

  // 平滑滚动到视野中央
  lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 移除之前的闪烁
  document.querySelectorAll('.code-line-flash').forEach(el => el.classList.remove('code-line-flash'));
  
  // 添加闪烁动画
  lineEl.classList.add('code-line-flash');
  
  // 1秒后移除动画类，方便下次触发
  setTimeout(() => {
    lineEl.classList.remove('code-line-flash');
  }, 1000);
};

// ==========================================
// 其他事件绑定（复制、点赞、删除）
// ==========================================
function initActions(snippet, user, isOwner) {
  const codeEl = document.getElementById("code");
  const preEl = document.getElementById("code-pre");
  
  preEl.style.setProperty("font-family", "'Consolas', monospace", "important");
  preEl.style.setProperty("font-size", "15px", "important");
  preEl.style.setProperty("line-height", "1.6", "important");
  codeEl.querySelectorAll("*").forEach(child => {
    child.style.setProperty("font-family", "'Consolas', monospace", "important");
  });

  document.getElementById("copy-btn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      showToast("✅ 代码已复制到剪贴板！");
    } catch {
      showAlert("复制失败，请手动选择代码复制");
    }
  };

  const likeBtn = document.getElementById("like-btn");
  if (likeBtn && user) {
    likeBtn.onclick = async () => {
      try {
        const res = await request(`/api/snippets/${snippet.id}/like`, { method: "POST" });
        const countEl = document.getElementById("like-count");
        let count = parseInt(countEl.textContent);
        
        if (res.liked) {
          likeBtn.classList.add("danger");
          likeBtn.style.background = "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)";
          likeBtn.style.borderColor = "#b91c1c";
          likeBtn.style.boxShadow = "0 2px 6px rgba(220, 38, 38, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)";
          likeBtn.innerHTML = `👍 已赞 (<span id="like-count">${count + 1}</span>)`;
        } else {
          likeBtn.classList.remove("danger");
          likeBtn.style.background = "linear-gradient(180deg, #10b981 0%, #059669 100%)";
          likeBtn.style.borderColor = "#047857";
          likeBtn.style.boxShadow = "0 2px 6px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)";
          likeBtn.innerHTML = `👍 点赞 (<span id="like-count">${count - 1}</span>)`;
        }
      } catch (e) { showAlert(e.message); }
    };
  }

  const favBtn = document.getElementById("fav-btn");
  if (favBtn) {
    favBtn.onclick = async () => {
      try {
        await snippetApi.favorite(snippet.id);
        showToast("✅ 收藏成功");
        favBtn.textContent = "已收藏";
      } catch (error) { showAlert(error.message); }
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
      } catch (error) { showAlert(error.message); }
    };
  }
}

// ==========================================
// 评论功能逻辑 (保持原样)
// ==========================================
async function loadComments(snippetId) {
  const listEl = document.getElementById("comments-list");
  listEl.innerHTML = `<p class="muted">加载评论中...</p>`;
  try {
    const comments = await request(`/api/snippets/${snippetId}/comments`, { auth: false });
    const user = getUser();
    if (comments.length === 0) {
      listEl.innerHTML = `<p class="muted">暂无评论，快来抢沙发！</p>`;
      return;
    }
    listEl.innerHTML = comments.map(c => {
      const isOwner = user && user.id === c.user_id;
      const isAdmin = user && user.is_admin;
      const canDelete = isOwner || isAdmin;
      const displayTime = c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { hour12: false }) : '';
      return `
        <div class="comment-item" style="border-bottom: 1px solid var(--border-color); padding: 12px 0;">
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
    if (!content) return showAlert("评论不能为空");
    btn.disabled = true;
    btn.textContent = "发送中...";
    try {
      await request(`/api/snippets/${snippetId}/comments`, { method: "POST", body: { content } });
      input.value = "";
      await loadComments(snippetId);
    } catch (error) {
      showAlert(error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "发送评论";
    }
  };
}

window.deleteComment = async (commentId, snippetId) => {
  const isConfirmed = await showConfirm("确认删除这条评论吗？");
  if (!isConfirmed) return;
  try {
    await request(`/api/snippets/comments/${commentId}`, { method: "DELETE" });
    await loadComments(snippetId);
  } catch (error) { showAlert(error.message); }
};

document.addEventListener("DOMContentLoaded", () => {
  const id = getId();
  if (id) {
    loadComments(id);
    initCommentForm(id);
  }
  loadSnippet();
});