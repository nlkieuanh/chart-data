// ==================================================
// Advertising Chart Functions for Webflow
// Prefix: adv
// ==================================================

// ========== Utility Functions ==========
function advHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function advToPercent(arr) {
  const total = arr.reduce((sum, v) => sum + v, 0);
  return arr.map(v => total > 0 ? +(v / total * 100).toFixed(1) : 0);
}

function advComputeConsolidated(data) {
  if (!data.competitors || !data.competitors.length) return null;
  const length = data.competitors[0].values.length;
  const avg = Array(length).fill(0);

  data.competitors.forEach(c => {
    c.values.forEach((v, i) => { avg[i] += v; });
  });

  return {
    name: "Average Competitors",
    color: "#999999",
    values: avg.map(v => +(v / data.competitors.length).toFixed(1))
  };
}

// ========== Init ==========
function advInitChart(wrapper, dataUrl) {
  const rootCanvas = wrapper.querySelector("canvas");

  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const type = data.chartType;
      let currentMode = "direct";
      let currentValue = "absolute";

      function setActive(group, activeBtn) {
        group.forEach(b => { if (b) b.classList.remove("is-active"); });
        if (activeBtn) activeBtn.classList.add("is-active");
      }

      // Angles special case
      if (type === "angles") {
        const grid = document.createElement("div");
        grid.className = "chart-grid";
        rootCanvas.replaceWith(grid);

        function renderCharts() {
          grid.replaceChildren();

          if (currentMode === "direct") {
            advCreateCompanyBlock(grid, data.yourCompany, currentValue);
            data.competitors.forEach(c => {
              advCreateCompanyBlock(grid, c, currentValue);
            });
          } else {
            advCreateCompanyBlock(grid, data.yourCompany, currentValue);

            const angleSet = new Set();
            data.competitors.forEach(c => Object.keys(c.anglesOffers).forEach(a => angleSet.add(a)));

            const avg = {};
            Array.from(angleSet).forEach(l => {
              let sum = 0, count = 0;
              data.competitors.forEach(c => {
                if (c.anglesOffers[l] !== undefined) { sum += c.anglesOffers[l]; count++; }
              });
              avg[l] = count > 0 ? +(sum / count).toFixed(1) : 0;
            });

            advCreateCompanyBlock(grid, {
              name: "Average Competitors",
              color: "#999999",
              anglesOffers: avg
            }, currentValue);
          }
        }

        const btnDirect = wrapper.closest(".chart-canvas").querySelector(".btn-direct");
        const btnConsolidate = wrapper.closest(".chart-canvas").querySelector(".btn-consolidate");
        const btnAbs = wrapper.closest(".chart-canvas").querySelector(".btn-absolute");
        const btnPct = wrapper.closest(".chart-canvas").querySelector(".btn-percent");

        const modeBtns = [btnDirect, btnConsolidate];
        const valueBtns = [btnAbs, btnPct];

        if (btnDirect) btnDirect.addEventListener("click", () => { 
          currentMode="direct"; currentValue="absolute"; renderCharts(); 
          setActive(modeBtns, btnDirect); setActive(valueBtns, btnAbs);
        });
        if (btnConsolidate) btnConsolidate.addEventListener("click", () => { 
          currentMode="consolidate"; currentValue="absolute"; renderCharts(); 
          setActive(modeBtns, btnConsolidate); setActive(valueBtns, btnAbs);
        });
        if (btnAbs) btnAbs.addEventListener("click", () => { 
          currentValue="absolute"; renderCharts(); setActive(valueBtns, btnAbs);
        });
        if (btnPct) btnPct.addEventListener("click", () => { 
          currentValue="percent"; renderCharts(); setActive(valueBtns, btnPct);
        });

        renderCharts();
        setActive(modeBtns, btnDirect);
        setActive(valueBtns, btnAbs);
        return;
      }

      // Other chart types
      data.consolidatedCompetitors = advComputeConsolidated(data);

      function renderChart() {
        if (type === "line") advCreateLineChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
        if (type === "bar-grouped") advCreateGroupedBarChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
        if (type === "bar-stacked") advCreateStackedBarChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
        if (type === "bar-horizontal") advCreateHorizontalBarChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
      }

      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];

      if (btnDirect) btnDirect.addEventListener("click", () => { 
        currentMode="direct"; currentValue="absolute"; renderChart(); 
        setActive(modeBtns, btnDirect); setActive(valueBtns, btnAbs);
      });
      if (btnConsolidate) btnConsolidate.addEventListener("click", () => { 
        currentMode="consolidate"; currentValue="absolute"; renderChart(); 
        setActive(modeBtns, btnConsolidate); setActive(valueBtns, btnAbs);
      });
      if (btnAbs) btnAbs.addEventListener("click", () => { 
        currentValue="absolute"; renderChart(); setActive(valueBtns, btnAbs);
      });
      if (btnPct) btnPct.addEventListener("click", () => { 
        currentValue="percent"; renderChart(); setActive(valueBtns, btnPct);
      });

      renderChart();
      setActive(modeBtns, btnDirect);
      setActive(valueBtns, btnAbs);
    })
    .catch(err => console.error("Error loading adv data:", err));
}

// ========== Company Block for Angles ==========
function advCreateCompanyBlock(container, company, valueType) {
  const block = document.createElement("div");
  block.classList.add("company-chart");

  const title = document.createElement("h4");
  title.innerText = company.name;
  block.appendChild(title);

  const canvas = document.createElement("canvas");
  canvas.id = "chart-" + company.name.replace(/\s+/g,"-");

  // ✅ Chiều cao tính động: mỗi angle ~30px (20 bar + 10 spacing)
  const anglesCount = Object.keys(company.anglesOffers).length;
  const calcHeight = Math.max(anglesCount * 30, 120); // tối thiểu 120px
  canvas.style.width = "100%";
  canvas.style.height = calcHeight + "px";

  block.appendChild(canvas);
  container.appendChild(block);

  advRenderAnglesChart(canvas, company, valueType);
}

// ========== Chart Functions ==========

// (giữ nguyên Line, Grouped Bar, Stacked Bar, Horizontal Bar như bản trước)

// Angles Chart
function advRenderAnglesChart(canvas, company, valueType){
  if(window[canvas.id+"Chart"])window[canvas.id+"Chart"].destroy();
  const labels=Object.keys(company.anglesOffers);
  const arr=labels.map(l=>company.anglesOffers[l]||0);
  const values=valueType==="percent"?advToPercent(arr):arr;
  window[canvas.id+"Chart"]=new Chart(canvas.getContext("2d"),{
    type:"bar",
    data:{labels:labels,datasets:[{
      label:company.name,
      data:values,
      backgroundColor:company.color,
      barThickness:20,
      maxBarThickness:20,
      categoryPercentage:1.0,
      barPercentage:0.9
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        datalabels:{
          anchor:"end",align:"right",color:"#333",font:{size:12,weight:"bold"},
          formatter:v=>v===0?"":(valueType==="percent"?v+"%":v)
        }
      },
      indexAxis:"y",
      layout:{padding:{top:6,right:6,bottom:6,left:6}},
      scales:{
        y:{grid:{display:false},ticks:{color:"#000",font:{size:12}}},
        x:{beginAtZero:true,grid:{display:false},ticks:{display:false},
           max:valueType==="percent"?100:undefined}
      }
    },
    plugins:[ChartDataLabels]
  });
}
