// ==================================================
// Common Chart Functions for Webflow
// Utility prefix: chart
// Org-specific prefix: org
// ==================================================

// ========== Utility Functions ==========
function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function chartToPercent(arr) {
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

// Chuẩn hoá values object -> array khớp periods
function mapValuesToArray(valuesObj, fullPeriods) {
  return fullPeriods.map(region => valuesObj[region] || 0);
}

// Lấy union tất cả periods từ yourCompany + competitors + consolidated
function getFullPeriods(data) {
  const set = new Set(data.periods || []);
  if (data.yourCompany?.values) Object.keys(data.yourCompany.values).forEach(k => set.add(k));
  if (data.competitors) {
    data.competitors.forEach(c => {
      if (c.values) Object.keys(c.values).forEach(k => set.add(k));
      if (c.locations) Object.keys(c.locations).forEach(k => set.add(k));
    });
  }
  if (data.consolidatedCompetitors?.values) {
    Object.keys(data.consolidatedCompetitors.values).forEach(k => set.add(k));
  }
  if (data.consolidatedCompetitors?.locations) {
    Object.keys(data.consolidatedCompetitors.locations).forEach(k => set.add(k));
  }
  return Array.from(set);
}

// ========== Org Init ==========
function orgInitChart(wrapper, dataUrl) {
  const canvas = wrapper.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const periodsCount = data.periods ? data.periods.length : 0;
      const isLine = periodsCount >= 10 && !data.yourCompany.values?.US; 
      const isStacked = periodsCount > 6 && periodsCount < 10 && Array.isArray(data.yourCompany.values);
      const isGrouped = Array.isArray(data.yourCompany.values) && periodsCount <= 6;
      const isGeo = !Array.isArray(data.yourCompany.values); // values dạng object -> Geo Workforce

      let currentMode = "direct";     // direct | consolidate
      let currentValue = "absolute";  // absolute | percent

      function renderChart() {
        if (isLine) orgCreateLineChart(ctx, data, currentMode, currentValue);
        if (isGrouped) orgCreateGroupedChart(ctx, data, currentMode, currentValue);
        if (isStacked) orgCreateStackedChart(ctx, data, currentMode, currentValue);
        if (isGeo) orgCreateGeoCompanyCharts(canvas, data, currentMode, currentValue);
      }

      // buttons
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
    .catch(err => console.error("Error loading chart data:", err));
}

// ========== Line Chart (Overall Headcount) ==========
function orgCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  function getValues(arr) {
    return valueType === "percent" ? chartToPercent(arr) : arr;
  }

  let datasets = [];
  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: chartHexToRgba(data.yourCompany.color, 0.5),
      tension: 0.3
    });
    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: getValues(c.values),
        borderColor: c.color,
        backgroundColor: chartHexToRgba(c.color, 0.5),
        borderDash: [4, 2],
        tension: 0.3
      });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: chartHexToRgba(data.yourCompany.color, 0.5),
      tension: 0.3
    });
    datasets.push({
      label: data.consolidatedCompetitors.name,
      data: getValues(data.consolidatedCompetitors.values),
      borderColor: data.consolidatedCompetitors.color,
      backgroundColor: chartHexToRgba(data.consolidatedCompetitors.color, 0.5),
      borderDash: [6, 3],
      tension: 0.3
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
          ticks: {
            callback: val => valueType === "percent" ? val + "%" : val
          },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

// ========== Grouped Bar Chart (Performance / Marketing) ==========
function orgCreateGroupedChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  function getValues(arr) {
    return valueType === "percent" ? chartToPercent(arr) : arr;
  }

  let datasets = [];
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

// ========== Stacked Bar Chart (Department Distribution) ==========
function orgCreateStackedChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  function getValues(arr) {
    return valueType === "percent" ? chartToPercent(arr) : arr;
  }

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidatedCompetitors.name];

  const datasets = data.periods.map((dept, i) => {
    let deptValues = mode === "direct"
      ? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c => getValues(c.values)[i])]
      : [getValues(data.yourCompany.values)[i], getValues(data.consolidatedCompetitors.values)[i]];

    const colors = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477"];
    return { label: dept, data: deptValues, backgroundColor: colors[i % colors.length] };
  });

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (context) {
              return valueType === "percent"
                ? `${context.dataset.label}: ${context.parsed.x}%`
                : `${context.dataset.label}: ${context.parsed.x}`;
            }
          }
        }
      },
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

