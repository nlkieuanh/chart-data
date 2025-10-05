// ==================================================
// Traffic Chart Functions
// Prefix: traffic
// Library: Chart.js + ECharts (geo only)
// ==================================================

// ========== Color Mapping & Constants ==========
const DASHBOARD_YOUR_COMPANY_COLOR = "#7d83ff";
const DASHBOARD_AVERAGE_COLOR = "#577590";

const DONUT_COLOR_POOL = [
  "#cab2d6", "#1f78b4", "#a6cee3", "#33a02c",
  "#b2df8a", "#ff7f00", "#fdbf6f", "#fb9a99", "#e31a1c"
];

const COMPETITOR_COLOR_MAP = {}; 
let colorIndex = 0; 

function getConsistentCompetitorColor(name) {
    if (COMPETITOR_COLOR_MAP[name]) return COMPETITOR_COLOR_MAP[name];
    const color = DONUT_COLOR_POOL[colorIndex % DONUT_COLOR_POOL.length]; 
    COMPETITOR_COLOR_MAP[name] = color;
    colorIndex++;
    return color;
}


// ========== Utility Functions ==========

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

  if (data.chartType === "donut") {
    const acc = {};
    const n = data.competitors.length;
    data.competitors.forEach(comp => {
      (comp.sources || []).forEach(s => {
        acc[s.source] = (acc[s.source] || 0) + Number(s.share || 0);
      });
    });
    const consolidatedSources = Object.keys(acc)
      .map(source => ({ source, share: +(acc[source] / n).toFixed(2) }))
      .sort((a, b) => b.share - a.share);
    return { name: "Consolidated Competitors", sources: consolidatedSources };
  }

  if (data.chartType === "geo") {
    const aggregated = {};
    data.competitors.forEach(c => {
      (c.top_countries || []).forEach(tc => {
        aggregated[tc.country] = (aggregated[tc.country] || 0) + Number(tc.traffic_share || 0);
      });
    });
    const consolidatedCountries = Object.keys(aggregated)
      .map(country => ({ country, traffic_share: +aggregated[country].toFixed(2) }))
      .sort((a, b) => b.traffic_share - a.traffic_share);
    return { name: "Consolidated Competitors", top_countries: consolidatedCountries };
  }

  const firstWithValues = (data.competitors || []).find(c => Array.isArray(c.values));
  if (!firstWithValues) return null;

  const len = firstWithValues.values.length;
  const sums = Array(len).fill(0);
  data.competitors.forEach(c => {
    (c.values || []).forEach((v, i) => { sums[i] += Number(v || 0); });
  });

  return {
    name: "Average Competitors",
    color: DASHBOARD_AVERAGE_COLOR,
    values: sums.map(v => +(v / data.competitors.length).toFixed(1))
  };
}

// ========== Initialization & Main Logic ==========

function trafficInitChart(wrapper, dataUrl) {
  const rootCanvas = wrapper.querySelector("canvas");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const type = data.chartType;
      const barMode = data.barMode || "grouped";
      let currentMode = "direct";
      let currentValue = "absolute";

      data.consolidated = trafficComputeConsolidated(data);

      if (data.yourCompany) data.yourCompany.color = DASHBOARD_YOUR_COMPANY_COLOR;
      if (data.competitors) {
        data.competitors.forEach(c => { c.color = getConsistentCompetitorColor(c.name); });
      }

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      function renderChart() {
        if (!rootCanvas) return;
        const ctx = rootCanvas.getContext("2d");

        if (type === "donut") {
          rootCanvas.style.display = "none";
          trafficRenderDonutCharts(wrapper, data, currentMode);
          return;
        }

        if (type === "geo") {
          rootCanvas.style.display = "none";
          trafficRenderCountryCharts(wrapper, data, currentMode);
          return;
        }

        rootCanvas.style.display = "";
        const geoGrid = wrapper.querySelector(".country-grid");
        if (geoGrid) geoGrid.remove();
        const donutGrid = wrapper.querySelector(".donut-grid");
        if (donutGrid) donutGrid.remove();

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

      if (type !== "donut" && type !== "geo") {
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
        setActive(modeBtns, btnDirect);
        setActive(valueBtns, btnAbs);
      } else {
        if (btnDirect) {
          btnDirect.addEventListener("click", () => {
            currentMode = "direct"; renderChart();
            setActive(modeBtns, btnDirect);
          });
          setActive(modeBtns, btnDirect);
        }
        if (btnConsolidate) {
          btnConsolidate.addEventListener("click", () => {
            currentMode = "consolidate"; renderChart();
            setActive(modeBtns, btnConsolidate);
          });
        }
        if (btnAbs) btnAbs.style.display = 'none';
        if (btnPct) btnPct.style.display = 'none';
      }

      renderChart();
    })
    .catch(err => console.error("Error loading traffic data:", err));
}

// ========== Donut Charts ==========

