// ==================================================
// Traffic Chart Functions – FULL VERSION
// Prefix: traffic
// Library: Chart.js (assumed loaded globally as `Chart`), optional ChartDataLabels
// Purpose: Unified initializer `trafficInitChart(wrapper, dataUrl)` for
//          line, bar (grouped/stacked-horizontal), donut (multi-cards), and GEO (multi-cards)
// Notes:
// - Comments are in English per project convention.
// - Designed for Webflow wrappers with optional control buttons:
//     .btn-direct, .btn-consolidate, .btn-absolute, .btn-percent
// - Data contracts:
//   * LINE/BAR: {
//       chartType: "line" | "bar",
//       barMode?: "grouped" | "stacked-horizontal",
//       periods: ["Jan 2024", ...],
//       yourCompany: { name, values: number[] },
//       competitors: [{ name, values: number[] }]
//     }
//   * DONUT: {
//       chartType: "donut",
//       yourCompany: { name, sources: [{ source, share }] },
//       competitors: [{ name, sources: [{ source, share }] }]
//     }
//   * GEO: {
//       chartType: "geo",
//       yourCompany: { name, top_countries: [{ country, traffic_share }] },
//       competitors: [{ name, top_countries: [{ country, traffic_share }] }]
//     }
// ==================================================

// ========== Color Mapping & Constants (CONSISTENT ACROSS DASHBOARD) ==========
(function(){
  if (typeof window === 'undefined') return;
  if (typeof window.DASHBOARD_YOUR_COMPANY_COLOR === 'undefined') {
    window.DASHBOARD_YOUR_COMPANY_COLOR = '#7d83ff';
  }
  if (typeof window.DASHBOARD_AVERAGE_COLOR === 'undefined') {
    window.DASHBOARD_AVERAGE_COLOR = '#577590';
  }
})();

const DONUT_COLOR_POOL = [
  '#cab2d6', '#1f78b4', '#a6cee3', '#33a02c', '#b2df8a', '#ff7f00', '#fdbf6f', '#fb9a99', '#e31a1c'
];

const COMPETITOR_COLOR_POOL = [
  '#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a','#b15928'
];

/** Stable competitor color by name (pure function). Uses global if provided. */
function getConsistentCompetitorColor(name) {
  if (typeof window !== 'undefined' && typeof window.getConsistentCompetitorColor === 'function') {
    try { return window.getConsistentCompetitorColor(name); } catch(_){}
  }
  let hash = 0; const s = String(name || '');
  for (let i=0;i<s.length;i++){ hash = (hash<<5)-hash + s.charCodeAt(i); hash |= 0; }
  const idx = Math.abs(hash) % COMPETITOR_COLOR_POOL.length;
  return COMPETITOR_COLOR_POOL[idx];
}

// ========== Utilities ==========
function traffic_isNumber(n){ return typeof n === 'number' && isFinite(n); }
function trafficClamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function trafficToPercent(arr){
  const total = arr.reduce((a,b)=>a+(traffic_isNumber(b)?b:0),0);
  if (total <= 0) return arr.map(_=>0);
  return arr.map(v=> +(traffic_isNumber(v) ? (v/total*100) : 0).toFixed(1));
}
function trafficDeepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

// Returns [you, ...competitors] list
function trafficAllEntities(data){
  const list = [];
  if (data.yourCompany) list.push(data.yourCompany);
  if (Array.isArray(data.competitors)) list.push(...data.competitors);
  return list;
}

