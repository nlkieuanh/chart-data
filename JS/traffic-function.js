/* ========== traffic-function.js (gọn cho Overview, Sources, Channels, Geo) ========== */

/* ---------- Utils ---------- */
function chartHexToRgba(hex, alpha) {
  if (!hex || hex[0] !== '#') return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Map một số tên quốc gia phổ biến để khớp world-atlas (Chart.js Geo)
const GEO_NAME_FIX = {
  US: 'United States of America',
  USA: 'United States of America',
  'United States': 'United States of America',
  UK: 'United Kingdom',
  Russia: 'Russian Federation',
  Iran: 'Iran, Islamic Republic of',
  'South Korea': 'Korea, Republic of',
  'North Korea': "Korea, Democratic People's Republic of",
  Vietnam: 'Viet Nam',
  Laos: "Lao People's Democratic Republic",
  Syria: 'Syrian Arab Republic',
  Moldova: 'Moldova, Republic of',
  Tanzania: 'Tanzania, United Republic of',
  Bolivia: 'Bolivia, Plurinational State of',
  Venezuela: 'Venezuela, Bolivarian Republic of',
  'Congo (Kinshasa)': 'Congo, the Democratic Republic of the',
  'Congo (Brazzaville)': 'Congo',
  'Ivory Coast': "Côte d'Ivoire",
  'Czech Republic': 'Czechia',
  Eswatini: 'Swaziland',
  'Cape Verde': 'Cabo Verde'
};

function normalizeCountryName(name) {
  return GEO_NAME_FIX[name] || name;
}

/* ---------- Data detection & shaping ---------- */
function chartProcessData(data, mode = 'direct') {
  // 1) Overview (line)
  if (data.periods && data.yourCompany?.traffic) {
    const makeLine = (label, series, color, dashed) => ({
      label,
      data: series,
      borderColor: color,
      backgroundColor: chartHexToRgba(color, 0.2),
      borderWidth: dashed ? 2 : 3,
      borderDash: dashed ? [4, 4] : undefined,
      fill: false,
      pointRadius: 0
    });

    if (mode === 'direct') {
      const datasets = [
        makeLine(data.yourCompany.name, data.yourCompany.traffic, data.yourCompany.color, false),
        ...data.competitors.map(c => makeLine(c.name, c.traffic, c.color, true))
      ];
      return { type: 'line', labels: data.periods, datasets };
    } else if (data.consolidatedCompetitors) {
      const datasets = [
        makeLine(data.yourCompany.name, data.yourCompany.traffic, data.yourCompany.color, false),
        makeLine(data.consolidatedCompetitors.name, data.consolidatedCompetitors.traffic, data.consolidatedCompetitors.color, true)
      ];
      return { type: 'line', labels: data.periods, datasets };
    }
  }

  // 2) Sources (Direct = bar, Consolidated = 2 doughnut)
  if (data.yourCompany?.sources) {
    const categories = Object.keys(data.yourCompany.sources);
    if (mode === 'direct') {
      const datasets = [
        {
          label: data.yourCompany.name,
          data: Object.values(data.yourCompany.sources),
          backgroundColor: data.yourCompany.color
        },
        ...data.competitors.map(c => ({
          label: c.name,
          data: Object.values(c.sources),
          backgroundColor: c.color
        }))
      ];
      return { type: 'bar', labels: categories, datasets, options: { responsive: true } };
    } else if (data.consolidatedCompetitors) {
      const palette = ['#3366cc', '#109618', '#ff9900', '#dc3912', '#0099c6', '#990099'];
      return {
        type: 'doughnut-dual',
        doughnutCompany: {
          labels: categories,
          datasets: [{ label: data.yourCompany.name, data: Object.values(data.yourCompany.sources), backgroundColor: palette }]
        },
        doughnutConsolidated: {
          labels: categories,
          datasets: [{ label: data.consolidatedCompetitors.name, data: Object.values(data.consolidatedCompetitors.sources), backgroundColor: palette }]
        }
      };
    }
  }

  // 3) Channels (Direct = stacked horizontal snapshot, Consolidated = 2 doughnut)
  // LƯU Ý: file channels.json phải là snapshot (không có "periods")
  if (!data.periods && data.yourCompany?.channels) {
    const cats = Object.keys(data.yourCompany.channels);
    if (mode === 'direct') {
      const palette = ['#3366cc', '#109618', '#ff9900', '#dc3912', '#0099c6', '#990099'];
      const datasets = cats.map((cat, i) => ({
        label: cat,
        data: [data.yourCompany.channels[cat], ...data.competitors.map(c => c.channels[cat])],
        backgroundColor: palette[i % palette.length]
      }));
      return {
        type: 'bar',
        labels: [data.yourCompany.name, ...data.competitors.map(c => c.name)],
        datasets,
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true } }
        }
      };
    } else if (data.consolidatedCompetitors) {
      const palette = ['#3366cc', '#109618', '#ff9900', '#dc3912', '#0099c6', '#990099'];
      return {
        type: 'doughnut-dual',
        doughnutCompany: {
          labels: cats,
          datasets: [{ label: data.yourCompany.name, data: Object.values(data.yourCompany.channels), backgroundColor: palette }]
        },
        doughnutConsolidated: {
          labels: cats,
          datasets: [{ label: data.consolidatedCompetitors.name, data: Object.values(data.consolidatedCompetitors.channels), backgroundColor: palette }]
        }
      };
    }
  }

  // 4) Geo (choropleth – Chart.js Geo)
  if (data.competitors && data.competitors[0]?.countries) {
    return { type: 'geo', competitors: data.competitors };
  }

  return null;
}

