async function testApiKey() {
  const res = await fetch("http://127.0.0.1:3000/api/snippets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": "cv_live_5c0cb8707c0900c1f347deaa5a35a227"
    },
    body: JSON.stringify({
      title: "Node.js 脚本推送",
      language: "javascript",
      code: "console.log('API Key works!');",
      is_public: true,
      tags: ["node", "test"]
    })
  });

  const data = await res.json();
  if (res.ok) {
    console.log("✅ 成功！返回 ID:", data.id);
  } else {
    console.log("❌ 失败:", data);
  }
}

testApiKey();