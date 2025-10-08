const ADMIN_PASSWORD = 'henrique12';
const STORAGE_KEY = 'crash-rocket-admin-token';
const WAIT_FOR_SOCKET_TIMEOUT = 5000;
const BOT_CONFIG_DEFAULTS = {
    maxBots: 200,
    bet: { min: 10, max: 50 },
    auto: { min: 1.8, max: 3.5 },
    betDelay: { min: 200, max: 1000 }
};

const html = {
    authForm: document.getElementById('auth-form'),
    passwordInput: document.getElementById('password-input'),
    errorMessage: document.getElementById('auth-error'),
    adminSection: document.getElementById('admin-section'),
    statusMessage: document.getElementById('status-message'),
    connectionStatus: document.getElementById('connection-status'),
    serverUrl: document.getElementById('server-url'),
    socketId: document.getElementById('socket-id'),
    forceCrashBtn: document.getElementById('force-crash-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    lastResult: document.getElementById('last-result'),
    botCountInput: document.getElementById('bot-count'),
    botBetMinInput: document.getElementById('bot-bet-min'),
    botBetMaxInput: document.getElementById('bot-bet-max'),
    botAutoMinInput: document.getElementById('bot-auto-min'),
    botAutoMaxInput: document.getElementById('bot-auto-max'),
    startBotsBtn: document.getElementById('start-bots-btn'),
    stopBotsBtn: document.getElementById('stop-bots-btn'),
    botsStatus: document.getElementById('bots-status')
};

let connectionStatusListener = null;
let reconnectListener = null;
let botController = null;

class BotClient {
    constructor(id, controller) {
        this.id = id;
        this.controller = controller;
        this.name = `Bot_${String(id).padStart(3, '0')}`;
        this.socket = null;
        this.serverUrl = controller.serverUrl;
        this.connected = false;
        this.isBetPlaced = false;
        this.betTimeout = null;
    }

    connect() {
        if (!this.serverUrl) {
            console.warn('Bot sem URL configurada.');
            return;
        }

        this.cleanupSocket();

        this.socket = io(this.serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            timeout: 20000,
            forceNew: true
        });

        this.setupListeners();
    }

    setupListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            this.connected = true;
            this.isBetPlaced = false;
            this.controller.notifyStatus();
            this.joinGame();
        });

        this.socket.on('disconnect', () => {
            this.connected = false;
            this.clearTimers();
            this.controller.notifyStatus();
        });

        this.socket.on('connect_error', (error) => {
            console.debug(`Bot ${this.name} falhou ao conectar:`, error?.message || error);
        });

        this.socket.on('game_state', (data) => {
            this.handleGameState(data);
        });

        this.socket.on('bet_placed', (data) => {
            if (data && data.success) {
                this.isBetPlaced = true;
            } else {
                this.isBetPlaced = false;
            }
        });
    }

    joinGame() {
        if (!this.socket?.connected) return;
        this.socket.emit('join_game', {
            playerName: this.name,
            timestamp: Date.now()
        });
    }

    handleGameState(data) {
        if (!data || !data.state) {
            return;
        }

        switch (data.state) {
            case 'waiting':
                this.isBetPlaced = false;
                this.clearTimers();
                break;
            case 'starting':
                if (!this.isBetPlaced) {
                    this.scheduleBet();
                }
                break;
            default:
                break;
        }
    }

    scheduleBet() {
        this.clearTimers();
        const delay = this.controller.randomDelay();
        this.betTimeout = setTimeout(() => {
            this.placeBet();
        }, delay);
    }

    placeBet() {
        if (!this.socket?.connected || this.isBetPlaced) {
            return;
        }

        const amount = this.controller.randomBetAmount();
        const autoCashOut = this.controller.randomAutoCashOut();

        this.socket.emit('place_bet', {
            amount,
            autoCashOut,
            timestamp: Date.now()
        });

        this.isBetPlaced = true;
    }

    setServerUrl(url) {
        if (!url || url === this.serverUrl) {
            return;
        }
        this.serverUrl = url;
        if (this.socket) {
            this.reconnect();
        }
    }

    reconnect() {
        this.cleanupSocket();
        this.connect();
    }

    clearTimers() {
        if (this.betTimeout) {
            clearTimeout(this.betTimeout);
            this.betTimeout = null;
        }
    }

    cleanupSocket() {
        this.clearTimers();
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
    }

    destroy() {
        this.cleanupSocket();
        this.controller.notifyStatus();
    }
}

