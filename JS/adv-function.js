// ==================================================
// Advertising Chart Functions for Webflow
// Prefix: adv
// ==================================================

// --------------------------------------------------
// ## UTILITY FUNCTIONS
// --------------------------------------------------

function advHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function advToPercent(arr) {
  if (!Array.isArray(arr)) return [];
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

function advComputeConsolidated(data) {
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

// --------------------------------------------------
// ## CORE INITIALIZATION
// --------------------------------------------------

function advInitChart(wrapper, dataUrl) {
  const rootCanvas = wrapper.querySelector("canvas");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const type = data.chartType;
      let currentMode = "direct";
      let currentValue = "absolute";

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      // ===== ANGLES SPECIAL (Handles its own rendering loop and buttons) =====
      if (type === "angles") {
        const grid = document.createElement("div");
        grid.className = "chart-grid";
        rootCanvas.replaceWith(grid);

        function advComputeConsolidatedAngles(data) {
          if (!data.competitors || !data.competitors.length) return null;
          const angleSet = new Set();
          data.competitors.forEach(c => Object.keys(c.anglesOffers).forEach(a => angleSet.add(a)));
          const avg = {};
          Array.from(angleSet).forEach(angle => {
            let sum = 0, count = 0;
            data.competitors.forEach(c => {
              if (c.anglesOffers[angle] !== undefined) { sum += c.anglesOffers[angle]; count++; }
            });
            avg[angle] = count > 0 ? +(sum / count).toFixed(1) : 0;
          });

          return { name: "Average Competitors", color: "#999999", anglesOffers: avg };
        }

        function renderCharts() {
          grid.replaceChildren();

          if (currentMode === "direct") {
            advCreateCompanyBlock(grid, data.yourCompany, currentValue);
            data.competitors.forEach(c => advCreateCompanyBlock(grid, c, currentValue));
          } else {
            advCreateCompanyBlock(grid, data.yourCompany, currentValue);
            const avgCompetitors = advComputeConsolidatedAngles(data);
            advCreateCompanyBlock(grid, avgCompetitors, currentValue);
          }
        }

        const btnDirect = wrapper.querySelector(".btn-direct");
        const btnConsolidate = wrapper.querySelector(".btn-consolidate");
        const btnAbs = wrapper.querySelector(".btn-absolute");
        const btnPct = wrapper.querySelector(".btn-percent");

        const modeBtns = [btnDirect, btnConsolidate];
        const valueBtns = [btnAbs, btnPct];

        if (btnDirect) btnDirect.addEventListener("click", () => {
          currentMode = "direct"; currentValue = "absolute"; renderCharts();
          setActive(modeBtns, btnDirect); setActive(valueBtns, btnAbs);
        });
        if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
          currentMode = "consolidate"; currentValue = "absolute"; renderCharts();
          setActive(modeBtns, btnConsolidate); setActive(valueBtns, btnAbs);
        });
        if (btnAbs) btnAbs.addEventListener("click", () => {
          currentValue = "absolute"; renderCharts(); setActive(valueBtns, btnAbs);
        });
        if (btnPct) btnPct.addEventListener("click", () => {
          currentValue = "percent"; renderCharts(); setActive(valueBtns, btnPct);
        });

        renderCharts();
        setActive(modeBtns, btnDirect);
        setActive(valueBtns, btnAbs);
        return;
      }

      // ===== OTHER CHART TYPES (Standard single canvas flow) =====
      data.consolidatedCompetitors = advComputeConsolidated(data);
      const chartTypeMap = {
        "line": advCreateLineChart,
        "bar-grouped": advCreateGroupedBarChart,
        "bar-stacked": advCreateStackedBarChart,
        "bar-horizontal": advCreateHorizontalBarChart
      };
      
      const createChartFunction = chartTypeMap[type];

      function renderChart() {
        const ctx = rootCanvas.getContext("2d");
        createChartFunction(ctx, data, currentMode, currentValue);
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
    .catch(err => console.error("Error loading adv data:", err));
}

// --------------------------------------------------
// ## ANGLES/GEO RENDER BLOCKS
// --------------------------------------------------

function advCreateCompanyBlock(container, company, valueType) {
  const block = document.createElement("div");
  block.classList.add("company-chart");

  const title = document.createElement("h4");
  title.innerText = company.name;
  block.appendChild(title);

  const inner = document.createElement("div");
  inner.classList.add("chart-inner");

  const BAR_THICKNESS = 20;
  const BAR_GAP = 20;
  // Use anglesOffers for labels/data
  const anglesCount = Object.keys(company.anglesOffers).length; 
  const calcHeight = Math.max(anglesCount * (BAR_THICKNESS + BAR_GAP), 120); 
  inner.style.height = calcHeight + "px";                   

  const canvas = document.createElement("canvas");
  canvas.id = "chart-" + company.name.replace(/\s+/g, "-");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.setAttribute("height", calcHeight); 
  inner.appendChild(canvas);
  block.appendChild(inner);
  container.appendChild(block);

  advRenderAnglesChart(canvas, company, valueType, { BAR_THICKNESS });
}

function advRenderAnglesChart(canvas, company, valueType, opts) {
  if (window[canvas.id + "Chart"]) window[canvas.id + "Chart"].destroy();

  const labels = Object.keys(company.anglesOffers);              
  const arr = labels.map(l => company.anglesOffers[l] || 0);
  const values = valueType === "percent" ? advToPercent(arr) : arr;
  const BAR_THICKNESS = (opts && opts.BAR_THICKNESS) || 20;
  
  // FIX: Calculate Max Scale for X-axis to ensure margin for Data Labels (120%)
  let maxScaleValue = undefined;
  if (valueType !== "percent" && values.length > 0) {
    const maxDataValue = Math.max(...values);
    maxScaleValue = Math.ceil(maxDataValue * 1.2); 
  }

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
      responsive: true, maintainAspectRatio: false, 
      resizeDelay: 50,
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: "end",
          align: "right",
          clamp: true,           
          clip: false,
          color: "#333",
          font: { size: 12, weight: "bold" },
          formatter: v => v === 0 ? "" : (valueType === "percent" ? v + "%" : v)
        }
      },
      indexAxis: "y",
      layout: { padding: { top: 6, right: 6, bottom: 6, left: 6 } },
      scales: {
        y: { grid: { display: false }, ticks: { color: "#0f172a", font: { size: 12 } } },
        x: {
          beginAtZero: true,
          grid: { display: false },
          ticks: { display: false },
          max: valueType === "percent" ? 100 : maxScaleValue // Apply calculated max
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

// --------------------------------------------------
// ## STANDARD CHART CREATION
// --------------------------------------------------

const getChartValues = (arr, valueType) => Array.isArray(arr) ? (valueType === "percent" ? advToPercent(arr) : arr) : [];

function advCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);
  const datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), borderColor: data.yourCompany.color, backgroundColor: advHexToRgba(data.yourCompany.color, 0.3), fill: false, tension: 0.3 });
    data.competitors.forEach(c => { datasets.push({ label: c.name, data: getValues(c.values), borderColor: c.color, backgroundColor: advHexToRgba(c.color, 0.3), borderDash: [4, 2], fill: false, tension: 0.3 }); });
  } else {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), borderColor: data.yourCompany.color, backgroundColor: advHexToRgba(data.yourCompany.color, 0.3), fill: false, tension: 0.3 });
    datasets.push({ label: data.consolidatedCompetitors.name, data: getValues(data.consolidatedCompetitors.values), borderColor: data.consolidatedCompetitors.color, borderDash: [6, 3], fill: false, tension: 0.3 });
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

function advCreateGroupedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);
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

function advCreateStackedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidatedCompetitors.name];

  const colorPool = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477"];
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
      plugins: {
        legend: { position: "bottom" },
        // FIX: Add callback to show '%' in tooltip label when in percent mode
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.x !== null) {
                label += context.parsed.x;
                if (valueType === 'percent') {
                  label += '%';
                }
              }
              return label;
            }
          }
        }
     },
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

function advCreateHorizontalBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);
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
      indexAxis: "y",
      scales: {
        x: {
          beginAtZero: true,
          max: valueType === "percent" ? 100 : undefined,
          ticks: { callback: v => valueType === "percent" ? v + "%" : v }
        }
      }
    }
  });
}
