// Source Management functionality - Complete Version
class ManagementManager {
    static init() {
        console.log('🔧 Initializing ManagementManager...');
        this.setupEventListeners();
        this.loadMetadata();
    }

    static setupEventListeners() {
        const addBtn = document.getElementById('addSourceBtn');
        const saveBtn = document.getElementById('modalSave');
        const cancelBtn = document.getElementById('modalCancel');
        const closeBtn = document.getElementById('modalClose');

        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddModal());
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveMetadata();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideModal();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideModal();
            });
        }
    }

    static async loadMetadata() {
        try {
            console.log('📥 Loading metadata...');
            const response = await fetch('http://localhost:3000/api/metadata');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const metadata = await response.json();
            console.log('✅ Metadata loaded:', metadata);
            this.updateMetadataTable(metadata);
        } catch (error) {
            console.error('❌ Error loading metadata:', error);
            this.showToast('Error loading source metadata: ' + error.message, 'error');
        }
    }

    static updateMetadataTable(metadata) {
        const tbody = document.getElementById('metadataBody');
        
        if (!tbody) {
            console.error('❌ metadataBody element not found');
            return;
        }

        if (!metadata || metadata.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <span class="material-icons">category</span>
                        <p>No source metadata added yet.</p>
                        <small class="text-muted">Click "Add Source" to get started</small>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = metadata.map(item => {
            return `
                <tr>
                    <td>
                        <div class="source-name">
                            <strong>${this.escapeHtml(item.source_name)}</strong>
                        </div>
                    </td>
                    <td>${this.escapeHtml(item.title || '-')}</td>
                    <td>
                        ${item.category ? `
                            <span class="category-badge">
                                ${this.escapeHtml(item.category)}
                            </span>
                        ` : '-'}
                    </td>
                    <td>${this.escapeHtml(item.brand || '-')}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit" onclick="ManagementManager.editMetadata('${this.escapeHtml(item.source_name)}')" 
                                    title="Edit ${this.escapeHtml(item.source_name)}">
                                <span class="material-icons">edit</span>
                            </button>
                            <button class="action-btn delete" onclick="ManagementManager.deleteMetadata('${this.escapeHtml(item.source_name)}')" 
                                    title="Delete ${this.escapeHtml(item.source_name)}">
                                <span class="material-icons">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        console.log('✅ Metadata table updated with', metadata.length, 'items');
    }

    static async showAddModal(editMode = false, sourceData = null) {
        console.log('🔄 Showing modal, editMode:', editMode);
        
        try {
            // Load available sources from today's tracking data
            const response = await fetch('http://localhost:3000/api/sources');
            const sources = await response.json();
            
            const sourceSelect = document.getElementById('sourceName');
            const modalTitle = document.querySelector('#sourceModal .modal-header h3');
            const saveBtn = document.getElementById('modalSave');
            
            if (!sourceSelect || !modalTitle || !saveBtn) {
                console.error('❌ Modal elements not found');
                return;
            }

            if (editMode && sourceData) {
                // Edit mode
                console.log('✏️ Edit mode for:', sourceData);
                modalTitle.textContent = 'Edit Source Metadata';
                saveBtn.textContent = 'Update';
                saveBtn.setAttribute('data-edit-mode', 'true');
                saveBtn.setAttribute('data-source-name', sourceData.source_name);
                
                // Populate form with existing data
                document.getElementById('sourceName').value = sourceData.source_name;
                document.getElementById('sourceTitle').value = sourceData.title || '';
                document.getElementById('sourceCategory').value = sourceData.category || '';
                document.getElementById('sourceBrand').value = sourceData.brand || '';
                
                // Disable source name selection in edit mode
                sourceSelect.disabled = true;
                sourceSelect.innerHTML = `<option value="${this.escapeHtml(sourceData.source_name)}">${this.escapeHtml(sourceData.source_name)}</option>`;
            } else {
                // Add mode
                console.log('➕ Add mode');
                modalTitle.textContent = 'Add Source Metadata';
                saveBtn.textContent = 'Save';
                saveBtn.removeAttribute('data-edit-mode');
                saveBtn.removeAttribute('data-source-name');
                
                // Reset form
                const form = document.getElementById('sourceForm');
                if (form) form.reset();
                
                sourceSelect.disabled = false;
                
                // Populate source dropdown with sources that don't have metadata yet
                const existingMetadata = await this.getExistingMetadata();
                const uniqueSources = [...new Set(sources.map(s => s.source_name))];
                const availableSources = uniqueSources.filter(source => !existingMetadata.includes(source));
                
                console.log('📋 Available sources:', availableSources);
                
                sourceSelect.innerHTML = '<option value="">Select a source</option>';
                availableSources.forEach(sourceName => {
                    const option = document.createElement('option');
                    option.value = sourceName;
                    option.textContent = sourceName;
                    sourceSelect.appendChild(option);
                });

                // If no sources available, show message
                if (availableSources.length === 0) {
                    sourceSelect.innerHTML = '<option value="">All sources already have metadata</option>';
                    sourceSelect.disabled = true;
                }
            }
            
        } catch (error) {
            console.error('❌ Error loading sources:', error);
            this.showToast('Error loading sources: ' + error.message, 'error');
            return;
        }

        this.showModal();
    }

    static async getExistingMetadata() {
        try {
            const response = await fetch('http://localhost:3000/api/metadata');
            const metadata = await response.json();
            return metadata.map(item => item.source_name);
        } catch (error) {
            console.error('Error fetching existing metadata:', error);
            return [];
        }
    }

    static async saveMetadata() {
        console.log('💾 Saving metadata...');
        
        const saveBtn = document.getElementById('modalSave');
        const isEditMode = saveBtn.getAttribute('data-edit-mode') === 'true';
        const sourceName = isEditMode ? 
            saveBtn.getAttribute('data-source-name') : 
            document.getElementById('sourceName').value;

        const metadata = {
            source_name: sourceName,
            title: document.getElementById('sourceTitle').value,
            category: document.getElementById('sourceCategory').value,
            brand: document.getElementById('sourceBrand').value
        };

        console.log('📦 Metadata to save:', metadata);

        // Validation
        if (!metadata.source_name) {
            this.showToast('Please select a source', 'error');
            return;
        }
        if (!metadata.title) {
            this.showToast('Please enter a display title', 'error');
            return;
        }
        if (!metadata.category) {
            this.showToast('Please enter a category', 'error');
            return;
        }

        try {
            const url = isEditMode ? 
                `http://localhost:3000/api/metadata/${encodeURIComponent(sourceName)}` : 
                'http://localhost:3000/api/metadata';
                
            const method = isEditMode ? 'PUT' : 'POST';

            console.log('🌐 Sending request:', { url, method });

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(metadata)
            });

            console.log('📨 Response status:', response.status);

            let result;
            try {
                result = await response.json();
            } catch (jsonError) {
                console.error('❌ JSON parse error:', jsonError);
                throw new Error('Server returned invalid JSON response');
            }

            if (response.ok) {
                this.showToast(
                    isEditMode ? 'Source metadata updated successfully' : 'Source metadata saved successfully'
                );
                await this.loadMetadata();
                this.hideModal();
            } else {
                throw new Error(result.error || `Server returned ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Error saving metadata:', error);
            this.showToast('Error saving metadata: ' + error.message, 'error');
        }
    }

    static async editMetadata(sourceName) {
        console.log('✏️ Editing metadata for:', sourceName);
        
        try {
            const response = await fetch('http://localhost:3000/api/metadata');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const allMetadata = await response.json();
            const sourceData = allMetadata.find(item => item.source_name === sourceName);
            
            if (sourceData) {
                this.showAddModal(true, sourceData);
            } else {
                this.showToast('Source metadata not found', 'error');
            }
        } catch (error) {
            console.error('❌ Error loading source data:', error);
            this.showToast('Error loading source data: ' + error.message, 'error');
        }
    }

    static async deleteMetadata(sourceName) {
        console.log('🗑️ Deleting metadata for:', sourceName);
        
        if (!confirm(`Are you sure you want to delete metadata for "${sourceName}"? This will remove the display title, category, and brand information.`)) {
            return;
        }

        try {
            const response = await fetch(`http://localhost:3000/api/metadata/${encodeURIComponent(sourceName)}`, {
                method: 'DELETE'
            });

            console.log('📨 Delete response status:', response.status);

            let result;
            try {
                result = await response.json();
            } catch (jsonError) {
                console.error('❌ JSON parse error:', jsonError);
                throw new Error('Server returned invalid JSON response');
            }

            if (response.ok) {
                this.showToast('Source metadata deleted successfully');
                await this.loadMetadata();
            } else {
                throw new Error(result.error || `Server returned ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Error deleting metadata:', error);
            this.showToast('Error deleting metadata: ' + error.message, 'error');
        }
    }

    // Quick edit from realtime table
    static quickEdit(sourceName, currentTitle = '') {
        console.log('⚡ Quick edit for:', sourceName);
        
        // Check if metadata already exists
        this.getExistingMetadata().then(existingMetadata => {
            if (existingMetadata.includes(sourceName)) {
                // Edit existing metadata
                this.editMetadata(sourceName);
            } else {
                // Create new metadata with suggested title
                const metadata = {
                    source_name: sourceName,
                    title: currentTitle || sourceName,
                    category: '',
                    brand: ''
                };
                this.showAddModal(false, metadata);
                
                // Auto-fill the form
                setTimeout(() => {
                    document.getElementById('sourceName').value = sourceName;
                    if (currentTitle && currentTitle !== sourceName) {
                        document.getElementById('sourceTitle').value = currentTitle;
                    }
                }, 100);
            }
        });
    }

    // Bulk actions
    static async bulkDelete() {
        const selectedSources = this.getSelectedSources();
        if (selectedSources.length === 0) {
            this.showToast('Please select sources to delete', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to delete metadata for ${selectedSources.length} sources?`)) {
            return;
        }

        try {
            const deletePromises = selectedSources.map(sourceName => 
                fetch(`http://localhost:3000/api/metadata/${encodeURIComponent(sourceName)}`, {
                    method: 'DELETE'
                })
            );

            const results = await Promise.allSettled(deletePromises);
            const successfulDeletes = results.filter(result => result.status === 'fulfilled' && result.value.ok).length;
            
            this.showToast(`Successfully deleted ${successfulDeletes} metadata entries`);
            await this.loadMetadata();
        } catch (error) {
            console.error('❌ Error in bulk delete:', error);
            this.showToast('Error during bulk delete', 'error');
        }
    }

    static getSelectedSources() {
        // Implementation for checkbox selection
        const checkboxes = document.querySelectorAll('.source-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    // Modal controls
    static showModal() {
        const modal = document.getElementById('sourceModal');
        if (modal) {
            modal.classList.add('active');
            // Focus on first input
            setTimeout(() => {
                const firstInput = modal.querySelector('input, select');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    }

    static hideModal() {
        const modal = document.getElementById('sourceModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // Utility functions
    static escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    static showToast(message, type = 'success') {
        if (typeof Utils !== 'undefined' && Utils.showToast) {
            Utils.showToast(message, type);
        } else {
            // Fallback toast
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
        }
    }

    // Auto-cleanup: Remove metadata for sources that don't exist in current tracking
    static async cleanupOrphanedMetadata() {
        try {
            const [metadataResponse, sourcesResponse] = await Promise.all([
                fetch('http://localhost:3000/api/metadata'),
                fetch('http://localhost:3000/api/sources')
            ]);

            const metadata = await metadataResponse.json();
            const sources = await sourcesResponse.json();

            const currentSources = [...new Set(sources.map(s => s.source_name))];
            const orphanedMetadata = metadata.filter(item => !currentSources.includes(item.source_name));

            if (orphanedMetadata.length > 0) {
                console.log(`🧹 Found ${orphanedMetadata.length} orphaned metadata entries`);
                
                const deletePromises = orphanedMetadata.map(item =>
                    fetch(`http://localhost:3000/api/metadata/${encodeURIComponent(item.source_name)}`, {
                        method: 'DELETE'
                    })
                );

                await Promise.all(deletePromises);
                console.log('✅ Orphaned metadata cleaned up');
                await this.loadMetadata();
            }
        } catch (error) {
            console.error('❌ Error cleaning orphaned metadata:', error);
        }
    }
}

// Auto cleanup on page load
document.addEventListener('DOMContentLoaded', () => {
    // Run cleanup after a delay
    setTimeout(() => {
        if (typeof ManagementManager !== 'undefined') {
            ManagementManager.cleanupOrphanedMetadata();
        }
    }, 15000); // 15 seconds after page load
});