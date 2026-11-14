document.addEventListener("DOMContentLoaded", async () => {
  // 获取当前主题对应的颜色配置
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const textColor = isDark ? "#94a3b8" : "#64748b";
  const titleColor = isDark ? "#e2e8f0" : "#1e293b";
  const axisLineColor = isDark ? "#475569" : "#cbd5e1";
  const splitLineColor = isDark ? "#334155" : "#e2e8f0";
  const chartBgColor = isDark ? "#1e293b" : "#ffffff";

  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    const data = await res.json();

    if (data.detail) throw new Error(data.detail);

    // 1. 渲染数字动画
    animateValue("kpi-users", 0, data.summary.users, 1000);
    animateValue("kpi-snippets", 0, data.summary.snippets, 1000);
    animateValue("kpi-likes", 0, data.summary.likes, 1000);
    animateValue("kpi-views", 0, data.summary.views, 1000);

    // 2. 渲染 7 日趋势折线图
    const trendChart = echarts.init(document.getElementById("chart-trend"));
    const dates = data.trend7Days.map(d => d.date.substring(5));
    const counts = data.trend7Days.map(d => d.count);

    trendChart.setOption({
      title: { text: "近 7 日发帖趋势", textStyle: { color: titleColor, fontSize: 16 }, left: "center" },
      tooltip: { trigger: "axis" },
      grid: { left: "10%", right: "5%", bottom: "15%", top: "20%" },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: axisLineColor } },
        axisLabel: { color: textColor }
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: splitLineColor, type: "dashed" } },
        axisLabel: { color: textColor }
      },
      series: [{
        data: counts,
        type: "line",
        smooth: true,
        symbolSize: 8,
        itemStyle: { color: "#38bdf8" },
        lineStyle: { width: 3, shadowColor: "rgba(56,189,248,0.5)", shadowBlur: 10 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(56,189,248,0.5)" },
            { offset: 1, color: "rgba(56,189,248,0)" }
          ])
        }
      }]
    });

    // 3. 渲染语言分布南丁格尔玫瑰图
    const langChart = echarts.init(document.getElementById("chart-lang"));
    langChart.setOption({
      title: { text: "全站语言分布", textStyle: { color: titleColor, fontSize: 16 }, left: "center" },
      tooltip: { trigger: "item", formatter: "{b}: {c} 段 ({d}%)" },
      legend: { bottom: "5%", textStyle: { color: textColor } },
      series: [{
        name: "语言",
        type: "pie",
        radius: ["20%", "70%"],
        center: ["50%", "50%"],
        roseType: "area",
        itemStyle: { borderRadius: 5 },
        label: { color: titleColor },
        data: data.languages.map(l => ({ name: l.name.toUpperCase(), value: l.value }))
      }]
    });

    // 4. 渲染 365 天发帖热力图
    const heatmapChart = echarts.init(document.getElementById("chart-heatmap"));
    const dateList = [];
    const today = new Date();
    for (let i = 365; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateList.push(d.toISOString().split('T')[0]);
    }

    const heatmapData = data.heatmapData.map(item => [item.date, item.count]);

    heatmapChart.setOption({
      title: { text: "过去一年代码活跃热力图", textStyle: { color: titleColor, fontSize: 16 }, top: 10, left: "center" },
      tooltip: {
        formatter: function (params) {
          return params.value[0] + "<br/>发布代码: " + params.value[1] + " 段";
        }
      },
      visualMap: {
        min: 0,
        max: 10,
        calculable: true,
        orient: "horizontal",
        left: "center",
        top: 35,
        inRange: { color: isDark ? ["#1e293b", "#0ea5e9", "#38bdf8"] : ["#f1f5f9", "#7dd3fc", "#0ea5e9"] },
        textStyle: { color: textColor }
      },
      calendar: {
        top: 80,
        left: 50,
        right: 20,
        cellSize: ["auto", 14],
        range: [dateList[0], dateList[dateList.length - 1]],
        itemStyle: { color: chartBgColor, borderWidth: 1, borderColor: isDark ? "#0b1120" : "#ffffff" },
        yearLabel: { show: false },
        dayLabel: { color: textColor, nameMap: ["日", "一", "二", "三", "四", "五", "六"] },
        monthLabel: { color: textColor }
      },
      series: [{
        type: "heatmap",
        coordinateSystem: "calendar",
        data: heatmapData
      }]
    });

    window.addEventListener("resize", () => {
      trendChart.resize();
      langChart.resize();
      heatmapChart.resize();
    });

  } catch (error) {
    console.error("大屏加载失败:", error);
    document.querySelector(".dashboard-container").innerHTML = `
      <div style="color: #f87171; text-align: center; margin-top: 50px; font-size: 20px;">
        <h2>⚠️ 加载失败</h2>
        <p>${error.message}</p>
        <p>请按 F12 查看网络请求响应。</p>
      </div>
    `;
  }
});

function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}