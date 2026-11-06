const state = {
  page: 1,
  pageSize: 10,
  q: "",
  language: "",
  scope: "public",
  tag: "",
};

async function loadList() {
  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  listEl.innerHTML = `<p class="muted">加载中...</p>`;

  try {
    const data = await snippetApi.list({
      q: state.q,
      language: state.language,
      scope: state.scope,
      tag: state.tag,
      page: state.page,
      page_size: state.pageSize,
    });

    if (!data.items.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      listEl.innerHTML = data.items.map(renderCard).join("");
    }
    renderPager(data.total, data.page, data.page_size);
  } catch (error) {
    listEl.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

function renderCard(snippet) {
  const tags = snippet.tags
    .map((tag) => `<span class="tag">${escapeHtml(tag.name)}</span>`)
    .join("");

  return `
    <article class="card snippet-card">
      <h2><a href="snippet.html?id=${snippet.id}">${escapeHtml(snippet.title)}</a></h2>
      <div class="meta">
        <span class="lang">${escapeHtml(snippet.language)}</span>
        ${tags}
        <span>${escapeHtml(snippet.owner.display_name)}</span>
        <span>${new Date(snippet.created_at).toLocaleString()}</span>
      </div>
      <p class="muted">${snippet.is_public ? "公开" : "私有"} · 浏览 ${snippet.view_count}</p>
    </article>
  `;
}

function renderPager(total, page, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const el = document.getElementById("pager");
  el.innerHTML = `
    <button id="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
    <span>第 ${page} / ${pages} 页，共 ${total} 条</span>
    <button id="next" ${page >= pages ? "disabled" : ""}>下一页</button>
  `;
  document.getElementById("prev").onclick = () => {
    state.page -= 1;
    loadList();
  };
  document.getElementById("next").onclick = () => {
    state.page += 1;
    loadList();
  };
}

function initIndex() {
  const search = document.getElementById("search");
  const language = document.getElementById("language");
  const scope = document.getElementById("scope");

  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = search.value.trim();
      state.page = 1;
      loadList();
    }, 300);
  });

  language.addEventListener("change", () => {
    state.language = language.value;
    state.page = 1;
    loadList();
  });

  scope.addEventListener("change", () => {
    if (scope.value !== "public" && !getUser()) {
      location.href = "login.html";
      return;
    }
    state.scope = scope.value;
    state.page = 1;
    loadList();
  });

  loadList();
}

document.addEventListener("DOMContentLoaded", initIndex);