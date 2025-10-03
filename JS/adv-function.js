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

      // Special case: Angles
      if (type === "angles") {
        const angleSet = new Set(Object.keys(data.yourCompany.anglesOffers));
        data.competitors.forEach(c => Object.keys(c.anglesOffers).forEach(a => angleSet.add(a)));
        const labels = Array.from(angleSet);

        // remove canvas gốc → wrapper thành container
        rootCanvas.remove();

        function renderCharts() {
          wrapper.innerHTML = "";

          if (currentMode === "direct") {
            // Your company
            const ycCanvas = document.createElement("canvas");
            ycCanvas.id = "chart-yourCompany";
            wrapper.appendChild(ycCanvas);
            advRenderAnglesChart(ycCanvas, data.yourCompany, labels, currentValue);

            // Competitors
            data.competitors.forEach((c, i) => {
              const cCanvas = document.createElement("canvas");
              cCanvas.id = "chart-comp-" + i;
              wrapper.appendChild(cCanvas);
              advRenderAnglesChart(cCanvas, c, labels, currentValue);
            });
          } else {
            // Your company
            const ycCanvas = document.createElement("canvas");
            ycCanvas.id = "chart-yourCompany";
            wrapper.appendChild(ycCanvas);
            advRenderAnglesChart(ycCanvas, data.yourCompany, labels, currentValue);

            // Average competitors
            const avg = {};
            labels.forEach(l => {
              let sum = 0, count = 0;
              data.competitors.forEach(c => {
                if (c.anglesOffers[l]) {
                  sum += c.anglesOffers[l];
                  count++;
                }
              });
              avg[l] = count > 0 ? +(sum / count).toFixed(1) : 0;
            });

            const avgCanvas = document.createElement("canvas");
            avgCanvas.id = "chart-consolidated";
            wrapper.appendChild(avgCanvas);
            advRenderAnglesChart(avgCanvas, {
              name: "Average Competitors",
              color: "#999999",
              anglesOffers: avg
            }, labels, currentValue);
          }
        }

        // attach buttons
        const btnDirect = wrapper.closest(".chart-canvas").querySelector(".btn-direct");
        const btnConsolidate = wrapper.closest(".chart-canvas").querySelector(".btn-consolidate");
        const btnAbs = wrapper.closest(".chart-canvas").querySelector(".btn-absolute");
        const btnPct = wrapper.closest(".chart-canvas").querySelector(".btn-percent");

        if (btnDirect) btnDirect.addEventListener("click", () => { currentMode="direct"; currentValue="absolute"; renderCharts(); });
        if (btnConsolidate) btnConsolidate.addEventListener("click", () => { currentMode="consolidate"; currentValue="absolute"; renderCharts(); });
        if (btnAbs) btnAbs.addEventListener("click", () => { currentValue="absolute"; renderCharts(); });
        if (btnPct) btnPct.addEventListener("click", () => { currentValue="percent"; renderCharts(); });

        renderCharts();
        return;
      }

      // Non-angles charts
      data.consolidatedCompetitors = advComputeConsolidated(data);

      function renderChart() {
        if (type === "line") advCreateLineChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
        if (type === "bar-grouped") advCreateGroupedBarChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
        if (type === "bar-stacked") advCreateStackedBarChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
        if (type === "bar-horizontal") advCreateHorizontalBarChart(rootCanvas.getContext("2d"), data, currentMode, currentValue);
      }

      // attach buttons
      const btnDirect = wrapper.querySelector(".btn-direct");
      const btnConsolidate = wrapper.querySelector(".btn-consolidate");
      const btnAbs = wrapper.querySelector(".btn-absolute");
      const btnPct = wrapper.querySelector(".btn-percent");

      if (btnDirect) btnDirect.addEventListener("click", () => { currentMode="direct"; currentValue="absolute"; renderChart(); });
      if (btnConsolidate) btnConsolidate.addEventListener("click", () => { currentMode="consolidate"; currentValue="absolute"; renderChart(); });
      if (btnAbs) btnAbs.addEventListener("click", () => { currentValue="absolute"; renderChart(); });
      if (btnPct) btnPct.addEventListener("click", () => { currentValue="percent"; renderChart(); });

      renderChart();
    })
    .catch(err => console.error("Error loading adv data:", err));
}

// ========== Chart Functions ==========

// Line Chart
function advCreateLineChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id+"Chart"]) window[ctx.canvas.id+"Chart"].destroy();
  function getValues(arr) { return valueType==="percent" ? advToPercent(arr) : arr; }

  const datasets = [];
  if (mode === "direct") {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: advHexToRgba(data.yourCompany.color, 0.3),
      fill: false, tension:0.3
    });
    data.competitors.forEach(c=>{
      datasets.push({
        label:c.name,
        data:getValues(c.values),
        borderColor:c.color,
        backgroundColor:advHexToRgba(c.color,0.3),
        borderDash:[4,2],
        fill:false, tension:0.3
      });
    });
  } else {
    datasets.push({
      label: data.yourCompany.name,
      data: getValues(data.yourCompany.values),
      borderColor: data.yourCompany.color,
      backgroundColor: advHexToRgba(data.yourCompany.color,0.3),
      fill:false, tension:0.3
    });
    datasets.push({
      label: data.consolidatedCompetitors.name,
      data: getValues(data.consolidatedCompetitors.values),
      borderColor: data.consolidatedCompetitors.color,
      borderDash:[6,3], fill:false, tension:0.3
    });
  }

  window[ctx.canvas.id+"Chart"]=new Chart(ctx,{
    type:"line",
    data:{labels:data.periods,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"bottom"}},
      scales:{
        y:{beginAtZero:true,
           ticks:{callback:val=>valueType==="percent"?val+"%":val},
           max:valueType==="percent"?100:undefined}
      }
    }
  });
}