/* ---------- Renderer ---------- */
function destroyIfChartJS(inst) {
  if (inst && typeof inst.destroy === 'function') inst.destroy();
}

function ensureDualContainer(canvasEl) {
  // Tạo container phụ cho dual doughnut nếu chưa có
  let dual = canvasEl.parentElement.querySelector(`[data-dual="${canvasEl.id}"]`);
  if (!dual) {
    dual = document.createElement('div');
    dual.setAttribute('data-dual', canvasEl.id);
    dual.style.display = 'none';
    dual.style.gap = '20px';
    dual.style.width = '100%';
    dual.style.height = '100%';
    dual.style.alignItems = 'stretch';
    dual.style.justifyContent = 'space-between';
    dual.style.flexWrap = 'wrap';
    dual.style.display = 'none';
    dual.style.flex = '1 1 auto';
    dual.style.boxSizing = 'border-box';
    dual.style.minHeight = '280px';
    dual.style.display = 'none';

    dual.style.display = 'none';
    dual.style.flexDirection = 'row';
    dual.innerHTML = `
      <div style="flex:1;min-width:260px;min-height:240px;"><canvas id="${canvasEl.id}-d1"></canvas></div>
      <div style="flex:1;min-width:260px;min-height:240px;"><canvas id="${canvasEl.id}-d2"></canvas></div>
    `;
    // Đặt ngay sau canvas gốc
    canvasEl.insertAdjacentElement('afterend', dual);
  }
  return dual;
}

function showDualHideCanvas(canvasEl) {
  const dual = ensureDualContainer(canvasEl);
  canvasEl.style.display = 'none';
  dual.style.display = 'flex';
  return dual;
}

function showCanvasHideDual(canvasEl) {
  const dual = canvasEl.parentElement.querySelector(`[data-dual="${canvasEl.id}"]`);
  canvasEl.style.display = '';
  if (dual) {
    dual.style.display = 'none';
    // huỷ 2 doughnut nếu còn
    const c1 = window[canvasEl.id + '_Dual_1'];
    const c2 = window[canvasEl.id + '_Dual_2'];
    destroyIfChartJS(c1);
    destroyIfChartJS(c2);
    window[canvasEl.id + '_Dual_1'] = null;
    window[canvasEl.id + '_Dual_2'] = null;
  }
}

