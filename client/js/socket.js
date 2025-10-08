// Socket.IO client connection and event handling

const DEFAULT_TUNNEL_URL = 'https://inf-abraham-query-artistic.trycloudflare.com';

class SocketManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.currentServerUrl = '';
        
        this.eventCallbacks = new Map();
        
        // Carregar URL do servidor salva ou usar padrão
        this.loadServerUrl();
        
        // Debug automático
        console.log('🎯 SocketManager inicializado');
        console.log('📡 URL do servidor:', this.currentServerUrl);
        console.log('🔌 Conectando automaticamente...');
        
        // Conectar automaticamente
        setTimeout(() => {
            this.connect();
        }, 1000);
    }
    
    loadServerUrl() {
        // Tentar carregar URL salva no localStorage
        let savedUrl = null;

        try {
            savedUrl = localStorage.getItem('crash-rocket-server-url');
        } catch (error) {
            console.warn('⚠️ Não foi possível acessar o localStorage:', error);
        }

        if (savedUrl && this.isValidUrl(savedUrl)) {
            if (this.isDeprecatedTunnelUrl(savedUrl)) {
                console.log('♻️ Atualizando URL do túnel salva para o novo endereço padrão.');
                this.persistServerUrl(DEFAULT_TUNNEL_URL);
                this.currentServerUrl = DEFAULT_TUNNEL_URL;
            } else {
                this.currentServerUrl = savedUrl;
            }
        } else {
            this.currentServerUrl = this.resolveDefaultUrl();
            this.persistServerUrl(this.currentServerUrl);
        }

        console.log('🔌 URL do servidor carregada:', this.currentServerUrl);
        this.connect();
    }
    
    setServerUrl(url) {
        // Validar URL
        if (!url || !this.isValidUrl(url)) {
            throw new Error('URL inválida');
        }
        
        this.currentServerUrl = url;
        this.persistServerUrl(url);
        
        // Reconectar com nova URL
        this.disconnect();
        this.connect();
    }
    
    isValidUrl(url) {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        } catch {
            return false;
        }
    }
    
    resolveDefaultUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return DEFAULT_TUNNEL_URL;
        }
        return DEFAULT_TUNNEL_URL;
    }

    isDeprecatedTunnelUrl(url) {
        if (!url) {
            return false;
        }
        const normalized = url.trim().toLowerCase();
        if (!normalized.includes('trycloudflare.com')) {
            return false;
        }
        return normalized !== DEFAULT_TUNNEL_URL.toLowerCase();
    }

    persistServerUrl(url) {
        try {
            localStorage.setItem('crash-rocket-server-url', url);
        } catch (error) {
            console.warn('⚠️ Não foi possível salvar a URL do servidor no localStorage:', error);
        }
    }

    async testConnection(url) {
        return new Promise((resolve) => {
            const testSocket = io(url, {
                transports: ['websocket', 'polling'],
                timeout: 5000,
                forceNew: true
            });
            
            const timeout = setTimeout(() => {
                testSocket.disconnect();
                resolve(false);
            }, 5000);
            
            testSocket.on('connect', () => {
                clearTimeout(timeout);
                testSocket.disconnect();
                resolve(true);
            });
            
            testSocket.on('connect_error', () => {
                clearTimeout(timeout);
                testSocket.disconnect();
                resolve(false);
            });
        });
    }
    
    connect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        console.log('🚀 Conectando ao servidor:', this.currentServerUrl);
        
        this.socket = io(this.currentServerUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay,
            timeout: 20000,
            forceNew: true
        });
        
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        this.socket.on('connect', () => {
            console.log('✅ CONECTADO AO SERVIDOR!');
            console.log('📡 Socket ID:', this.socket.id);
            console.log('🌐 URL:', this.currentServerUrl);
            console.log('🎮 Transport:', this.socket.io.engine.transport.name);
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connection_status', { connected: true });
            
            // Update UI
            this.updateConnectionIndicator(true);
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('❌ Desconectado do servidor:', reason);
            this.isConnected = false;
            this.emit('connection_status', { connected: false, reason });
            
            // Update UI
            this.updateConnectionIndicator(false);
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('❌ ERRO DE CONEXÃO CRÍTICO:', error);
            console.log('🔄 URL que falhou:', this.currentServerUrl);
            console.log('🔧 Tentativa:', this.reconnectAttempts + 1);
            
            this.reconnectAttempts++;
            
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('🚨 FALHA TOTAL - Esgotadas as tentativas!');
                this.emit('connection_error', { 
                    error: 'Falha ao conectar após várias tentativas',
                    attempts: this.reconnectAttempts 
                });
            }
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔄 Reconectado após', attemptNumber, 'tentativas');
            this.emit('reconnected', { attempts: attemptNumber });
        });
        
        // Game events
        this.socket.on('game_state', (data) => {
            this.emit('game_state', data);
        });
        
        this.socket.on('player_joined', (data) => {
            this.emit('player_joined', data);
        });
        
        this.socket.on('player_left', (data) => {
            this.emit('player_left', data);
        });
        
        this.socket.on('player_bet', (data) => {
            this.emit('player_bet', data);
        });
        
        this.socket.on('player_cashed_out', (data) => {
            this.emit('player_cashed_out', data);
        });
        
        this.socket.on('game_history', (data) => {
            this.emit('game_history', data);
        });
        
        // Server confirms bet
        this.socket.on('bet_placed', (data) => {
            this.emit('bet_placed', data);
        });

        this.socket.on('leaderboard_update', (data) => {
            this.emit('leaderboard_update', data);
        });

        this.socket.on('leaderboard_rank', (data) => {
            this.emit('leaderboard_rank', data);
        });

        this.socket.on('error', (data) => {
            console.error('🚨 Erro do servidor:', data);
            this.emit('server_error', data);
        });
    }
    
    // Event emitter methods
    on(event, callback) {
        if (!this.eventCallbacks.has(event)) {
            this.eventCallbacks.set(event, []);
        }
        this.eventCallbacks.get(event).push(callback);
    }
    
    off(event, callback) {
        if (this.eventCallbacks.has(event)) {
            const callbacks = this.eventCallbacks.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.eventCallbacks.has(event)) {
            this.eventCallbacks.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Erro no callback do evento', event, ':', error);
                }
            });
        }
    }
    
    // Socket.IO specific methods
    send(event, data) {
        if (this.isConnected && this.socket) {
            this.socket.emit(event, data);
        } else {
            console.warn('⚠️ Tentativa de envio sem conexão:', event);
        }
    }
    
    // Game specific methods
    placeBet(amount, autoCashOut = null) {
        this.send('place_bet', {
            amount: amount,
            autoCashOut: autoCashOut,
            timestamp: Date.now()
        });
    }
    
    cashOut() {
        this.send('cash_out', {
            timestamp: Date.now()
        });
    }
    
    joinGame(playerName = null) {
        try {
            // Usa o nome salvo no localStorage se existir
            const saved = localStorage.getItem('crash-rocket-player-name');
            if (!playerName && saved) {
                playerName = saved;
            }
        } catch {}
        this.send('join_game', {
            playerName: playerName || this.generatePlayerName(),
            timestamp: Date.now()
        });
    }
    
    generatePlayerName() {
        const adjectives = ['Rápido', 'Sortudo', 'Corajoso', 'Esperto', 'Audaz'];
        const nouns = ['Piloto', 'Astronauta', 'Foguete', 'Explorador', 'Aventureiro'];
        
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 999) + 1;
        
        return `${adj}${noun}${number}`;
    }

    resolveAdminBaseUrl() {
        let base = (this.currentServerUrl || '').trim();
        if (!base || base.includes('vercel.app')) {
            base = DEFAULT_TUNNEL_URL;
        }

        if (!this.isValidUrl(base)) {
            throw new Error('URL do servidor inválida para o comando admin');
        }

        return base.replace(/\/$/, '');
    }

    async forceCrash(token = null, reason = 'manual_override') {
        const baseUrl = this.resolveAdminBaseUrl();
        const targetUrl = `${baseUrl}/admin/force-crash`;
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['X-Admin-Token'] = token;
        }

        const payload = token ? { token, reason } : { reason };

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            const message = errorPayload?.error || `Falha ao forçar crash (${response.status})`;
            throw new Error(message);
        }

        return response.json();
    }
    
    // Connection management
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.updateConnectionIndicator(false);
    }
    
    reconnect() {
        if (this.socket) {
            this.socket.connect();
        }
    }
    
    updateConnectionIndicator(connected) {
        // Update server selector indicator
        if (window.serverSelector) {
            window.serverSelector.updateConnectionStatus(connected);
        }
        
        // Update any other connection indicators
        const indicators = document.querySelectorAll('.connection-indicator, .server-indicator');
        indicators.forEach(indicator => {
            if (connected) {
                indicator.classList.remove('disconnected');
                indicator.classList.add('connected');
            } else {
                indicator.classList.remove('connected');
                indicator.classList.add('disconnected');
            }
        });
    }
    
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            socketId: this.socket?.id || null,
            transport: this.socket?.io?.engine?.transport?.name || null,
            serverUrl: this.currentServerUrl
        };
    }
    
    // Método de debug para forçar conexão
    forceConnect() {
        console.log('🔧 FORÇANDO CONEXÃO...');
        this.disconnect();
        setTimeout(() => {
            this.connect();
        }, 1000);
    }
    
    // Teste de conectividade simples
    async testServerConnection() {
        console.log('🧪 Testando conectividade do servidor...');
        try {
            const response = await fetch(this.currentServerUrl + '/health');
            const data = await response.json();
            console.log('✅ Servidor respondeu:', data);
            return true;
        } catch (error) {
            console.error('❌ Servidor não responde:', error);
            return false;
        }
    }
}

