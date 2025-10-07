// Main application initialization
class OBSDashboard {
    constructor() {
        this.currentTab = 'realtime';
        this.init();
    }

    init() {
        console.log('🚀 Initializing OBS Dashboard...');
        
        this.initializeTabs();
        this.initializeTime();
        this.initializeModal();
        
        // Initialize modules
        if (typeof RealTimeManager !== 'undefined') {
            RealTimeManager.init();
        }
        if (typeof ManagementManager !== 'undefined') {
            ManagementManager.init();
        }
        if (typeof ReportsManager !== 'undefined') {
            ReportsManager.init();
        }
        if (typeof SettingsManager !== 'undefined') {
            SettingsManager.init();
        }

        this.updateGlobalStatus();
        this.startTimeUpdate();
    }

    initializeTabs() {
        const tabLinks = document.querySelectorAll('.nav-item[data-tab]');
        const tabContents = document.querySelectorAll('.tab-content');

        tabLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                const targetTab = link.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });
    }

    switchTab(tabName) {
        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        this.currentTab = tabName;
        
        // Trigger tab-specific initialization
        this.onTabChange(tabName);
    }

    onTabChange(tabName) {
        switch(tabName) {
            case 'realtime':
                if (typeof RealTimeManager !== 'undefined') {
                    RealTimeManager.fetchRealTimeData();
                }
                break;
            case 'management':
                if (typeof ManagementManager !== 'undefined') {
                    ManagementManager.loadMetadata();
                }
                break;
            case 'reports':
                if (typeof ReportsManager !== 'undefined') {
                    ReportsManager.loadReports();
                }
                break;
        }
    }

    initializeTime() {
        this.updateTime();
    }

    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        const dateString = now.toLocaleDateString();
        
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = `${dateString} ${timeString}`;
        }
    }

    startTimeUpdate() {
        setInterval(() => {
            this.updateTime();
        }, 1000);
    }

    initializeModal() {
        const modal = document.getElementById('sourceModal');
        const closeBtn = document.getElementById('modalClose');
        const cancelBtn = document.getElementById('modalCancel');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideModal());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideModal());
        }

        // Close modal when clicking outside
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal();
                }
            });
        }
    }

    showModal() {
        const modal = document.getElementById('sourceModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    hideModal() {
        const modal = document.getElementById('sourceModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    updateGlobalStatus() {
        // This will be updated by realtime manager
        const statusDot = document.getElementById('globalStatusDot');
        const statusText = document.getElementById('globalStatusText');
        
        if (statusDot && statusText) {
            // Initial status
            statusDot.classList.remove('connected');
            statusText.textContent = 'Connecting to OBS...';
        }
    }

    setGlobalStatus(connected, message) {
        const statusDot = document.getElementById('globalStatusDot');
        const statusText = document.getElementById('globalStatusText');
        
        if (statusDot && statusText) {
            if (connected) {
                statusDot.classList.add('connected');
                statusText.textContent = message || 'Connected to OBS';
            } else {
                statusDot.classList.remove('connected');
                statusText.textContent = message || 'Disconnected from OBS';
            }
        }
    }
}

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Application error:', e.error);
    Utils.showToast('An error occurred', 'error');
});

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.dashboard = new OBSDashboard();
    
    // Global refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            if (typeof RealTimeManager !== 'undefined') {
                RealTimeManager.fetchRealTimeData();
            }
            Utils.showToast('Data refreshed');
        });
    }
});