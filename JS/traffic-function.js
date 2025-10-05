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
    const allEntities = [data.yourCompany, ...data.competitors];
    const totalEntities = allEntities.length;
    const aggregatedSources = {};
    allEntities.forEach(entity => {
      entity.sources.forEach(s => {
        aggregatedSources[s.source] = (aggregatedSources[s.source] || 0) + s.share;
      });
    });
    const totalPossibleShare = 100 * totalEntities;
    const normalizedSources = Object.keys(aggregatedSources).map(source => {
      const normalized = (aggregatedSources[source] / totalPossibleShare) * 100;
      return { source, share: +normalized.toFixed(2) };
    });
    return { name: "Consolidated Competitors", sources: normalizedSources };
  }

  if (data.chartType === "geo") {
    const aggregated = {};
    const all = data.competitors;
    const n = all.length;
    all.forEach(c => {
      c.top_countries.forEach(tc => {
        aggregated[tc.country] = (aggregated[tc.country] || 0) + parseFloat(tc.traffic_share);
      });
    });
    const consolidatedCountries = Object.keys(aggregated).map(k => ({
      country: k,
      traffic_share: +(aggregated[k] / n).toFixed(2)
    }));
    return { name: "Consolidated Competitors", top_countries: consolidatedCountries };
  }

  // bar/line case
  const length = data.competitors[0].values.length;
  const avg = Array(length).fill(0);
  data.competitors.forEach(c => c.values.forEach((v, i) => { avg[i] += v; }));
  return {
    name: "Average Competitors",
    color: DASHBOARD_AVERAGE_COLOR,
    values: avg.map(v => +(v / data.competitors.length).toFixed(1))
  };
}

// ========== Init ==========
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
      if (data.competitors) data.competitors.forEach(c => c.color = getConsistentCompetitorColor(c.name));

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      function renderChart() {
        if (type === "donut") {
          trafficRenderDonutCharts(wrapper, data, currentMode);
          return;
        }
        if (type === "geo") {
          trafficCreateGeoCharts(wrapper, data, currentMode);
          return;
        }

        const ctx = rootCanvas.getContext("2d");
        if (type === "line") trafficCreateLineChart(ctx, data, currentMode, currentValue);
        if (type === "bar" && barMode === "grouped") trafficCreateGroupedBarChart(ctx, data, currentMode, currentValue);
        if (type === "bar" && barMode === "stacked-horizontal") trafficCreateStackedHorizontalBarChart(ctx, data, currentMode, currentValue);
      }

      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      if (type === "geo" || type === "donut") {
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
      } else {
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
      }

      renderChart();
    })
    .catch(err => console.error("Error loading traffic data:", err));
}

// ========== Donut Chart (unchanged from previous fix) ==========
function trafficRenderDonutCharts(wrapper, data, mode) {
  let grid = wrapper.querySelector(".donut-grid");
  const rootCanvas = wrapper.querySelector("canvas");
  if (rootCanvas) rootCanvas.style.display = "none";

  if (grid) grid.innerHTML = "";
  else {
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
        plugins: { legend: { position: "bottom" }, title: { display: true, text: name } }
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

// ========== Geo Charts with ECharts ==========
function trafficCreateGeoCharts(wrapper, data, mode) {
  const rootCanvas = wrapper.querySelector("canvas");
  if (rootCanvas) rootCanvas.style.display = "none";

  let grid = wrapper.querySelector(".geo-grid");
  if (grid) grid.innerHTML = "";
  else {
    grid = document.createElement("div");
    grid.className = "geo-grid";
    wrapper.appendChild(grid);
  }

  function createGeoCard(id, title, topCountries) {
    const card = document.createElement("div");
    card.className = "geo-card";
    const div = document.createElement("div");
    div.id = id;
    div.style.width = "100%";
    div.style.height = "300px";
    card.appendChild(div);
    grid.appendChild(card);

    const chart = echarts.init(div);
    const option = {
      title: { text: title, left: "center", top: 10, textStyle: { fontSize: 14 } },
      tooltip: { trigger: "item", formatter: p => `${p.name}: ${p.value || 0}%` },
      visualMap: {
        min: 0, max: 20, left: "left", bottom: "5%",
        inRange: { color: ["#e0f3f8", "#005824"] },
        text: ["High", "Low"], calculable: true
      },
      series: [{
        name: "Traffic Share",
        type: "map",
        map: "world",
        roam: false,
        emphasis: { label: { show: false } },
        data: topCountries.map(c => ({ name: c.country, value: c.traffic_share }))
      }]
    };
    chart.setOption(option);
  }

  if (mode === "direct") {
    createGeoCard("geo-yourcompany", data.yourCompany.name, data.yourCompany.top_countries);
    data.competitors.forEach((c, idx) => createGeoCard("geo-competitor-" + idx, c.name, c.top_countries));
  } else {
    createGeoCard("geo-yourcompany", data.yourCompany.name, data.yourCompany.top_countries);
    if (data.consolidated) createGeoCard("geo-consolidated", data.consolidated.name, data.consolidated.top_countries);
  }
}

// ========== Line Chart ==========
function trafficCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType === "percent" ? trafficToPercent(arr) : arr;

  const datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), borderColor: data.yourCompany.color, fill: false, tension: 0.3 });
    data.competitors.forEach(c => {
      datasets.push({ label: c.name, data: getValues(c.values), borderColor: c.color, borderDash: [4,2], fill: false, tension: 0.3 });
    });
  } else {
    datasets.push({ label: data.yourCompany.name, data: getValues(data.yourCompany.values), borderColor: data.yourCompany.color, fill: false, tension: 0.3 });
    datasets.push({ label: data.consolidated.name, data: getValues(data.consolidated.values), borderColor: data.consolidated.color, borderDash: [6,3], fill: false, tension: 0.3 });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "line",
    data: { labels: data.periods, datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true, ticks: { callback: v => valueType === "percent" ? v+"%" : v }, max: valueType==="percent"?100:undefined } } }
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
  window[ctx.canvas.id + "Chart"] = new Chart(ctx, { type:"bar", data:{ labels:data.periods, datasets }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom"}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>valueType==="percent"?v+"%":v }, max:valueType==="percent"?100:undefined } } } });
}

// ========== Stacked Horizontal Bar ==========
function trafficCreateStackedHorizontalBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();
  const getValues = arr => valueType==="percent"?trafficToPercent(arr):arr;
  const labels = mode==="direct" ? [data.yourCompany.name, ...data.competitors.map(c=>c.name)] : [data.yourCompany.name, data.consolidated.name];
  const datasets = data.periods.map((p,i)=> {
    const vals = mode==="direct"? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c=>getValues(c.values)[i])] : [getValues(data.yourCompany.values)[i], getValues(data.consolidated.values)[i]];
    return { label:p, data:vals, backgroundColor:DONUT_COLOR_POOL[i%DONUT_COLOR_POOL.length]};
  });
  window[ctx.canvas.id + "Chart"]=new Chart(ctx,{ type:"bar", data:{ labels, datasets }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom"}}, indexAxis:"y", scales:{ x:{ stacked:true, beginAtZero:true, max:valueType==="percent"?100:undefined, ticks:{ callback:v=>valueType==="percent"?v+"%":v } }, y:{ stacked:true } } } });
}