// Grouped Bar Chart
function advCreateGroupedBarChart(ctx, data, mode, valueType) {
  if (window[ctx.canvas.id+"Chart"]) window[ctx.canvas.id+"Chart"].destroy();
  function getValues(arr){return valueType==="percent"?advToPercent(arr):arr;}
  const datasets=[];
  if(mode==="direct"){
    datasets.push({label:data.yourCompany.name,data:getValues(data.yourCompany.values),backgroundColor:data.yourCompany.color});
    data.competitors.forEach(c=>{
      datasets.push({label:c.name,data:getValues(c.values),backgroundColor:c.color});
    });
  } else {
    datasets.push({label:data.yourCompany.name,data:getValues(data.yourCompany.values),backgroundColor:data.yourCompany.color});
    datasets.push({label:data.consolidatedCompetitors.name,data:getValues(data.consolidatedCompetitors.values),backgroundColor:data.consolidatedCompetitors.color});
  }
  window[ctx.canvas.id+"Chart"]=new Chart(ctx,{
    type:"bar",
    data:{labels:data.periods,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"bottom"}},
      scales:{
        y:{beginAtZero:true,
           ticks:{callback:val=>valueType==="percent"?val+"%":val},
           max:valueType==="percent"?100:undefined}
      }
    }
  });
}

// Stacked Bar Chart
function advCreateStackedBarChart(ctx, data, mode, valueType){
  if(window[ctx.canvas.id+"Chart"])window[ctx.canvas.id+"Chart"].destroy();
  function getValues(arr){return valueType==="percent"?advToPercent(arr):arr;}
  const labels=mode==="direct"?[data.yourCompany.name,...data.competitors.map(c=>c.name)]:[data.yourCompany.name,data.consolidatedCompetitors.name];
  const datasets=data.periods.map((item,i)=>{
    let vals=mode==="direct"?[getValues(data.yourCompany.values)[i],...data.competitors.map(c=>getValues(c.values)[i])]:[getValues(data.yourCompany.values)[i],getValues(data.consolidatedCompetitors.values)[i]];
    const colors=["#3366cc","#dc3912","#ff9900","#109618","#990099","#0099c6"];
    return{label:item,data:vals,backgroundColor:colors[i%colors.length]};
  });
  window[ctx.canvas.id+"Chart"]=new Chart(ctx,{
    type:"bar",
    data:{labels,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"bottom"}},
      indexAxis:"y",
      scales:{
        x:{stacked:true,beginAtZero:true,
           max:valueType==="percent"?100:undefined,
           ticks:{callback:val=>valueType==="percent"?val+"%":val}},
        y:{stacked:true}
      }
    }
  });
}

// Horizontal Bar Chart (non-angles)
function advCreateHorizontalBarChart(ctx, data, mode, valueType){
  if(window[ctx.canvas.id+"Chart"])window[ctx.canvas.id+"Chart"].destroy();
  function getValues(arr){return valueType==="percent"?advToPercent(arr):arr;}
  const datasets=[];
  if(mode==="direct"){
    datasets.push({label:data.yourCompany.name,data:getValues(data.yourCompany.values),backgroundColor:data.yourCompany.color});
    data.competitors.forEach(c=>{
      datasets.push({label:c.name,data:getValues(c.values),backgroundColor:c.color});
    });
  } else {
    datasets.push({label:data.yourCompany.name,data:getValues(data.yourCompany.values),backgroundColor:data.yourCompany.color});
    datasets.push({label:data.consolidatedCompetitors.name,data:getValues(data.consolidatedCompetitors.values),backgroundColor:data.consolidatedCompetitors.color});
  }
  window[ctx.canvas.id+"Chart"]=new Chart(ctx,{
    type:"bar",
    data:{labels:data.periods,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:"bottom"}},
      indexAxis:"y",
      scales:{
        x:{beginAtZero:true,
           max:valueType==="percent"?100:undefined,
           ticks:{callback:val=>valueType==="percent"?val+"%":val}}
      }
    }
  });
}

// Angles Chart (multi-chart mode)
function advRenderAnglesChart(canvas, company, labels, valueType){
  if(window[canvas.id+"Chart"])window[canvas.id+"Chart"].destroy();
  const arr=labels.map(l=>company.anglesOffers[l]||0);
  const values=valueType==="percent"?advToPercent(arr):arr;
  window[canvas.id+"Chart"]=new Chart(canvas.getContext("2d"),{
    type:"bar",
    data:{labels:labels,datasets:[{label:company.name,data:values,backgroundColor:company.color}]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        datalabels:{
          anchor:"end",align:"right",color:"#fff",font:{size:11},
          formatter:v=>v===0?"":(valueType==="percent"?v+"%":v)
        }
      },
      indexAxis:"y",
      scales:{
        x:{beginAtZero:true,
           max:valueType==="percent"?100:undefined,
           ticks:{callback:val=>valueType==="percent"?val+"%":val}}
      }
    },
    plugins:[ChartDataLabels]
  });
}
