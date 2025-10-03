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
  const avg = {};

  // clone keys from first competitor
  const sample = competitors[0];
  for (const key in sample) {
    if (Array.isArray(sample[key])) {
      avg[key] = Array(sample[key].length).fill(0);
    } else if (typeof sample[key] === "object") {
      avg[key] = {};
      for (const sub in sample[key]) avg[key][sub] = 0;
    }
  }

  competitors.forEach(c => {
    for (const key in c) {
      if (Array.isArray(c[key])) {
        c[key].forEach((v, i) => avg[key][i] += v);
      } else if (typeof c[key] === "object") {
        for (const sub in c[key]) {
          avg[key][sub] = (avg[key][sub] || 0) + (c[key][sub] || 0);
        }
      }
    }
  });

  // average
  for (const key in avg) {
    if (Array.isArray(avg[key])) {
      avg[key] = avg[key].map(v => v / competitors.length);
    } else if (typeof avg[key] === "object") {
      for (const sub in avg[key]) {
        avg[key][sub] = avg[key][sub] / competitors.length;
      }
    }
  }

  return {
    name: "Average Competitors",
    color: "#aaaaaa",
    ...avg
  };
}

// ========== Init Function ==========

function advInitChart(wrapper, dataUrl) {
  const canvas = wrapper.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      data.consolidatedCompetitors = advComputeConsolidated(data);

      let currentMode = "direct";    // direct | consolidate
      let currentValue = "absolute"; // absolute | percent

      function renderChart() {
        const type = wrapper.dataset.type;
        if (type === "overallTrend") advCreateOverallTrend(ctx, data, currentMode);
        if (type === "formatBreakdown") advCreateFormatBreakdown(ctx, data, currentMode, currentValue);
        if (type === "anglesOffers") advCreateAnglesOffers(ctx, data, currentMode, currentValue);
        if (type === "channels") advCreateChannels(ctx, data, currentMode, currentValue);
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

      // Mode events
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

      // Value events
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

// Overall Trend
function advCreateOverallTrend(ctx, data, mode) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  const datasets = [];
  const consolidated = data.consolidatedCompetitors;

  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: data.yourCompany.overallTrend,
      borderColor: data.yourCompany.color,
      fill: false
    });
    data.competitors.forEach(c => {
      datasets.push({ label: c.name, data: c.overallTrend, borderColor: c.color, fill: false });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: data.yourCompany.overallTrend,
      borderColor: data.yourCompany.color,
      fill: false
    });
    datasets.push({
      label: "Average Competitors",
      data: consolidated.overallTrend,
      borderColor: "#999999",
      borderDash: [5, 5],
      fill: false
    });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "line",
    data: { labels: data.periods, datasets },
    options: { responsive: true, plugins: { datalabels: false } }
  });
}

// Format Breakdown
function advCreateFormatBreakdown(ctx, data, mode, scale) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  let companies = mode === "direct"
    ? [data.yourCompany, ...data.competitors]
    : [data.yourCompany, data.consolidatedCompetitors];

  const labels = Object.keys(data.yourCompany.formatBreakdown);
  const datasets = [];

  companies.forEach(comp => {
    let values = labels.map(l => comp.formatBreakdown[l] || 0);
    if (scale === "percent") values = advToPercent(values);
    datasets.push({ label: comp.name, data: values, backgroundColor: comp.color });
  });

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        datalabels: {
          color: "#333", anchor: "end", align: "top", font: { size: 10 }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

// Angles & Offers
function advCreateAnglesOffers(ctx, data, mode, scale) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  let companies = mode === "direct"
    ? [data.yourCompany, ...data.competitors]
    : [data.yourCompany, data.consolidatedCompetitors];

  let allAngles = new Set();
  companies.forEach(c => Object.keys(c.anglesOffers).forEach(a => allAngles.add(a)));
  let labels = Array.from(allAngles);
  let datasets = [];

  companies.forEach(comp => {
    let values = labels.map(l => comp.anglesOffers[l] || 0);
    if (scale === "percent") values = advToPercent(values);
    datasets.push({ label: comp.name, data: values, backgroundColor: comp.color });
  });

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        datalabels: {
          color: "#333", anchor: "end", align: "right", font: { size: 10 }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

// Channels
function advCreateChannels(ctx, data, mode, scale) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  let companies = mode === "direct"
    ? [data.yourCompany, ...data.competitors]
    : [data.yourCompany, data.consolidatedCompetitors];

  const labels = Object.keys(data.yourCompany.channels);
  const datasets = [];

  companies.forEach(comp => {
    let values = labels.map(l => comp.channels[l] || 0);
    if (scale === "percent") values = advToPercent(values);
    datasets.push({ label: comp.name, data: values, backgroundColor: comp.color });
  });

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        datalabels: {
          color: "#333", anchor: "end", align: "top", font: { size: 10 }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}
