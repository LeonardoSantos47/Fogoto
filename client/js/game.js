// Main game logic and coordination

const DEFAULT_GROWTH_RATE = 0.2;
const MULTIPLIER_CAP = 250;

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
    this.startDelayTimeout = null;
    this.visibilityStartHandler = null;
    this.lastRenderTimestamp = 0;
    this.targetFrameInterval = 50;
        this.predictionSnapshot = null;
        this.lastPredictedDisplay = null;
        this.multiplierCap = MULTIPLIER_CAP;
        this.defaultGrowthRate = DEFAULT_GROWTH_RATE;
        
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
            this.scheduleInitialRender();
        });
    }

    scheduleInitialRender() {
        if (this.startDelayTimeout) {
            clearTimeout(this.startDelayTimeout);
        }

        if (this.visibilityStartHandler) {
            document.removeEventListener('visibilitychange', this.visibilityStartHandler);
            this.visibilityStartHandler = null;
        }

        console.log('⏱️ Render loop will start in 3 seconds...');

        this.startDelayTimeout = setTimeout(() => {
            this.startDelayTimeout = null;

            const startWhenVisible = () => {
                if (document.hidden) {
                    return;
                }

                if (this.visibilityStartHandler) {
                    document.removeEventListener('visibilitychange', this.visibilityStartHandler);
                    this.visibilityStartHandler = null;
                }

                if (this.isRendering) {
                    return;
                }

                this.startRenderLoop();
                console.log('🎮 Game initialized successfully');
            };

            if (document.hidden) {
                this.visibilityStartHandler = () => {
                    if (!document.hidden) {
                        startWhenVisible();
                    }
                };
                document.addEventListener('visibilitychange', this.visibilityStartHandler);
            } else {
                startWhenVisible();
            }
        }, 3000);
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

        // Snapshots para dead reckoning
        this.socketManager.on('multiplier_update', (data) => {
            this.handlePredictionSnapshot(data);
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
        
        // Prevent scrolling on game area aparentemente fucniou
        const gameArea = document.querySelector('.game-area');
        if (gameArea) {
            let touchStartPoint = null;

            gameArea.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    touchStartPoint = { x: touch.clientX, y: touch.clientY };
                } else {
                    touchStartPoint = null;
                }
            }, { passive: true });

            gameArea.addEventListener('touchmove', (e) => {
                if (e.touches.length !== 1 || !touchStartPoint) {
                    return;
                }

                const touch = e.touches[0];
                const deltaX = Math.abs(touch.clientX - touchStartPoint.x);
                const deltaY = Math.abs(touch.clientY - touchStartPoint.y);

                if (deltaX > deltaY * 1.2) {
                    e.preventDefault();
                }
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
        this.clearPredictionSnapshot();
        
        // Update UI
        this.uiManager.setGameState('waiting', data);
        
        console.log('⏳ Waiting for next game...');
    }
    
    handleStartingState(data) {
        // Prepare for new game
        this.rocketCurve.reset();
        this.explosionParticles = null;
        this.currentMultiplier = 1.00;
        this.clearPredictionSnapshot();
        
        // Update UI
        this.uiManager.setGameState('starting', data);
        
        console.log('🚀 Game starting...');
    }
    
    handleFlyingState(data) {
        const rawMultiplier = typeof data.multiplier === 'number'
            ? data.multiplier
            : (typeof data.displayMultiplier === 'number' ? data.displayMultiplier : this.currentMultiplier);
        const displayMultiplier = typeof data.displayMultiplier === 'number'
            ? data.displayMultiplier
            : Number(rawMultiplier.toFixed(2));
        const timeValue = typeof data.time === 'number' ? data.time : 0;
        const growthRate = typeof data.growthRate === 'number' && data.growthRate > 0
            ? data.growthRate
            : this.defaultGrowthRate;
        const dataTimestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();
        
        // Update game state
        this.currentMultiplier = rawMultiplier;
        
        if (!this.gameStartTime) {
            this.gameStartTime = Date.now() - (timeValue * 1000);
        }
        
        // Add point to curve
        this.rocketCurve.addPoint(timeValue, rawMultiplier);
        
        // Update UI
        this.uiManager.setGameState('flying', { multiplier: displayMultiplier });

        if (!this.predictionSnapshot) {
            this.handlePredictionSnapshot({
                multiplier: rawMultiplier,
                displayMultiplier,
                time: timeValue,
                timestamp: dataTimestamp,
                growthRate
            });
        }
        
        // Check auto cash out
        this.checkAutoCashOut(rawMultiplier);
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

        this.clearPredictionSnapshot();
        
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
    
    handlePredictionSnapshot(data) {
        if (!data || typeof data !== 'object') {
            return;
        }

        if (this.gameState !== 'flying') {
            return;
        }

        const rawMultiplier = typeof data.multiplier === 'number' ? data.multiplier : null;
        if (rawMultiplier === null || !Number.isFinite(rawMultiplier)) {
            return;
        }

        const growthRate = typeof data.growthRate === 'number' && data.growthRate > 0
            ? data.growthRate
            : (this.predictionSnapshot?.growthRate || this.defaultGrowthRate);

        if (!growthRate || !Number.isFinite(growthRate) || growthRate <= 0) {
            return;
        }

        let timeValue = typeof data.time === 'number' && Number.isFinite(data.time)
            ? data.time
            : null;

        const safeMultiplier = Math.max(1.0, rawMultiplier);
        if (timeValue === null) {
            timeValue = Math.log(safeMultiplier) / growthRate;
        }

        const timestamp = typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
            ? data.timestamp
            : Date.now();

        const displayMultiplier = typeof data.displayMultiplier === 'number' && Number.isFinite(data.displayMultiplier)
            ? data.displayMultiplier
            : Number(safeMultiplier.toFixed(2));

        this.predictionSnapshot = {
            multiplier: safeMultiplier,
            time: Math.max(0, timeValue),
            timestamp,
            growthRate,
            displayMultiplier
        };

        this.lastPredictedDisplay = displayMultiplier;
        if (this.uiManager?.updateMultiplier) {
            this.uiManager.updateMultiplier(displayMultiplier);
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

        if (currentTime && this.lastRenderTimestamp && (currentTime - this.lastRenderTimestamp) < this.targetFrameInterval) {
            this.animationFrameId = requestAnimationFrame((time) => this.render(time));
            return;
        }

        if (currentTime) {
            this.lastRenderTimestamp = currentTime;
        }
        
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

        if (this.gameState === 'flying') {
            const prediction = this.getPredictedMultiplier();
            if (prediction) {
                const displayMultiplier = Number(prediction.multiplier.toFixed(2));
                if (this.lastPredictedDisplay === null || Math.abs(displayMultiplier - this.lastPredictedDisplay) >= 0.01) {
                    this.uiManager.updateMultiplier(displayMultiplier);
                    this.lastPredictedDisplay = displayMultiplier;
                }

                if (this.rocketCurve) {
                    this.rocketCurve.setPredictedPoint(prediction.time, prediction.multiplier);
                }
            } else if (this.rocketCurve) {
                this.rocketCurve.clearPredictedPoint();
            }
        } else if (this.rocketCurve) {
            this.rocketCurve.clearPredictedPoint();
        }
        
        // Draw grid using dynamic Y scale (start at 2x, smooth zoom-out)
        let yMaxForGrid = 2;
        let timeWindowForGrid = 30;
        if (this.rocketCurve) {
            const yMaxNext = Math.max(1.01, this.rocketCurve.yMax + (this.rocketCurve.yMaxTarget - this.rocketCurve.yMax) * 0.15);
            yMaxForGrid = Math.max(2, yMaxNext);
            if (typeof this.rocketCurve.getWindowSize === 'function') {
                timeWindowForGrid = this.rocketCurve.getWindowSize();
            }
        }
        this.canvasManager.drawGrid(1, yMaxForGrid, timeWindowForGrid);
        
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
        if (this.startDelayTimeout) {
            return;
        }

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
    
    getPredictedMultiplier() {
        if (this.gameState !== 'flying' || !this.predictionSnapshot) {
            return null;
        }

        const { multiplier, time, timestamp, growthRate } = this.predictionSnapshot;

        if (!Number.isFinite(multiplier) || !Number.isFinite(growthRate) || growthRate <= 0) {
            return null;
        }

        const baseTime = Number.isFinite(time) ? time : Math.log(Math.max(1.0, multiplier)) / growthRate;
        const elapsedSinceSnapshot = Math.max(0, (Date.now() - timestamp) / 1000);
        const predictedTime = baseTime + elapsedSinceSnapshot;

        let predictedMultiplier = Math.exp(growthRate * predictedTime);
        if (!Number.isFinite(predictedMultiplier)) {
            predictedMultiplier = this.multiplierCap;
        }

        predictedMultiplier = Math.min(this.multiplierCap, Math.max(1.0, predictedMultiplier));

        return {
            multiplier: predictedMultiplier,
            time: predictedTime
        };
    }

    clearPredictionSnapshot() {
        this.predictionSnapshot = null;
        this.lastPredictedDisplay = null;
        if (this.rocketCurve) {
            this.rocketCurve.clearPredictedPoint();
        }
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
