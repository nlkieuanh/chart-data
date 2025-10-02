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
// HEADCOUNT LINE CHART FUNCTIONS
// ==============================

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

// ==============================
// PERFORMANCE BAR CHART FUNCTIONS
// ==============================

function orgProcessPerformanceDirect(data) {
    const labels = [data.yourCompany.name, ...data.competitors.map(c => c.name)];
    const values = [data.yourCompany.value, ...data.competitors.map(c => c.value)];
    const colors = [data.yourCompany.color, ...data.competitors.map(c => c.color)];
    const backgroundColors = colors.map((color, i) => 
        chartHexToRgba(color, i === 0 ? 0.7 : 0.5)
    );

    return {
        labels: labels,
        datasets: [{
            label: data.metric,
            data: values,
            backgroundColor: backgroundColors,
            borderColor: colors,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false
        }]
    };
}

function orgProcessPerformanceConsolidated(data) {
    const labels = [data.yourCompany.name, data.consolidatedCompetitors.name];
    const values = [data.yourCompany.value, data.consolidatedCompetitors.value];
    const colors = [data.yourCompany.color, data.consolidatedCompetitors.color];
    const backgroundColors = [
        chartHexToRgba(data.yourCompany.color, 0.7),
        chartHexToRgba(data.consolidatedCompetitors.color, 0.5)
    ];

    return {
        labels: labels,
        datasets: [{
            label: data.metric,
            data: values,
            backgroundColor: backgroundColors,
            borderColor: colors,
            borderWidth: 1,
            borderRadius: 4,
            borderSkipped: false
        }]
    };
}

function orgCreatePerformanceBarChart(canvasId, jsonData, mode = 'direct') {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Destroy existing chart
    if (window[canvasId + 'Chart']) {
        window[canvasId + 'Chart'].destroy();
    }

    let chartData;
    if (mode === 'direct') {
        chartData = orgProcessPerformanceDirect(jsonData);
    } else {
        chartData = orgProcessPerformanceConsolidated(jsonData);
    }

    const config = {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'x',
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: jsonData.metric || 'Performance'
                    },
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) return (value / 1000000) + 'M';
                            if (value >= 1000) return (value / 1000) + 'k';
                            return value;
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Company'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (value >= 1000000) return `${label}: ${(value / 1000000).toFixed(2)}M`;
                            if (value >= 1000) return `${label}: ${(value / 1000).toFixed(1)}k`;
                            return `${label}: ${value.toLocaleString()}`;
                        }
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

function initChartAuto(canvasId, dataUrl, chartType = 'auto') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const wrapper = canvas.closest('.chart-canvas');
    if (!wrapper) return;

    // Auto-detect chart type based on canvasId
    let detectedType = chartType;
    if (chartType === 'auto') {
        const id = canvasId.toLowerCase();
        if (id.includes('headcount')) {
            detectedType = 'headcount';
        } else if (id.includes('performance') || id.includes('perf')) {
            detectedType = 'performance';
        }
    }

    // Load JSON and initialize chart
    fetch(dataUrl.trim())
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (detectedType === 'headcount') {
                // Initialize with 'direct' mode
                orgCreateHeadcountChart(canvasId, data, 'direct');
                const btnDirect = wrapper.querySelector('.btn-direct');
                const btnConsolidate = wrapper.querySelector('.btn-consolidate');

                if (btnDirect) {
                    btnDirect.addEventListener('click', () => {
                        orgCreateHeadcountChart(canvasId, data, 'direct');
                        btnDirect.classList.add('is-active');
                        if (btnConsolidate) btnConsolidate.classList.remove('is-active');
                    });
                }

                if (btnConsolidate) {
                    btnConsolidate.addEventListener('click', () => {
                        orgCreateHeadcountChart(canvasId, data, 'consolidated');
                        btnConsolidate.classList.add('is-active');
                        if (btnDirect) btnDirect.classList.remove('is-active');
                    });
                }

            } else if (detectedType === 'performance') {
                // Initialize with 'direct' mode
                orgCreatePerformanceBarChart(canvasId, data, 'direct');
                const btnDirect = wrapper.querySelector('.btn-direct');
                const btnConsolidate = wrapper.querySelector('.btn-consolidate');

                if (btnDirect) {
                    btnDirect.addEventListener('click', () => {
                        orgCreatePerformanceBarChart(canvasId, data, 'direct');
                        btnDirect.classList.add('is-active');
                        if (btnConsolidate) btnConsolidate.classList.remove('is-active');
                    });
                }

                if (btnConsolidate) {
                    btnConsolidate.addEventListener('click', () => {
                        orgCreatePerformanceBarChart(canvasId, data, 'consolidated');
                        btnConsolidate.classList.add('is-active');
                        if (btnDirect) btnDirect.classList.remove('is-active');
                    });
                }
            }
        })
        .catch(error => {
            console.error(`Failed to load chart "${canvasId}" from "${dataUrl}":`, error);
        });
}
