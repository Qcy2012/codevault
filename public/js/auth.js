// 初始化主题
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  
  const icon = document.getElementById("theme-toggle");
  if (icon) icon.textContent = next === "dark" ? "🌙" : "☀️";
}

function renderNav() {
  initTheme();
  const nav = document.getElementById("nav-auth");
  if (!nav) return;

  const user = getUser();
  
  let navHTML = `
    <a href="status.html">服务状态</a>
    <a href="dashboard.html">数据仪表板</a>
    <a href="stats.html">代码统计</a>
  `;

  if (user) {
    navHTML += `
      <a href="me.html">我的</a>
      ${user.is_admin ? `<a href="admin.html">管理后台</a>` : ""}
      <span>${escapeHtml(user.display_name)}</span>
      <a href="#" id="logout-link">退出</a>
    `;
  } else {
    navHTML += `<a href="login.html">登录</a> <a href="register.html">注册</a>`;
  }
  
  nav.innerHTML = navHTML;

  // 绑定退出事件
  const logoutBtn = document.getElementById("logout-link");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (event) => {
      event.preventDefault();
      clearAuth();
      location.href = "index.html";
    });
  }

  // 注入主题切换按钮
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const themeBtn = document.createElement("button");
  themeBtn.id = "theme-toggle";
  themeBtn.className = "btn-cancel";
  themeBtn.style.padding = "6px 12px";
  themeBtn.style.marginLeft = "8px";
  themeBtn.textContent = currentTheme === "dark" ? "🌙" : "☀️";
  themeBtn.onclick = toggleTheme;
  nav.appendChild(themeBtn);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function showMessage(el, message, type = "error") {
  el.textContent = message;
  el.className = `message ${type}`;
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const msg = document.getElementById("msg");
  try {
    const data = await authApi.login({
      account: form.elements.account.value.trim(),
      password: form.elements.password.value,
    });
    setToken(data.access_token);
    setUser(data.user);
    location.href = "index.html";
  } catch (error) {
    showMessage(msg, error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.target;
  const msg = document.getElementById("msg");
  try {
    const data = await authApi.register({
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
      display_name: form.elements.display_name.value.trim(),
    });
    setToken(data.access_token);
    setUser(data.user);
    location.href = "index.html";
  } catch (error) {
    showMessage(msg, error.message);
  }
}

document.addEventListener("DOMContentLoaded", renderNav);

// ==========================================
// 全局命令面板 (Command Palette)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // 避免重复注入
  if (document.getElementById("command-palette")) return;

  // 动态注入 HTML
  const paletteHTML = `
    <div id="command-palette" class="command-overlay hidden">
      <div class="command-box">
        <div class="command-input-wrapper">
          <svg style="width: 20px; height: 20px; fill: var(--muted); margin-right: 12px;" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input id="command-input" type="text" placeholder="搜索全站代码片段..." autocomplete="off">
          <span class="command-esc">ESC</span>
        </div>
        <div class="command-hints">
          <span><kbd>Enter</kbd> 搜索</span>
          <span><kbd>ESC</kbd> 关闭</span>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", paletteHTML);

  const overlay = document.getElementById("command-palette");
  const commandInput = document.getElementById("command-input");

  // 键盘监听
  document.addEventListener("keydown", (e) => {
    // 唤起面板
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      overlay.classList.remove("hidden");
      setTimeout(() => commandInput.focus(), 50);
    }
    // 关闭面板
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      overlay.classList.add("hidden");
      commandInput.blur();
    }
  });

  // 点击遮罩层关闭
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      commandInput.blur();
    }
  });

  // 回车执行搜索
  commandInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = commandInput.value.trim();
      overlay.classList.add("hidden");
      commandInput.blur();

      // 智能判断：如果当前在首页，直接刷新列表；如果不在首页，跳转回首页并带上参数
      const isHome = window.location.pathname.endsWith("index.html") || window.location.pathname === "/" || window.location.pathname.endsWith("/");
      
      if (isHome) {
        // 同步搜索框，触发列表刷新
        const searchEl = document.getElementById("search");
        if (searchEl) searchEl.value = q;
        if (typeof state !== "undefined") {
          state.q = q;
          state.page = 1;
          if (typeof loadList === "function") loadList();
        }
      } else {
        // 跳到首页搜索
        window.location.href = `index.html?q=${encodeURIComponent(q)}`;
      }
    }
  });
});