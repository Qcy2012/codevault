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
  
  // 无论是否登录，都先放上“代码统计”
  let navHTML = `
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