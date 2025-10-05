// ==================================================
// ==================================================
// Traffic Chart Functions
// Prefix: traffic
// Library: Chart.js (assumed)
// ==================================================

// ========== Color Mapping & Constants (ENSURE CONSISTENCY ACROSS DASHBOARD) ==========

const DASHBOARD_YOUR_COMPANY_COLOR = "#7d83ff";  // Primary
const DASHBOARD_AVERAGE_COLOR = "#577590";       // Light Grey

const DONUT_COLOR_POOL = [
  "#cab2d6", "#1f78b4", "#a6cee3", "#33a02c", "#b2df8a", "#ff7f00", "#fdbf6f", "#fb9a99", "#e31a1c"
];

const COMPETITOR_COLOR_MAP = {}; 
let colorIndex = 0; 

function getConsistentCompetitorColor(name) {
    if (COMPETITOR_COLOR_MAP[name]) {
        return COMPETITOR_COLOR_MAP[name];
    }
    const color = DONUT_COLOR_POOL[colorIndex % 8]; 
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
    const allEntities = [data.yourCompany, ...data.competitors];
    const totalEntities = allEntities.length;
    const aggregatedSources = {};
    
    allEntities.forEach(entity => {
      entity.sources.forEach(s => {
        if (aggregatedSources[s.source]) {
          aggregatedSources[s.source] += s.share;
        } else {
          aggregatedSources[s.source] = s.share;
        }
      });
    });

    const totalPossibleShare = 100 * totalEntities;

    const normalizedSources = Object.keys(aggregatedSources).map(source => {
      const explicitNormalizedShare = (aggregatedSources[source] / totalPossibleShare) * 100;
      return { source, share: +(explicitNormalizedShare).toFixed(2) };
    }).sort((a, b) => b.share - a.share);

    return { name: "Consolidated Market Traffic", sources: normalizedSources };
  }

  const length = data.competitors[0].values.length;
  const avg = Array(length).fill(0);
  data.competitors.forEach(c => c.values.forEach((v, i) => { avg[i] += v; }));

  return {
    name: "Average Competitors",
    color: DASHBOARD_AVERAGE_COLOR,
    values: avg.map(v => +(v / data.competitors.length).toFixed(1))
  };
}

// ========== Initialization & Main Logic (trafficInitChart) ==========

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
          data.competitors.forEach(c => {
            c.color = getConsistentCompetitorColor(c.name); 
          });
      }

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      function renderChart() {
        if (type === "donut") {
            trafficRenderDonutCharts(wrapper, data, currentMode);
            return; 
        }

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
      
      if (type !== "donut") {
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
                  currentMode = "direct"; renderChart(); setActive(modeBtns, btnDirect);
              });
              setActive(modeBtns, btnDirect);
          }
          if (btnConsolidate) {
              btnConsolidate.addEventListener("click", () => {
                  currentMode = "consolidate"; renderChart(); setActive(modeBtns, btnConsolidate);
              });
          }
          if (btnAbs) btnAbs.style.display = 'none';
          if (btnPct) btnPct.style.display = 'none';
      }

      renderChart();
    })
    .catch(err => console.error("Error loading traffic data:", err));
}

// ========== Donut Chart (UPDATED MULTI) ==========
function trafficRenderDonutCharts(wrapper, data, mode) {
    // giữ controls, chỉ clear phần chart
    let grid = wrapper.querySelector(".donut-grid");
    if (grid) {
        grid.innerHTML = "";
    } else {
        grid = document.createElement("div");
        grid.className = "donut-grid";
        wrapper.appendChild(grid);
    }

    function createDonutCard(name, sources) {
        const card = document.createElement("div");
        card.className = "donut-card";
        const canvas = document.createElement("canvas");
        card.appendChild(canvas);
        grid.appendChild(card);

        const labels = sources.map(s => s.source);
        const values = sources.map(s => s.share);
        const colors = labels.map((_, i) => DONUT_COLOR_POOL[i % DONUT_COLOR_POOL.length]);

        new Chart(canvas.getContext("2d"), {
            type: "doughnut",
            data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom" },
                    title: { display: true, text: name }
                }
            }
        });
    }

    if (mode === "direct") {
        createDonutCard(data.yourCompany.name, data.yourCompany.sources);
        data.competitors.forEach(c => createDonutCard(c.name, c.sources));
    } else {
        createDonutCard(data.yourCompany.name, data.yourCompany.sources);
        if (data.consolidated) createDonutCard(data.consolidated.name, data.consolidated.sources);
    }
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
    // Sử dụng data.consolidated cho Line/Bar charts
    datasets.push({
      label: data.consolidated.name,
      data: getValues(data.consolidated.values),
      borderColor: data.consolidated.color,
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
    // Sử dụng data.consolidated cho Line/Bar charts
    datasets.push({ label: data.consolidated.name, data: getValues(data.consolidated.values), backgroundColor: data.consolidated.color });
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
    : [data.yourCompany.name, data.consolidated.name];

  // DONUT_COLOR_POOL được tái sử dụng cho tính nhất quán của các kênh (periods)
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