function trafficCreateDonutChart(div, entityData) {
  const canvas = document.createElement("canvas");
  div.appendChild(canvas);

  const labels = entityData.sources.map(s => s.source);
  const data = entityData.sources.map(s => Number(s.share || 0));
  const backgroundColors = labels.map((_, i) => DONUT_COLOR_POOL[i % DONUT_COLOR_POOL.length]);

  new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: backgroundColors }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right" },
        title: { display: true, text: entityData.name }
      }
    }
  });
}

function trafficRenderDonutCharts(wrapper, data, mode) {
  const rootCanvas = wrapper.querySelector("canvas");
  if (rootCanvas) rootCanvas.style.display = "none";

  let grid = wrapper.querySelector(".donut-grid");
  if (grid) grid.innerHTML = "";
  else {
    grid = document.createElement("div");
    grid.className = "donut-grid";
    wrapper.appendChild(grid);
  }

  if (mode === "direct") {
    [data.yourCompany, ...data.competitors].forEach(company => {
      const card = document.createElement("div");
      card.className = "donut-card";
      grid.appendChild(card);
      trafficCreateDonutChart(card, company);
    });
  } else {
    [data.yourCompany, data.consolidated].forEach(company => {
      const card = document.createElement("div");
      card.className = "donut-card";
      grid.appendChild(card);
      trafficCreateDonutChart(card, company);
    });
  }
}

// ========== Line Chart ==========

function trafficCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? trafficToPercent(arr) : arr;

  const datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), borderColor: data.yourCompany.color, fill: false, tension: 0.3 });
    data.competitors.forEach(c => datasets.push({ label: c.name, data: getValues(c.values), borderColor: c.color, borderDash: [4, 2], fill: false, tension: 0.3 }));
  } else {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), borderColor: data.yourCompany.color, fill: false, tension: 0.3 });
    datasets.push({ label: data.consolidated.name, data: getValues(data.consolidated.values), borderColor: data.consolidated.color, borderDash: [6, 3], fill: false, tension: 0.3 });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "line",
    data: { labels: data.periods, datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });
}

// ========== Grouped Bar ==========

function trafficCreateGroupedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? trafficToPercent(arr) : arr;

  const datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    data.competitors.forEach(c => datasets.push({ label: c.name, data: getValues(c.values), backgroundColor: c.color }));
  } else {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
    datasets.push({ label: data.consolidated.name, data: getValues(data.consolidated.values), backgroundColor: data.consolidated.color });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels: data.periods, datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });
}

// ========== Stacked Horizontal Bar ==========

function trafficCreateStackedHorizontalBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? trafficToPercent(arr) : arr;

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidated.name];

  const datasets = data.periods.map((p, i) => {
    const vals = mode === "direct"
      ? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c => getValues(c.values)[i])]
      : [getValues(data.yourCompany.values)[i], getValues(data.consolidated.values)[i]];
    return { label: p, data: vals, backgroundColor: DONUT_COLOR_POOL[i % DONUT_COLOR_POOL.length] };
  });

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      indexAxis: "y",
      scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }
    }
  });
}

// ========== Geo Bar (Spacer Technique) ==========

function trafficCreateCountryBarChart(div, companyData) {
  const canvas = document.createElement("canvas");
  div.appendChild(canvas);

  const labels = companyData.top_countries.map(c => c.country);
  const values = companyData.top_countries.map(c => c.traffic_share);

  const barColor = companyData.color || getConsistentCompetitorColor(companyData.name);

  // interleave: country -> bar, spacer -> gap
  const datasetLabels = [];
  const datasetValues = [];
  labels.forEach((label, i) => {
    datasetLabels.push(label);
    datasetValues.push(values[i]);
    datasetLabels.push("");      // spacer label
    datasetValues.push(null);    // spacer value
  });

  new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: datasetLabels,
      datasets: [{
        data: datasetValues,
        backgroundColor: datasetLabels.map(l => l === "" ? "rgba(0,0,0,0)" : barColor),
        barThickness: 20,
        barPercentage: 1.0, 
        categoryPercentage: 1.0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        title: { display: true, text: companyData.name, font: { size: 14, weight: "bold" } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.raw !== null ? ctx.raw + "%" : ""
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => v + "%" }
        },
        y: {
          ticks: {
            autoSkip: false,
            callback: function(value, index) {
              return datasetLabels[index] || "";
            }
          }
        }
      }
    }
  });
}

function trafficRenderCountryCharts(wrapper, data, mode) {
  const rootCanvas = wrapper.querySelector("canvas");
  if (rootCanvas) rootCanvas.style.display = "none";

  let grid = wrapper.querySelector(".country-grid");
  if (grid) grid.innerHTML = "";
  else {
    grid = document.createElement("div");
    grid.className = "country-grid";
    wrapper.appendChild(grid);
  }

  if (mode === "direct") {
    [data.yourCompany, ...data.competitors].forEach(company => {
      const card = document.createElement("div");
      card.className = "country-card";
      grid.appendChild(card);
      trafficCreateCountryBarChart(card, company);
    });
  } else {
    [data.yourCompany, data.consolidated].forEach(company => {
      const card = document.createElement("div");
      card.className = "country-card";
      grid.appendChild(card);
      trafficCreateCountryBarChart(card, company);
    });
  }
}