// ========== Geo Workforce (Per-Company Charts) ==========
function orgComputeConsolidatedGeo(data) {
  if (!data.competitors || !data.competitors.length) return null;
  const locationSet = new Set();
  data.competitors.forEach(c => Object.keys(c.values || c.locations || {}).forEach(l => locationSet.add(l)));

  const avg = {};
  Array.from(locationSet).forEach(loc => {
    let sum = 0, count = 0;
    data.competitors.forEach(c => {
      const v = (c.values && c.values[loc]) || (c.locations && c.locations[loc]) || 0;
      if (v) { sum += v; count++; }
    });
    avg[loc] = count > 0 ? +(sum / count).toFixed(1) : 0;
  });

  return { name: "Average Competitors", color: "#999999", locations: avg };
}

function orgCreateGeoCompanyCharts(rootCanvas, data, mode, valueType) {
  const wrapper = rootCanvas.parentNode;
  let grid = wrapper.querySelector(".geo-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.className = "geo-grid";
    rootCanvas.replaceWith(grid);
  }
  grid.replaceChildren();

  if (mode === "direct") {
    orgCreateGeoCompanyBlock(grid, data.yourCompany, valueType);
    data.competitors.forEach(c => orgCreateGeoCompanyBlock(grid, c, valueType));
  } else {
    orgCreateGeoCompanyBlock(grid, data.yourCompany, valueType);
    const avg = orgComputeConsolidatedGeo(data);
    orgCreateGeoCompanyBlock(grid, avg, valueType);
  }
}

function orgCreateGeoCompanyBlock(container, company, valueType) {
  const block = document.createElement("div");
  block.classList.add("company-chart");

  const title = document.createElement("h4");
  title.innerText = company.name;
  block.appendChild(title);

  const inner = document.createElement("div");
  inner.classList.add("chart-inner");

  const BAR_THICKNESS = 20;
  const BAR_GAP = 20;
  const locCount = Object.keys(company.values || company.locations || {}).length;
  const calcHeight = Math.max(locCount * (BAR_THICKNESS + BAR_GAP), 120);
  inner.style.height = calcHeight + "px";

  const canvas = document.createElement("canvas");
  canvas.id = "geo-" + company.name.replace(/\s+/g, "-");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.setAttribute("height", calcHeight);
  inner.appendChild(canvas);
  block.appendChild(inner);
  container.appendChild(block);

  orgRenderGeoChart(canvas, company, valueType, { BAR_THICKNESS });
}

function orgRenderGeoChart(canvas, company, valueType, opts) {
  if (window[canvas.id + "Chart"]) window[canvas.id + "Chart"].destroy();

  const labels = Object.keys(company.values || company.locations || {});
  const arr = labels.map(l => (company.values && company.values[l]) || (company.locations && company.locations[l]) || 0);
  const values = valueType === "percent" ? chartToPercent(arr) : arr;
  const BAR_THICKNESS = (opts && opts.BAR_THICKNESS) || 20;

  window[canvas.id + "Chart"] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: company.name,
        data: values,
        backgroundColor: company.color,
        barThickness: BAR_THICKNESS,
        maxBarThickness: BAR_THICKNESS,
        categoryPercentage: 1.0,
        barPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: "end",
          align: "right",
          clamp: true,
          color: "#333",
          font: { size: 12, weight: "bold" },
          formatter: v => v === 0 ? "" : (valueType === "percent" ? v + "%" : v)
        }
      },
      indexAxis: "y",
      scales: {
        y: { grid: { display: false }, ticks: { color: "#0f172a", font: { size: 12 } } },
        x: {
          beginAtZero: true,
          grid: { display: false },
          ticks: { display: false },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}
