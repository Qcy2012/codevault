document.addEventListener("DOMContentLoaded", async () => {
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
    const dates = data.trend7Days.map(d => d.date.substring(5)); // 截取 MM-DD
    const counts = data.trend7Days.map(d => d.count);

    trendChart.setOption({
      title: { text: "近 7 日发帖趋势", textStyle: { color: "#e2e8f0", fontSize: 16 }, left: "center" },
      tooltip: { trigger: "axis" },
      grid: { left: "10%", right: "5%", bottom: "15%", top: "20%" },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: "#475569" } },
        axisLabel: { color: "#94a3b8" }
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#334155", type: "dashed" } },
        axisLabel: { color: "#94a3b8" }
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
      title: { text: "全站语言分布", textStyle: { color: "#e2e8f0", fontSize: 16 }, left: "center" },
      tooltip: { trigger: "item", formatter: "{b}: {c} 段 ({d}%)" },
      legend: { bottom: "5%", textStyle: { color: "#94a3b8" } },
      series: [{
        name: "语言",
        type: "pie",
        radius: ["20%", "70%"],
        center: ["50%", "50%"],
        roseType: "area",
        itemStyle: { borderRadius: 5 },
        label: { color: "#e2e8f0" },
        data: data.languages.map(l => ({ name: l.name.toUpperCase(), value: l.value }))
      }]
    });

    // 4. 渲染 365 天发帖热力图
    const heatmapChart = echarts.init(document.getElementById("chart-heatmap"));
    
    // 生成从今天往前推 365 天的日期数组
    const dateList = [];
    const today = new Date();
    for (let i = 365; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateList.push(d.toISOString().split('T')[0]);
    }

    // 将数据库数据转为 ECharts 需要的格式
    const heatmapData = data.heatmapData.map(item => [item.date, item.count]);

    heatmapChart.setOption({
      title: { text: "过去一年代码活跃热力图", textStyle: { color: "#e2e8f0", fontSize: 16 }, top: 10, left: "center" },
      tooltip: {
        formatter: function (params) {
          return params.value[0] + "<br/>发布代码: " + params.value[1] + " 段";
        }
      },
      visualMap: {
        min: 0,
        max: 10, // 你可以根据实际情况调整最大值
        calculable: true,
        orient: "horizontal",
        left: "center",
        top: 35,
        inRange: { color: ["#1e293b", "#0ea5e9", "#38bdf8"] }, // 从暗到亮的蓝色渐变
        textStyle: { color: "#94a3b8" }
      },
      calendar: {
        top: 80,
        left: 50,
        right: 20,
        cellSize: ["auto", 14],
        range: [dateList[0], dateList[dateList.length - 1]],
        itemStyle: { color: "#1e293b", borderWidth: 1, borderColor: "#0b1120" },
        yearLabel: { show: false },
        dayLabel: { color: "#94a3b8", nameMap: ["日", "一", "二", "三", "四", "五", "六"] },
        monthLabel: { color: "#94a3b8" }
      },
      series: [{
        type: "heatmap",
        coordinateSystem: "calendar",
        data: heatmapData
      }]
    });

    // 窗口缩放时自适应
    window.addEventListener("resize", () => {
      trendChart.resize();
      langChart.resize();
      heatmapChart.resize();
    });

  } catch (error) {
    console.error("大屏加载失败:", error);
    // 强制在页面上显示报错
    document.querySelector(".dashboard-container").innerHTML = `
      <div style="color: #f87171; text-align: center; margin-top: 50px; font-size: 20px;">
        <h2>⚠️ 加载失败</h2>
        <p>${error.message}</p>
        <p>请按 F12 查看网络请求响应。</p>
      </div>
    `;
  }
});

// 数字滚动动画函数
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