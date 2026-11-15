document.addEventListener("DOMContentLoaded", () => {
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  
  // 初始化 CodeMirror
  const cmOptions = {
    lineNumbers: true,
    theme: isDark ? "dracula" : "default",
    mode: "text/x-c++src", // 默认语言
    lineWrapping: true,
    indentUnit: 4
  };

  const oldEditor = CodeMirror.fromTextArea(document.getElementById("diff-old"), cmOptions);
  const newEditor = CodeMirror.fromTextArea(document.getElementById("diff-new"), cmOptions);

  // 占位符提示
  oldEditor.setValue("// 在这里粘贴原始代码\n");
  newEditor.setValue("// 在这里粘贴修改后的代码\n");

  const diffBtn = document.getElementById("diff-btn");
  const outputDiv = document.getElementById("diff-output");

  diffBtn.addEventListener("click", () => {
    const oldCode = oldEditor.getValue();
    const newCode = newEditor.getValue();

    if (!oldCode.trim() || !newCode.trim()) {
      showAlert("请在两边的输入框中都填入代码！");
      return;
    }

    // 使用 jsdiff 的 diffLines 方法进行按行对比
    const diff = Diff.diffLines(oldCode, newCode);
    
    let html = "";
    
    // 遍历差异结果，生成高亮 HTML
    diff.forEach((part) => {
      // 将文本按行分割，过滤掉末尾的空行
      const lines = part.value.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();

      lines.forEach(line => {
        const escapedLine = escapeHtml(line) || " "; // 保留空行
        
        if (part.added) {
          html += `<span class="diff-line diff-added">+ ${escapedLine}</span>`;
        } else if (part.removed) {
          html += `<span class="diff-line diff-removed">- ${escapedLine}</span>`;
        } else {
          html += `<span class="diff-line diff-unchanged">  ${escapedLine}</span>`;
        }
      });
    });

    outputDiv.innerHTML = html;
    outputDiv.classList.remove("hidden");
    outputDiv.scrollIntoView({ behavior: 'smooth' }); // 平滑滚动到结果区
  });

  // 辅助函数：防止 XSS
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
});