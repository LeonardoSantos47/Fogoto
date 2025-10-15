const EventEmitter = require('events');

// Game states
const GAME_STATES = {
    WAITING: 'waiting',
    STARTING: 'starting',
    FLYING: 'flying',
    CRASHED: 'crashed'
};

class GameEngine extends EventEmitter {
    constructor(io) {
        super();
        this.io = io;
        
        // Game state
        this.state = GAME_STATES.WAITING;
        this.multiplier = 1.00;
        this.startTime = null;
        this.gameId = 0;
        this.history = [];
        
        // Active players and bets
        this.activePlayers = new Map(); // playerId -> { bet, autoCashOut, hasWon }
        this.cashedOutPlayers = new Set();
        
        // Timers
        this.gameLoopInterval = null;
        this.stateTimeout = null;
        
        // Configuration
        this.config = {
            waitTime: { min: 3000, max: 7000 }, // 3-7 seconds
            countdownTime: 3000, // 3 seconds
            updateInterval: 100, // 100ms para lógica interna responsiva
            predictionInterval: 1000, // Snapshot de predição a cada 1s
            maxGameTime: 90000,  // 90 seconds max para suportar curvas longas
            historySize: 20
        };
        // Growth configuration (exponencial simples)
        this.growth = {
            mode: 'exponential',
            rate: 0.2,          // Crescimento ~exp(0.065 * t)
            minMultiplier: 1.0,
            capMultiplier: 250    // Limite de segurança para evitar overflow
        };
        
        // Statistics
        this.stats = {
            totalGames: 0,
            totalBets: 0,
            totalPayouts: 0,
            averageMultiplier: 0,
            uptime: Date.now()
        };

        this._lastPredictionBroadcast = 0;
    }
    
    start() {
        console.log('🎮 Game engine starting...');
        this.scheduleNextGame();
    }
    
    stop() {
        console.log('🛑 Game engine stopping...');
        this.clearTimers();
        this.state = GAME_STATES.WAITING;
    }
    
    scheduleNextGame() {
        const waitTime = this.getRandomWaitTime();
        console.log(`⏰ Next game in ${waitTime / 1000}s`);
        
        this.state = GAME_STATES.WAITING;
        this.emit('game_state_changed', {
            state: this.state,
            nextGameIn: waitTime / 1000
        });
        
        this.stateTimeout = setTimeout(() => {
            this.startCountdown();
        }, waitTime);
    }
    
    startCountdown() {
        console.log('🚦 Starting countdown...');
        
        this.state = GAME_STATES.STARTING;
        this.cashedOutPlayers.clear();
        
        this.emit('game_state_changed', {
            state: this.state,
            countdown: this.config.countdownTime / 1000
        });
        
        this.stateTimeout = setTimeout(() => {
            this.startGame();
        }, this.config.countdownTime);
    }
    
    startGame() {
        console.log(`🚀 Game ${++this.gameId} started with ${this.activePlayers.size} players`);
        
        this.state = GAME_STATES.FLYING;
        this.multiplier = 1.00;
        this.startTime = Date.now();
        this.cashedOutPlayers.clear();
        this._lastPredictionBroadcast = 0;
        
        this.emit('game_state_changed', this.buildMultiplierPayload(0));
        
        this.startGameLoop();
    }
    
    startGameLoop() {
        this.gameLoopInterval = setInterval(() => {
            this.updateGame();
        }, this.config.updateInterval);
    }
    
    updateGame() {
        if (this.state !== GAME_STATES.FLYING) return;
        
        const now = Date.now();
        const elapsed = (now - this.startTime) / 1000;
        const newMultiplier = this.calculateMultiplier(elapsed);
        this.multiplier = newMultiplier;

        if (!this._lastPredictionBroadcast || (now - this._lastPredictionBroadcast) >= this.config.predictionInterval) {
            this._lastPredictionBroadcast = now;
            const predictionPayload = this.buildMultiplierPayload(elapsed, now);
            this.emit('multiplier_update', predictionPayload);
        }
        
        // Check for crash
        if (this.shouldCrash(this.multiplier)) {
            this.crashGame();
            return;
        }
        
        // Check for max game time
        if (elapsed >= this.config.maxGameTime / 1000) {
            this.crashGame();
            return;
        }
        
        // Check auto cash outs
        this.checkAutoCashOuts();
        
        // Emit game state
    this.emit('game_state_changed', this.buildMultiplierPayload(elapsed, now));
    }
    
