function getId() {
  return new URLSearchParams(location.search).get("id");
}

// 映射到 CodeMirror 的 mode
const modeMap = {
  cpp: "text/x-c++src",
  python: "python",
  javascript: "javascript",
  html: "xml",
  css: "css",
  other: "null"
};

async function initEdit() {
  if (!getUser()) {
    location.href = "login.html";
    return;
  }

  const form = document.getElementById("edit-form");
  const msg = document.getElementById("msg");
  const id = getId();

  // 1. 初始化 CodeMirror
  const codeTextarea = document.getElementById("code-input");
  const codeEditor = CodeMirror.fromTextArea(codeTextarea, {
    lineNumbers: true,
    theme: "dracula",
    mode: "text/x-c++src",
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 4,
    tabSize: 4,
    lineWrapping: true
  });

  // 监听语言下拉框，动态切换语法高亮
  const langSelect = document.getElementById("lang-select");
  langSelect.addEventListener("change", () => {
    codeEditor.setOption("mode", modeMap[langSelect.value] || "null");
  });

  // 2. 初始化 Markdown 实时预览
  const descInput = document.getElementById("desc-input");
  const descPreview = document.getElementById("desc-preview");
  
  const updatePreview = () => {
    const raw = descInput.value.trim();
    if (!raw) {
      descPreview.innerHTML = '<span style="color: #64748b;">预览区</span>';
      return;
    }
    descPreview.innerHTML = DOMPurify.sanitize(marked.parse(raw));
  };
  
  descInput.addEventListener("input", updatePreview);

  // 3. 如果是编辑模式，回显数据
  if (id) {
    try {
      const snippet = await snippetApi.get(id);
      form.elements.title.value = snippet.title;
      form.elements.language.value = snippet.language;
      
      // 切换编辑器语言模式
      codeEditor.setOption("mode", modeMap[snippet.language] || "null");
      
      // 填充 Markdown 并触发预览
      form.elements.description.value = snippet.description || "";
      updatePreview();
      
      // 填充代码编辑器
      codeEditor.setValue(snippet.code);
      
      form.elements.is_public.checked = snippet.is_public;
      form.elements.tags.value = snippet.tags.map((tag) => tag.name).join(", ");
      document.querySelector("h1").textContent = "编辑片段";
      
      // 让编辑器获得焦点
      setTimeout(() => codeEditor.refresh(), 100);
    } catch (error) {
      showAlert(error.message);
    }
  }

  // 4. 提交表单
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // 从 CodeMirror 实例获取代码
    const codeValue = codeEditor.getValue();
    if (!codeValue.trim()) {
      showToast("代码不能为空！", true);
      return;
    }

    const body = {
      title: form.elements.title.value.trim(),
      language: form.elements.language.value,
      description: form.elements.description.value.trim() || null,
      code: codeValue,
      is_public: form.elements.is_public.checked,
      tags: form.elements.tags.value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "保存中...";

    try {
      const saved = id
        ? await snippetApi.update(id, body)
        : await snippetApi.create(body);
      location.href = `snippet.html?id=${saved.id}`;
    } catch (error) {
      showAlert(error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "保存并发布";
    }
  });
}

document.addEventListener("DOMContentLoaded", initEdit);