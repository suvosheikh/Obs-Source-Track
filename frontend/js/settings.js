// Settings functionality
class SettingsManager {
    static init() {
        console.log('🔧 Initializing SettingsManager...');
        this.setupEventListeners();
        this.loadSettings();
    }

    static setupEventListeners() {
        // Add event listeners for settings actions
        const exportBtn = document.querySelector('[onclick="SettingsManager.exportData()"]');
        const clearBtn = document.querySelector('[onclick="SettingsManager.clearData()"]');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearData());
        }
    }

    static loadSettings() {
        // Load and display current settings
        this.updateConnectionStatus();
    }

    static updateConnectionStatus() {
        const statusElement = document.getElementById('obsStatus');
        if (statusElement) {
            // Check connection status
            fetch('http://localhost:3000/api/active')
                .then(response => response.json())
                .then(data => {
                    if (data.isOBSConnected) {
                        statusElement.innerHTML = '<span class="material-icons">check_circle</span> Connected';
                        statusElement.style.color = 'var(--success-color)';
                    } else {
                        statusElement.innerHTML = '<span class="material-icons">error</span> Disconnected';
                        statusElement.style.color = 'var(--error-color)';
                    }
                })
                .catch(error => {
                    statusElement.innerHTML = '<span class="material-icons">error</span> Connection Error';
                    statusElement.style.color = 'var(--error-color)';
                });
        }
    }

    static exportData() {
        Utils.showToast('Export functionality coming soon');
        // Implementation for full database export
    }

    static clearData() {
        if (confirm('Are you sure you want to clear all historical data? This action cannot be undone.')) {
            Utils.showToast('Data clearance functionality coming soon');
            // Implementation for data clearance
        }
    }

    static testConnection() {
        Utils.showToast('Testing OBS connection...');
        
        fetch('http://localhost:3000/api/active')
            .then(response => response.json())
            .then(data => {
                if (data.isOBSConnected) {
                    Utils.showToast('OBS connection successful');
                } else {
                    Utils.showToast('OBS connection failed', 'error');
                }
            })
            .catch(error => {
                Utils.showToast('Connection test failed', 'error');
            });
    }
}