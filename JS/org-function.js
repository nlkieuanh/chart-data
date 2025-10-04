// ==================================================
// Common Chart Functions for Webflow
// Utility prefix: chart
// Org-specific prefix: org
// ==================================================

// --------------------------------------------------
// ## UTILITY FUNCTIONS
// --------------------------------------------------

function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function chartToPercent(arr) {
  if (!Array.isArray(arr)) return [];
  const total = arr.reduce((sum, v) => sum + v, 0);
  // Fixed to 1 decimal place, then convert back to number with unary plus
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

function mapValuesToArray(valuesObj, fullPeriods) {
  return fullPeriods.map(region => valuesObj[region] || 0);
}

function getFullPeriods(data) {
  const set = new Set(data.periods || []);
  if (data.yourCompany?.values) {
    if (Array.isArray(data.yourCompany.values)) {
      (data.periods || []).forEach(p => set.add(p));
    } else {
      Object.keys(data.yourCompany.values).forEach(k => set.add(k));
    }
  }
  if (data.competitors) {
    data.competitors.forEach(c => {
      if (Array.isArray(c.values)) {
        (data.periods || []).forEach(p => set.add(p));
      } else {
        Object.keys(c.values).forEach(k => set.add(k));
      }
    });
  }
  return Array.from(set);
}

// --------------------------------------------------
// ## CONSOLIDATED COMPUTATIONS
// --------------------------------------------------

function orgComputeConsolidatedArray(data) {
  if (!data.competitors || !data.competitors.length) return null;
  // Use length from periods if available, otherwise from the first competitor's values array
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
    color: "#999999", // Default color for computed average
    values: avg.map(v => +(v / competitorCount).toFixed(1))
  };
}

function orgComputeConsolidatedGeo(data) {
  if (!data.competitors || !data.competitors.length) return null;
  const locationSet = new Set();
  data.competitors.forEach(c => Object.keys(c.values || {}).forEach(l => locationSet.add(l)));

  const avg = {};
  Array.from(locationSet).forEach(loc => {
    let sum = 0, count = 0;
    data.competitors.forEach(c => {
      if (c.values && c.values[loc] !== undefined) { sum += c.values[loc]; count++; }
    });
    avg[loc] = count > 0 ? +(sum / count).toFixed(1) : 0;
  });

  return { name: "Average Competitors", color: "#999999", values: avg };
}

// --------------------------------------------------
// ## CHART CREATION FUNCTIONS (BY CHART TYPE)
// --------------------------------------------------

// Shared logic to get values (absolute or percent)
const getChartValues = (arr, valueType) => Array.isArray(arr) ? (valueType === "percent" ? chartToPercent(arr) : arr) : [];

function chartCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  let datasets = [];
  const getValues = (arr) => getChartValues(arr, valueType);

  // Add Your Company
  datasets.push({
    label: data.yourCompany.name,
    data: getValues(data.yourCompany.values),
    borderColor: data.yourCompany.color,
    backgroundColor: chartHexToRgba(data.yourCompany.color, 0.5),
    tension: 0.3
  });

  if (mode === "direct") {
    // Add all competitors
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
  } else if (data.consolidatedCompetitors) {
    // Add consolidated average
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
          ticks: { callback: val => valueType === "percent" ? val + "%" : val },
          max: valueType === "percent" ? 100 : undefined
        }
      }
    }
  });
}

function chartCreateGroupedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);

  let datasets = [];
  
  // Add Your Company
  datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), backgroundColor: data.yourCompany.color });
  
  if (mode === "direct") {
    // Add all competitors
    data.competitors.forEach(c => {
      datasets.push({ label: c.name, data: getValues(c.values), backgroundColor: c.color });
    });
  } else if (data.consolidatedCompetitors) {
    // Add consolidated average
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

function chartCreateStackedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = (arr) => getChartValues(arr, valueType);

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidatedCompetitors?.name || "Average Competitors"];

  // Use a fixed set of colors for the periods (departments, marketing channels, etc.)
  const colors = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477"];

  const datasets = data.periods.map((period, i) => {
    let periodValues = mode === "direct"
      ? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c => getValues(c.values)[i])]
      : [getValues(data.yourCompany.values)[i], getValues(data.consolidatedCompetitors?.values || [])[i]];

    return { label: period, data: periodValues, backgroundColor: colors[i % colors.length] };
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
            // Tùy chỉnh chỉ phần label (bao gồm giá trị)
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              // Định dạng giá trị (Value)
              if (context.parsed.x !== null) {
                label += context.parsed.x;
                // Chỉ thêm % nếu đang ở chế độ percent
                if (valueType === 'percent') {
                  label += '%';
                }
              }
              return label;
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

// Helper to create and render individual GEO blocks (Horizontal Bar Charts)
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
  const locCount = Object.keys(company.values || {}).length;
  // Calculate height to fit all bars plus some padding (min height 120px)
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

  chartRenderGeoBarChart(canvas, company, valueType, { BAR_THICKNESS });
}