// ========== Consolidation (Average of competitors) ==========
function trafficComputeConsolidated(data){
  if (!data.competitors || !data.competitors.length) return null;

  // TIME-SERIES (line/bar) – values is array
  if (Array.isArray(data.competitors[0]?.values)){
    const len = data.yourCompany?.values?.length || data.competitors[0].values.length || 0;
    const avg = new Array(len).fill(0); const cnt = new Array(len).fill(0);
    data.competitors.forEach(c=>{
      (c.values||[]).forEach((v,i)=>{ if(traffic_isNumber(v)){ avg[i]+=v; cnt[i]++; } });
    });
    const out = avg.map((s,i)=> cnt[i]>0 ? +(s/cnt[i]).toFixed(2) : 0);
    return { name: 'Average Competitors', color: DASHBOARD_AVERAGE_COLOR, values: out };
  }

  // DONUT – aggregate shares by source then normalize by number of entities (average share)
  if (Array.isArray(data.competitors[0]?.sources)){
    const all = trafficAllEntities(data); // include yourCompany for alignment consistency when consolidating? Org version averages competitors only. We keep competitors-only by spec.
    const comp = data.competitors; // average of competitors only
    const agg = {}; let entCount = 0;
    comp.forEach(entity=>{
      if (Array.isArray(entity.sources)){
        entCount++;
        entity.sources.forEach(s=>{ agg[s.source] = (agg[s.source]||0) + (s.share||0); });
      }
    });
    const avgSources = Object.keys(agg).map(k=> ({ source:k, share: +(agg[k]/Math.max(entCount,1)).toFixed(2) }));
    return { name:'Average Competitors', color: DASHBOARD_AVERAGE_COLOR, sources: avgSources };
  }

  return null;
}

// ========== Normalizers ==========
// (1) LINE/BAR
function trafficNormalizeSeriesData(json){
  const model = trafficDeepClone(json);
  // Ensure colors
  if (model.yourCompany) model.yourCompany.color = DASHBOARD_YOUR_COMPANY_COLOR;
  if (Array.isArray(model.competitors)) model.competitors.forEach(c=> c.color = getConsistentCompetitorColor(c.name));
  // Precompute consolidated for series
  model.consolidated = trafficComputeConsolidated(model);
  return model;
}

// (2) DONUT
function trafficNormalizeDonutData(json){
  const model = trafficDeepClone(json);
  if (model.yourCompany) model.yourCompany.color = DASHBOARD_YOUR_COMPANY_COLOR;
  if (Array.isArray(model.competitors)) model.competitors.forEach(c=> c.color = getConsistentCompetitorColor(c.name));
  model.consolidated = trafficComputeConsolidated(model); // average competitor share per source
  return model;
}

// (3) GEO
function trafficNormalizeGeoEntity(entity, color){
  const values = {};
  (entity?.top_countries||[]).forEach(({country,traffic_share})=>{ if(country && traffic_isNumber(traffic_share)) values[country]=+traffic_share; });
  return { name: entity?.name || '', color, values };
}
function trafficNormalizeGeoData(json){
  const you = trafficNormalizeGeoEntity(json.yourCompany||{}, DASHBOARD_YOUR_COMPANY_COLOR);
  const competitors = (json.competitors||[]).map(c=> trafficNormalizeGeoEntity(c, getConsistentCompetitorColor(c.name)));
  return { chartType:'geo', yourCompany: you, competitors };
}
function trafficComputeConsolidatedGeo(model){
  if (!model.competitors || !model.competitors.length) return null;
  const set = new Set();
  model.competitors.forEach(c=> Object.keys(c.values||{}).forEach(k=> set.add(k)) );
  const avg = {};
  Array.from(set).forEach(loc=>{
    let s=0, n=0; model.competitors.forEach(c=>{ if(typeof c.values[loc]!== 'undefined'){ s += (+c.values[loc]||0); n++; } });
    avg[loc] = n>0 ? +(s/n).toFixed(2) : 0;
  });
  return { name:'Average Competitors', color: DASHBOARD_AVERAGE_COLOR, values: avg };
}