class BotController {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || null;
        this.config = {
            maxBots: options.maxBots || BOT_CONFIG_DEFAULTS.maxBots,
            bet: { ...BOT_CONFIG_DEFAULTS.bet },
            auto: { ...BOT_CONFIG_DEFAULTS.auto },
            betDelay: { ...BOT_CONFIG_DEFAULTS.betDelay }
        };
        this.bots = [];
        this.onStatusChange = options.onStatusChange || (() => {});
    }

    setStatusHandler(handler) {
        this.onStatusChange = handler || (() => {});
    }

    notifyStatus() {
        if (typeof this.onStatusChange === 'function') {
            this.onStatusChange(this.getStats());
        }
    }

    getStats() {
        return {
            total: this.bots.length,
            connected: this.bots.filter(bot => bot.connected).length
        };
    }

    setServerUrl(url) {
        if (!url || url === this.serverUrl) {
            return;
        }
        this.serverUrl = url;
        this.bots.forEach(bot => bot.setServerUrl(url));
        this.notifyStatus();
    }

    applySettings(settings = {}) {
        if (settings.betMin != null && settings.betMax != null) {
            const min = Math.max(1, Number(settings.betMin));
            const max = Math.max(min, Number(settings.betMax));
            this.config.bet = { min, max };
        }

        if (settings.autoMin != null && settings.autoMax != null) {
            const min = Math.max(1.01, Number(settings.autoMin));
            const max = Math.max(min + 0.01, Number(settings.autoMax));
            this.config.auto = { min, max };
        }
    }

    async startBots(count, settings = {}) {
        if (!this.serverUrl) {
            throw new Error('URL do servidor não configurada.');
        }

        this.applySettings(settings);

        const target = Math.min(Math.max(1, Math.floor(count)), this.config.maxBots);

        while (this.bots.length < target) {
            const bot = new BotClient(this.bots.length + 1, this);
            bot.setServerUrl(this.serverUrl);
            bot.connect();
            this.bots.push(bot);
        }

        if (this.bots.length > target) {
            const excess = this.bots.splice(target);
            excess.forEach(bot => bot.destroy());
        }

        this.notifyStatus();
    }

    stopBots() {
        this.bots.forEach(bot => bot.destroy());
        this.bots = [];
        this.notifyStatus();
    }

    randomBetAmount() {
        const { min, max } = this.config.bet;
        const value = Math.random() * (max - min) + min;
        return Number(value.toFixed(2));
    }

    randomAutoCashOut() {
        const { min, max } = this.config.auto;
        const value = Math.random() * (max - min) + min;
        return Number(value.toFixed(2));
    }

    randomDelay() {
        const { min, max } = this.config.betDelay;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

function safeLocalStorageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        console.warn('Não foi possível ler do localStorage:', error);
        return null;
    }
}

function safeLocalStorageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        console.warn('Não foi possível gravar no localStorage:', error);
    }
}

function safeLocalStorageRemove(key) {
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        console.warn('Não foi possível remover chave do localStorage:', error);
    }
}

function isAuthenticated() {
    return safeLocalStorageGet(STORAGE_KEY) === ADMIN_PASSWORD;
}

function setAuthenticated(authenticated) {
    if (authenticated) {
        safeLocalStorageSet(STORAGE_KEY, ADMIN_PASSWORD);
    } else {
        safeLocalStorageRemove(STORAGE_KEY);
    }
}

function showElement(element) {
    element?.classList.remove('hidden');
}

function hideElement(element) {
    element?.classList.add('hidden');
}

function setStatusMessage(message, type = 'neutral') {
    if (!html.statusMessage) return;
    html.statusMessage.textContent = message || '';
    html.statusMessage.classList.remove('success', 'error');
    if (type === 'success') {
        html.statusMessage.classList.add('success');
    }
    if (type === 'error') {
        html.statusMessage.classList.add('error');
    }
}

function setLastResult(message, type = 'neutral') {
    if (!html.lastResult) return;
    html.lastResult.textContent = message || '';
    html.lastResult.classList.remove('success', 'error');
    if (type === 'success') {
        html.lastResult.classList.add('success');
    }
    if (type === 'error') {
        html.lastResult.classList.add('error');
    }
}

