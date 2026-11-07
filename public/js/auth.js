function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
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

function renderNav() {
  const nav = document.getElementById("nav-auth");
  if (!nav) return;

  const user = getUser();
  if (user) {
    nav.innerHTML = `
      <a href="stats.html">代码统计</a>
      <a href="me.html">我的</a>
      ${user.is_admin ? `<a href="admin.html">管理后台</a>` : ""}
      <span>${escapeHtml(user.display_name)}</span>
      <a href="#" id="logout-link">退出</a>
    `;

    document.getElementById("logout-link").addEventListener("click", (event) => {
      event.preventDefault();
      clearAuth();
      location.href = "index.html";
    });
  } else {
    nav.innerHTML = `
      <a href="login.html">登录</a> 
      <a href="register.html">注册</a>
    `;
  }
}

document.addEventListener("DOMContentLoaded", renderNav);