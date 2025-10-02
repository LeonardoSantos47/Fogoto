// Main game logic and coordination

class Game {
    constructor() {
        this.canvasManager = null;
        this.rocketCurve = null;
        this.explosionParticles = null;
        this.uiManager = null;
        this.socketManager = null;
        
        this.gameState = 'waiting';
        this.currentMultiplier = 1.00;
        this.gameStartTime = null;
        this.animationFrameId = null;
        this.isRendering = false;
        
        // Performance tracking
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 60;
        
        this.init();
    }
    
    init() {
        // Wait for all components to be ready
        this.waitForComponents().then(() => {
            this.setupComponents();
            this.setupEventListeners();
            this.startRenderLoop();
            console.log('🎮 Game initialized successfully');
        });
    }
    
    async waitForComponents() {
        // Wait for DOM to be ready
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                window.addEventListener('load', resolve);
            });
        }
        
        // Wait for managers to be available
        let attempts = 0;
        while ((!window.uiManager || !window.socketManager) && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.uiManager || !window.socketManager) {
            throw new Error('Failed to initialize game components');
        }
    }
    
    setupComponents() {
        // Initialize canvas
        this.canvasManager = new CanvasManager('gameCanvas');
        this.rocketCurve = new RocketCurve(this.canvasManager);
        
        // Get references to managers
        this.uiManager = window.uiManager;
        this.socketManager = window.socketManager;
    }
    
    setupEventListeners() {
        // Socket events
        this.socketManager.on('game_state', (data) => {
            this.handleGameState(data);
        });

        // Alimentar linha também pelos updates de multiplicador suaves
        this.socketManager.on('multiplier_update', (data) => {
            if (this.gameState === 'flying' && typeof data.multiplier === 'number' && typeof data.time === 'number') {
                this.currentMultiplier = data.multiplier;
                this.rocketCurve.addPoint(data.time, data.multiplier);
                this.uiManager.updateMultiplier(data.multiplier);
            }
        });
        
        this.socketManager.on('player_cashed_out', (data) => {
            this.handlePlayerCashedOut(data);
        });
        
        this.socketManager.on('game_history', (data) => {
            this.handleGameHistory(data);
        });
        
        this.socketManager.on('connection_status', (data) => {
            if (!data.connected) {
                this.pauseGame();
            }
        });
        
        // Window events
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        window.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseRendering();
            } else {
                this.resumeRendering();
            }
        });
        
        // Touch and mobile events
        this.setupMobileOptimizations();
    }
    
    setupMobileOptimizations() {
        // Prevent zoom on double tap
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // Prevent scrolling on game area
        const gameArea = document.querySelector('.game-area');
        if (gameArea) {
            gameArea.addEventListener('touchmove', (e) => {
                e.preventDefault();
            }, { passive: false });
        }
        
        // Optimize for low-end devices
        if (this.canvasManager.performanceSettings.frameRate < 60) {
            console.log('🔧 Low-end device detected, optimizing performance');
        }
    }
    
    handleGameState(data) {
        const { state, multiplier, time, countdown, nextGameIn, finalMultiplier } = data;
        
        this.gameState = state;
        
        switch (state) {
            case 'waiting':
                this.handleWaitingState({ nextGameIn });
                break;
                
            case 'starting':
                this.handleStartingState({ countdown });
                break;
                
            case 'flying':
                this.handleFlyingState({ multiplier, time });
                break;
                
            case 'crashed':
                this.handleCrashedState({ finalMultiplier });
                break;
        }
    }
    
    handleWaitingState(data) {
        // Reset game state
        this.currentMultiplier = 1.00;
        this.gameStartTime = null;
        this.rocketCurve.reset();
        this.explosionParticles = null;
        
        // Update UI
        this.uiManager.setGameState('waiting', data);
        
        console.log('⏳ Waiting for next game...');
    }
    
    handleStartingState(data) {
        // Prepare for new game
        this.rocketCurve.reset();
        this.explosionParticles = null;
        this.currentMultiplier = 1.00;
        
        // Update UI
        this.uiManager.setGameState('starting', data);
        
        console.log('🚀 Game starting...');
    }
    
    handleFlyingState(data) {
        const { multiplier, time } = data;
        
        // Update game state
        this.currentMultiplier = multiplier;
        
        if (!this.gameStartTime) {
            this.gameStartTime = Date.now() - (time * 1000);
        }
        
        // Add point to curve
        this.rocketCurve.addPoint(time, multiplier);
        
        // Update UI
        this.uiManager.setGameState('flying', { multiplier });
        
        // Check auto cash out
        this.checkAutoCashOut(multiplier);
    }
    
    handleCrashedState(data) {
        const { finalMultiplier } = data;
        
        this.currentMultiplier = finalMultiplier;
        
        // Create explosion effect
        const rocketPos = this.rocketCurve.getRocketPosition();
        if (rocketPos) {
            this.explosionParticles = new ExplosionParticles(
                this.canvasManager, 
                rocketPos.x, 
                rocketPos.y
            );
        }
        
        // Update UI
        this.uiManager.setGameState('crashed', { finalMultiplier });
        
        // Add to history
        this.uiManager.addToHistory(finalMultiplier);
        
        console.log(`💥 Game crashed at ${finalMultiplier.toFixed(2)}x`);
    }
    
    handlePlayerCashedOut(data) {
        this.uiManager.handlePlayerCashedOut(data);
        
        if (data.isCurrentPlayer) {
            console.log(`💰 Cashed out at ${data.multiplier.toFixed(2)}x for R$ ${data.amount.toFixed(2)}`);
        }
    }
    
    handleGameHistory(data) {
        // Update history with server data
        if (data.history && Array.isArray(data.history)) {
            // Clear current history
            this.uiManager.elements.historyContainer.innerHTML = '';
            
            // Add each item
            data.history.forEach(multiplier => {
                this.uiManager.addToHistory(multiplier);
            });
        }
    }
    
    checkAutoCashOut(currentMultiplier) {
        if (!this.uiManager.isAutoCashOut || !this.uiManager.isPlaying) {
            return;
        }
        
        const autoCashOutValue = parseFloat(this.uiManager.elements.autoCashOutValue.value);
        
        if (currentMultiplier >= autoCashOutValue) {
            this.socketManager.cashOut();
            this.uiManager.isPlaying = false;
            this.uiManager.updateStartButton();
            
            console.log(`🤖 Auto cash out triggered at ${currentMultiplier.toFixed(2)}x`);
        }
    }
    
    // Rendering and animation
    startRenderLoop() {
        this.isRendering = true;
        this.render();
    }
    
    render(currentTime = 0) {
        if (!this.isRendering) return;
        
        // Calculate FPS
        if (currentTime - this.lastFrameTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFrameTime = currentTime;
        }
        this.frameCount++;
        
        // Clear canvas
        this.canvasManager.clear();
        
        // Draw background
        this.canvasManager.drawBackground();
        
        // Draw grid using dynamic Y scale (start at 2x, smooth zoom-out)
        let yMaxForGrid = 2;
        if (this.rocketCurve) {
            const yMaxNext = Math.max(1.01, this.rocketCurve.yMax + (this.rocketCurve.yMaxTarget - this.rocketCurve.yMax) * 0.15);
            yMaxForGrid = Math.max(2, yMaxNext);
        }
        this.canvasManager.drawGrid(1, yMaxForGrid);
        
        // Draw rocket curve
        if (this.gameState === 'flying' || this.gameState === 'crashed') {
            this.rocketCurve.draw();
        }
        
        // Update and draw explosion particles
        if (this.explosionParticles && this.explosionParticles.isActive) {
            this.explosionParticles.update();
            this.explosionParticles.draw();
        }
        
        // Continue rendering
        this.animationFrameId = requestAnimationFrame((time) => this.render(time));
    }
    
    pauseRendering() {
        this.isRendering = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }
    
    resumeRendering() {
        if (!this.isRendering) {
            this.startRenderLoop();
        }
    }
    
    pauseGame() {
        this.pauseRendering();
        console.log('⏸️ Game paused due to connection issues');
    }
    
    resumeGame() {
        this.resumeRendering();
        console.log('▶️ Game resumed');
    }
    
    handleResize() {
        if (this.canvasManager) {
            this.canvasManager.resize();
        }
    }
    
    // Utility methods
    getCurrentMultiplier() {
        return this.currentMultiplier;
    }
    
    getGameState() {
        return this.gameState;
    }
    
    getFPS() {
        return this.fps;
    }
    
    getPerformanceInfo() {
        return {
            fps: this.fps,
            gameState: this.gameState,
            isRendering: this.isRendering,
            settings: this.canvasManager?.performanceSettings || null
        };
    }
    
    // Debug methods
    enableDebugMode() {
        // Add FPS counter
        const fpsCounter = document.createElement('div');
        fpsCounter.id = 'fps-counter';
        fpsCounter.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
        `;
        document.body.appendChild(fpsCounter);
        
        // Update FPS counter
        setInterval(() => {
            fpsCounter.textContent = `FPS: ${this.fps} | State: ${this.gameState}`;
        }, 1000);
        
        console.log('🐛 Debug mode enabled');
    }
}

// Initialize game when DOM is ready
let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new Game();
    
    // Make it globally available for debugging
    window.game = game;
    
    // Enable debug mode in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        game.enableDebugMode();
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (game) {
        game.pauseRendering();
    }
});

// Export for use in other modules
window.Game = Game;