// ========== RENDERERS ==========
// ---- Donut (grid of per-entity donut charts) ----
function trafficCreateSingleDonut(canvas, entity){
  if (window[canvas.id + 'Chart']) window[canvas.id+'Chart'].destroy();
  const labels = (entity.sources||[]).map(s=>s.source);
  const data = (entity.sources||[]).map(s=>s.share);
  const bg = labels.map((_,i)=> DONUT_COLOR_POOL[i % DONUT_COLOR_POOL.length]);
  window[canvas.id+'Chart'] = new Chart(canvas.getContext('2d'),{
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:bg, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
  });
}
function trafficRenderDonutCharts(wrapper, model, mode){
  let grid = wrapper.querySelector('.donut-grid');
  if(!grid){ grid = document.createElement('div'); grid.className='donut-grid'; wrapper.appendChild(grid); }
  grid.innerHTML='';
  let entities = [];
  if (mode==='direct') entities = [model.yourCompany, ...(model.competitors||[])];
  else entities = [model.yourCompany, model.consolidated].filter(Boolean);
  entities.forEach(entity=>{
    const card = document.createElement('div'); card.className='donut-card';
    const title = document.createElement('h4'); title.className='donut-card__title'; title.textContent = entity.name; card.appendChild(title);
    const inner = document.createElement('div'); inner.className='donut-card__inner'; inner.style.height = '240px';
    const canvas = document.createElement('canvas'); canvas.id = `donut-${entity.name.replace(/\s+/g,'-')}`; canvas.style.width='100%'; canvas.style.height='100%';
    inner.appendChild(canvas); card.appendChild(inner); grid.appendChild(card);
    trafficCreateSingleDonut(canvas, entity);
  });
}

// ---- Line ----
function trafficCreateLineChart(ctx, data, mode, valueType){
  if (window[ctx.canvas.id + 'Chart']) window[ctx.canvas.id+'Chart'].destroy();
  const getVals = arr => Array.isArray(arr) ? (valueType==='percent'?trafficToPercent(arr):arr) : [];
  const labels = data.periods || [];
  const ds = [];
  if (mode==='direct'){
    ds.push({ label:data.yourCompany.name, data:getVals(data.yourCompany.values), borderColor:DASHBOARD_YOUR_COMPANY_COLOR, tension:.3, fill:false });
    (data.competitors||[]).forEach(c=> ds.push({ label:c.name, data:getVals(c.values), borderColor:getConsistentCompetitorColor(c.name), tension:.3, fill:false }));
  } else {
    ds.push({ label:data.yourCompany.name, data:getVals(data.yourCompany.values), borderColor:DASHBOARD_YOUR_COMPANY_COLOR, tension:.3, fill:false });
    ds.push({ label:data.consolidated.name, data:getVals(data.consolidated.values), borderColor:DASHBOARD_AVERAGE_COLOR, tension:.3, fill:false });
  }
  window[ctx.canvas.id+'Chart'] = new Chart(ctx,{
    type:'line', data:{ labels, datasets: ds }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, scales:{ y:{ beginAtZero:true, ticks:{ callback:v=> valueType==='percent'? (v+'%') : v }, suggestedMax: valueType==='percent'?100:undefined } } }
  });
}

// ---- Bar (grouped) ----
function trafficCreateGroupedBarChart(ctx, data, mode, valueType){
  if (window[ctx.canvas.id + 'Chart']) window[ctx.canvas.id+'Chart'].destroy();
  const getVals = arr => Array.isArray(arr) ? (valueType==='percent'?trafficToPercent(arr):arr) : [];
  const labels = [data.yourCompany.name, ...(mode==='direct' ? (data.competitors||[]).map(c=>c.name) : [data.consolidated.name])];
  const datasets = (data.periods||[]).map((p,i)=>{
    const vals = (mode==='direct')
      ? [getVals(data.yourCompany.values)[i], ...(data.competitors||[]).map(c=> getVals(c.values)[i])]
      : [getVals(data.yourCompany.values)[i], getVals(data.consolidated.values)[i]];
    return { label:p, data: vals, backgroundColor: DONUT_COLOR_POOL[i % DONUT_COLOR_POOL.length] };
  });
  window[ctx.canvas.id+'Chart'] = new Chart(ctx,{
    type:'bar', data:{ labels, datasets }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, scales:{ y:{ beginAtZero:true, ticks:{ callback:v=> valueType==='percent'? (v+'%') : v }, suggestedMax: valueType==='percent'?100:undefined } } }
  });
}

