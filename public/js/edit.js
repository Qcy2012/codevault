function getId() { return new URLSearchParams(location.search).get("id"); }

const modeMap = { cpp: "text/x-c++src", python: "python", javascript: "javascript", html: "xml", css: "css", other: "null" };

// 状态管理
let filesData = []; // 存储多文件数据
let activeFileIndex = 0;
let codeEditor;

async function initEdit() {
  if (!getUser()) { location.href = "login.html"; return; }

  const form = document.getElementById("edit-form");
  const msg = document.getElementById("msg");
  const id = getId();

  // 初始化编辑器
  codeEditor = CodeMirror.fromTextArea(document.getElementById("code-input"), {
    lineNumbers: true, theme: "dracula", mode: "text/x-c++src",
    matchBrackets: true, autoCloseBrackets: true, indentUnit: 4, tabSize: 4, lineWrapping: true
  });

  // 监听语言下拉框
  const langSelect = document.getElementById("lang-select");
  langSelect.addEventListener("change", () => {
    codeEditor.setOption("mode", modeMap[langSelect.value] || "null");
    if (filesData[activeFileIndex]) filesData[activeFileIndex].language = langSelect.value;
  });

  // Markdown 逻辑保持不变...
  const descInput = document.getElementById("desc-input");
  const descPreview = document.getElementById("desc-preview");
  const updatePreview = () => {
    const raw = descInput.value.trim();
    descPreview.innerHTML = raw ? DOMPurify.sanitize(marked.parse(raw)) : '<span style="color: #64748b;">预览区</span>';
  };
  descInput.addEventListener("input", updatePreview);

  // 渲染文件 Tabs
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

  // 切换文件
  window.switchFile = (index) => {
    // 1. 保存当前编辑器内容到数组
    filesData[activeFileIndex].code = codeEditor.getValue();
    // 2. 切换索引
    activeFileIndex = index;
    const file = filesData[index];
    // 3. 更新下拉框和编辑器
    langSelect.value = file.language;
    langSelect.dispatchEvent(new Event("change"));
    codeEditor.setOption("mode", modeMap[file.language] || "null");
    codeEditor.setValue(file.code);
    renderTabs();
    setTimeout(() => codeEditor.refresh(), 10);
  };

  // 删除文件
  window.removeFile = (index) => {
    if (filesData.length <= 1) return;
    filesData.splice(index, 1);
    if (activeFileIndex >= filesData.length) activeFileIndex = filesData.length - 1;
    switchFile(activeFileIndex);
  };

  // 添加文件
  document.getElementById("add-file-btn").onclick = () => {
    filesData[activeFileIndex].code = codeEditor.getValue(); // 暂存
    const newFileName = prompt("输入新文件名 (例如 utils.h):", "file.cpp");
    if (!newFileName) return;
    const ext = newFileName.split('.').pop() || 'cpp';
    const lang = ext === 'h' || ext === 'hpp' ? 'cpp' : ext;
    
    filesData.push({ filename: newFileName, language: lang, code: "" });
    switchFile(filesData.length - 1);
  };

  // 回显 / 初始化数据
  if (id) {
    try {
      const snippet = await snippetApi.get(id);
      form.elements.title.value = snippet.title;
      form.elements.language.value = snippet.language;
      form.elements.description.value = snippet.description || "";
      updatePreview();
      form.elements.is_public.checked = snippet.is_public;
      form.elements.tags.value = snippet.tags.map((tag) => tag.name).join(", ");
      document.querySelector("h1").textContent = "编辑项目";
      
      filesData = snippet.files || [{ filename: "main.cpp", language: snippet.language, code: snippet.code }];
    } catch (error) { showAlert(error.message); }
  } else {
    // 新建默认
    filesData = [{ filename: "main.cpp", language: "cpp", code: "// Write your code here\n" }];
  }

  activeFileIndex = 0;
  langSelect.value = filesData[0].language;
  codeEditor.setOption("mode", modeMap[filesData[0].language] || "null");
  codeEditor.setValue(filesData[0].code);
  renderTabs();

  // 提交表单
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    filesData[activeFileIndex].code = codeEditor.getValue(); // 存下最后一个活动文件的内容

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
      location.href = `snippet.html?id=${saved.id}`;
    } catch (error) {
      showAlert(error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "保存并发布";
    }
  });
}

document.addEventListener("DOMContentLoaded", initEdit);