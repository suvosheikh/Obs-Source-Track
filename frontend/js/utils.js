// Utility functions
const Utils = {
    formatDuration(seconds) {
        if (!seconds || seconds < 0) return '0s';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
        } else {
            return `${secs}s`;
        }
    },

    formatTime(timestamp) {
        if (!timestamp) return 'Never';
        try {
            return new Date(timestamp).toLocaleTimeString();
        } catch (error) {
            return 'Invalid time';
        }
    },

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        try {
            return new Date(dateString + 'T00:00:00').toLocaleDateString();
        } catch (error) {
            return 'Invalid date';
        }
    },

    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    },

    formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    },

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    showToast(message, type = 'success') {
        try {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `
                <span class="material-icons">${type === 'success' ? 'check_circle' : 'error'}</span>
                <span>${message}</span>
            `;
            
            document.body.appendChild(toast);
            
            setTimeout(() => toast.classList.add('show'), 100);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        } catch (error) {
            console.error('Toast error:', error);
            alert(message);
        }
    }
};