function chartCreate(canvasId, processed, mode) {
  const canvas = document.getElementById(canvasId);

  // GEO (Chart.js choropleth)
  if (processed.type === 'geo') {
    showCanvasHideDual(canvas);
    destroyIfChartJS(window[canvasId + 'Chart']);

    fetch('https://cdn.jsdelivr.net/npm/world-atlas/countries-110m.json')
      .then(r => r.json())
      .then(topology => {
        const countries = ChartGeo.topojson.feature(topology, topology.objects.countries).features;

        const datasets = processed.competitors.map(c => {
          const points = [];
          c.countries.forEach(ct => {
            const targetName = normalizeCountryName(ct.name);
            const feature = countries.find(f => f.properties.name === targetName);
            if (feature) points.push({ feature, value: ct.value });
            else console.warn('[Geo] Country not matched:', ct.name);
          });
          return { label: c.name, data: points, backgroundColor: chartHexToRgba(c.color || '#888', 0.8) };
        });

        const cfg = {
          type: 'choropleth',
          data: { labels: countries.map(d => d.properties.name), datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            showOutline: true,
            showGraticule: true,
            scales: {
              // v4: KHÔNG set axis; chỉ cần projection
              projection: { projection: 'equalEarth' },
              color: { quantize: 5 }
            },
            plugins: {
              legend: { position: 'top', labels: { usePointStyle: true } },
              tooltip: {
                callbacks: {
                  label: ctx =>
                    `${ctx.dataset.label}: ${ctx.raw.feature.properties.name} – ${Number(ctx.raw.value).toLocaleString()}`
                }
              }
            }
          }
        };

        window[canvasId + 'Chart'] = new Chart(canvas.getContext('2d'), cfg);
      })
      .catch(err => console.error('Geo load error:', err));

    return;
  }

  // DUAL DOUGHNUT (Sources/Channels consolidated)
  if (processed.type === 'doughnut-dual') {
    const dual = showDualHideCanvas(canvas);
    // huỷ chart đơn nếu còn
    destroyIfChartJS(window[canvasId + 'Chart']);

    const c1 = new Chart(dual.querySelector(`#${canvasId}-d1`), { type: 'doughnut', data: processed.doughnutCompany, options: { responsive: true, maintainAspectRatio: false } });
    const c2 = new Chart(dual.querySelector(`#${canvasId}-d2`), { type: 'doughnut', data: processed.doughnutConsolidated, options: { responsive: true, maintainAspectRatio: false } });

    window[canvasId + '_Dual_1'] = c1;
    window[canvasId + '_Dual_2'] = c2;
    return;
  }

  // Còn lại (line / bar / stacked)
  showCanvasHideDual(canvas);
  destroyIfChartJS(window[canvasId + 'Chart']);

  const cfg = {
    type: processed.type,
    data: { labels: processed.labels, datasets: processed.datasets },
    options: processed.options || { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
  };

  window[canvasId + 'Chart'] = new Chart(canvas.getContext('2d'), cfg);
}

/* ---------- Load + Init (giữ switch + default direct) ---------- */
async function chartLoadAndCreate(canvasId, jsonUrl, mode = 'direct') {
  const res = await fetch(jsonUrl);
  const data = await res.json();
  const processed = chartProcessData(data, mode);
  if (!processed) {
    console.warn('[chartLoadAndCreate] Unsupported data shape');
    return;
  }
  chartCreate(canvasId, processed, mode);
}

function initChart(wrapper, jsonUrl) {
  // Lấy <canvas> gốc duy nhất trong wrapper
  const baseCanvas = wrapper.querySelector('canvas');
  if (!baseCanvas) return;
  const chartId = baseCanvas.id;

  const btnDirect = wrapper.querySelector('.btn-direct');
  const btnConsolidate = wrapper.querySelector('.btn-consolidate');

  // Mặc định: direct
  chartLoadAndCreate(chartId, jsonUrl, 'direct');
  if (btnDirect) btnDirect.classList.add('is-active');

  if (btnDirect) {
    btnDirect.addEventListener('click', (e) => {
      e.preventDefault();
      chartLoadAndCreate(chartId, jsonUrl, 'direct');
      btnDirect.classList.add('is-active');
      btnConsolidate?.classList.remove('is-active');
    });
  }

  if (btnConsolidate) {
    btnConsolidate.addEventListener('click', (e) => {
      e.preventDefault();
      chartLoadAndCreate(chartId, jsonUrl, 'consolidated');
      btnConsolidate.classList.add('is-active');
      btnDirect?.classList.remove('is-active');
    });
  }
}
/* ========== /traffic-function.js ========== */
