// Common Chart Functions for Webflow
// All functions use proper prefixes for clarity

// Chart utility functions (prefix: chart)
function chartHexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Org page specific functions (prefix: org)
function orgProcessHeadcountDirect(data) {
    const datasets = [];

    // Your company (always first, solid line)
    datasets.push({
        label: data.yourCompany.name,
        data: data.yourCompany.headcount,
        borderColor: data.yourCompany.color,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
        borderWidth: 3,
        fill: false,
        pointRadius: 4
    });

    // Competitors (dashed lines)
    data.competitors.forEach(competitor => {
        datasets.push({
            label: competitor.name,
            data: competitor.headcount,
            borderColor: competitor.color,
            backgroundColor: chartHexToRgba(competitor.color, 0.15),
            borderWidth: 2,
            fill: false,
            borderDash: [3, 3],
            pointRadius: 3
        });
    });

    return {
        labels: data.periods,
        datasets: datasets
    };
}

function orgProcessHeadcountConsolidated(data) {
    const datasets = [];

    // Your company
    datasets.push({
        label: data.yourCompany.name,
        data: data.yourCompany.headcount,
        borderColor: data.yourCompany.color,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
        borderWidth: 3,
        fill: false,
        pointRadius: 4
    });

    // All competitors combined
    datasets.push({
        label: data.consolidatedCompetitors.name,
        data: data.consolidatedCompetitors.headcount,
        borderColor: data.consolidatedCompetitors.color,
        backgroundColor: chartHexToRgba(data.consolidatedCompetitors.color, 0.15),
        borderWidth: 3,
        fill: false,
        borderDash: [5, 5],
        pointRadius: 4
    });

    return {
        labels: data.periods,
        datasets: datasets
    };
}

function orgCreateHeadcountChart(canvasId, jsonData, mode = 'direct') {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Destroy existing chart if it exists
    if (window[canvasId + 'Chart']) {
        window[canvasId + 'Chart'].destroy();
    }

    let chartData;
    if (mode === 'direct') {
        chartData = orgProcessHeadcountDirect(jsonData);
    } else {
        chartData = orgProcessHeadcountConsolidated(jsonData);
    }

    const config = {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Headcount'
                    },
                    ticks: {
                        callback: function (value) {
                            return value >= 1000 ? (value / 1000) + 'k' : value;
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            }
        }
    };

    // Store chart instance globally for easy access
    window[canvasId + 'Chart'] = new Chart(ctx, config);
}

function initHeadcountChart(wrapper, dataUrl) {
  const canvas = wrapper.querySelector('canvas');
  if (!canvas) return;

  const chartId = canvas.id;
  const btnDirect = wrapper.querySelector('.btn-direct');
  const btnConsolidate = wrapper.querySelector('.btn-consolidate');

  // Load mặc định Direct
  orgLoadAndCreateHeadcountChart(chartId, dataUrl, 'direct');
  if (btnDirect) btnDirect.classList.add("is-active");

  // Switch Direct
  if (btnDirect) {
    btnDirect.addEventListener('click', function() {
      orgLoadAndCreateHeadcountChart(chartId, dataUrl, 'direct');
      btnDirect.classList.add("is-active");
      if (btnConsolidate) btnConsolidate.classList.remove("is-active");
    });
  }

  // Switch Consolidated
  if (btnConsolidate) {
    btnConsolidate.addEventListener('click', function() {
      orgLoadAndCreateHeadcountChart(chartId, dataUrl, 'consolidated');
      btnConsolidate.classList.add("is-active");
      if (btnDirect) btnDirect.classList.remove("is-active");
    });
  }
}


async function orgLoadAndCreateHeadcountChart(canvasId, jsonUrl, mode = 'direct') {
    try {
        const response = await fetch(jsonUrl);
        const data = await response.json();
        orgCreateHeadcountChart(canvasId, data, mode);
    } catch (error) {
        console.error('Error loading org headcount chart ', error);
    }
}
