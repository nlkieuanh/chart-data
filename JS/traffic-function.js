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



// --------------------------------------------------
// ## UTILITY FUNCTIONS
// --------------------------------------------------

function trafficHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function trafficToPercent(arr) {
  if (!Array.isArray(arr)) return [];
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

function trafficComputeConsolidated(data) {
  if (!data.competitors || !data.competitors.length) return null;

  if (data.chartType === "multiple-donut") {
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

  const length = data.periods?.length || (Array.isArray(data.competitors[0].values) ? data.competitors[0].values.length : 0);
  const avg = Array(length).fill(0);
  let competitorCount = 0;

  data.competitors.forEach(c => {
    if (Array.isArray(c.values) && c.values.length === length) {
      c.values.forEach((v, i) => { avg[i] += v; });
      competitorCount++;
    }
  });

  if (competitorCount === 0) return null;

  return {
    name: "Average Competitors",
    color: DASHBOARD_AVERAGE_COLOR, 
    values: avg.map(v => +(v / competitorCount).toFixed(1))
  };
}


// --------------------------------------------------
// ## MULTIPLE DONUT CHART RENDERERS
// --------------------------------------------------

function trafficRenderDonutChart(ctx, entityData) {
    if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

    const labels = entityData.sources.map(s => s.source);
    const data = entityData.sources.map(s => s.share);
    
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
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: {
                legend: { position: "bottom" },
                title: { display: true, text: entityData.name, font: { size: 14 } } 
            }
        }
    });
}

function trafficCreateDonutCompanyBlock(container, entity) {
    const block = document.createElement("div");
    block.classList.add("donut-chart-container"); 
    
    const title = document.createElement("h4");
    title.innerText = entity.name;
    block.appendChild(title);

    const canvas = document.createElement("canvas");
    const canvasId = "donut-" + entity.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, '');
    canvas.id = canvasId;
    
    block.appendChild(canvas);
    container.appendChild(block);

    trafficRenderDonutChart(canvas.getContext("2d"), entity);
}

function trafficCreateMultipleDonuts(grid, data, mode) {
    grid.innerHTML = ''; 
    
    let entitiesToRender = [];
    if (mode === "direct") {
        entitiesToRender = [data.yourCompany, ...data.competitors];
    } else {
        entitiesToRender = [data.yourCompany, data.consolidated].filter(c => c);
    }
    
    entitiesToRender.forEach(entity => {
        if (entity.sources) { 
            trafficCreateDonutCompanyBlock(grid, entity);
        }
    });
}

// --------------------------------------------------
// ## INIT & MAIN LOGIC
// --------------------------------------------------

function trafficInitChart(wrapper, dataUrl) {
  // --- ADD INLINE STYLING FOR FLEXBOX LAYOUT ---
  const style = document.createElement('style');
  style.textContent = `
    .chart-canvas {
        display: flex;
        flex-wrap: wrap;
        gap: 20px; 
        justify-content: flex-start;
        align-items: flex-start;
    }
    .donut-chart-container {
        flex: 0 0 300px; 
        max-width: 100%;
        min-height: 350px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }
    .donut-chart-container h4 {
        margin-bottom: 10px;
        font-size: 1em;
        font-weight: 600;
        color: #333;
    }
  `;
  wrapper.appendChild(style);
  // --------------------------------------------------

  const rootCanvas = wrapper.querySelector("canvas");
  const ctx = rootCanvas ? rootCanvas.getContext("2d") : null;
  
  const chartTypeMap = {
    "line": trafficCreateLineChart,
    "bar": trafficCreateGroupedBarChart, 
    "stacked-horizontal": trafficCreateStackedHorizontalBarChart, 
    "multiple-donut": trafficCreateMultipleDonuts 
  };

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const chartType = data.chartType; 
      const barMode = data.barMode || "grouped"; 
      let currentMode = "direct";
      let currentValue = "absolute";
      
      const isMultipleDonut = chartType === "multiple-donut";
      
      if (!chartType || !chartTypeMap[chartType]) {
        console.error(`Error: chartType "${chartType}" is missing or invalid in JSON data.`);
        return;
      }
      
      const createChartFunction = chartTypeMap[chartType];
      
      // 1. Apply Color Mapping 
      if (data.yourCompany) data.yourCompany.color = DASHBOARD_YOUR_COMPANY_COLOR;
      if (data.competitors) {
          data.competitors.forEach(c => {
            c.color = getConsistentCompetitorColor(c.name); 
          });
      }
      
      // 2. Compute Consolidated Data
      data.consolidated = trafficComputeConsolidated(data);

      // Active state helper
      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      function renderChart() {
        if (isMultipleDonut) {
           if (rootCanvas) rootCanvas.style.display = 'none'; 
           createChartFunction(wrapper, data, currentMode);
        } else if (ctx) {
           if (rootCanvas) rootCanvas.style.display = 'block'; 
           createChartFunction(ctx, data, currentMode, currentValue);
        }
      }

      // Buttons setup
      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      // Add event listeners
      if (btnDirect) btnDirect.addEventListener("click", () => {
        currentMode = "direct";
        renderChart();
        setActive(modeBtns, btnDirect); 
      });

      if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate";
        renderChart();
        setActive(modeBtns, btnConsolidate); 
      });

      if (btnAbs) btnAbs.addEventListener("click", () => {
        if (isMultipleDonut) return; 
        currentValue = "absolute"; renderChart(); setActive(valueBtns, btnAbs);
      });

      if (btnPct) btnPct.addEventListener("click", () => {
        if (isMultipleDonut) return; 
        currentValue = "percent"; renderChart(); setActive(valueBtns, btnPct);
      });

      // Hide/Show buttons
      if (isMultipleDonut) {
         if (btnAbs) btnAbs.style.display = 'none';
         if (btnPct) btnPct.style.display = 'none';
      } else {
         if (btnAbs) btnAbs.style.display = 'block';
         if (btnPct) btnPct.style.display = 'block';
      }
      

      // Initial render and button states
      renderChart();
      setActive(modeBtns, btnDirect);
      setActive(valueBtns, btnAbs);
    })
    .catch(err => console.error("Error loading traffic data:", err));
}

// --------------------------------------------------
// ## CHART CREATION FUNCTIONS (LINE, BAR)
// --------------------------------------------------

const getChartValues = (arr, valueType) => Array.isArray(arr) ? (valueType === "percent" ? trafficToPercent(arr) : arr) : [];

function trafficCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  let datasets = [];
  const getValues = (arr) => getChartValues(arr, valueType);

  datasets.push({
    label: data.yourCompany.name,
    data: getValues(data.yourCompany.values),
    borderColor: data.yourCompany.color,
    fill: false, tension: 0.3
  });

  if (mode === "direct") {
    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: getValues(c.values),
        borderColor: c.color,
        borderDash: [4, 2],
        fill: false, tension: 0.3
      });
    });
  } else if (data.consolidated) {
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

function trafficCreateGroupedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);

  const datasets = [];
  datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
  
  if (mode === "direct") {
    data.competitors.forEach(c => datasets.push({ label: c.name, data: getValues(c.values), backgroundColor: c.color }));
  } else if (data.consolidated) {
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

function trafficCreateStackedHorizontalBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidated?.name || "Average Competitors"];

  const datasets = data.periods.map((p, i) => {
    const vals = mode === "direct"
      ? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c => getValues(c.values)[i])]
      : [getValues(data.yourCompany.values)[i], getValues(data.consolidated?.values || [])[i]];
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
