function getId() { return new URLSearchParams(location.search).get("id"); }

const modeMap = { cpp: "text/x-c++src", python: "python", javascript: "javascript", html: "xml", css: "css", other: "null" };

let filesData = []; 
let activeFileIndex = 0;
let codeEditor;
let autoSaveTimer = null;

// 生成草稿存储的 Key
function getDraftKey(id) {
  return id ? `codevault_draft_${id}` : `codevault_draft_new`;
}

// 自动保存草稿
function saveDraft(id, form) {
  const key = getDraftKey(id);
  
  // 每次保存前，先把当前编辑器里的代码同步到数组
  if (filesData[activeFileIndex]) {
    filesData[activeFileIndex].code = codeEditor.getValue();
  }

  const draft = {
    title: form.elements.title.value.trim(),
    language: form.elements.language.value,
    description: form.elements.description.value,
    tags: form.elements.tags.value,
    is_public: form.elements.is_public.checked,
    password: form.elements.password.value,
    max_views: form.elements.max_views.value,
    expires_at: form.elements.expires_at.value,
    filesData: filesData,
    activeFileIndex: activeFileIndex,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem(key, JSON.stringify(draft));
}

// 加载草稿
async function loadDraft(id) {
  const key = getDraftKey(id);
  const raw = localStorage.getItem(key);
  if (!raw) return false;

  try {
    const draft = JSON.parse(raw);
    // 如果草稿是空的（比如没有任何代码），就不恢复了
    if (!draft.filesData || draft.filesData.length === 0) return false;

    const timeStr = new Date(draft.savedAt).toLocaleString('zh-CN', { hour12: false });
    const confirmRestore = await showConfirm(`发现 ${timeStr} 的本地草稿，是否恢复？\n（如果点击取消，将丢失该草稿）`);
    
    if (confirmRestore) {
      return draft;
    } else {
      // 用户选择不恢复，清理掉旧草稿
      localStorage.removeItem(key);
      return false;
    }
  } catch (e) {
    return false;
  }
}

async function initEdit() {
  if (!getUser()) { location.href = "login.html"; return; }

  const form = document.getElementById("edit-form");
  const id = getId();

  // 1. 初始化编辑器
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

  // ==========================================
  // 核心：渲染与状态管理
  // ==========================================
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

  // 监听语言切换
  langSelect.addEventListener("change", () => {
    codeEditor.setOption("mode", modeMap[langSelect.value] || "null");
    if (filesData[activeFileIndex]) filesData[activeFileIndex].language = langSelect.value;
  });

  // ==========================================
  // 回显数据 / 加载草稿
  // ==========================================
  let hasRestored = false;

  if (id) {
    // 优先检查草稿
    const draft = await loadDraft(id);
    if (draft) {
      hasRestored = true;
      form.elements.title.value = draft.title;
      form.elements.language.value = draft.language;
      form.elements.description.value = draft.description;
      form.elements.tags.value = draft.tags;
      form.elements.is_public.checked = draft.is_public;
      form.elements.password.value = draft.password || "";
      form.elements.max_views.value = draft.max_views || "0";
      form.elements.expires_at.value = draft.expires_at || "";
      
      filesData = draft.filesData;
      activeFileIndex = draft.activeFileIndex || 0;
      
      updatePreview();
      document.querySelector("h1").textContent = "编辑片段 (已恢复草稿)";
      showToast("✅ 已恢复本地草稿");
    } else {
      // 没草稿，正常拉取服务器数据
      try {
        const snippet = await snippetApi.get(id);
        form.elements.title.value = snippet.title;
        form.elements.language.value = snippet.language;
        form.elements.description.value = snippet.description || "";
        form.elements.tags.value = snippet.tags.map((tag) => tag.name).join(", ");
        form.elements.is_public.checked = snippet.is_public;
        form.elements.password.value = "";
        form.elements.max_views.value = snippet.max_views || "0";
        form.elements.expires_at.value = snippet.expires_at || "";
        
        filesData = snippet.files || [{ filename: "main.cpp", language: snippet.language, code: snippet.code }];
        updatePreview();
        document.querySelector("h1").textContent = "编辑片段";
      } catch (error) { showAlert(error.message); }
    }
  } else {
    // 新建模式
    const draft = await loadDraft(null);
    if (draft) {
      hasRestored = true;
      form.elements.title.value = draft.title;
      form.elements.language.value = draft.language;
      form.elements.description.value = draft.description;
      form.elements.tags.value = draft.tags;
      form.elements.is_public.checked = draft.is_public;
      form.elements.password.value = draft.password || "";
      form.elements.max_views.value = draft.max_views || "0";
      form.elements.expires_at.value = draft.expires_at || "";
      filesData = draft.filesData;
      activeFileIndex = draft.activeFileIndex || 0;
      updatePreview();
      showToast("✅ 已恢复本地草稿");
    } else {
      filesData = [{ filename: "main.cpp", language: "cpp", code: "// Write your code here\n" }];
    }
  }

  // 初始渲染
  langSelect.value = filesData[activeFileIndex].language;
  codeEditor.setOption("mode", modeMap[filesData[activeFileIndex].language] || "null");
  codeEditor.setValue(filesData[activeFileIndex].code);
  renderTabs();

  // ==========================================
  // 核心：自动保存草稿监听
  // ==========================================
  const triggerAutoSave = () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveDraft(id, form);
      // 可以加个隐晦的 UI 提示，这里直接 console 打印
      console.log("💾 草稿已自动保存");
    }, 2000); // 防抖 2 秒
  };

  // 监听编辑器内容变化
  codeEditor.on("change", triggerAutoSave);
  // 监听表单其他输入
  form.addEventListener("input", triggerAutoSave);
  form.addEventListener("change", triggerAutoSave);

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
      password: form.elements.password.value.trim() || null,
      max_views: Number(form.elements.max_views.value) || 0,
      expires_at: form.elements.expires_at.value || null
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "保存中...";

    try {
      const saved = id ? await snippetApi.update(id, body) : await snippetApi.create(body);
      
      // 核心：发布成功后，立刻清除本地草稿！
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