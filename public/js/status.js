document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch(`${API_BASE}/api/status/data`, { auth: false });
    const data = await res.json();

    // 1. 渲染 30 天可用率日历块
    const grid = document.getElementById("status-grid");
    const statsMap = {};
    data.dailyStats.forEach(d => {
      statsMap[d.date] = d.uptime;
    });

    const today = new Date();
    // 补齐过去 30 天的数据
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const bar = document.createElement("div");
      bar.className = "status-bar";
      
      if (statsMap[dateStr] !== undefined) {
        const uptime = statsMap[dateStr];
        if (uptime < 100) bar.classList.add("down");
        bar.title = `${dateStr} - 可用率: ${uptime.toFixed(2)}%`;
      } else {
        bar.classList.add("empty");
        bar.title = `${dateStr} - 无数据`;
      }
      grid.appendChild(bar);
    }

    // 2. 渲染 Incident 历史
    const incidentList = document.getElementById("incident-list");
    if (data.incidents.length === 0) {
      incidentList.innerHTML = `<p class="muted">过去 30 天内没有发生任何故障。</p>`;
      return;
    }

    incidentList.innerHTML = data.incidents.map(inc => {
      const isResolved = inc.status === "resolved";
      const timeStr = new Date(inc.started_at.replace(' ', 'T') + 'Z').toLocaleString('zh-CN', { hour12: false });
      
      return `
        <div class="incident-card ${isResolved ? 'resolved' : ''}">
          <div style="display: flex; justify-content: space-between;">
            <strong>${escapeHtml(inc.title)}</strong>
            <span class="tag" style="background: ${isResolved ? '#10b981' : '#f59e0b'}; color: #fff;">
              ${isResolved ? '已解决' : '调查中'}
            </span>
          </div>
          <p class="muted" style="font-size: 13px; margin-top: 8px;">
            开始于: ${timeStr}
            ${isResolved && inc.resolved_at ? ` | 解决于: ${new Date(inc.resolved_at.replace(' ', 'T') + 'Z').toLocaleString('zh-CN', { hour12: false })}` : ''}
          </p>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error("获取状态失败:", error);
    document.getElementById("incident-list").innerHTML = `<p class="message error">加载失败</p>`;
  }
});