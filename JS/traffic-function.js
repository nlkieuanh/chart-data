// ==================================================
// Traffic Chart Functions
// Prefix: traffic
// Library: Chart.js (assumed)
// ==================================================

// ========== Color Mapping & Constants (ENSURE CONSISTENCY ACROSS DASHBOARD) ==========

const DASHBOARD_YOUR_COMPANY_COLOR = "#7d83ff";  // Primary
const DASHBOARD_AVERAGE_COLOR = "#577590";       // Light Grey
/*const DASHBOARD_PERIODS_COLOR_POOL = ["#cab2d6", "#1f78b4", "#a6cee3", "#33a02c", "#b2df8a", "#ff7f00", "#fdbf6f", "#fb9a99", "#e31a1c"];*/

const DONUT_COLOR_POOL = [
  "#cab2d6", "#1f78b4", "#a6cee3", "#33a02c", "#b2df8a", "#ff7f00", "#fdbf6f", "#fb9a99", "#e31a1c"
];

const COMPETITOR_COLOR_MAP = {}; 
let colorIndex = 0; 

function getConsistentCompetitorColor(name) {
    if (COMPETITOR_COLOR_MAP[name]) {
        return COMPETITOR_COLOR_MAP[name];
    }
    
    // Use the first 8 colors of the palette for individual competitor consistency
    const color = DONUT_COLOR_POOL[colorIndex % 8]; // Use a subset of the pool
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
    // LOGIC CHO DONUT CHART: Gom nhóm và chuẩn hóa tổng thị trường
    const allEntities = [data.yourCompany, ...data.competitors];
    const totalEntities = allEntities.length; // 6 entities
    const aggregatedSources = {};
    
    // 1. Gom nhóm và cộng tổng share
    allEntities.forEach(entity => {
      entity.sources.forEach(s => {
        if (aggregatedSources[s.source]) {
          aggregatedSources[s.source] += s.share;
        } else {
          aggregatedSources[s.source] = s.share;
        }
      });
    });

    // 2. Chuẩn hóa về 100% của thị trường gộp
    // Tổng share tuyệt đối là 100% * TotalEntities
    const totalPossibleShare = 100 * totalEntities;

    const normalizedSources = Object.keys(aggregatedSources).map(source => {
      const explicitNormalizedShare = (aggregatedSources[source] / totalPossibleShare) * 100;

      return {
        source: source,
        share: +(explicitNormalizedShare).toFixed(2)
      };
    }).sort((a, b) => b.share - a.share);

    return {
      name: "Consolidated Market Traffic",
      sources: normalizedSources
    };
  }

  // LOGIC CHO LINE/BAR CHARTS: Tính trung bình của các đối thủ (cho các periods đồng nhất)
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
      let currentEntity = 'yourCompany'; // State cho Donut Chart

      // 1. Tính toán Consolidated data (Chức năng đa năng cho cả bar/line và donut)
      data.consolidated = trafficComputeConsolidated(data);

      // 2. Ánh xạ màu nhất quán cho các chủ thể
      if (data.yourCompany) data.yourCompany.color = DASHBOARD_YOUR_COMPANY_COLOR;
      if (data.competitors) {
          data.competitors.forEach(c => {
            c.color = getConsistentCompetitorColor(c.name); 
          });
      }

      // Active state helper
      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      function renderChart() {
        const ctx = rootCanvas.getContext("2d");

        if (type === "donut") {
            let activeEntityData = data.yourCompany;
            if (currentEntity === 'consolidated' && data.consolidated) {
                activeEntityData = data.consolidated;
            }
            trafficCreateDonutChart(ctx, activeEntityData);
            return; 
        }

        // --- Logic cho Line/Bar Charts ---
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
          // Logic cho Line/Bar Charts
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
          // Logic cho Donut Chart
          if (btnDirect) {
              btnDirect.addEventListener("click", () => {
                  currentEntity = "yourCompany"; 
                  renderChart();
                  setActive(modeBtns, btnDirect);
              });
              setActive(modeBtns, btnDirect); // Set initial state
          }
          if (btnConsolidate) {
              btnConsolidate.addEventListener("click", () => {
                  if (data.consolidated) {
                      currentEntity = "consolidated"; 
                      renderChart();
                      setActive(modeBtns, btnConsolidate);
                  }
              });
          }
          // Ẩn nút Value vì Donut luôn hiển thị phần trăm
          if (btnAbs) btnAbs.style.display = 'none';
          if (btnPct) btnPct.style.display = 'none';
      }

      renderChart();
    })
    .catch(err => console.error("Error loading traffic data:", err));
}

// ========== Donut Chart (NEW) ==========
function trafficCreateDonutChart(ctx, entityData) {
    if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

    const labels = entityData.sources.map(s => s.source);
    const data = entityData.sources.map(s => s.share);
    
    // Use DONUT_COLOR_POOL for segments
    const backgroundColors = labels.map((_, i) => DONUT_COLOR_POOL[i % DONUT_COLOR_POOL.length]);

    window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
        type: "doughnut",
        data: { 
          labels, 
          datasets: [{
              label: "Traffic Share",
              data: data,
              backgroundColor: backgroundColors,
              hoverOffset: 4
          }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: "right" },
                title: { display: true, text: entityData.name + ' - Social Traffic Distribution' }
            }
        }
    });
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
