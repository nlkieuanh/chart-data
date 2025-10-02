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

// ========== Org Page Functions ==========
function orgInitChart(wrapper, dataUrl) {
  const canvas = wrapper.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const isHeadcount = !!data.yourCompany.headcount;
      const isPerformance = !!data.yourCompany.performance;

      if (isHeadcount) {
        orgCreateHeadcountChart(ctx, data, "direct");
        orgAttachSwitch(wrapper, ctx, data, orgCreateHeadcountChart);
      } else if (isPerformance) {
        orgCreatePerformanceChart(ctx, data, "direct");
        orgAttachSwitch(wrapper, ctx, data, orgCreatePerformanceChart);
      }
    })
    .catch(err => console.error("Error loading chart data:", err));
}

function orgAttachSwitch(wrapper, ctx, data, chartFn) {
  const btnDirect = wrapper.querySelector(".btn-direct");
  const btnConsolidate = wrapper.querySelector(".btn-consolidate");
  const allBtns = [btnDirect, btnConsolidate];

  function setActive(activeBtn) {
    allBtns.forEach(btn => {
      if (btn) btn.classList.remove("is-active");
    });
    if (activeBtn) activeBtn.classList.add("is-active");
  }

  if (btnDirect) {
    btnDirect.addEventListener("click", () => {
      chartFn(ctx, data, "direct");
      setActive(btnDirect);
    });
  }

  if (btnConsolidate) {
    btnConsolidate.addEventListener("click", () => {
      chartFn(ctx, data, "consolidate");
      setActive(btnConsolidate);
    });
  }

  // Mặc định chọn Direct
  setActive(btnDirect);
}

// ========== Headcount (Line Chart) ==========
function orgCreateHeadcountChart(ctx, data, mode) {
  if (window[ctx.canvas.id + "Chart"]) {
    window[ctx.canvas.id + "Chart"].destroy();
  }

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
    data: {
      labels: data.periods,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

// ========== Performance (Group Bar Chart) ==========
function orgCreatePerformanceChart(ctx, data, mode) {
  if (window[ctx.canvas.id + "Chart"]) {
    window[ctx.canvas.id + "Chart"].destroy();
  }

  let datasets = [];

  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: data.yourCompany.performance,
      backgroundColor: data.yourCompany.color
    });

    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: c.performance,
        backgroundColor: c.color
      });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: data.yourCompany.performance,
      backgroundColor: data.yourCompany.color
    });

    datasets.push({
      label: data.consolidatedCompetitors.name,
      data: data.consolidatedCompetitors.performance,
      backgroundColor: data.consolidatedCompetitors.color
    });
  }

  window[ctx.canvas.id + "Chart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.periods,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      },
      scales: {
        x: { stacked: false },
        y: { beginAtZero: true }
      }
    }
  });
}
