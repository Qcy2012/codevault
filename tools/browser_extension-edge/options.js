// 加载已保存的设置
chrome.storage.sync.get(["apiUrl", "apiKey"], (config) => {
  if (config.apiUrl) document.getElementById("apiUrl").value = config.apiUrl;
  if (config.apiKey) document.getElementById("apiKey").value = config.apiKey;
});

// 保存设置
document.getElementById("saveBtn").addEventListener("click", () => {
  const apiUrl = document.getElementById("apiUrl").value.trim().replace(/\/$/, ""); // 去掉末尾的斜杠
  const apiKey = document.getElementById("apiKey").value.trim();
  
  chrome.storage.sync.set({ apiUrl, apiKey }, () => {
    const status = document.getElementById("status");
    status.style.display = "block";
    setTimeout(() => { status.style.display = "none"; }, 2000);
  });
});