    calculateMultiplier(timeInSeconds) {
        const { rate, minMultiplier, capMultiplier } = this.growth;
        const multiplier = Math.exp(rate * timeInSeconds);
        return Math.min(Math.max(multiplier, minMultiplier), capMultiplier);
    }
    
    shouldCrash(multiplier) {
        const elapsedSeconds = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;

        // Probabilidade base muito baixa para permitir crescimento longo
        let crashChance = 0.0008; // 0.08% por tick (~0.8% por segundo a 10 FPS)

        // Aumenta lentamente após 30 segundos
        if (elapsedSeconds > 30) {
            crashChance += (elapsedSeconds - 30) * 0.0006;
        }

        // Multiplicadores muito altos elevam chance de crash progressivamente
        if (multiplier > 5) {
            crashChance += (multiplier - 5) * 0.0015;
        }

        // Limite superior de 8%
        crashChance = Math.min(crashChance, 0.08);

        return Math.random() < crashChance;
    }
    
    checkAutoCashOuts() {
        for (const [playerId, playerData] of this.activePlayers) {
            if (playerData.autoCashOut && 
                !this.cashedOutPlayers.has(playerId) && 
                this.multiplier >= playerData.autoCashOut) {
                
                this.performAutoCashOut(playerId, playerData);
            }
        }
    }
    
    performAutoCashOut(playerId, playerData) {
        const winAmount = playerData.bet * this.multiplier;
        
        this.cashedOutPlayers.add(playerId);
        playerData.hasWon = true;
        
        this.stats.totalPayouts += winAmount;
        
        console.log(`🤖 Auto cash out: Player ${playerId} at ${this.multiplier.toFixed(2)}x = R$ ${winAmount.toFixed(2)}`);
        
        this.emit('player_auto_cashed_out', {
            playerId: playerId,
            multiplier: this.multiplier,
            winAmount: winAmount,
            betAmount: playerData.bet
        });
    }
    
    crashGame(trigger = null) {
        const reasonSuffix = trigger ? ` (${trigger})` : '';
        console.log(`💥 Game ${this.gameId} crashed${reasonSuffix} at ${this.multiplier.toFixed(2)}x`);
        
        this.clearTimers();
        this.state = GAME_STATES.CRASHED;

        if (this.startTime) {
            const now = Date.now();
            const elapsed = (now - this.startTime) / 1000;
            const finalSnapshot = this.buildMultiplierPayload(elapsed, now);
            this.emit('multiplier_update', finalSnapshot);
        }
        
        // Update statistics
        this.stats.totalGames++;
        this.updateAverageMultiplier();
        
        // Add to history
        this.addToHistory(this.multiplier);
        
        // Calculate payouts for players who didn't cash out
        const settlement = this.finalizeBets();
        
        this.emit('game_state_changed', {
            state: this.state,
            finalMultiplier: this.multiplier
        });

        this.emit('round_settled', {
            finalMultiplier: this.multiplier,
            losers: settlement.losers,
            participants: settlement.participants
        });
        
        // Schedule next game
        this.stateTimeout = setTimeout(() => {
            this.scheduleNextGame();
        }, 2000); // Show crash for 2 seconds
    }

    forceCrash(reason = 'admin_override') {
        if (this.state !== GAME_STATES.FLYING) {
            return {
                success: false,
                error: 'Game is not currently flying'
            };
        }

        console.log(`🛑 Force crash requested (${reason})`);
        this.crashGame(reason);

        return {
            success: true,
            multiplier: this.multiplier
        };
    }
    
    finalizeBets() {
        const participants = [];
        const losers = [];

        for (const [playerId, playerData] of this.activePlayers.entries()) {
            const record = {
                playerId,
                betAmount: playerData.bet,
                autoCashOut: playerData.autoCashOut,
                hasWon: this.cashedOutPlayers.has(playerId)
            };
            participants.push(record);

            if (!record.hasWon) {
                losers.push({
                    playerId,
                    betAmount: playerData.bet
                });
            }
        }

        this.activePlayers.clear();
        this.cashedOutPlayers.clear();

        return { participants, losers };
    }
    