// Game state constants matching server
const GAME_STATES = {
    WAITING: 'waiting',
    STARTING: 'starting',
    FLYING: 'flying',
    CRASHED: 'crashed'
};

// Initialize socket manager
let socketManager;

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', () => {
    socketManager = new SocketManager();
    
    // Make it globally available
    window.socketManager = socketManager;
    window.GAME_STATES = GAME_STATES;
    
    // Auto-join game when connected
    socketManager.on('connection_status', (data) => {
        if (data.connected) {
            setTimeout(() => {
                socketManager.joinGame();
            }, 500);
        }
    });
});

// Connection status indicator
class ConnectionIndicator {
    constructor() {
        this.indicator = this.createIndicator();
        this.setupEventListeners();
    }
    
    createIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'connection-indicator';
        indicator.innerHTML = `
            <div class="connection-dot"></div>
            <span class="connection-text">Conectando...</span>
        `;
        
        // Add CSS styles
        const style = document.createElement('style');
        style.textContent = `
            .connection-indicator {
                position: fixed;
                top: 10px;
                right: 10px;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 20px;
                font-size: 0.8rem;
                z-index: 1000;
                transition: all 0.3s ease;
            }
            
            .connection-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ffc107;
                animation: pulse 1.5s infinite;
            }
            
            .connection-indicator.connected .connection-dot {
                background: #28a745;
                animation: none;
            }
            
            .connection-indicator.disconnected .connection-dot {
                background: #dc3545;
                animation: pulse 1s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(indicator);
        
        return indicator;
    }
    
    setupEventListeners() {
        if (window.socketManager) {
            window.socketManager.on('connection_status', (data) => {
                this.updateStatus(data.connected);
            });
        }
    }
    
    updateStatus(connected) {
        const dot = this.indicator.querySelector('.connection-dot');
        const text = this.indicator.querySelector('.connection-text');
        
        if (connected) {
            this.indicator.className = 'connection-indicator connected';
            text.textContent = 'Online';
        } else {
            this.indicator.className = 'connection-indicator disconnected';
            text.textContent = 'Desconectado';
        }
    }
}

// Initialize connection indicator when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ConnectionIndicator();
});
