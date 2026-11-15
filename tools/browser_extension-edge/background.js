// 1. 创建右键菜单
function createContextMenu() {
  // 先清除已有的菜单，防止重复创建报错
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-to-codevault",
      title: "保存到 CodeVault",
      contexts: ["selection"] // 只有选中文字时显示
    });
  });
}

// 插件安装时创建
chrome.runtime.onInstalled.addListener(createContextMenu);
// 浏览器启动时创建
chrome.runtime.onStartup.addListener(createContextMenu);

// 2. 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-to-codevault") {
    const selectedCode = info.selectionText;
    
    // 获取用户配置的 API Key 和服务器地址
    chrome.storage.sync.get(["apiUrl", "apiKey"], async (config) => {
      if (!config.apiUrl || !config.apiKey) {
        // 如果没配置，弹出一个系统通知提醒
        chrome.notifications?.create({
          type: "basic",
          iconUrl: "icon.png",
          title: "请先配置 CodeVault",
          message: "右键点击插件图标，进入选项配置 API Key"
        });
        return;
      }

      // 准备发送的数据
      const payload = {
        title: "来自网页的代码: " + (tab.title || "未命名"),
        language: "other",
        code: selectedCode,
        is_public: true,
        tags: ["edge-clipper"]
      };

      // 防止用户输入的 URL 末尾带有斜杠导致路径变成 //api/snippets
      const baseUrl = config.apiUrl.replace(/\/$/, "");

      console.log("🚀 准备发送请求到:", `${baseUrl}/api/snippets`);
      console.log("🔑 使用的 API Key:", config.apiKey.substring(0, 10) + "...");

      try {
        const res = await fetch(`${baseUrl}/api/snippets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.apiKey
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          console.log("✅ 代码已成功保存到 CodeVault");
          // 如果成功，可以试着通过系统通知告诉用户
          chrome.notifications?.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "保存成功",
            message: "代码已成功收录至 CodeVault！"
          });
        } else {
          const errText = await res.text();
          console.error("❌ 保存失败，服务器返回:", res.status, errText);
        }
      } catch (error) {
        console.error("❌ 网络请求彻底失败:", error);
      }
    });
  }
});