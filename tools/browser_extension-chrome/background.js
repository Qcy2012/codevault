// 1. 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-codevault",
    title: "保存到 CodeVault",
    contexts: ["selection"] // 只有在选中文字时才显示
  });
});

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
        tags: ["web-clipper"]
      };

      try {
        const res = await fetch(`${config.apiUrl}/api/snippets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.apiKey
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          console.log("✅ 代码已成功保存到 CodeVault");
        } else {
          console.error("❌ 保存失败:", await res.text());
        }
      } catch (error) {
        console.error("❌ 网络请求失败:", error);
      }
    });
  }
});