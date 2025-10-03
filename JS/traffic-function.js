// ==================================================
// Traffic Chart Functions for Webflow
// Prefix: traffic
// ==================================================

// ========== Utility Functions (ALWAYS KEEP THESE FIRST) ==========
function trafficHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function trafficToPercent(arr) {
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

function trafficComputeConsolidated(data) {
  if (!data.competitors || !data.competitors.length) return null;
  const length = data.competitors[0].values.length;
  const avg = Array(length).fill(0);
  data.competitors.forEach(c => c.values.forEach((v, i) => { avg[i] += v; }));
  return {
    name: "Average Competitors",
    color: "#999999",
    values: avg.map(v => +(v / data.competitors.length).toFixed(1))
  };
}

// ========== Init ==========
function trafficInitChart(wrapper, dataUrl) {
  const rootCanvas = wrapper.querySelector("canvas");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const type = data.chartType;      // "line" | "bar"
      const barMode = data.barMode || "grouped"; // default nếu chartType=bar
      let currentMode = "direct";
      let currentValue = "absolute";

      // Active state helper
      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      data.consolidatedCompetitors = trafficComputeConsolidated(data);

      function renderChart() {
        const ctx = rootCanvas.getContext("2d");

        if (type === "line") {
          trafficCreateLineChart(ctx, data, currentMode, currentValue);
        }

        if (type === "bar" && barMode === "grouped") {
          trafficCreateGroupedBarChart(ctx, data, currentMode, currentValue);
        }

        if (type === "bar" && barMode === "stacked-horizontal") {
          trafficCreateStackedHorizontalBarChart(ctx, data, currentMode, currentValue);
        }
      }

      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      if (btnDirect) btnDirect.addEventListener("click", () => {
        currentMode = "direct"; currentValue = "absolute"; renderChart();
        setActive(modeBtns, btnDirect); setActive(valueBtns, btnAbs);
      });
      if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate"; currentValue = "absolute"; renderChart();
        setActive(modeBtns, btnConsolidate); setActive(valueBtns, btnAbs);
      });
      if (btnAbs) btnAbs.addEventListener("click", () => {
        currentValue = "absolute"; renderChart(); setActive(valueBtns, btnAbs);
      });
      if (btnPct) btnPct.addEventListener("click", () => {
        currentValue = "percent"; renderChart(); setActive(valueBtns, btnPct);
      });

      renderChart();
      setActive(modeBtns, btnDirect);
      setActive(valueBtns, btnAbs);
    })
    .catch(err => console.error("Error loading traffic data:", err));
}

// ========== Line Chart ==========
function trafficCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? trafficToPercent(arr) : arr;

  const datasets = [];
  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      fill: false, tension: 0.3
    });
    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: getValues(c.values),
        borderColor: c.color,
        borderDash: [4, 2],
        fill: false, tension: 0.3
      });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      fill: false, tension: 0.3
    });
    datasets.push({
      label: data.consolidatedCompetitors.name,
      data: getValues(data.consolidatedCompetitors.values),
      borderColor: data.consolidatedCompetitors.color,
      borderDash: [6, 3], fill: false, tension: 0.3
    });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "line",
    data: { labels: data.periods, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => valueType === "percent" ? v + "%" : v },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

// ========== Grouped Bar Chart ==========
function trafficCreateGroupedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? trafficToPercent(arr) : arr;

  const datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    data.competitors.forEach(c => datasets.push({ label: c.name, data: getValues(c.values), backgroundColor: c.color }));
  } else {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    datasets.push({ label: data.consolidatedCompetitors.name, data: getValues(data.consolidatedCompetitors.values), backgroundColor: data.consolidatedCompetitors.color });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels: data.periods, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => valueType === "percent" ? v + "%" : v },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

// ========== Stacked Horizontal Bar Chart ==========
function trafficCreateStackedHorizontalBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? trafficToPercent(arr) : arr;

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidatedCompetitors.name];

  const colorPool = ["#3366cc", "#109618", "#ff9900", "#dc3912", "#0099c6", "#990099"];
  const datasets = data.periods.map((p, i) => {
    const vals = mode === "direct"
      ? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c => getValues(c.values)[i])]
      : [getValues(data.yourCompany.values)[i], getValues(data.consolidatedCompetitors.values)[i]];
    return { label: p, data: vals, backgroundColor: colorPool[i % colorPool.length] };
  });

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      indexAxis: "y",
      scales: {
        x: {
          stacked: true, beginAtZero: true,
          max: valueType === "percent" ? 100 : undefined,
          ticks: { callback: v => valueType === "percent" ? v + "%" : v }
        },
        y: { stacked: true }
      }
    }
  });
}
