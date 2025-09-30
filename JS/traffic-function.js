
// ===== Utility =====
function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ===== Detect & Process Data =====
function chartProcessData(data, mode = 'direct') {
  const datasets = [];

  // --- CASE 1: Time series (headcount, traffic, channels) ---
  if (data.periods) {
    if (mode === 'direct') {
      if (data.yourCompany?.headcount || data.yourCompany?.traffic) {
        const key = data.yourCompany.headcount ? 'headcount' : 'traffic';
        datasets.push({
          label: data.yourCompany.name,
          data: data.yourCompany[key],
          borderColor: data.yourCompany.color,
          backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
          borderWidth: 3,
          fill: false,
          pointRadius: 4
        });
        data.competitors.forEach(c => {
          datasets.push({
            label: c.name,
            data: c[key],
            borderColor: c.color,
            backgroundColor: chartHexToRgba(c.color, 0.15),
            borderWidth: 2,
            borderDash: [3, 3],
            fill: false,
            pointRadius: 3
          });
        });
      } else if (data.yourCompany?.channels) {
        Object.keys(data.yourCompany.channels).forEach(channel => {
          datasets.push({
            label: data.yourCompany.name + " - " + channel,
            data: data.yourCompany.channels[channel],
            borderColor: data.yourCompany.color,
            backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
            fill: false
          });
        });
        data.competitors.forEach(c => {
          Object.keys(c.channels).forEach(channel => {
            datasets.push({
              label: c.name + " - " + channel,
              data: c.channels[channel],
              borderColor: c.color,
              backgroundColor: chartHexToRgba(c.color, 0.15),
              borderDash: [5, 5],
              fill: false
            });
          });
        });
      }
    } else if (mode === 'consolidated' && data.consolidatedCompetitors) {
      const key = data.consolidatedCompetitors.headcount ? 'headcount' : 'traffic';
      datasets.push({
        label: data.yourCompany.name,
        data: data.yourCompany[key],
        borderColor: data.yourCompany.color,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
        borderWidth: 3,
        fill: false,
        pointRadius: 4
      });
      datasets.push({
        label: data.consolidatedCompetitors.name,
        data: data.consolidatedCompetitors[key],
        borderColor: data.consolidatedCompetitors.color,
        backgroundColor: chartHexToRgba(data.consolidatedCompetitors.color, 0.15),
        borderDash: [5, 5],
        fill: false,
        pointRadius: 4
      });
    }

    return { type: 'line', labels: data.periods, datasets };
  }

  // --- CASE 2: Sources / Devices ---
  if (data.yourCompany.sources || data.yourCompany.devices) {
    const isSources = !!data.yourCompany.sources;
    const categories = Object.keys(isSources ? data.yourCompany.sources : data.yourCompany.devices);

    if (mode === 'direct') {
      datasets.push({
        label: data.yourCompany.name,
        data: Object.values(isSources ? data.yourCompany.sources : data.yourCompany.devices),
        backgroundColor: data.yourCompany.color
      });
      data.competitors.forEach(c => {
        datasets.push({
          label: c.name,
          data: Object.values(isSources ? c.sources : c.devices),
          backgroundColor: c.color
        });
      });
    } else if (mode === 'consolidated' && data.consolidatedCompetitors) {
      datasets.push({
        label: data.consolidatedCompetitors.name,
        data: Object.values(isSources ? data.consolidatedCompetitors.sources : data.consolidatedCompetitors.devices),
        backgroundColor: data.consolidatedCompetitors.color
      });
    }

    return { type: 'bar', labels: categories, datasets };
  }

  // --- CASE 3: Geo Distribution ---
  if (data.yourCompany.countries) {
    let allCountries = new Set();
    data.yourCompany.countries.forEach(c => allCountries.add(c.name));
    data.competitors.forEach(comp => comp.countries.forEach(c => allCountries.add(c.name)));
    allCountries = Array.from(allCountries);

    function mapCountries(entity) {
      return allCountries.map(cn => {
        let match = entity.find(e => e.name === cn);
        return match ? match.value : 0;
      });
    }

    if (mode === 'direct') {
      datasets.push({
        label: data.yourCompany.name,
        data: mapCountries(data.yourCompany.countries),
        backgroundColor: data.yourCompany.color
      });
      data.competitors.forEach(c => {
        datasets.push({
          label: c.name,
          data: mapCountries(c.countries),
          backgroundColor: c.color
        });
      });
    } else if (mode === 'consolidated' && data.consolidatedCompetitors) {
      datasets.push({
        label: data.consolidatedCompetitors.name,
        data: mapCountries(data.consolidatedCompetitors.countries),
        backgroundColor: data.consolidatedCompetitors.color
      });
    }

    return { type: 'bar', labels: allCountries, datasets };
  }

  // --- CASE 4: Engagement Metrics ---
  if (data.metrics) {
    if (mode === 'direct') {
      datasets.push({
        label: data.yourCompany.name,
        data: data.yourCompany.values,
        borderColor: data.yourCompany.color,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.3)
      });
      data.competitors.forEach(c => {
        datasets.push({
          label: c.name,
          data: c.values,
          borderColor: c.color,
          backgroundColor: chartHexToRgba(c.color, 0.3)
        });
      });
    } else if (mode === 'consolidated' && data.consolidatedCompetitors) {
      datasets.push({
        label: data.consolidatedCompetitors.name,
        data: data.consolidatedCompetitors.values,
        borderColor: data.consolidatedCompetitors.color,
        backgroundColor: chartHexToRgba(data.consolidatedCompetitors.color, 0.3)
      });
    }

    return { type: 'radar', labels: data.metrics, datasets };
  }

  return null;
}

// ===== Create Chart =====
function chartCreate(canvasId, data, mode) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (window[canvasId + 'Chart']) {
    window[canvasId + 'Chart'].destroy();
  }

  const chartData = chartProcessData(data, mode);
  if (!chartData) return;

  const config = {
    type: chartData.type,
    data: {
      labels: chartData.labels,
      datasets: chartData.datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true } }
      }
    }
  };

  window[canvasId + 'Chart'] = new Chart(ctx, config);
}

// ===== Load + Init =====
async function chartLoadAndCreate(canvasId, jsonUrl, mode = 'direct') {
  try {
    const res = await fetch(jsonUrl);
    const data = await res.json();
    chartCreate(canvasId, data, mode);
  } catch (err) {
    console.error('Error loading chart:', err);
  }
}

function initChart(wrapper, jsonUrl) {
  const canvas = wrapper.querySelector('canvas');
  if (!canvas) return;
  const chartId = canvas.id;

  const btnDirect = wrapper.querySelector('.btn-direct');
  const btnConsolidate = wrapper.querySelector('.btn-consolidate');

  chartLoadAndCreate(chartId, jsonUrl, 'direct');
  if (btnDirect) btnDirect.classList.add("is-active");

  if (btnDirect) {
    btnDirect.addEventListener('click', e => {
      e.preventDefault();
      chartLoadAndCreate(chartId, jsonUrl, 'direct');
      btnDirect.classList.add("is-active");
      btnConsolidate?.classList.remove("is-active");
    });
  }

  if (btnConsolidate) {
    btnConsolidate.addEventListener('click', e => {
      e.preventDefault();
      chartLoadAndCreate(chartId, jsonUrl, 'consolidated');
      btnConsolidate.classList.add("is-active");
      btnDirect?.classList.remove("is-active");
    });
  }
}

