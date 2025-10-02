class PlayerManager {
    constructor() {
        this.players = new Map(); // playerId -> player data
        this.sockets = new Map(); // playerId -> socket reference
        
        // Statistics
        this.stats = {
            totalPlayersJoined: 0,
            peakConcurrentPlayers: 0,
            totalBetsPlaced: 0,
            totalWinnings: 0
        };
    }
    
    addPlayer(playerId, socket) {
        const player = {
            id: playerId,
            name: null,
            socket: socket,
            balance: 1000.00, // Starting balance
            currentBet: 0,
            isPlaying: false,
            autoCashOut: null,
            
            // Statistics
            joinedAt: Date.now(),
            lastSeenAt: Date.now(),
            gamesPlayed: 0,
            totalBets: 0,
            totalWinnings: 0,
            biggestWin: 0,
            longestStreak: 0,
            currentStreak: 0,
            
            // Session data
            sessionBets: 0,
            sessionWinnings: 0,
            sessionGames: 0
        };
        
        this.players.set(playerId, player);
        this.sockets.set(playerId, socket);
        
        this.stats.totalPlayersJoined++;
        this.updatePeakPlayers();
        
        console.log(`👤 Player ${playerId} added to manager`);
        
        return player;
    }
    
    removePlayer(playerId) {
        const player = this.players.get(playerId);
        
        if (player) {
            // Log session statistics
            console.log(`📊 Player ${playerId} session: ${player.sessionGames} games, R$ ${player.sessionWinnings.toFixed(2)} winnings`);
            
            this.players.delete(playerId);
            this.sockets.delete(playerId);
            
            console.log(`👤 Player ${playerId} removed from manager`);
        }
    }
    
    getPlayer(playerId) {
        return this.players.get(playerId);
    }
    
    getPlayerSocket(playerId) {
        return this.sockets.get(playerId);
    }
    
    updatePlayerActivity(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            player.lastSeenAt = Date.now();
        }
    }
    
    updatePlayerBalance(playerId, amount) {
        const player = this.players.get(playerId);
        if (player) {
            player.balance += amount;
            
            if (amount > 0) {
                player.totalWinnings += amount;
                player.sessionWinnings += amount;
                
                if (amount > player.biggestWin) {
                    player.biggestWin = amount;
                }
                
                player.currentStreak++;
                if (player.currentStreak > player.longestStreak) {
                    player.longestStreak = player.currentStreak;
                }
            } else {
                player.currentStreak = 0;
            }
            
            this.stats.totalWinnings += Math.max(0, amount);
        }
    }
    
    placeBet(playerId, amount) {
        const player = this.players.get(playerId);
        if (player && player.balance >= amount) {
            player.balance -= amount;
            player.currentBet = amount;
            player.isPlaying = true;
            player.totalBets += amount;
            player.sessionBets += amount;
            
            this.stats.totalBetsPlaced++;
            
            return true;
        }
        
        return false;
    }
    
    cashOut(playerId, multiplier) {
        const player = this.players.get(playerId);
        if (player && player.isPlaying) {
            const winAmount = player.currentBet * multiplier;
            
            this.updatePlayerBalance(playerId, winAmount);
            
            player.isPlaying = false;
            player.currentBet = 0;
            player.gamesPlayed++;
            player.sessionGames++;
            
            return {
                success: true,
                winAmount: winAmount,
                newBalance: player.balance
            };
        }
        
        return { success: false };
    }
    
    resetPlayerGame(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            if (player.isPlaying) {
                // Player lost their bet
                player.currentStreak = 0;
            }
            
            player.isPlaying = false;
            player.currentBet = 0;
            player.autoCashOut = null;
            player.gamesPlayed++;
            player.sessionGames++;
        }
    }
    
    getActivePlayers() {
        return Array.from(this.players.values()).filter(player => player.isPlaying);
    }
    
    getOnlinePlayers() {
        const cutoffTime = Date.now() - 30000; // 30 seconds
        return Array.from(this.players.values()).filter(player => player.lastSeenAt > cutoffTime);
    }
    
    getPlayerCount() {
        return this.players.size;
    }
    
    getActivePlayerCount() {
        return this.getActivePlayers().length;
    }
    
    updatePeakPlayers() {
        const currentCount = this.getPlayerCount();
        if (currentCount > this.stats.peakConcurrentPlayers) {
            this.stats.peakConcurrentPlayers = currentCount;
        }
    }
    
    // Leaderboard and rankings
    getTopPlayers(limit = 10) {
        return Array.from(this.players.values())
            .sort((a, b) => b.totalWinnings - a.totalWinnings)
            .slice(0, limit)
            .map(player => ({
                name: player.name || `Player${player.id.substr(0, 4)}`,
                totalWinnings: player.totalWinnings,
                gamesPlayed: player.gamesPlayed,
                biggestWin: player.biggestWin,
                longestStreak: player.longestStreak
            }));
    }
    
    getPlayerRank(playerId) {
        const players = Array.from(this.players.values())
            .sort((a, b) => b.totalWinnings - a.totalWinnings);
        
        const playerIndex = players.findIndex(p => p.id === playerId);
        return playerIndex >= 0 ? playerIndex + 1 : null;
    }
    
    // Statistics and analytics
    getStats() {
        const onlinePlayers = this.getOnlinePlayers();
        const activePlayers = this.getActivePlayers();
        
        return {
            ...this.stats,
            currentPlayers: this.getPlayerCount(),
            onlinePlayers: onlinePlayers.length,
            activePlayers: activePlayers.length,
            averageBalance: this.getAverageBalance(),
            totalBalance: this.getTotalBalance()
        };
    }
    
    getAverageBalance() {
        const players = Array.from(this.players.values());
        if (players.length === 0) return 0;
        
        const totalBalance = players.reduce((sum, player) => sum + player.balance, 0);
        return totalBalance / players.length;
    }
    
    getTotalBalance() {
        return Array.from(this.players.values())
            .reduce((sum, player) => sum + player.balance, 0);
    }
    
    getSessionStats() {
        const players = Array.from(this.players.values());
        
        return {
            totalSessionBets: players.reduce((sum, p) => sum + p.sessionBets, 0),
            totalSessionWinnings: players.reduce((sum, p) => sum + p.sessionWinnings, 0),
            totalSessionGames: players.reduce((sum, p) => sum + p.sessionGames, 0),
            averageSessionLength: this.getAverageSessionLength()
        };
    }
    
    getAverageSessionLength() {
        const now = Date.now();
        const players = Array.from(this.players.values());
        
        if (players.length === 0) return 0;
        
        const totalSessionTime = players.reduce((sum, player) => {
            return sum + (now - player.joinedAt);
        }, 0);
        
        return totalSessionTime / players.length;
    }
    
    // Cleanup and maintenance
    cleanupInactivePlayers(inactiveThreshold = 300000) { // 5 minutes
        const cutoffTime = Date.now() - inactiveThreshold;
        const inactivePlayers = [];
        
        for (const [playerId, player] of this.players) {
            if (player.lastSeenAt < cutoffTime) {
                inactivePlayers.push(playerId);
            }
        }
        
        inactivePlayers.forEach(playerId => {
            console.log(`🧹 Cleaning up inactive player: ${playerId}`);
            this.removePlayer(playerId);
        });
        
        return inactivePlayers.length;
    }
    
    // Broadcast methods
    broadcastToAll(event, data) {
        for (const socket of this.sockets.values()) {
            socket.emit(event, data);
        }
    }
    
    broadcastToPlayer(playerId, event, data) {
        const socket = this.sockets.get(playerId);
        if (socket) {
            socket.emit(event, data);
        }
    }
    
    broadcastToActivePlayers(event, data) {
        const activePlayers = this.getActivePlayers();
        activePlayers.forEach(player => {
            this.broadcastToPlayer(player.id, event, data);
        });
    }
    
    // Admin methods
    setPlayerBalance(playerId, newBalance) {
        const player = this.players.get(playerId);
        if (player) {
            player.balance = newBalance;
            return true;
        }
        return false;
    }
    
    resetPlayerStats(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            player.gamesPlayed = 0;
            player.totalBets = 0;
            player.totalWinnings = 0;
            player.biggestWin = 0;
            player.longestStreak = 0;
            player.currentStreak = 0;
            player.sessionBets = 0;
            player.sessionWinnings = 0;
            player.sessionGames = 0;
            return true;
        }
        return false;
    }
    
    // Export player data
    exportPlayerData(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            return {
                id: player.id,
                name: player.name,
                balance: player.balance,
                statistics: {
                    gamesPlayed: player.gamesPlayed,
                    totalBets: player.totalBets,
                    totalWinnings: player.totalWinnings,
                    biggestWin: player.biggestWin,
                    longestStreak: player.longestStreak,
                    joinedAt: player.joinedAt,
                    sessionTime: Date.now() - player.joinedAt
                }
            };
        }
        return null;
    }
}

module.exports = PlayerManager;
