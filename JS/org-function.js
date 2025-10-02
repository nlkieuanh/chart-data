// Common Chart Functions for Webflow
// Utility prefix: chart
// Org-specific prefix: org

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
    });
  }
  if (data.consolidatedCompetitors?.values) {
    Object.keys(data.consolidatedCompetitors.values).forEach(k => set.add(k));
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
      const periodsCount = data.periods.length;
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
        if (isGeo) orgCreateGeoWorkforceChart(ctx, data, currentMode, currentValue);
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

// ========== Geo Workforce (Stacked Horizontal Bar) ==========
function orgCreateGeoWorkforceChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  const fullPeriods = getFullPeriods(data);

  function getValues(obj) {
    const arr = mapValuesToArray(obj, fullPeriods);
    return valueType === "percent" ? chartToPercent(arr) : arr;
  }

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidatedCompetitors.name];

  const datasets = fullPeriods.map((region, i) => {
    let regionValues = mode === "direct"
      ? [getValues(data.yourCompany.values)[i], ...data.competitors.map(c => getValues(c.values)[i])]
      : [getValues(data.yourCompany.values)[i], getValues(data.consolidatedCompetitors.values)[i]];

    const colors = ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66ccff", "#ff66cc"];
    return { label: region, data: regionValues, backgroundColor: colors[i % colors.length] };
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