// ---- Bar (stacked horizontal) ----
function trafficCreateStackedHorizontalBarChart(ctx, data, mode, valueType){
  if (window[ctx.canvas.id + 'Chart']) window[ctx.canvas.id+'Chart'].destroy();
  const getVals = arr => Array.isArray(arr) ? (valueType==='percent'?trafficToPercent(arr):arr) : [];
  const labels = [data.yourCompany.name, ...(mode==='direct' ? (data.competitors||[]).map(c=>c.name) : [data.consolidated.name])];
  const datasets = (data.periods||[]).map((p,i)=>{
    const vals = (mode==='direct')
      ? [getVals(data.yourCompany.values)[i], ...(data.competitors||[]).map(c=> getVals(c.values)[i])]
      : [getVals(data.yourCompany.values)[i], getVals(data.consolidated.values)[i]];
    return { label:p, data: vals, backgroundColor: DONUT_COLOR_POOL[i % DONUT_COLOR_POOL.length] };
  });
  window[ctx.canvas.id+'Chart'] = new Chart(ctx,{
    type:'bar', data:{ labels, datasets }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, indexAxis:'y', scales:{ x:{ stacked:true, beginAtZero:true, max: valueType==='percent'?100:undefined, ticks:{ callback:v=> valueType==='percent' ? (v+'%') : v } }, y:{ stacked:true } } }
  });
}

// ---- GEO (grid of per-entity horizontal bars) ----
function trafficRenderGeoBarChart(canvas, company, valueType, opts){
  if (window[canvas.id + 'Chart']) window[canvas.id+'Chart'].destroy();
  const labels = Object.keys(company.values||{});
  const raw = labels.map(l=> company.values[l] || 0);
  const isPercent = (valueType==='percent');
  const values = isPercent ? trafficToPercent(raw) : raw;
  const BAR_THICKNESS = (opts&&opts.BAR_THICKNESS)||20;
  window[canvas.id+'Chart'] = new Chart(canvas.getContext('2d'),{
    type:'bar', data:{ labels, datasets:[{ label:company.name, data:values, backgroundColor:company.color, borderRadius:6, borderSkipped:false, barThickness:BAR_THICKNESS }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=> isPercent ? (ctx.parsed.x+'%') : (ctx.parsed.x) } } }, indexAxis:'y', scales:{ y:{ grid:{ display:false } }, x:{ beginAtZero:true, grid:{ display:true }, max: isPercent?100:undefined, ticks:{ callback:(v)=> isPercent ? (v+'%') : v } } } }
  });
}
function trafficCreateGeoCompanyBlock(container, company, valueType){
  const card = document.createElement('div'); card.className='geo-card';
  const title = document.createElement('h4'); title.className='geo-card__title'; title.textContent = company.name; card.appendChild(title);
  const inner = document.createElement('div'); inner.className='geo-card__inner';
  const BAR_THICKNESS = 20, BAR_GAP = 18; const locCount = Object.keys(company.values||{}).length; const h = Math.max(120, locCount*(BAR_THICKNESS+BAR_GAP)+20); inner.style.height = h+'px';
  const canvas = document.createElement('canvas'); canvas.id = `geo-${company.name.replace(/\s+/g,'-')}`; canvas.style.width='100%'; canvas.style.height='100%'; canvas.setAttribute('height', String(h));
  inner.appendChild(canvas); card.appendChild(inner); container.appendChild(card);
  trafficRenderGeoBarChart(canvas, company, valueType, { BAR_THICKNESS });
}
function trafficRenderGeoCharts(wrapper, model, mode, valueType){
  let grid = wrapper.querySelector('.geo-grid'); if(!grid){ grid = document.createElement('div'); grid.className='geo-grid'; wrapper.appendChild(grid); }
  grid.innerHTML='';
  const list = (mode==='direct') ? [model.yourCompany, ...(model.competitors||[])] : [model.yourCompany, (model._consolidatedGeo || (model._consolidatedGeo = trafficComputeConsolidatedGeo(model)))].filter(Boolean);
  list.forEach(c=> trafficCreateGeoCompanyBlock(grid, c, valueType));
}

