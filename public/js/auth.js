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
    <a href="api-docs.html">API文档</a>
    <a href="diff.html">代码对比</a>
    <a href="status.html">服务状态</a>
    <a href="stats.html">代码统计</a>
    <a href="dashboard.html">数据仪表板</a>
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
  document.getElementById("logout-link").addEventListener("click", async (event) => {
    event.preventDefault();
    
    const token = getToken();
    if (token) {
      // 先通知后端立刻下线，再去清理本地状态
      try {
        await fetch(`${API_BASE}/api/users/offline`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch (e) {
        console.error("下线通知失败", e);
      }
    }
    
    clearAuth();
    location.href = "index.html";
  });

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
// 全局命令面板 (支持搜索 + 指令模式)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("command-palette")) return;

  // 1. 定义所有可用的指令
  const commands = [
    { id: "dark", title: "切换深色/浅色模式", icon: "Dark/Light", run: () => { if (typeof toggleTheme === 'function') toggleTheme(); } },
    { id: "new", title: "发布新代码片段", icon: "New Snippet", run: () => { location.href = "edit.html"; } },
    { id: "home", title: "返回首页", icon: "Home", run: () => { location.href = "index.html"; } },
    { id: "dashboard", title: "打开数据仪表板", icon: "Data Dashboard", run: () => { location.href = "dashboard.html"; } },
    { id: "api", title: "查看 API 文档", icon: "View API Docs", run: () => { location.href = "api-docs.html"; } },
    { id: "my", title: "我的主页", icon: "My Profile", run: () => { 
        if (getUser()) location.href = "me.html"; 
        else location.href = "login.html"; 
    }},
    { id: "logout", title: "退出登录", icon: "Logout", run: () => { 
        clearAuth();
        location.href = "index.html"; 
    }}
  ];

  // 2. 注入 HTML 骨架
  const paletteHTML = `
    <div id="command-palette" class="command-overlay hidden">
      <div class="command-box">
        <div class="command-input-wrapper">
          <svg id="cmd-icon" style="width: 20px; height: 20px; fill: var(--muted); margin-right: 12px;" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input id="command-input" type="text" placeholder="输入搜索关键词，或输入 > 进入指令模式..." autocomplete="off">
          <span class="command-esc">ESC</span>
        </div>
        
        <!-- 指令列表容器 -->
        <div id="command-list" class="command-list"></div>
        
        <div class="command-hints" id="command-hints">
          <span><kbd>Enter</kbd> 搜索</span>
          <span><kbd>ESC</kbd> 关闭</span>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", paletteHTML);

  const overlay = document.getElementById("command-palette");
  const commandInput = document.getElementById("command-input");
  const commandList = document.getElementById("command-list");
  const hints = document.getElementById("command-hints");

  let isCommandMode = false;
  let filteredCommands = [];
  let selectedIndex = 0;

  // 3. 渲染指令列表
  const renderCommands = (query) => {
    const searchTerm = query.slice(1).toLowerCase().trim();
    
    // 过滤匹配的指令
    filteredCommands = commands.filter(cmd => 
      cmd.id.toLowerCase().includes(searchTerm) || 
      cmd.title.includes(searchTerm)
    );

    if (filteredCommands.length === 0) {
      commandList.innerHTML = `<div class="command-item" style="justify-content: center; color: var(--muted);">没有找到匹配的指令</div>`;
      selectedIndex = -1;
      return;
    }

    selectedIndex = 0; // 默认选中第一个
    commandList.innerHTML = filteredCommands.map((cmd, i) => `
      <div class="command-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
        <div class="command-icon">${cmd.icon}</div>
        <div class="command-text">${cmd.title}</div>
        <div class="command-shortcut">&gt; ${cmd.id}</div>
      </div>
    `).join("");

    // 绑定鼠标点击事件
    document.querySelectorAll(".command-item").forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const index = Number(el.dataset.index);
        if (filteredCommands[index]) executeCommand(filteredCommands[index]);
      };
    });
  };

  // 4. 执行指令
  const executeCommand = (cmd) => {
    overlay.classList.add("hidden");
    commandInput.value = "";
    setTimeout(() => cmd.run(), 100); // 留出动画时间
  };

  // 5. 核心：输入监听（切换模式）
  commandInput.addEventListener("input", (e) => {
    const val = commandInput.value;

    if (val.startsWith(">")) {
      // 进入指令模式
      isCommandMode = true;
      commandList.classList.add("show");
      hints.style.display = "none"; // 隐藏原本的搜索提示
      document.getElementById("cmd-icon").innerHTML = `<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>`; // 变成对勾图标
      renderCommands(val);
    } else {
      // 退出指令模式
      isCommandMode = false;
      commandList.classList.remove("show");
      hints.style.display = "flex";
      document.getElementById("cmd-icon").innerHTML = `<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>`;
    }
  });

  // 6. 键盘事件（Esc 关闭、回车执行、上下键切换）
  commandInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      overlay.classList.add("hidden");
      commandInput.blur();
      return;
    }

    if (isCommandMode) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (selectedIndex < filteredCommands.length - 1) {
          document.querySelectorAll(".command-item")[selectedIndex].classList.remove("selected");
          selectedIndex++;
          const el = document.querySelectorAll(".command-item")[selectedIndex];
          el.classList.add("selected");
          el.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (selectedIndex > 0) {
          document.querySelectorAll(".command-item")[selectedIndex].classList.remove("selected");
          selectedIndex--;
          const el = document.querySelectorAll(".command-item")[selectedIndex];
          el.classList.add("selected");
          el.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
      }
    } else {
      // 普通搜索逻辑
      if (e.key === "Enter") {
        const q = commandInput.value.trim();
        if (!q) return;
        overlay.classList.add("hidden");
        commandInput.blur();
        
        const isHome = window.location.pathname.endsWith("index.html") || window.location.pathname === "/" || window.location.pathname.endsWith("/");
        if (isHome) {
          const searchEl = document.getElementById("search");
          if (searchEl) searchEl.value = q;
          if (typeof state !== "undefined") {
            state.q = q; state.page = 1;
            if (typeof loadList === "function") loadList();
          }
        } else {
          window.location.href = `index.html?q=${encodeURIComponent(q)}`;
        }
      }
    }
  });

  // 7. 全局唤起快捷键 (Ctrl + K)
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      overlay.classList.remove("hidden");
      commandInput.value = ""; // 清空上次内容
      commandInput.dispatchEvent(new Event("input")); // 重置模式
      setTimeout(() => commandInput.focus(), 50);
    }
  });

  // 点击遮罩层关闭
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      commandInput.blur();
    }
  });
});

// ==========================================
// 全局在线状态心跳 (Heartbeat)
// ==========================================
function startHeartbeat() {
  const token = getToken();
  if (!token) return; // 没登录不发心跳

  // 发送心跳的函数
  const sendHeartbeat = async () => {
    try {
      await fetch(`${API_BASE}/api/users/heartbeat`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } catch (e) {
      // 忽略心跳报错，防止控制台一直红屏
    }
  };

  // 页面加载立刻发一次
  sendHeartbeat();

  // 每 3 分钟发一次心跳（5分钟的统计窗口，3分钟发一次足够安全）
  setInterval(sendHeartbeat, 3 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", startHeartbeat);

// ==========================================
// 全局自定义下拉菜单 (Custom Select)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const selects = document.querySelectorAll("select");

  selects.forEach(originalSelect => {
    // 如果已经被替换过，就跳过
    if (originalSelect.dataset.customized) return;
    originalSelect.dataset.customized = "true";

    // 隐藏原生 select
    originalSelect.style.display = "none";

    // 创建自定义容器
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select-wrapper";
    originalSelect.parentNode.insertBefore(wrapper, originalSelect);
    wrapper.appendChild(originalSelect);

    const trigger = document.createElement("div");
    trigger.className = "custom-select-trigger";
    
    // 箭头 SVG
    trigger.innerHTML = `
      <span class="custom-select-label">${originalSelect.options[originalSelect.selectedIndex]?.text || ""}</span>
      <svg class="custom-select-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
    `;
    wrapper.appendChild(trigger);

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "custom-select-options";
    wrapper.appendChild(optionsContainer);

    // 渲染选项
    const renderOptions = () => {
      optionsContainer.innerHTML = "";
      Array.from(originalSelect.options).forEach((opt, index) => {
        const div = document.createElement("div");
        div.className = "custom-select-option";
        div.textContent = opt.text;
        
        // 处理分组（optgroup）
        if (opt.parentElement.tagName === "OPTGROUP") {
          div.textContent = opt.parentElement.label + " - " + opt.text; // 简单处理
        }

        if (opt.selected) div.classList.add("selected");

        div.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          originalSelect.selectedIndex = index;
          // 触发原生的 change 事件，保证原有页面的下拉逻辑正常执行！
          originalSelect.dispatchEvent(new Event("change"));
          
          // 更新 UI
          trigger.querySelector(".custom-select-label").textContent = opt.text;
          wrapper.classList.remove("open");
          renderOptions();
        };
        optionsContainer.appendChild(div);
      });
    };

    renderOptions();

    // 点击展开/收起
    trigger.onclick = (e) => {
      e.preventDefault(); 
      e.stopPropagation();
      // 关闭其他已打开的
      document.querySelectorAll(".custom-select-wrapper").forEach(w => {
        if (w !== wrapper) w.classList.remove("open");
      });
      wrapper.classList.toggle("open");
    };

    originalSelect.addEventListener("change", () => {
      const selectedOpt = originalSelect.options[originalSelect.selectedIndex];
      trigger.querySelector(".custom-select-label").textContent = selectedOpt ? selectedOpt.text : "";
      renderOptions();
    });
  });

  // 点击空白处关闭
  document.addEventListener("click", () => {
    document.querySelectorAll(".custom-select-wrapper").forEach(w => w.classList.remove("open"));
  });
});