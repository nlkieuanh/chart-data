// ============================
// Advertising Chart Functions
// Prefix: adv-
// ============================

// Load and initialize chart
function advInitChart(wrapper, dataUrl) {
  fetch(dataUrl)
    .then(res => res.json())
    .then(data => {
      const mode = wrapper.dataset.mode || 'direct'; // direct | consolidate
      const type = wrapper.dataset.type; // overallTrend | formatBreakdown | anglesOffers | channels
      const scale = wrapper.dataset.scale || 'absolute'; // absolute | percent

      if (type === 'overallTrend') {
        advCreateOverallTrend(wrapper, data, mode);
      } else if (type === 'formatBreakdown') {
        advCreateFormatBreakdown(wrapper, data, mode, scale);
      } else if (type === 'anglesOffers') {
        advCreateAnglesOffers(wrapper, data, mode, scale);
      } else if (type === 'channels') {
        advCreateChannels(wrapper, data, mode, scale);
      }
    });
}

// Compute consolidated competitors
function advComputeConsolidated(competitors) {
  const consolidate = {};
  const keys = Object.keys(competitors[0]);

  competitors.forEach(comp => {
    for (const key in comp) {
      if (Array.isArray(comp[key])) {
        if (!consolidate[key]) consolidate[key] = Array(comp[key].length).fill(0);
        comp[key].forEach((v, i) => consolidate[key][i] += v);
      } else if (typeof comp[key] === 'object') {
        if (!consolidate[key]) consolidate[key] = {};
        for (const sub in comp[key]) {
          consolidate[key][sub] = (consolidate[key][sub] || 0) + comp[key][sub];
        }
      }
    }
  });

  // Chia trung bình
  for (const key in consolidate) {
    if (Array.isArray(consolidate[key])) {
      consolidate[key] = consolidate[key].map(v => v / competitors.length);
    } else if (typeof consolidate[key] === 'object') {
      for (const sub in consolidate[key]) {
        consolidate[key][sub] = consolidate[key][sub] / competitors.length;
      }
    }
  }

  return consolidate;
}

// Example chart creators
function advCreateOverallTrend(wrapper, data, mode) {
  const ctx = wrapper.querySelector('canvas').getContext('2d');
  const datasets = [];
  const consolidated = advComputeConsolidated(data.competitors);

  if (mode === 'direct') {
    datasets.push({
      label: data.yourCompany.name,
      data: data.yourCompany.overallTrend,
      borderColor: data.yourCompany.color,
      fill: false
    });
    data.competitors.forEach(c => {
      datasets.push({
        label: c.name,
        data: c.overallTrend,
        borderColor: c.color,
        fill: false
      });
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
      borderDash: [5,5],
      fill: false
    });
  }

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.periods,
      datasets: datasets
    }
  });
}

// Các hàm advCreateFormatBreakdown, advCreateAnglesOffers, advCreateChannels
// sẽ viết tương tự, lấy dữ liệu từ JSON và dựng chart.
