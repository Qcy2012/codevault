function getId() { return new URLSearchParams(location.search).get("id"); }

const modeMap = { cpp: "text/x-c++src", python: "python", javascript: "javascript", html: "xml", css: "css", other: "null" };

let filesData = []; 
let activeFileIndex = 0;
let codeEditor;
let autoSaveTimer = null;

function getDraftKey(id) {
  return id ? `codevault_draft_${id}` : `codevault_draft_new`;
}

function saveDraft(id, form) {
  try {
    const key = getDraftKey(id);
    if (filesData[activeFileIndex]) {
      filesData[activeFileIndex].code = codeEditor.getValue();
    }

    const draft = {
      title: form.elements.title ? form.elements.title.value : "",
      language: form.elements.language ? form.elements.language.value : "cpp",
      description: form.elements.description ? form.elements.description.value : "",
      tags: form.elements.tags ? form.elements.tags.value : "",
      is_public: form.elements.is_public ? form.elements.is_public.checked : true,
      password: form.elements.password ? form.elements.password.value : "",
      max_views: form.elements.max_views ? form.elements.max_views.value : "0",
      expires_at: form.elements.expires_at ? form.elements.expires_at.value : "",
      filesData: filesData,
      activeFileIndex: activeFileIndex,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(key, JSON.stringify(draft));
    console.log("💾 草稿自动保存成功");
  } catch (e) {
    console.error("❌ 保存草稿失败:", e);
  }
}

async function loadDraft(id) {
  try {
    const key = getDraftKey(id);
    const raw = localStorage.getItem(key);
    if (!raw) return false;

    const draft = JSON.parse(raw);
    if (!draft.filesData || draft.filesData.length === 0) return false;

    const timeStr = new Date(draft.savedAt).toLocaleString('zh-CN', { hour12: false });
    const confirmRestore = await showConfirm(`发现 ${timeStr} 的本地草稿，是否恢复？\n（点击取消将丢失该草稿）`);
    
    if (confirmRestore) {
      return draft;
    } else {
      localStorage.removeItem(key);
      return false;
    }
  } catch (e) {
    console.error("读取草稿失败:", e);
    return false;
  }
}

async function initEdit() {
  if (!getUser()) { location.href = "login.html"; return; }

  const form = document.getElementById("edit-form");
  const id = getId();

  codeEditor = CodeMirror.fromTextArea(document.getElementById("code-input"), {
    lineNumbers: true, theme: "dracula", mode: "text/x-c++src",
    matchBrackets: true, autoCloseBrackets: true, indentUnit: 4, tabSize: 4, lineWrapping: true
  });

  const langSelect = document.getElementById("lang-select");
  const descInput = document.getElementById("desc-input");
  const descPreview = document.getElementById("desc-preview");

  const updatePreview = () => {
    const raw = descInput.value.trim();
    descPreview.innerHTML = raw ? DOMPurify.sanitize(marked.parse(raw)) : '<span style="color: #64748b;">预览区</span>';
  };
  descInput.addEventListener("input", updatePreview);

  const renderTabs = () => {
    const tabsContainer = document.getElementById("file-tabs");
    tabsContainer.innerHTML = filesData.map((f, i) => `
      <div style="display:flex; align-items:center;">
        <button type="button" onclick="switchFile(${i})" style="padding: 4px 12px; border-radius: 6px 0 0 6px; border-right: none; background: ${i === activeFileIndex ? 'var(--primary)' : 'var(--border-color)'}; color: #fff; font-size: 13px;">
          ${escapeHtml(f.filename)}
        </button>
        ${filesData.length > 1 ? `<button type="button" onclick="removeFile(${i})" style="padding: 4px 8px; border-radius: 0 6px 6px 0; background: #dc2626; color: #fff; font-size: 13px; border-left: 1px solid #b91c1c;">×</button>` : ''}
      </div>
    `).join("");
  };

  const renderEditor = () => {
    const file = filesData[activeFileIndex];
    if (!file) return;
    langSelect.value = file.language;
    langSelect.dispatchEvent(new Event("change"));
    codeEditor.setOption("mode", modeMap[file.language] || "null");
    codeEditor.setValue(file.code);
    renderTabs();
    setTimeout(() => codeEditor.refresh(), 10);
  };

  window.switchFile = (index) => {
    filesData[activeFileIndex].code = codeEditor.getValue();
    activeFileIndex = index;
    renderEditor();
  };

  window.removeFile = (index) => {
    if (filesData.length <= 1) return;
    filesData[activeFileIndex].code = codeEditor.getValue();
    filesData.splice(index, 1);
    if (activeFileIndex >= filesData.length) activeFileIndex = filesData.length - 1;
    else if (index < activeFileIndex) activeFileIndex--;
    renderEditor();
  };

  document.getElementById("add-file-btn").onclick = () => {
    filesData[activeFileIndex].code = codeEditor.getValue();
    const newFileName = prompt("输入新文件名 (例如 utils.h):", "file.cpp");
    if (!newFileName) return;
    const ext = newFileName.split('.').pop() || 'cpp';
    const lang = ext === 'h' || ext === 'hpp' ? 'cpp' : ext;
    filesData.push({ filename: newFileName, language: lang, code: "" });
    activeFileIndex = filesData.length - 1;
    renderEditor();
  };

  langSelect.addEventListener("change", () => {
    codeEditor.setOption("mode", modeMap[langSelect.value] || "null");
    if (filesData[activeFileIndex]) filesData[activeFileIndex].language = langSelect.value;
  });

  // ==========================================
  // 核心：加载数据与草稿
  // ==========================================
  let hasRestored = false;

  if (id) {
    const draft = await loadDraft(id);
    if (draft) {
      hasRestored = true;
      form.elements.title.value = draft.title || "";
      form.elements.language.value = draft.language || "cpp";
      form.elements.description.value = draft.description || "";
      form.elements.tags.value = draft.tags || "";
      form.elements.is_public.checked = draft.is_public !== false;
      if(form.elements.password) form.elements.password.value = draft.password || "";
      if(form.elements.max_views) form.elements.max_views.value = draft.max_views || "0";
      if(form.elements.expires_at) form.elements.expires_at.value = draft.expires_at || "";
      
      filesData = draft.filesData;
      activeFileIndex = draft.activeFileIndex || 0;
      
      updatePreview();
      document.querySelector("h1").textContent = "编辑片段 (已恢复草稿)";
      showToast("✅ 已恢复本地草稿");
    } else {
      try {
        const snippet = await snippetApi.get(id);
        form.elements.title.value = snippet.title;
        form.elements.language.value = snippet.language;
        form.elements.description.value = snippet.description || "";
        form.elements.tags.value = snippet.tags.map((tag) => tag.name).join(", ");
        form.elements.is_public.checked = snippet.is_public;
        if(form.elements.max_views) form.elements.max_views.value = snippet.max_views || "0";
        if(form.elements.expires_at) form.elements.expires_at.value = snippet.expires_at || "";
        
        filesData = snippet.files || [{ filename: "main.cpp", language: snippet.language, code: snippet.code }];
        updatePreview();
        document.querySelector("h1").textContent = "编辑片段";
      } catch (error) { showAlert(error.message); }
    }
  } else {
    const draft = await loadDraft(null);
    if (draft) {
      hasRestored = true;
      form.elements.title.value = draft.title || "";
      form.elements.language.value = draft.language || "cpp";
      form.elements.description.value = draft.description || "";
      form.elements.tags.value = draft.tags || "";
      form.elements.is_public.checked = draft.is_public !== false;
      if(form.elements.password) form.elements.password.value = draft.password || "";
      if(form.elements.max_views) form.elements.max_views.value = draft.max_views || "0";
      if(form.elements.expires_at) form.elements.expires_at.value = draft.expires_at || "";
      
      filesData = draft.filesData;
      activeFileIndex = draft.activeFileIndex || 0;
      updatePreview();
      showToast("✅ 已恢复本地草稿");
    } else {
      filesData = [{ filename: "main.cpp", language: "cpp", code: "// Write your code here\n" }];
    }
  }

  langSelect.value = filesData[activeFileIndex].language;
  codeEditor.setOption("mode", modeMap[filesData[activeFileIndex].language] || "null");
  codeEditor.setValue(filesData[activeFileIndex].code);
  renderTabs();

  // ==========================================
  // 监听并自动保存
  // ==========================================
  const triggerAutoSave = () => {
    clearTimeout(autoSaveTimer);
    // 缩短为 1 秒防抖，防止用户按 F5 太快
    autoSaveTimer = setTimeout(() => {
      saveDraft(id, form);
    }, 1000); 
  };

  codeEditor.on("change", triggerAutoSave);
  form.addEventListener("input", triggerAutoSave);
  form.addEventListener("change", triggerAutoSave);

  // 当页面关闭或刷新时，强制保存最后一次状态（双保险）
  window.addEventListener("beforeunload", () => {
    if (filesData[activeFileIndex]) {
      filesData[activeFileIndex].code = codeEditor.getValue();
    }
    saveDraft(id, form);
  });

  // ==========================================
  // 提交表单
  // ==========================================
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    filesData[activeFileIndex].code = codeEditor.getValue();

    const body = {
      title: form.elements.title.value.trim(),
      language: form.elements.language.value,
      description: form.elements.description.value.trim() || null,
      code: filesData[0].code, 
      files: filesData, 
      is_public: form.elements.is_public.checked,
      tags: form.elements.tags.value.split(",").map(i => i.trim()).filter(Boolean),
      password: form.elements.password ? form.elements.password.value.trim() || null : null,
      max_views: form.elements.max_views ? Number(form.elements.max_views.value) || 0 : 0,
      expires_at: form.elements.expires_at ? form.elements.expires_at.value || null : null
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "保存中...";

    try {
      const saved = id ? await snippetApi.update(id, body) : await snippetApi.create(body);
      
      localStorage.removeItem(getDraftKey(id));
      
      location.href = `snippet.html?id=${saved.id}`;
    } catch (error) {
      showAlert(error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "保存并发布";
    }
  });
}

document.addEventListener("DOMContentLoaded", initEdit);