// ========== INITIALIZER (Unified) ==========
function trafficInitChart(wrapper, dataUrl){
  const rootCanvas = wrapper.querySelector('canvas');
  fetch(dataUrl)
    .then(r=> r.json())
    .then(json=>{
      const type = json.chartType; // 'line' | 'bar' | 'donut' | 'geo'
      const barMode = json.barMode || 'grouped';
      const isDonut = (type==='donut');
      const isGeo = (type==='geo');

      // State
      let currentMode = 'direct'; // 'direct' | 'consolidate'
      let currentValue = isGeo ? 'percent' : (json.defaultValueType || 'absolute'); // 'absolute' | 'percent'

      // Normalize per type
      let model = null; // for series/donut
      let geoModel = null;
      if (isGeo){
        geoModel = trafficNormalizeGeoData(json);
      } else if (isDonut){
        model = trafficNormalizeDonutData(json);
      } else {
        model = trafficNormalizeSeriesData(json);
      }

      // Controls
      const btnDirect = wrapper.querySelector('.btn-direct');
      const btnConsolidate = wrapper.querySelector('.btn-consolidate');
      const btnAbs = wrapper.querySelector('.btn-absolute');
      const btnPct = wrapper.querySelector('.btn-percent');
      const modeBtns = [btnDirect, btnConsolidate];
      const valueBtns = [btnAbs, btnPct];
      function setActive(group, activeBtn){ group.forEach(b=>{ if(b) b.classList.remove('is-active'); }); if(activeBtn) activeBtn.classList.add('is-active'); }

      function render(){
        if (isDonut){ trafficRenderDonutCharts(wrapper, model, currentMode); return; }
        if (isGeo){ trafficRenderGeoCharts(wrapper, geoModel, currentMode, currentValue); return; }
        if (!rootCanvas){ console.warn('[traffic] Missing <canvas> inside wrapper'); return; }
        const ctx = rootCanvas.getContext('2d');
        if (type==='line') trafficCreateLineChart(ctx, model, currentMode, currentValue);
        if (type==='bar' && barMode==='grouped') trafficCreateGroupedBarChart(ctx, model, currentMode, currentValue);
        if (type==='bar' && barMode==='stacked-horizontal') trafficCreateStackedHorizontalBarChart(ctx, model, currentMode, currentValue);
      }

      // Bind controls (donut skips value type)
      if (!isDonut){
        if (btnDirect) btnDirect.addEventListener('click', ()=>{ currentMode='direct'; render(); setActive(modeBtns, btnDirect); });
        if (btnConsolidate) btnConsolidate.addEventListener('click', ()=>{ currentMode='consolidate'; render(); setActive(modeBtns, btnConsolidate); });
        if (btnAbs) btnAbs.addEventListener('click', ()=>{ currentValue='absolute'; render(); setActive(valueBtns, btnAbs); });
        if (btnPct) btnPct.addEventListener('click', ()=>{ currentValue='percent'; render(); setActive(valueBtns, btnPct); });
        setActive(modeBtns, btnDirect);
        setActive(valueBtns, isGeo ? btnPct : (json.defaultValueType==='percent' ? btnPct : btnAbs));
      } else {
        if (btnDirect){ btnDirect.addEventListener('click', ()=>{ currentMode='direct'; render(); setActive(modeBtns, btnDirect); }); setActive(modeBtns, btnDirect); }
        if (btnConsolidate) btnConsolidate.addEventListener('click', ()=>{ currentMode='consolidate'; render(); setActive(modeBtns, btnConsolidate); });
        if (btnAbs) btnAbs.style.display = 'none';
        if (btnPct) btnPct.style.display = 'none';
      }

      // Initial paint
      render();
    })
    .catch(err=> console.error('[traffic] Failed to load data:', err));
}

// Optional auto initializer (detect chartType first)
// window.trafficInitChartAuto = function(wrapper){
//   const url = wrapper?.dataset?.url || wrapper?.getAttribute('data-url');
//   if (!url) return console.error('[traffic] Missing data-url on wrapper');
//   fetch(url).then(r=>r.json()).then(json=>{ trafficInitChart(wrapper, url); });
// };
