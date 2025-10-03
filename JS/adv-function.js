// ==================================================
// Advertising Chart Functions for Webflow
// Utility prefix: adv
// ==================================================

// ========== Utility Functions ==========

// Hex to RGBA
function advHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Convert array to percent
function advToPercent(arr) {
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

// Compute consolidated competitors
function advComputeConsolidated(data) {
  const competitors = data.competitors;
  if (!competitors || competitors.length === 0) return null;

  const avg = { values: [] };
  const length = competitors[0].values.length;

  // init array zeros
  avg.values = Array(length).fill(0);

  competitors.forEach(c => {
    c.values.forEach((v, i) => {
      avg.values[i] += v;
    });
  });

  avg.values = avg.values.map(v => v / competitors.length);
  avg.name = "Average Competitors";
  avg.color = "#999999";

  return avg;
}

// ========== Init Function ==========

function advInitChart(wrapper, dataUrl) {
  const canvas = wrapper.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      // tính consolidate
      data.consolidatedCompetitors = advComputeConsolidated(data);

      const type = data.chartType; // đọc loại chart từ JSON
      let currentMode = "direct";    // direct | consolidate
      let currentValue = "absolute"; // absolute | percent

      function renderChart() {
        if (type === "line") advCreateLineChart(ctx, data, currentMode, currentValue);
        if (type === "bar-grouped") advCreateGroupedBarChart(ctx, data, currentMode, currentValue);
        if (type === "bar-stacked") advCreateStackedBarChart(ctx, data, currentMode, currentValue);
        if (type === "bar-horizontal") advCreateHorizontalBarChart(ctx, data, currentMode, currentValue);
      }

      // buttons (nếu có trong wrapper)
      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      // mode events
      if (btnDirect) btnDirect.addEventListener("click", () => {
        currentMode = "direct";
        currentValue = "absolute";
        renderChart();
        setActive(modeBtns, btnDirect);
        setActive(valueBtns, btnAbs);
      });

      if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate";
        currentValue = "absolute";
        renderChart();
        setActive(modeBtns, btnConsolidate);
        setActive(valueBtns, btnAbs);
      });

      // value events
      if (btnAbs) btnAbs.addEventListener("click", () => {
        currentValue = "absolute";
        renderChart();
        setActive(valueBtns, btnAbs);
      });

      if (btnPct) btnPct.addEventListener("click", () => {
        currentValue = "percent";
        renderChart();
        setActive(valueBtns, btnPct);
      });

      // default render
      renderChart();
      setActive(modeBtns, btnDirect);
      setActive(valueBtns, btnAbs);
    })
    .catch(err => console.error("Error loading adv data:", err));
}

// ========== Chart Creators ==========

// Line Chart
function advCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  function getValues(arr) { return valueType === "percent" ? advToPercent(arr) : arr; }

  const datasets = [];
  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: advHexToRgba(data.yourCompany.color, 0.3),
      tension: 0.3,
      fill: false
    });
    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: getValues(c.values),
        borderColor: c.color,
        backgroundColor: advHexToRgba(c.color, 0.3),
        borderDash: [4, 2],
        tension: 0.3,
        fill: false
      });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: advHexToRgba(data.yourCompany.color, 0.3),
      tension: 0.3,
      fill: false
    });
    datasets.push({
      label: data.consolidatedCompetitors.name,
      data: getValues(data.consolidatedCompetitors.values),
      borderColor: data.consolidatedCompetitors.color,
      borderDash: [6, 3],
      tension: 0.3,
      fill: false
    });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "line",
    data: { labels: data.periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: val => valueType === "percent" ? val + "%" : val },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

// Grouped Bar Chart
function advCreateGroupedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  function getValues(arr) { return valueType === "percent" ? advToPercent(arr) : arr; }

  const datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    data.competitors.forEach(c => {
      datasets.push({ label: c.name, data: getValues(c.values), backgroundColor: c.color });
    });
  } else {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    datasets.push({ label: data.consolidatedCompetitors.name, data: getValues(data.consolidatedCompetitors.values), backgroundColor: data.consolidatedCompetitors.color });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels: data.periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: val => valueType === "percent" ? val + "%" : val },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

// Stacked Bar Chart
function advCreateStackedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  function getValues(arr) { return valueType === "percent" ? advToPercent(arr) : arr; }

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidatedCompetitors.name];

  const datasets = data.periods.map((item, i) => {
    let itemValues = mode === "direct"
      ? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c => getValues(c.values)[i])]
      : [getValues(data.yourCompany.values)[i], getValues(data.consolidatedCompetitors.values)[i]];

    const colors = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6"];
    return { label: item, data: itemValues, backgroundColor: colors[i % colors.length] };
  });

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      indexAxis: "y",
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          max: valueType === "percent" ? 100 : undefined,
          ticks: { callback: val => valueType === "percent" ? val + "%" : val }
        },
        y: { stacked: true }
      }
    }
  });
}

// Horizontal Bar Chart
function advCreateHorizontalBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  function getValues(arr) { return valueType === "percent" ? advToPercent(arr) : arr; }

  const datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    data.competitors.forEach(c => {
      datasets.push({ label: c.name, data: getValues(c.values), backgroundColor: c.color });
    });
  } else {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    datasets.push({ label: data.consolidatedCompetitors.name, data: getValues(data.consolidatedCompetitors.values), backgroundColor: data.consolidatedCompetitors.color });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels: data.periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      indexAxis: "y",
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: val => valueType === "percent" ? val + "%" : val },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}
