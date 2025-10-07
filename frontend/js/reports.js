// Reports and Analytics functionality - Simple Working Version
class ReportsManager {
    static init() {
        console.log('🔧 Initializing ReportsManager...');
        this.setupEventListeners();
        this.loadReports();
    }

    static setupEventListeners() {
        const dateInput = document.getElementById('reportDate');
        const exportBtn = document.getElementById('exportBtn');

        if (dateInput) {
            dateInput.value = this.getTodayDate();
            dateInput.addEventListener('change', () => this.loadReports());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportReport());
        }
    }

    static async loadReports() {
        const dateInput = document.getElementById('reportDate');
        const selectedDate = dateInput?.value || this.getTodayDate();

        console.log('📊 Loading reports for date:', selectedDate);

        try {
            const response = await fetch(`http://localhost:3000/api/reports/daily?date=${selectedDate}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reportData = await response.json();
            this.updateReportsTable(reportData, selectedDate);
            
        } catch (error) {
            console.error('Error loading reports:', error);
            this.showError('Error loading report data');
        }
    }

    static updateReportsTable(reportData, date) {
        const tbody = document.getElementById('reportsBody');
        
        if (!reportData || reportData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <span class="material-icons">analytics</span>
                        <p>No data available for ${this.formatDate(date)}</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = reportData.map(item => {
            const displayName = item.title || item.source_name;
            const avgDuration = item.visible_count > 0 ? 
                Math.round(item.total_duration / item.visible_count) : 0;

            return `
                <tr>
                    <td>
                        <div class="source-name">
                            <strong>${displayName}</strong>
                            ${item.source_name !== displayName ? 
                              `<small class="text-muted">${item.source_name}</small>` : ''}
                        </div>
                    </td>
                    <td>${item.category || '-'}</td>
                    <td>${item.brand || '-'}</td>
                    <td><span class="count-badge">${item.visible_count || 0}</span></td>
                    <td>${this.formatDuration(item.total_duration || 0)}</td>
                    <td>${this.formatDuration(avgDuration)}</td>
                </tr>
            `;
        }).join('');
    }

    static exportReport() {
        const dateInput = document.getElementById('reportDate');
        const selectedDate = dateInput?.value || this.getTodayDate();
        this.exportToCSV(selectedDate);
    }

    static async exportToCSV(date) {
        try {
            const response = await fetch(`http://localhost:3000/api/reports/daily?date=${date}`);
            const reportData = await response.json();
            
            if (!reportData.length) {
                this.showToast('No data to export', 'error');
                return;
            }

            const headers = ['Source Name', 'Title', 'Category', 'Brand', 'Show Count', 'Total Duration', 'Avg Duration'];
            const csvContent = [
                headers.join(','),
                ...reportData.map(item => {
                    const avgDuration = item.visible_count > 0 ? 
                        Math.round(item.total_duration / item.visible_count) : 0;
                    
                    return [
                        `"${item.source_name}"`,
                        `"${item.title || item.source_name}"`,
                        `"${item.category || ''}"`,
                        `"${item.brand || ''}"`,
                        item.visible_count || 0,
                        item.total_duration || 0,
                        avgDuration
                    ].join(',');
                })
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `obs-report-${date}.csv`;
            a.click();
            URL.revokeObjectURL(url);

            this.showToast('Report exported successfully');
        } catch (error) {
            console.error('Error exporting report:', error);
            this.showToast('Error exporting report', 'error');
        }
    }

    static getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    static formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    static formatDuration(seconds) {
        if (!seconds) return '0s';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }

    static showError(message) {
        const tbody = document.getElementById('reportsBody');
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <span class="material-icons">error</span>
                    <p>${message}</p>
                </td>
            </tr>
        `;
    }

    static showToast(message, type = 'success') {
        if (typeof Utils !== 'undefined' && Utils.showToast) {
            Utils.showToast(message, type);
        }
    }
}