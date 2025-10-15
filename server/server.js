const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const GameEngine = require('./game-logic');
const PlayerManager = require('./player-manager');

class CrashRocketServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });
        
        this.gameEngine = new GameEngine(this.io);
        this.playerManager = new PlayerManager();
        
    this.port = process.env.PORT || 3001;
    this.adminSecret = process.env.ADMIN_SECRET || null;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.startServer();
    }

    getStartingBalance() {
        return 1000;
    }

    buildLeaderboardSnapshot() {
        const snapshot = this.playerManager.getLeaderboardSnapshot(10);
        const timestamp = Date.now();

        return {
            payload: {
                entries: snapshot.entries.map(entry => ({
                    rank: entry.rank,
                    playerId: entry.id,
                    name: entry.name,
                    balance: Number(entry.balance.toFixed(2)),
                    profit: Number(entry.profit.toFixed(2)),
                    totalWinnings: Number(entry.totalWinnings.toFixed(2)),
                    biggestWin: Number(entry.biggestWin.toFixed(2)),
                    longestStreak: entry.longestStreak,
                    gamesPlayed: entry.gamesPlayed
                })),
                totalPlayers: snapshot.totalPlayers,
                updatedAt: timestamp
            },
            sortedPlayers: snapshot.sortedPlayers,
            timestamp
        };
    }

    broadcastLeaderboard() {
        const { payload, sortedPlayers, timestamp } = this.buildLeaderboardSnapshot();
        this.io.emit('leaderboard_update', payload);
        this.sendIndividualRankUpdates(sortedPlayers, timestamp);
    }

    sendLeaderboardToSocket(socket) {
        if (!socket) return;
        const { payload, sortedPlayers, timestamp } = this.buildLeaderboardSnapshot();
        socket.emit('leaderboard_update', payload);
        this.sendIndividualRankUpdates(sortedPlayers, timestamp, socket);
    }

    sendIndividualRankUpdates(sortedPlayers = null, timestamp = Date.now(), targetSocket = null) {
        const reference = sortedPlayers || this.playerManager.getSortedPlayers();
        const totalPlayers = reference.length;
        const baseBalance = this.getStartingBalance();

        reference.forEach((player, index) => {
            if (targetSocket && player.id !== targetSocket.id) {
                return;
            }

            const socket = targetSocket || this.playerManager.getPlayerSocket(player.id);
            if (!socket) {
                return;
            }

            const balance = Number((player.balance || 0).toFixed(2));
            const profit = Number((balance - baseBalance).toFixed(2));

            socket.emit('leaderboard_rank', {
                rank: index + 1,
                totalPlayers,
                balance,
                profit,
                totalWinnings: Number((player.totalWinnings || 0).toFixed(2)),
                biggestWin: Number((player.biggestWin || 0).toFixed(2)),
                longestStreak: Number(player.longestStreak || 0),
                gamesPlayed: Number(player.gamesPlayed || 0),
                updatedAt: timestamp
            });
        });
    }
    
    setupMiddleware() {
        // Security and optimization
        this.app.use(helmet({
            contentSecurityPolicy: false // Disable for Socket.IO
        }));
        this.app.use(compression());
        this.app.use(cors({
            origin: "*",
            credentials: true
        }));
        this.app.use(express.json());
        
        // Servir arquivos do socket.io
        this.app.use('/socket.io', express.static(path.join(__dirname, '../node_modules/socket.io/client-dist')));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }
    
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                message: 'Crash Rocket Server Online!',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                gameState: this.gameEngine.getGameState(),
                playersOnline: this.playerManager.getPlayerCount(),
                version: '1.0.0'
            });
        });
        
        // Root route
        this.app.get('/', (req, res) => {
            res.json({
                status: 'ok',
                message: 'Crash Rocket Server is running!',
                timestamp: new Date().toISOString(),
                endpoints: {
                    health: '/health',
                    stats: '/stats',
                    websocket: 'ws://' + req.get('host')
                }
            });
        });
        
        // Game stats
        this.app.get('/stats', (req, res) => {
            res.json({
                gameStats: this.gameEngine.getStats(),
                players: this.playerManager.getStats()
            });
        });

        // Admin: force crash endpoint
        this.app.post('/admin/force-crash', (req, res) => {
            try {
                const token = req.body?.token || req.query?.token || req.headers['x-admin-token'];

                if (this.adminSecret) {
                    if (!token || token !== this.adminSecret) {
                        return res.status(401).json({ error: 'Unauthorized' });
                    }
                } else {
                    console.warn('⚠️ ADMIN_SECRET not configured; accepting force crash without token (development mode).');
                }

                const reason = req.body?.reason || 'admin_api';
                const result = this.gameEngine.forceCrash(reason);

                if (!result.success) {
                    return res.status(400).json(result);
                }

                return res.json({
                    success: true,
                    multiplier: result.multiplier,
                    state: this.gameEngine.getCurrentState()
                });
            } catch (error) {
                console.error('Error handling admin force crash:', error);
                res.status(500).json({ error: 'Failed to force crash' });
            }
        });
        
        // Serve static files in production
        if (process.env.NODE_ENV === 'production') {
            this.app.use(express.static('../client'));
            
            this.app.get('*', (req, res) => {
                res.sendFile(path.join(__dirname, '../client/index.html'));
            });
        }
        
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Route not found' });
        });
        
        // Error handler
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }
    
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`✅ Player connected: ${socket.id}`);
            
            // Add player
            this.playerManager.addPlayer(socket.id, socket);
            this.sendLeaderboardToSocket(socket);
            
            // Send current game state
            const gameState = this.gameEngine.getCurrentState();
            socket.emit('game_state', gameState);
            
            // Send game history
            const history = this.gameEngine.getHistory();
            socket.emit('game_history', { history });
            
            // Handle join game
            socket.on('join_game', (data) => {
                try {
                    const player = this.playerManager.getPlayer(socket.id);
                    if (player) {
                        // Prefer saved name from localStorage if sent
                        player.name = data.playerName || player.name || `Player${socket.id.substr(0, 4)}`;
                        player.joinedAt = Date.now();
                        
                        console.log(`🎮 Player ${player.name} joined the game`);
                        
                        // Notify other players
                        socket.broadcast.emit('player_joined', {
                            playerId: socket.id,
                            playerName: player.name
                        });
                    }
                } catch (error) {
                    console.error('Error handling join game:', error);
                    socket.emit('error', { message: 'Failed to join game' });
                }
            });

            // Handle update name
            socket.on('update_player_name', (newName) => {
                try {
                    const name = String(newName).trim().slice(0, 20);
                    if (!name) return;
                    const player = this.playerManager.getPlayer(socket.id);
                    if (player) {
                        player.name = name;
                        socket.emit('player_name_updated', { success: true, name });
                    }
                } catch (error) {
                    console.error('Error updating player name:', error);
                    socket.emit('player_name_updated', { success: false, error: 'Failed to update name' });
                }
            });
            
            // Handle place bet
            socket.on('place_bet', (data) => {
                try {
                    const { amount, autoCashOut } = data;
                    
                                    // socket.broadcast.emit('player_cashed_out', {
                    if (!this.isValidBet(amount)) {
                        socket.emit('error', { message: 'Invalid bet amount' });
                        return;
                    }
                    
                    // Check if game accepts bets
                    if (!this.gameEngine.canPlaceBet()) {
                        socket.emit('error', { message: 'Cannot place bet at this time' });
                        return;
                    }
                    
                    // Place bet
                    const success = this.gameEngine.placeBet(socket.id, amount, autoCashOut);
                    
                    if (success) {
                        const player = this.playerManager.getPlayer(socket.id);
                        if (player) {
                            // Debitar saldo e marcar jogando
                            if (player.balance >= amount) {
                                player.balance -= amount;
                                player.currentBet = amount;
                                player.autoCashOut = autoCashOut;
                                player.isPlaying = true;
                                player.totalBets += amount;
                            }
                        }
                        
                        console.log(`💰 Player ${socket.id} placed bet: R$ ${amount}`);
                        
                        // Confirm bet to this player com saldo atualizado
                        const playerBalance = player ? player.balance : null;
                        socket.emit('bet_placed', {
                            success: true,
                            amount,
                            betAmount: amount,
                            balance: playerBalance,
                            autoCashOut: player?.autoCashOut ?? null
                        });

                        // Notify other players
                        this.io.emit('player_bet', {
                            playerId: socket.id,
                            playerName: player?.name || 'Anonymous',
                            amount: amount
                        });
                    } else {
                        socket.emit('bet_placed', { success: false, error: 'Failed to place bet' });
                    }
                } catch (error) {
                    console.error('Error handling place bet:', error);
                    socket.emit('bet_placed', { success: false, error: 'Failed to place bet' });
                }
            });
            
            // Handle cash out
            socket.on('cash_out', (data) => {
                try {
                    const result = this.gameEngine.cashOut(socket.id);
                    
                    if (result.success) {
                        const winStats = this.playerManager.recordWin(socket.id, result.winAmount, {
                            betAmount: result.betAmount,
                            multiplier: result.multiplier
                        });
                        const player = this.playerManager.getPlayer(socket.id);
                        
                        console.log(`💸 Player ${socket.id} cashed out: ${result.multiplier.toFixed(2)}x = R$ ${result.winAmount.toFixed(2)}`);
                        
                        // Notify player com saldo atualizado
                        const playerBalance = winStats ? winStats.balance : (player ? Number(player.balance.toFixed(2)) : null);
                        socket.emit('player_cashed_out', {
                            success: true,
                            multiplier: result.multiplier,
                            amount: result.winAmount,
                            betAmount: result.betAmount,
                            balance: playerBalance,
                            isCurrentPlayer: true
                        });
                        
                        // Notify other players
                        socket.broadcast.emit('player_cashed_out', {
                            playerId: socket.id,
                            playerName: player?.name || 'Anonymous',
                            multiplier: result.multiplier,
                            amount: result.winAmount,
                            betAmount: result.betAmount,
                            balance: playerBalance,
                            isCurrentPlayer: false
                        });
                    } else {
                        socket.emit('error', { message: result.error || 'Failed to cash out' });
                    }
                } catch (error) {
                    console.error('Error handling cash out:', error);
                    socket.emit('error', { message: 'Failed to cash out' });
                }
            });
            
            // Handle disconnect
            socket.on('disconnect', (reason) => {
                console.log(`❌ Player disconnected: ${socket.id} (${reason})`);
                
                // Remove from active game if playing
                this.gameEngine.removePlayer(socket.id);
                
                // Remove player
                this.playerManager.removePlayer(socket.id);
                
                // Notify other players
                socket.broadcast.emit('player_left', {
                    playerId: socket.id
                });
            });
            
            // Handle errors
            socket.on('error', (error) => {
                console.error(`Socket error from ${socket.id}:`, error);
            });
        });
        
        // Game engine events
        this.gameEngine.on('game_state_changed', (gameState) => {
            this.io.emit('game_state', gameState);
        });
        // Forward multiplier updates com menos ruído
        this.gameEngine.on('multiplier_update', (data) => {
            this.io.emit('multiplier_update', data);
        });
        
        this.gameEngine.on('player_auto_cashed_out', (data) => {
            const winStats = this.playerManager.recordWin(data.playerId, data.winAmount, {
                betAmount: data.betAmount,
                multiplier: data.multiplier
            });
            const player = this.playerManager.getPlayer(data.playerId);
            const playerBalance = winStats ? winStats.balance : (player ? Number(player.balance.toFixed(2)) : null);
            
            // Notify all players
            this.io.emit('player_cashed_out', {
                playerId: data.playerId,
                playerName: player?.name || 'Anonymous',
                multiplier: data.multiplier,
                amount: data.winAmount,
                betAmount: data.betAmount,
                balance: playerBalance,
                success: true,
                isAuto: true,
                isCurrentPlayer: false
            });
            
            // Notify specific player
            const socket = this.playerManager.getPlayerSocket(data.playerId);
            if (socket) {
                socket.emit('player_cashed_out', {
                    success: true,
                    playerId: data.playerId,
                    multiplier: data.multiplier,
                    amount: data.winAmount,
                    betAmount: data.betAmount,
                    balance: playerBalance,
                    isAuto: true,
                    isCurrentPlayer: true
                });
            }

        });

        this.gameEngine.on('round_settled', (settlement) => {
            if (settlement?.losers?.length) {
                settlement.losers.forEach(({ playerId }) => {
                    this.playerManager.resetPlayerGame(playerId);
                });
            }

            this.broadcastLeaderboard();
        });
    }
    
    isValidBet(amount) {
        return typeof amount === 'number' && 
               amount >= 1 && 
               amount <= 1000000000 && 
               Number.isFinite(amount);
    }
    
    startServer() {
        this.server.listen(this.port, () => {
            console.log(`🚀 Crash Rocket Server running on port ${this.port}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 CORS origin: *`);
            console.log(`🔗 Server URL: http://localhost:${this.port}`);
            console.log(`💡 Health check: http://localhost:${this.port}/health`);
        });
        
        // Start game engine
        this.gameEngine.start();
        
        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully');
            this.gameEngine.stop();
            this.server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
        
        process.on('SIGINT', () => {
            console.log('🛑 SIGINT received, shutting down gracefully');
            this.gameEngine.stop();
            this.server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
        
        // Error handling
        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught exception:', error);
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
    }
}

// Start server
new CrashRocketServer();