    addToHistory(multiplier) {
        this.history.unshift(parseFloat(multiplier.toFixed(2)));
        
        if (this.history.length > this.config.historySize) {
            this.history.pop();
        }
    }
    
    updateAverageMultiplier() {
        if (this.history.length > 0) {
            const sum = this.history.reduce((a, b) => a + b, 0);
            this.stats.averageMultiplier = sum / this.history.length;
        }
    }

    buildMultiplierPayload(explicitElapsed = null, explicitTimestamp = null) {
        const timestamp = explicitTimestamp !== null ? explicitTimestamp : Date.now();
        const elapsed = explicitElapsed !== null
            ? explicitElapsed
            : (this.startTime ? (timestamp - this.startTime) / 1000 : 0);
        return {
            state: this.state,
            multiplier: Number(this.multiplier.toFixed(4)),
            displayMultiplier: Number(this.multiplier.toFixed(2)),
            time: elapsed,
            timestamp,
            growthRate: this.growth.rate
        };
    }
    
    // Player interaction methods
    canPlaceBet() {
        return this.state === GAME_STATES.WAITING || this.state === GAME_STATES.STARTING;
    }
    
    placeBet(playerId, amount, autoCashOut = null) {
        if (!this.canPlaceBet()) {
            return false;
        }
        
        // Validate auto cash out
        if (autoCashOut && autoCashOut < 1.01) {
            return false;
        }
        
        this.activePlayers.set(playerId, {
            bet: amount,
            autoCashOut: autoCashOut,
            hasWon: false,
            placedAt: Date.now()
        });
        
        this.stats.totalBets += amount;
        
        return true;
    }
    
    cashOut(playerId) {
        if (this.state !== GAME_STATES.FLYING) {
            return { success: false, error: 'Cannot cash out at this time' };
        }
        
        if (!this.activePlayers.has(playerId)) {
            return { success: false, error: 'No active bet found' };
        }
        
        if (this.cashedOutPlayers.has(playerId)) {
            return { success: false, error: 'Already cashed out' };
        }
        
        const playerData = this.activePlayers.get(playerId);
        const winAmount = playerData.bet * this.multiplier;
        
        this.cashedOutPlayers.add(playerId);
        playerData.hasWon = true;
        
        this.stats.totalPayouts += winAmount;
        
        return {
            success: true,
            multiplier: this.multiplier,
            winAmount: winAmount,
            betAmount: playerData.bet
        };
    }
    
    removePlayer(playerId) {
        this.activePlayers.delete(playerId);
        this.cashedOutPlayers.delete(playerId);
    }
    
    // Utility methods
    getRandomWaitTime() {
        const { min, max } = this.config.waitTime;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    clearTimers() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
        
        if (this.stateTimeout) {
            clearTimeout(this.stateTimeout);
            this.stateTimeout = null;
        }
    }
    
    // Public getters
    getCurrentState() {
        const baseState = {
            state: this.state,
            gameId: this.gameId
        };
        
        switch (this.state) {
            case GAME_STATES.WAITING:
                return baseState;
                
            case GAME_STATES.STARTING:
                return baseState;
                
            case GAME_STATES.FLYING:
                const elapsed = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
                return {
                    ...baseState,
                    multiplier: this.multiplier,
                    time: elapsed
                };
                
            case GAME_STATES.CRASHED:
                return {
                    ...baseState,
                    finalMultiplier: this.multiplier
                };
                
            default:
                return baseState;
        }
    }
    
    getGameState() {
        return this.state;
    }
    
    getHistory() {
        return [...this.history];
    }
    
    getStats() {
        return {
            ...this.stats,
            currentMultiplier: this.multiplier,
            gameState: this.state,
            activePlayers: this.activePlayers.size,
            uptime: Date.now() - this.stats.uptime
        };
    }
    
    getActivePlayers() {
        return Array.from(this.activePlayers.keys());
    }
}

module.exports = GameEngine;
