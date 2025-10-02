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

// ========== Org Page Functions ==========
function orgInitChart(wrapper, dataUrl) {
  const canvas = wrapper.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const isHeadcount = !!data.yourCompany.headcount && !data.yourCompany.performance;
      const isPerformance = !!data.yourCompany.performance && data.periods.length <= 6;
      const isDepartment = !!data.yourCompany.headcount && data.periods.length > 6;

      // default mode
      let currentMode = "direct";     // direct | consolidate
      let currentValue = "absolute";  // absolute | percent (only for department)

      // render initial
      if (isHeadcount) {
        orgCreateHeadcountChart(ctx, data, currentMode);
      } else if (isPerformance) {
        orgCreatePerformanceChart(ctx, data, currentMode);
      } else if (isDepartment) {
        orgCreateDepartmentChart(ctx, data, currentMode, currentValue);
      }

      // attach switch
      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");
      const allBtns = [btnDirect, btnConsolidate, btnAbs, btnPct];

      function setActive(activeBtn) {
        allBtns.forEach(btn => { if (btn) btn.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      if (btnDirect) btnDirect.addEventListener("click", () => {
        currentMode = "direct";
        if (isHeadcount) orgCreateHeadcountChart(ctx, data, currentMode);
        if (isPerformance) orgCreatePerformanceChart(ctx, data, currentMode);
        if (isDepartment) orgCreateDepartmentChart(ctx, data, currentMode, currentValue);
        setActive(btnDirect);
      });

      if (btnConsolidate) btnConsolidate.addEventListener("click", () => {
        currentMode = "consolidate";
        if (isHeadcount) orgCreateHeadcountChart(ctx, data, currentMode);
        if (isPerformance) orgCreatePerformanceChart(ctx, data, currentMode);
        if (isDepartment) orgCreateDepartmentChart(ctx, data, currentMode, currentValue);
        setActive(btnConsolidate);
      });

      if (btnAbs) btnAbs.addEventListener("click", () => {
        currentValue = "absolute";
        if (isDepartment) orgCreateDepartmentChart(ctx, data, currentMode, currentValue);
        setActive(btnAbs);
      });

      if (btnPct) btnPct.addEventListener("click", () => {
        currentValue = "percent";
        if (isDepartment) orgCreateDepartmentChart(ctx, data, currentMode, currentValue);
        setActive(btnPct);
      });

      // mặc định active
      if (btnDirect) setActive(btnDirect);
    })
    .catch(err => console.error("Error loading chart data:", err));
}

// ========== Headcount (Line Chart) ==========
function orgCreateHeadcountChart(ctx, data, mode) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  let datasets = [];
  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: data.yourCompany.headcount,
      borderColor: data.yourCompany.color,
      backgroundColor: chartHexToRgba(data.yourCompany.color, 0.5),
      tension: 0.3
    });
    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: c.headcount,
        borderColor: c.color,
        backgroundColor: chartHexToRgba(c.color, 0.5),
        borderDash: [4, 2],
        tension: 0.3
      });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: data.yourCompany.headcount,
      borderColor: data.yourCompany.color,
      backgroundColor: chartHexToRgba(data.yourCompany.color, 0.5),
      tension: 0.3
    });
    datasets.push({
      label: data.consolidatedCompetitors.name,
      data: data.consolidatedCompetitors.headcount,
      borderColor: data.consolidatedCompetitors.color,
      backgroundColor: chartHexToRgba(data.consolidatedCompetitors.color, 0.5),
      borderDash: [6, 3],
      tension: 0.3
    });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "line",
    data: { labels: data.periods, datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });
}

// ========== Performance (Grouped Bar) ==========
function orgCreatePerformanceChart(ctx, data, mode) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  let datasets = [];
  if (mode === "direct") {
    datasets.push({ label: data.yourCompany.name, data: data.yourCompany.performance, backgroundColor: data.yourCompany.color });
    data.competitors.forEach(c => {
      datasets.push({ label: c.name, data: c.performance, backgroundColor: c.color });
    });
  } else {
    datasets.push({ label: data.yourCompany.name, data: data.yourCompany.performance, backgroundColor: data.yourCompany.color });
    datasets.push({ label: data.consolidatedCompetitors.name, data: data.consolidatedCompetitors.performance, backgroundColor: data.consolidatedCompetitors.color });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: { labels: data.periods, datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: false }, y: { beginAtZero: true } } }
  });
}

// ========== Department (Stacked Bar) ==========
function orgCreateDepartmentChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id + "Chart"]) window[ctx.canvas.id + "Chart"].destroy();

  const labels = mode === "direct"
    ? [data.yourCompany.name, ...data.competitors.map(c => c.name)]
    : [data.yourCompany.name, data.consolidatedCompetitors.name];

  const datasets = data.periods.map((dept, i) => {
    let deptValues = mode === "direct"
      ? [data.yourCompany.headcount[i], ...data.competitors.map(c => c.headcount[i])]
      : [data.yourCompany.headcount[i], data.consolidatedCompetitors.headcount[i]];

    if (valueType === "percent") {
      deptValues = mode === "direct"
        ? [chartToPercent(data.yourCompany.headcount)[i], ...data.competitors.map(c => chartToPercent(c.headcount)[i])]
        : [chartToPercent(data.yourCompany.headcount)[i], chartToPercent(data.consolidatedCompetitors.headcount)[i]];
    }

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
