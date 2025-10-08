// Server Selector Management

class ServerSelector {
    constructor() {
        this.isOpen = false;
        this.currentUrl = '';
        this.isDisabled = false;
        
        this.initializeElements();
        if (!this.elements.indicator || !this.elements.btn || !this.elements.dropdown) {
            console.warn('Server selector UI not found; feature disabled.');
            this.isDisabled = true;
            return;
        }

        this.setupEventListeners();
        this.updateStatus();
    }
    
    initializeElements() {
        this.elements = {
            indicator: document.getElementById('server-indicator'),
            dot: document.getElementById('server-dot'),
            text: document.getElementById('server-text'),
            btn: document.getElementById('server-btn'),
            dropdown: document.getElementById('server-dropdown'),
            closeBtn: document.getElementById('close-dropdown'),
            customInput: document.getElementById('custom-server'),
            presetBtns: document.querySelectorAll('.preset-btn'),
            testBtn: document.getElementById('test-connection'),
            saveBtn: document.getElementById('save-server'),
            statusText: document.getElementById('connection-status-text')
        };
    }
    
    setupEventListeners() {
        if (this.isDisabled) return;
        // Toggle dropdown
        this.elements.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });
        
        this.elements.indicator.addEventListener('click', (e) => {
            if (e.target !== this.elements.btn) {
                this.toggleDropdown();
            }
        });
        
        // Close dropdown
        this.elements.closeBtn.addEventListener('click', () => {
            this.closeDropdown();
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.elements.dropdown.contains(e.target) && !this.elements.indicator.contains(e.target)) {
                this.closeDropdown();
            }
        });
        
        // Preset buttons
        this.elements.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                this.elements.customInput.value = url;
                this.highlightPreset(btn);
            });
        });
        
        // Test connection
        this.elements.testBtn.addEventListener('click', () => {
            this.testConnection();
        });
        
        // Save and connect
        this.elements.saveBtn.addEventListener('click', () => {
            this.saveAndConnect();
        });
        
        // Enter key on input
        this.elements.customInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveAndConnect();
            }
        });
        
        // Listen to socket manager events
        if (window.socketManager) {
            window.socketManager.on('connection_status', (data) => {
                this.updateConnectionStatus(data.connected);
            });
        }
    }
    
    toggleDropdown() {
        if (this.isDisabled) return;
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }
    
    openDropdown() {
        if (this.isDisabled) return;
        this.isOpen = true;
        this.elements.dropdown.classList.remove('hidden');
        
        // Load current URL
        if (window.socketManager) {
            this.elements.customInput.value = window.socketManager.currentServerUrl || '';
            this.highlightCurrentPreset();
        }
        
        // Focus input
        setTimeout(() => {
            this.elements.customInput.focus();
        }, 100);
    }
    
    closeDropdown() {
        if (this.isDisabled) return;
        this.isOpen = false;
        this.elements.dropdown.classList.add('hidden');
        this.clearHighlights();
    }
    
    highlightPreset(btn) {
        if (this.isDisabled) return;
        this.clearHighlights();
        btn.style.background = 'rgba(229, 62, 62, 0.3)';
        btn.style.borderColor = '#e53e3e';
        btn.style.color = 'white';
    }
    
    highlightCurrentPreset() {
        if (this.isDisabled) return;
        const currentUrl = this.elements.customInput.value;
        this.elements.presetBtns.forEach(btn => {
            if (btn.dataset.url === currentUrl) {
                this.highlightPreset(btn);
            }
        });
    }
    
    clearHighlights() {
        if (this.isDisabled) return;
        this.elements.presetBtns.forEach(btn => {
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        });
    }
    
    async testConnection() {
        if (this.isDisabled) return;
        const url = this.elements.customInput.value.trim();
        
        if (!url) {
            this.showNotification('Digite uma URL do servidor', 'error');
            return;
        }
        
        if (!this.isValidUrl(url)) {
            this.showNotification('URL inválida', 'error');
            return;
        }
        
        // Update UI
        this.elements.testBtn.disabled = true;
        this.elements.testBtn.textContent = 'Testando...';
        this.updateTestStatus('testing', 'Testando conexão...');
        
        try {
            const isConnected = await window.socketManager.testConnection(url);
            
            if (isConnected) {
                this.updateTestStatus('connected', 'Conexão bem-sucedida!');
                this.showNotification('Servidor está online!', 'success');
            } else {
                this.updateTestStatus('disconnected', 'Falha na conexão');
                this.showNotification('Não foi possível conectar ao servidor', 'error');
            }
        } catch (error) {
            this.updateTestStatus('disconnected', 'Erro na conexão');
            this.showNotification('Erro ao testar conexão', 'error');
        }
        
        // Reset button
        this.elements.testBtn.disabled = false;
        this.elements.testBtn.textContent = 'Testar Conexão';
    }
    
    saveAndConnect() {
        if (this.isDisabled) return;
        const url = this.elements.customInput.value.trim();
        
        if (!url) {
            this.showNotification('Digite uma URL do servidor', 'error');
            return;
        }
        
        if (!this.isValidUrl(url)) {
            this.showNotification('URL inválida', 'error');
            return;
        }
        
        try {
            // Update socket manager
            window.socketManager.setServerUrl(url);
            
            this.currentUrl = url;
            this.showNotification('Servidor configurado! Conectando...', 'success');
            this.closeDropdown();
            this.updateStatus();
            
        } catch (error) {
            this.showNotification('Erro ao salvar configuração', 'error');
        }
    }
    
    updateConnectionStatus(connected) {
        if (this.isDisabled) return;
        this.elements.indicator.className = connected ? 
            'server-indicator connected' : 
            'server-indicator disconnected';
        
        this.elements.text.textContent = connected ? 'Conectado' : 'Desconectado';
    }
    
    updateTestStatus(status, message) {
        if (this.isDisabled) return;
        this.elements.statusText.className = `connection-status ${status}`;
        this.elements.statusText.querySelector('.status-text').textContent = message;
    }
    
    updateStatus() {
        if (this.isDisabled) return;
        if (window.socketManager) {
            const status = window.socketManager.getConnectionStatus();
            this.updateConnectionStatus(status.connected);
            this.currentUrl = window.socketManager.currentServerUrl || '';
        }
    }
    
    isValidUrl(url) {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        } catch {
            return false;
        }
    }
    
    showNotification(message, type = 'info') {
        // Usar o sistema de notificações existente se disponível
        if (window.uiManager && window.uiManager.showNotification) {
            window.uiManager.showNotification(message, type);
        } else {
            // Fallback para console
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
    
    // Public methods
    getCurrentServerUrl() {
        return this.currentUrl;
    }
    
    setServerUrl(url) {
        if (this.isDisabled) return;
        this.elements.customInput.value = url;
        this.saveAndConnect();
    }
    
    // Preset URLs for quick access
    getPresetUrls() {
        return {
            localhost: 'http://localhost:3001',
            cloudflare: 'https://elected-design-jets-repair.trycloudflare.com',
            railway: 'https://crash-rocket-server.railway.app'
        };
    }
}

// Initialize when DOM is ready
let serverSelector;

document.addEventListener('DOMContentLoaded', () => {
    serverSelector = new ServerSelector();
    
    // Make it globally available
    window.serverSelector = serverSelector;
    
    // Update status when socket manager is ready
    const checkSocketManager = () => {
        if (serverSelector.isDisabled) {
            return;
        }
        if (window.socketManager) {
            serverSelector.setupEventListeners();
            serverSelector.updateStatus();
        } else {
            setTimeout(checkSocketManager, 100);
        }
    };
    
    checkSocketManager();
});

// Export for use in other modules
window.ServerSelector = ServerSelector;
