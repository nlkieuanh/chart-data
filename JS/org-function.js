// Common Chart Functions for Webflow
// All functions use proper prefixes for clarity

// Chart utility functions (prefix: chart)
function chartHexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ==============================
// HEADCOUNT LINE CHART
// ==============================

function orgProcessHeadcountDirect(data) {
    const datasets = [];
    datasets.push({
        label: data.yourCompany.name,
         data.yourCompany.headcount,
        borderColor: data.yourCompany.color,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
        borderWidth: 3,
        fill: false,
        pointRadius: 4
    });
    data.competitors.forEach(comp => {
        datasets.push({
            label: comp.name,
             comp.headcount,
            borderColor: comp.color,
            backgroundColor: chartHexToRgba(comp.color, 0.15),
            borderWidth: 2,
            fill: false,
            borderDash: [3, 3],
            pointRadius: 3
        });
    });
    return { labels: data.periods, datasets };
}

function orgProcessHeadcountConsolidated(data) {
    return {
        labels: data.periods,
        datasets: [
            {
                label: data.yourCompany.name,
                 data.yourCompany.headcount,
                borderColor: data.yourCompany.color,
                backgroundColor: chartHexToRgba(data.yourCompany.color, 0.2),
                borderWidth: 3,
                fill: false,
                pointRadius: 4
            },
            {
                label: data.consolidatedCompetitors.name,
                 data.consolidatedCompetitors.headcount,
                borderColor: data.consolidatedCompetitors.color,
                backgroundColor: chartHexToRgba(data.consolidatedCompetitors.color, 0.15),
                borderWidth: 3,
                fill: false,
                borderDash: [5, 5],
                pointRadius: 4
            }
        ]
    };
}

function orgCreateHeadcountChart(canvasId, data, mode = 'direct') {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (window[canvasId + 'Chart']) window[canvasId + 'Chart'].destroy();

    const chartData = mode === 'direct' 
        ? orgProcessHeadcountDirect(data) 
        : orgProcessHeadcountConsolidated(data);

    const config = {
        type: 'line',
         chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Headcount' },
                    ticks: {
                        callback: v => v >= 1000 ? (v / 1000) + 'k' : v
                    }
                },
                x: { title: { display: true, text: 'Month' } }
            },
            plugins: {
                legend: { position: 'top', labels: { padding: 20, usePointStyle: true } },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString()
                    }
                }
            }
        }
    };

    window[canvasId + 'Chart'] = new Chart(ctx, config);
}

// ==============================
// PERFORMANCE GROUPED BAR CHART
// ==============================

function orgProcessPerformanceDirect(data) {
    const datasets = [];
    datasets.push({
        label: data.yourCompany.name,
         data.yourCompany.performance,
        backgroundColor: chartHexToRgba(data.yourCompany.color, 0.7),
        borderColor: data.yourCompany.color,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false
    });
    data.competitors.forEach(comp => {
        datasets.push({
            label: comp.name,
             comp.performance,
            backgroundColor: chartHexToRgba(comp.color, 0.6),
            borderColor: comp.color,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false
        });
    });
    return { labels: data.periods, datasets };
}

function orgProcessPerformanceConsolidated(data) {
    return {
        labels: data.periods,
        datasets: [
            {
                label: data.yourCompany.name,
                 data.yourCompany.performance,
                backgroundColor: chartHexToRgba(data.yourCompany.color, 0.7),
                borderColor: data.yourCompany.color,
                borderWidth: 1,
                borderRadius: 4,
                borderSkipped: false
            },
            {
                label: data.consolidatedCompetitors.name,
                 data.consolidatedCompetitors.performance,
                backgroundColor: chartHexToRgba(data.consolidatedCompetitors.color, 0.6),
                borderColor: data.consolidatedCompetitors.color,
                borderWidth: 1,
                borderRadius: 4,
                borderSkipped: false
            }
        ]
    };
}

function orgCreatePerformanceBarChart(canvasId, data, mode = 'direct') {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (window[canvasId + 'Chart']) window[canvasId + 'Chart'].destroy();

    const chartData = mode === 'direct'
        ? orgProcessPerformanceDirect(data)
        : orgProcessPerformanceConsolidated(data);

    const config = {
        type: 'bar',
         chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Performance Score' }
                },
                x: {
                    title: { display: true, text: 'Marketing Channel' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { padding: 15, usePointStyle: true } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}`
                    }
                }
            }
        }
    };

    window[canvasId + 'Chart'] = new Chart(ctx, config);
}

// ==============================
// AUTO INIT CHART FUNCTION (UNIFIED)
// ==============================

async function initChartAuto(canvasId, dataUrl) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const wrapper = canvas.closest('.chart-canvas');
    if (!wrapper) return;

    // Auto-detect chart type
    const id = canvasId.toLowerCase();
    const isHeadcount = id.includes('headcount');
    const isPerformance = id.includes('performance') || id.includes('perf');

    if (!isHeadcount && !isPerformance) {
        console.warn(`Unknown chart type for canvas ID: ${canvasId}`);
        return;
    }

    try {
        const res = await fetch(dataUrl.trim());
        const data = await res.json();

        // Initialize with 'direct' mode
        if (isHeadcount) {
            orgCreateHeadcountChart(canvasId, data, 'direct');
        } else if (isPerformance) {
            orgCreatePerformanceBarChart(canvasId, data, 'direct');
        }

        // Attach button events
        const btnDirect = wrapper.querySelector('.btn-direct');
        const btnConsolidate = wrapper.querySelector('.btn-consolidate');

        if (btnDirect) {
            btnDirect.addEventListener('click', () => {
                if (isHeadcount) {
                    orgCreateHeadcountChart(canvasId, data, 'direct');
                } else if (isPerformance) {
                    orgCreatePerformanceBarChart(canvasId, data, 'direct');
                }
                btnDirect.classList.add('is-active');
                if (btnConsolidate) btnConsolidate.classList.remove('is-active');
            });
        }

        if (btnConsolidate) {
            btnConsolidate.addEventListener('click', () => {
                if (isHeadcount) {
                    orgCreateHeadcountChart(canvasId, data, 'consolidated');
                } else if (isPerformance) {
                    orgCreatePerformanceBarChart(canvasId, data, 'consolidated');
                }
                btnConsolidate.classList.add('is-active');
                if (btnDirect) btnDirect.classList.remove('is-active');
            });
        }

        // Set initial active state
        if (btnDirect) btnDirect.classList.add('is-active');
        if (btnConsolidate) btnConsolidate.classList.remove('is-active');

    } catch (error) {
        console.error(`Failed to load chart "${canvasId}" from "${dataUrl}":`, error);
    }
}