function chartRenderGeoBarChart(canvas, company, valueType, opts) {
  if (window[canvas.id + "Chart"]) window[canvas.id + "Chart"].destroy();
  const labels = Object.keys(company.values || {});
  const arr = labels.map(l => company.values[l] || 0);
  const values = valueType === "percent" ? chartToPercent(arr) : arr;
  const BAR_THICKNESS = (opts && opts.BAR_THICKNESS) || 20;
  
  // ************  LOGIC MAX SCALE ************
  let maxScaleValue = undefined;
  if (valueType !== "percent" && values.length > 0) {
    const maxDataValue = Math.max(...values);
    maxScaleValue = Math.ceil(maxDataValue * 1.2); 
  }
  // *******************************************************

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
          font: { size: 12, weight: "normal" },
          formatter: v => v === 0 ? "" : (valueType === "percent" ? v + "%" : v)
        }
      },
      indexAxis: "y", // Horizontal Bar Chart
      scales: {
        y: { grid: { display: false }, ticks: { color: "#0f172a", font: { size: 12 } } },
        x: {
          beginAtZero: true,
          grid: { display: false },
          ticks: { display: false },
          max: valueType === "percent" ? 100 : maxScaleValue
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

function chartCreateGeoCharts(grid, data, mode, valueType) {
  grid.replaceChildren(); // Clear previous charts
  if (mode === "direct") {
    orgCreateGeoCompanyBlock(grid, data.yourCompany, valueType);
    data.competitors.forEach(c => orgCreateGeoCompanyBlock(grid, c, valueType));
  } else {
    orgCreateGeoCompanyBlock(grid, data.yourCompany, valueType);
    // Compute consolidated only if it hasn't been done or if it's not present in data
    let avg = data.consolidatedCompetitors;
    if (!avg || !avg.values || Array.isArray(avg.values)) { // Re-compute if missing or wrong type
       avg = orgComputeConsolidatedGeo(data);
    }
    if(avg) orgCreateGeoCompanyBlock(grid, avg, valueType);
  }
}

// --------------------------------------------------
// ## ORG INIT (Main Initialization Function)
// --------------------------------------------------

function orgInitChart(wrapper, dataUrl) {
  const rootCanvas = wrapper.querySelector("canvas");
  const ctx = rootCanvas ? rootCanvas.getContext("2d") : null;
  const chartTypeMap = {
    "line": chartCreateLineChart,
    "bar": chartCreateGroupedBarChart, // Grouped Bar Chart
    "stacked-bar": chartCreateStackedBarChart, // Stacked Bar Chart
    "geo": chartCreateGeoCharts // Geo/Horizontal Per-Company Charts
  };

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const chartType = data.chartType; // Get chart type from JSON
      const isArrayValues = Array.isArray(data.yourCompany.values);
      const isGeo = !isArrayValues;
      
      if (!chartType || !chartTypeMap[chartType]) {
        console.error(`Error: chartType "${chartType}" is missing or invalid in JSON data.`);
        return;
      }
      
      const createChartFunction = chartTypeMap[chartType];
      
      let currentMode = "direct";     
      let currentValue = "absolute";  

      // Helper function for button active state
      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      let geoGridEl = null;

      function renderChart() {
        // Compute consolidated data if in 'consolidate' mode and data is missing
        if (currentMode === "consolidate" && !data.consolidatedCompetitors) {
          if (isGeo) {
             data.consolidatedCompetitors = orgComputeConsolidatedGeo(data);
          } else {
             data.consolidatedCompetitors = orgComputeConsolidatedArray(data);
          }
        }

        if (isGeo) {
          // Handle Geo chart setup (needs a div wrapper, not a canvas)
          if (!geoGridEl) {
            geoGridEl = document.createElement("div");
            geoGridEl.className = "chart-grid";
            if (rootCanvas) rootCanvas.replaceWith(geoGridEl);
            else wrapper.appendChild(geoGridEl); // Fallback if no canvas initially
          }
          createChartFunction(geoGridEl, data, currentMode, currentValue);
        } else if (ctx) {
          // Handle all other chart types (need a canvas context)
          if (geoGridEl) {
             geoGridEl.replaceWith(rootCanvas); // Replace grid with canvas if switching from geo
             geoGridEl = null;
          }
          createChartFunction(ctx, data, currentMode, currentValue);
        } else {
          console.error("Chart context (canvas) is missing for non-geo chart type.");
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
        // Reset valueType to absolute when switching modes for consistency unless explicitly clicked
        // currentValue = "absolute"; 
        renderChart();
        setActive(modeBtns, btnDirect); 
        // setActive(valueBtns, btnAbs);
      });

      if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate";
        // currentValue = "absolute"; 
        renderChart();
        setActive(modeBtns, btnConsolidate); 
        // setActive(valueBtns, btnAbs);
      });

      if (btnAbs) btnAbs.addEventListener("click", () => {
        currentValue = "absolute"; renderChart(); setActive(valueBtns, btnAbs);
      });

      if (btnPct) btnPct.addEventListener("click", () => {
        // Percent view is only valid for array values (non-Geo)
        if (isGeo && currentValue !== "percent") {
             console.warn("Percent view is not typically used for Geo workforce/absolute counts.");
        }
        currentValue = "percent"; renderChart(); setActive(valueBtns, btnPct);
      });

      // Initial render and button states
      renderChart();
      setActive(modeBtns, btnDirect);
      setActive(valueBtns, btnAbs);
    })
    .catch(err => console.error("Error loading chart data:", err));
}