function setBotsStatus(message, type = 'neutral') {
    if (!html.botsStatus) return;
    html.botsStatus.textContent = message || '';
    html.botsStatus.classList.remove('success', 'error', 'info');
    if (type === 'success') {
        html.botsStatus.classList.add('success');
    }
    if (type === 'error') {
        html.botsStatus.classList.add('error');
    }
    if (type === 'info') {
        html.botsStatus.classList.add('info');
    }
}

function setBotsButtonsDisabled(disabled) {
    if (html.startBotsBtn) {
        html.startBotsBtn.disabled = disabled;
    }
    if (html.stopBotsBtn) {
        html.stopBotsBtn.disabled = disabled;
    }
}

function setError(message) {
    if (html.errorMessage) {
        html.errorMessage.textContent = message || '';
    }
}

function clearError() {
    setError('');
}

function toggleAdminSection(show) {
    if (show) {
        hideElement(html.authForm);
        showElement(html.adminSection);
        html.passwordInput.value = '';
        setStatusMessage('Sessão administrativa ativa.', 'success');
        html.forceCrashBtn?.focus();
    } else {
        showElement(html.authForm);
        hideElement(html.adminSection);
        setStatusMessage('');
        setLastResult('');
        html.passwordInput.focus();
    }
}

function updateConnectionDetails() {
    const socketManager = window.socketManager;
    if (!socketManager || !html.connectionStatus || !html.serverUrl) {
        return;
    }

    const { connected, serverUrl, socketId, transport } = socketManager.getConnectionStatus();
    html.connectionStatus.textContent = connected ? `Conectado via ${transport || 'desconhecido'}` : 'Desconectado';
    html.connectionStatus.classList.toggle('connection-online', Boolean(connected));
    html.connectionStatus.classList.toggle('connection-offline', !connected);
    html.serverUrl.textContent = serverUrl || '-';
    html.socketId.textContent = connected && socketId ? socketId : '-';

    if (botController) {
        botController.setServerUrl(serverUrl);
    }
}

function attachSocketListeners(socketManager) {
    if (!socketManager) return;

    detachSocketListeners();

    connectionStatusListener = (data) => {
        updateConnectionDetails();
        if (data.connected) {
            setStatusMessage('Conectado ao servidor.', 'success');
        } else {
            setStatusMessage('Perdemos a conexão com o servidor.', 'error');
        }
    };

    reconnectListener = () => {
        updateConnectionDetails();
        setStatusMessage('Reconectado ao servidor.', 'success');
    };

    socketManager.on('connection_status', connectionStatusListener);
    socketManager.on('reconnected', reconnectListener);
}

function detachSocketListeners() {
    const socketManager = window.socketManager;
    if (!socketManager) return;
    if (connectionStatusListener) {
        socketManager.off('connection_status', connectionStatusListener);
        connectionStatusListener = null;
    }
    if (reconnectListener) {
        socketManager.off('reconnected', reconnectListener);
        reconnectListener = null;
    }
}

function waitForSocketManager() {
    return new Promise((resolve, reject) => {
        if (window.socketManager) {
            return resolve(window.socketManager);
        }

        const start = Date.now();
        const interval = setInterval(() => {
            if (window.socketManager) {
                clearInterval(interval);
                resolve(window.socketManager);
            } else if (Date.now() - start >= WAIT_FOR_SOCKET_TIMEOUT) {
                clearInterval(interval);
                reject(new Error('SocketManager não disponível.'));
            }
        }, 100);
    });
}

function setCrashButtonLoading(isLoading) {
    if (!html.forceCrashBtn) return;
    html.forceCrashBtn.disabled = isLoading;
    html.forceCrashBtn.textContent = isLoading ? 'Enviando comando...' : 'Forçar crash agora';
}

async function triggerForceCrash() {
    const socketManager = window.socketManager;
    if (!socketManager) {
        setLastResult('SocketManager indisponível.', 'error');
        return;
    }

    setCrashButtonLoading(true);
    setLastResult('Enviando comando ao servidor...', 'neutral');

    try {
        const response = await socketManager.forceCrash(ADMIN_PASSWORD, 'manual_admin_panel');
        const multiplier = response?.crashMultiplier || response?.multiplier;
        const detail = multiplier ? `Multiplicador registrado: ${Number(multiplier).toFixed(2)}x.` : '';
        setLastResult(`Comando executado com sucesso. ${detail}`.trim(), 'success');
    } catch (error) {
        console.error('Falha ao forçar crash:', error);
        setLastResult(error.message || 'Falha ao enviar comando.', 'error');
    } finally {
        setCrashButtonLoading(false);
    }
}

