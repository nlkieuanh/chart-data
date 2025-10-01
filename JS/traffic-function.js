/* ========== traffic-function.js (Overview, Sources, Channels) ========== */

// Utils
function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Process Data
function chartProcessData(data, mode = "direct") {
  // --- Overview ---
  if (data.periods && data.yourCompany?.traffic) {
    const mkLine = (label, values, color, dash) => ({
      label, data: values, borderColor: color, borderDash: dash?[4,4]:undefined, fill:false
    });
    if (mode === "direct") {
      return {
        type: "line",
        labels: data.periods,
        datasets: [
          mkLine(data.yourCompany.name, data.yourCompany.traffic, data.yourCompany.color, false),
          ...data.competitors.map(c=>mkLine(c.name,c.traffic,c.color,true))
        ]
      }
    } else {
      return {
        type: "line",
        labels: data.periods,
        datasets: [
          mkLine(data.yourCompany.name,data.yourCompany.traffic,data.yourCompany.color,false),
          mkLine(data.consolidatedCompetitors.name,data.consolidatedCompetitors.traffic,data.consolidatedCompetitors.color,true)
        ]
      }
    }
  }

  // --- Sources (vertical bar) ---
  if (data.yourCompany?.sources) {
    const categories = Object.keys(data.yourCompany.sources);
    if (mode === "direct") {
      return {
        type: "bar",
        labels: categories,
        datasets: [
          { label:data.yourCompany.name,data:Object.values(data.yourCompany.sources),backgroundColor:data.yourCompany.color },
          ...data.competitors.map(c=>({label:c.name,data:Object.values(c.sources),backgroundColor:c.color}))
        ]
      }
    } else {
      return {
        type: "bar",
        labels: categories,
        datasets: [
          { label:data.yourCompany.name,data:Object.values(data.yourCompany.sources),backgroundColor:data.yourCompany.color },
          { label:data.consolidatedCompetitors.name,data:Object.values(data.consolidatedCompetitors.sources),backgroundColor:data.consolidatedCompetitors.color }
        ]
      }
    }
  }

  // --- Channels (snapshot stacked horizontal) ---
  if (data.yourCompany?.channels) {
    const cats = Object.keys(data.yourCompany.channels);
    if (mode === "direct") {
      const datasets = cats.map((cat,i)=>({
        label:cat,
        data:[data.yourCompany.channels[cat],...data.competitors.map(c=>c.channels[cat])],
        backgroundColor:["#3366cc","#109618","#ff9900","#dc3912","#0099c6"][i%5]
      }));
      return {
        type:"bar",
        labels:[data.yourCompany.name,...data.competitors.map(c=>c.name)],
        datasets,
        options:{indexAxis:"y",scales:{x:{stacked:true},y:{stacked:true}}}
      }
    } else {
      const datasets = cats.map((cat,i)=>({
        label:cat,
        data:[data.yourCompany.channels[cat],data.consolidatedCompetitors.channels[cat]],
        backgroundColor:["#3366cc","#109618","#ff9900","#dc3912","#0099c6"][i%5]
      }));
      return {
        type:"bar",
        labels:[data.yourCompany.name,data.consolidatedCompetitors.name],
        datasets,
        options:{indexAxis:"y",scales:{x:{stacked:true},y:{stacked:true}}}
      }
    }
  }

  // Render
function chartCreate(canvasId, processed) {
  const canvas=document.getElementById(canvasId);
  if(window[canvasId+"Chart"]) window[canvasId+"Chart"].destroy();

  :null;
        }).filter(Boolean),
        backgroundColor:c.color
      }));
      window[canvasId+"Chart"]=new Chart(canvas.getContext("2d"),{
        type:"choropleth",
        data:{labels:countries.map(d=>d.properties.name),datasets},
        options:{
          showOutline:true,showGraticule:true,
          scales:{projection:{projection:"equalEarth"},color:{quantize:5}},
          plugins:{legend:{position:"top"}}
        }
      })
    });
    return;
  }

  window[canvasId+"Chart"]=new Chart(canvas.getContext("2d"),{
    type:processed.type,
    data:{labels:processed.labels,datasets:processed.datasets},
    options:processed.options||{responsive:true,maintainAspectRatio:false}
  });
}

// Loader
async function chartLoadAndCreate(canvasId,jsonUrl,mode="direct"){
  const res=await fetch(jsonUrl);const data=await res.json();
  const processed=chartProcessData(data,mode);if(processed) chartCreate(canvasId,processed,mode);
}

function initChart(wrapper,jsonUrl){
  const canvas=wrapper.querySelector("canvas");if(!canvas) return;
  const chartId=canvas.id;
  const btnDirect=wrapper.querySelector(".btn-direct");
  const btnConsolidate=wrapper.querySelector(".btn-consolidate");
  chartLoadAndCreate(chartId,jsonUrl,"direct"); if(btnDirect) btnDirect.classList.add("is-active");
  if(btnDirect) btnDirect.addEventListener("click",e=>{e.preventDefault();chartLoadAndCreate(chartId,jsonUrl,"direct");btnDirect.classList.add("is-active");btnConsolidate?.classList.remove("is-active");});
  if(btnConsolidate) btnConsolidate.addEventListener("click",e=>{e.preventDefault();chartLoadAndCreate(chartId,jsonUrl,"consolidated");btnConsolidate.classList.add("is-active");btnDirect?.classList.remove("is-active");});
}
