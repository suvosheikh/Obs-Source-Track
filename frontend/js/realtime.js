// Real-time monitoring functionality - Fixed Version
class RealTimeManager {
    static data = [];
    static activeSources = [];
    static ws = null;

    static init() {
        console.log('🔧 Initializing RealTimeManager...');
        this.connectWebSocket();
        this.startPolling();
        this.setupEventListeners();
    }

    static connectWebSocket() {
        try {
            this.ws = new WebSocket('ws://localhost:8080');
            
            this.ws.onopen = () => {
                console.log('✅ Connected to backend WebSocket');
                if (window.dashboard) {
                    window.dashboard.setGlobalStatus(true, 'Connected to OBS');
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'source_updated' || data.type === 'initial_data') {
                        this.data = data.data || [];
                        this.activeSources = data.activeSources || [];
                        this.updateUI();
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('🔌 Disconnected from backend WebSocket');
                if (window.dashboard) {
                    window.dashboard.setGlobalStatus(false, 'Disconnected from OBS');
                }
                setTimeout(() => this.connectWebSocket(), 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (window.dashboard) {
                    window.dashboard.setGlobalStatus(false, 'Connection error');
                }
            };

        } catch (error) {
            console.error('WebSocket connection error:', error);
        }
    }

    static startPolling() {
        // Poll every 3 seconds as backup
        setInterval(() => {
            this.fetchRealTimeData();
        }, 3000);
        
        this.fetchRealTimeData();
    }

    static setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.fetchRealTimeData();
                Utils.showToast('Data refreshed');
            });
        }
    }

    static async fetchRealTimeData() {
        try {
            // Use single API call to avoid multiple requests
            const sourcesResponse = await fetch('http://localhost:3000/api/sources');
            
            if (!sourcesResponse.ok) {
                throw new Error(`HTTP error! status: ${sourcesResponse.status}`);
            }
            
            this.data = await sourcesResponse.json();
            
            // Get active sources separately
            try {
                const activeResponse = await fetch('http://localhost:3000/api/active');
                if (activeResponse.ok) {
                    const activeData = await activeResponse.json();
                    this.activeSources = activeData.activeSources || [];
                }
            } catch (activeError) {
                console.log('Active sources API not available, using empty array');
                this.activeSources = [];
            }
            
            this.updateUI();
        } catch (error) {
            console.error('Error fetching real-time data:', error);
            // Don't show error toast for temporary connection issues
        }
    }

    static updateUI() {
        this.updateStats();
        this.updateTable();
        this.updateLastUpdate();
    }

    static updateStats() {
        // Update stat cards
        const totalEl = document.getElementById('totalSources');
        const activeEl = document.getElementById('activeSources');
        const showsEl = document.getElementById('totalShows');
        const durationEl = document.getElementById('totalDuration');
        
        if (totalEl) totalEl.textContent = this.data.length;
        if (activeEl) activeEl.textContent = this.activeSources.length;
        
        if (showsEl || durationEl) {
            const totalShows = this.data.reduce((sum, source) => sum + (source.visible_count || 0), 0);
            const totalDuration = this.data.reduce((sum, source) => sum + (source.total_duration || 0), 0);
            
            if (showsEl) showsEl.textContent = Utils.formatNumber(totalShows);
            if (durationEl) durationEl.textContent = Utils.formatDuration(totalDuration);
        }
    }

    static updateTable() {
        const tbody = document.getElementById('realtimeBody');
        
        if (!this.data || this.data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <span class="material-icons">info</span>
                        <p>No sources detected. Start your OBS stream and add sources.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.data.map(source => {
            const isActive = this.activeSources.includes(source.source_name);
            const currentSession = this.getCurrentSessionDisplay(source.source_name);
            const displayName = source.title || source.source_name;
            
            return `
                <tr class="${isActive ? 'active-source' : ''}">
                    <td>
                        <div class="source-name">
                            <strong>${Utils.escapeHtml(displayName)}</strong>
                            ${source.category ? `
                                <span class="category-badge" style="background-color: #66666622; color: #666666">
                                    ${Utils.escapeHtml(source.category)}
                                </span>
                            ` : ''}
                            ${isActive ? '<span class="live-badge">LIVE</span>' : ''}
                        </div>
                        ${source.source_name !== displayName ? 
                          `<small class="text-muted">${Utils.escapeHtml(source.source_name)}</small>` : ''}
                    </td>
                    <td>
                        <div class="connection-status ${isActive ? 'connected' : 'disconnected'}">
                            <span class="material-icons">${isActive ? 'check_circle' : 'radio_button_unchecked'}</span>
                            ${isActive ? 'Active' : 'Inactive'}
                        </div>
                    </td>
                    <td>${currentSession}</td>
                    <td><span class="count-badge">${source.visible_count || 0}</span></td>
                    <td>${Utils.formatTime(source.last_visible_at)}</td>
                </tr>
            `;
        }).join('');
    }

    static getCurrentSessionDisplay(sourceName) {
        if (this.activeSources.includes(sourceName)) {
            return `<span class="session-duration">Active Now</span>`;
        }
        
        // Check if recently active (within 2 minutes)
        const source = this.data.find(s => s.source_name === sourceName);
        if (source && source.last_visible_at) {
            const lastActive = new Date(source.last_visible_at).getTime();
            const now = Date.now();
            if (now - lastActive < 120000) { // 2 minutes
                return `<span class="session-status">Recently Active</span>`;
            }
        }
        
        return `<span class="session-status">Not Active</span>`;
    }

    static updateLastUpdate() {
        const el = document.getElementById('lastUpdateTime');
        if (el) {
            el.textContent = new Date().toLocaleTimeString();
        }
    }
}