function handleAuthenticate(event) {
    event.preventDefault();
    clearError();

    const password = html.passwordInput.value.trim();
    if (!password) {
        setError('Informe a senha.');
        return;
    }

    if (password === ADMIN_PASSWORD) {
        setAuthenticated(true);
        toggleAdminSection(true);
        setStatusMessage('Senha correta. Acesso liberado.');
        updateConnectionDetails();
    } else {
        setAuthenticated(false);
        setError('Senha incorreta. Tente novamente.');
        html.passwordInput.select();
    }
}

function handleLogout() {
    botController?.stopBots();
    setAuthenticated(false);
    toggleAdminSection(false);
    setStatusMessage('Sessão encerrada.');
}

function initializeUI() {
    if (isAuthenticated()) {
        toggleAdminSection(true);
        setStatusMessage('Sessão restaurada.');
    } else {
        toggleAdminSection(false);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    botController = new BotController();
    botController.setStatusHandler((stats) => {
        if (stats.total === 0) {
            setBotsStatus('Nenhum bot ativo no momento.', 'info');
        } else {
            const message = `Bots conectados: ${stats.connected}/${stats.total}.`;
            setBotsStatus(message, stats.connected > 0 ? 'success' : 'info');
        }
    });

    setBotsStatus('Defina as configurações e clique em "Iniciar bots" para começar o teste.', 'info');

    initializeUI();

    try {
        const manager = await waitForSocketManager();
        attachSocketListeners(manager);
        updateConnectionDetails();
    } catch (error) {
        console.error(error);
        setStatusMessage('Não foi possível inicializar a conexão automática.', 'error');
    }

    html.authForm?.addEventListener('submit', handleAuthenticate);
    html.passwordInput?.addEventListener('input', () => {
        if (html.passwordInput.value.trim()) {
            clearError();
        }
    });

    html.forceCrashBtn?.addEventListener('click', triggerForceCrash);
    html.logoutBtn?.addEventListener('click', handleLogout);

    html.startBotsBtn?.addEventListener('click', () => {
        try {
            const count = Number(html.botCountInput?.value || 0);
            if (!Number.isFinite(count) || count < 1) {
                setBotsStatus('Informe uma quantidade de bots válida (mínimo 1).', 'error');
                return;
            }
            const settings = {
                betMin: Number(html.botBetMinInput?.value || BOT_CONFIG_DEFAULTS.bet.min),
                betMax: Number(html.botBetMaxInput?.value || BOT_CONFIG_DEFAULTS.bet.max),
                autoMin: Number(html.botAutoMinInput?.value || BOT_CONFIG_DEFAULTS.auto.min),
                autoMax: Number(html.botAutoMaxInput?.value || BOT_CONFIG_DEFAULTS.auto.max)
            };

            setBotsButtonsDisabled(true);
            botController.startBots(count, settings)
                .then(() => {
                    const stats = botController.getStats();
                    setBotsStatus(`Bots ativos: ${stats.connected}/${stats.total}.`, 'success');
                })
                .catch((error) => {
                    console.error('Erro ao iniciar bots:', error);
                    setBotsStatus(error.message || 'Falha ao iniciar bots.', 'error');
                })
                .finally(() => setBotsButtonsDisabled(false));
        } catch (error) {
            console.error('Erro inesperado ao iniciar bots:', error);
            setBotsStatus(error.message || 'Falha ao iniciar bots.', 'error');
            setBotsButtonsDisabled(false);
        }
    });

    html.stopBotsBtn?.addEventListener('click', () => {
        try {
            botController.stopBots();
            setBotsStatus('Bots desligados.', 'info');
        } catch (error) {
            console.error('Erro ao parar bots:', error);
            setBotsStatus(error.message || 'Falha ao parar bots.', 'error');
        }
    });

    window.addEventListener('beforeunload', () => {
        detachSocketListeners();
        botController?.stopBots();
    });
});
