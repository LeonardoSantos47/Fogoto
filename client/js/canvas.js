// Canvas management and graphics rendering

class CanvasManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.dpr = window.devicePixelRatio || 1;
        
        this.setupCanvas();
        this.setupResizeHandler();
        
        // Performance settings
        this.performanceSettings = this.detectPerformance();
    }
    
    setupCanvas() {
        this.resize();
        
        // Enable hardware acceleration
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }
    
    setupResizeHandler() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.resize(), 150);
        });
    }
    
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        
        // Set actual canvas size in memory (scaled for high DPI)
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        
    // Reset transform and scale the drawing context once per resize
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
        
        // Set the CSS size to maintain responsive design
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
    }
    
    detectPerformance() {
        const isLowEnd = navigator.hardwareConcurrency < 4 || 
                        navigator.deviceMemory < 2 ||
                        window.innerWidth < 768;
        
        return {
            particleCount: isLowEnd ? 10 : 20,
            frameRate: isLowEnd ? 30 : 60,
            enableShadows: !isLowEnd,
            enableBlur: !isLowEnd
        };
    }
    
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }
    
    drawGrid(yMin = 1, yMax = 2, timeWindow = 30) {
        const { ctx, width, height } = this;
        
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.globalAlpha = 0.3;
        
        // Horizontal lines (multipliers) - dynamically based on yMax
        const lines = 10;
        for (let i = 0; i <= lines; i++) {
            const frac = i / lines; // 0..1 from bottom to top
            const y = height - frac * height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // Labels
            ctx.fillStyle = '#a0aec0';
            ctx.font = '12px Inter, sans-serif';
            ctx.globalAlpha = 0.6;
            const value = yMin + frac * (yMax - yMin);
            const decimals = (yMax - yMin) > 5 ? 1 : 2;
            ctx.fillText(`${value.toFixed(decimals)}x`, 10, y - 5);
            ctx.globalAlpha = 0.3;
        }
        
        // Vertical lines (time)
        const timeIntervals = 6;
        const secondsPerInterval = timeWindow / timeIntervals;
        for (let i = 1; i <= timeIntervals; i++) {
            const x = (i / timeIntervals) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            // Time labels
            ctx.fillStyle = '#a0aec0';
            ctx.globalAlpha = 0.6;
            ctx.fillText(`${Math.round(i * secondsPerInterval)}s`, x + 5, height - 5);
            ctx.globalAlpha = 0.3;
        }
        
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }
    
    drawBackground() {
        const { ctx, width, height } = this;
        
        // Gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(26, 32, 44, 0.8)');
        gradient.addColorStop(1, 'rgba(45, 55, 72, 0.8)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
}

class RocketCurve {
    constructor(canvasManager) {
        this.canvas = canvasManager;
        this.ctx = canvasManager.ctx;
        // Armazena pontos crus (tempo e multiplicador)
        this.rawPoints = [];
        this.animationId = null;
        this.isAnimating = false;
        // Escala dinâmica do eixo Y: começa em 2x e faz zoom out suave
        this.yMax = 2.0;         // escala atual usada para desenhar (suavizada)
        this.yMaxTarget = 2.0;   // alvo baseado no maior multiplicador recente
        this.marginFactor = 1.1; // margem de 10% acima do atual
        // Escala dinâmica do eixo X (tempo)
        this.minTimeWindow = 12;   // segundos mínimos para preencher a tela
        this.maxTimeWindow = 90;   // limite superior (similar à duração máxima do jogo)
        this.timeWindow = this.minTimeWindow;
        this.timeWindowTarget = this.minTimeWindow;
        this.interpolationStep = 0.1; // cria pontos intermediários para curva suave
        this.predictedPoint = null;
    }
    
    reset() {
        this.rawPoints = [];
        this.yMax = 2.0;
        this.yMaxTarget = 2.0;
        this.timeWindow = this.minTimeWindow;
        this.timeWindowTarget = this.minTimeWindow;
        this.stopAnimation();
        this.predictedPoint = null;
    }
    
    addPoint(time, multiplier) {
        if (typeof time !== 'number' || typeof multiplier !== 'number') {
            return;
        }

        const safeMultiplier = Math.max(1.0, multiplier);

        // Garantir ordem crescente de tempo
        const lastPoint = this.rawPoints[this.rawPoints.length - 1];
        if (!lastPoint) {
            const seedTime = Math.max(0, time - 0.05);
            this.rawPoints.push({ time: seedTime, multiplier: safeMultiplier });
        }

        const previousPoint = this.rawPoints[this.rawPoints.length - 1];
        if (previousPoint && time <= previousPoint.time) {
            time = previousPoint.time + 0.0001;
        }

        // Atualiza escala alvo (zoom out) quando passar de 2x
        this.yMaxTarget = Math.max(2.0, Math.min(250, safeMultiplier * this.marginFactor));

        // Ajusta janela alvo do eixo X para preencher o gráfico com base no progresso
        const desiredWindow = Math.min(
            this.maxTimeWindow,
            Math.max(this.minTimeWindow, time *1.2 + 1)
        );
        this.timeWindowTarget = desiredWindow;

        // Interpolar pontos intermediários para evitar "buracos" na linha
        if (previousPoint) {
            const deltaTime = time - previousPoint.time;
            if (deltaTime > this.interpolationStep * 1.5) {
                const steps = Math.min(10, Math.floor(deltaTime / this.interpolationStep));
                for (let i = 1; i <= steps; i++) {
                    const factor = i / (steps + 1);
                    const interpTime = previousPoint.time + deltaTime * factor;
                    const interpMultiplier = previousPoint.multiplier + (safeMultiplier - previousPoint.multiplier) * factor;
                    this.rawPoints.push({ time: interpTime, multiplier: interpMultiplier });
                }
            }
        }

        // Armazena ponto cru
        this.rawPoints.push({ time, multiplier: safeMultiplier });

        // Limita histórico recente (ex.: últimos 60s)
        const cutoff = time - this.maxTimeWindow;
        if (cutoff > 0) {
            this.rawPoints = this.rawPoints.filter(p => p.time >= cutoff);
        } else if (this.rawPoints.length > 2000) {
            this.rawPoints = this.rawPoints.filter((_, idx, arr) => idx > arr.length - 2000);
        }
    }

    setPredictedPoint(time, multiplier) {
        if (typeof time !== 'number' || typeof multiplier !== 'number' || !Number.isFinite(time) || !Number.isFinite(multiplier)) {
            this.predictedPoint = null;
            return;
        }

        const safeMultiplier = Math.max(1.0, Math.min(multiplier, 250));
        const safeTime = Math.max(0, time);

        this.predictedPoint = {
            time: safeTime,
            multiplier: safeMultiplier
        };
    }

    clearPredictedPoint() {
        this.predictedPoint = null;
    }

    getWindowSize() {
        return Math.max(this.minTimeWindow, Math.min(this.maxTimeWindow, this.timeWindow));
    }
    
    draw() {
        const { ctx } = this;
        
        // Draw main curve
        ctx.strokeStyle = '#e53e3e';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Add glow effect on high-performance devices
        if (this.canvas.performanceSettings.enableShadows) {
            ctx.shadowColor = '#e53e3e';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        
        // Suaviza escala Y gradualmente
        this.yMax += (this.yMaxTarget - this.yMax) * 0.15; // 15% por frame
        const yMax = Math.max(1.01, this.yMax);

        // Suaviza ajustes da janela de tempo
        this.timeWindow += (this.timeWindowTarget - this.timeWindow) * 0.12;
        const windowSize = this.getWindowSize();

        if (this.rawPoints.length === 0) {
            return;
        }

        // Converte pontos crus para pontos em tela usando escala dinâmica
    const nowWindowEnd = this.rawPoints[this.rawPoints.length - 1].time; // último tempo conhecido
        const windowStart = Math.max(0, nowWindowEnd - windowSize);
        // Dimensões em pixels CSS (o contexto já está escalado pelo DPR)
        const cssWidth = this.canvas.width;
        const cssHeight = this.canvas.height;

        const pts = [];
        for (const p of this.rawPoints) {
            if (p.time < windowStart) continue;
            const tNorm = (p.time - windowStart) / windowSize; // 0..1
            const x = Math.min(cssWidth * tNorm, cssWidth);
            // map 1..yMax para 0..cssHeight
            const mClamped = Math.max(1.0, Math.min(p.multiplier, yMax));
            const yNorm = (mClamped - 1.0) / (yMax - 1.0);
            const y = cssHeight - yNorm * cssHeight;
            pts.push({ x, y });
        }

        if (this.predictedPoint) {
            const lastRaw = this.rawPoints[this.rawPoints.length - 1];
            if (lastRaw && this.predictedPoint.time >= lastRaw.time) {
                const tNorm = (this.predictedPoint.time - windowStart) / windowSize;
                const x = Math.min(cssWidth * tNorm, cssWidth);
                const mClamped = Math.max(1.0, Math.min(this.predictedPoint.multiplier, yMax));
                const yNorm = (mClamped - 1.0) / (yMax - 1.0);
                const y = cssHeight - yNorm * cssHeight;
                pts.push({ x, y, predicted: true });
            }
        }

        if (pts.length < 2) {
            // Desenha um marcador simples quando há somente um ponto (início do jogo)
            const single = pts[0];
            if (single) {
                ctx.beginPath();
                ctx.moveTo(Math.max(0, single.x - 12), single.y);
                ctx.lineTo(single.x, single.y);
                ctx.strokeStyle = '#e53e3e';
                ctx.lineWidth = 3;
                ctx.stroke();
                this.drawCurrentPoint();
            }
            return;
        }

        // Reduz a quantidade de pontos desenhados para manter performance estável
        let drawPoints = pts;
        const maxDrawPoints = 700;
        if (drawPoints.length > maxDrawPoints) {
            const step = Math.ceil(drawPoints.length / maxDrawPoints);
            const sampled = [];
            for (let i = 0; i < drawPoints.length; i += step) {
                sampled.push(drawPoints[i]);
            }
            const lastSample = sampled[sampled.length - 1];
            const lastPoint = drawPoints[drawPoints.length - 1];
            if (lastSample !== lastPoint) {
                sampled.push(lastPoint);
            }
            drawPoints = sampled;
        }

        // Catmull-Rom -> Bezier para suavidade sem picos
        ctx.beginPath();
        ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
        for (let i = 0; i < drawPoints.length - 1; i++) {
            const p0 = i > 0 ? drawPoints[i - 1] : drawPoints[0];
            const p1 = drawPoints[i];
            const p2 = drawPoints[i + 1];
            const p3 = i !== drawPoints.length - 2 ? drawPoints[i + 2] : p2;

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        
        ctx.stroke();
        
        // Reset shadow
        if (this.canvas.performanceSettings.enableShadows) {
            ctx.shadowBlur = 0;
        }
        
        // Draw current point indicator
        this.drawCurrentPoint();
    }
    
    drawCurrentPoint() {
        if (this.rawPoints.length === 0) return;

        const referencePoint = (this.predictedPoint && this.rawPoints.length)
            ? this.predictedPoint
            : this.rawPoints[this.rawPoints.length - 1];

        // Converte ponto de referência para coordenadas atuais
        const windowSize = this.getWindowSize();
        const windowStart = Math.max(0, referencePoint.time - windowSize);
        const cssWidth = this.canvas.width;
        const cssHeight = this.canvas.height;
        const yMax = Math.max(1.01, this.yMax);
        const tNorm = (referencePoint.time - windowStart) / windowSize;
        const x = Math.min(cssWidth * tNorm, cssWidth);
        const mClamped = Math.max(1.0, Math.min(referencePoint.multiplier, yMax));
        const yNorm = (mClamped - 1.0) / (yMax - 1.0);
        const y = cssHeight - yNorm * cssHeight;
        const { ctx } = this;
        
        // Pulsing dot at current position
        const time = Date.now() / 500;
        const pulse = Math.sin(time) * 0.3 + 0.7;
        
        ctx.beginPath();
    ctx.arc(x, y, 6 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        ctx.beginPath();
    ctx.arc(x, y, 4 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#e53e3e';
        ctx.fill();
    }
    
    startAnimation() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.animate();
    }
    
    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
    
    animate() {
        if (!this.isAnimating) return;
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    // Get curve trajectory for rocket sprite positioning
    getRocketPosition() {
        if (this.rawPoints.length === 0) return null;

        const lastRaw = this.rawPoints[this.rawPoints.length - 1];

        const referencePoint = (this.predictedPoint && this.rawPoints.length)
            ? this.predictedPoint
            : this.rawPoints[this.rawPoints.length - 1];

        const windowSize = this.getWindowSize();
        const windowStart = Math.max(0, referencePoint.time - windowSize);
        const cssWidth = this.canvas.width;
        const cssHeight = this.canvas.height;
        const yMax = Math.max(1.01, this.yMax);
        const tNorm = (referencePoint.time - windowStart) / windowSize;
        const x = Math.min(cssWidth * tNorm, cssWidth);
        const mClamped = Math.max(1.0, Math.min(referencePoint.multiplier, yMax));
        const yNorm = (mClamped - 1.0) / (yMax - 1.0);
        const y = cssHeight - yNorm * cssHeight;
        
        // Calculate angle based on last few points for smooth rotation
        let angle = 0;
        if (this.rawPoints.length > 1) {
            const prevRaw = this.rawPoints[this.rawPoints.length - 2];
            const prevTNorm = (prevRaw.time - windowStart) / windowSize;
            const px = Math.min(cssWidth * prevTNorm, cssWidth);
            const pm = Math.max(1.0, Math.min(prevRaw.multiplier, yMax));
            const pyNorm = (pm - 1.0) / (yMax - 1.0);
            const py = cssHeight - pyNorm * cssHeight;
            angle = Math.atan2(y - py, x - px);
        }
        
        return {
            x,
            y,
            angle: angle,
            multiplier: lastRaw ? lastRaw.multiplier : referencePoint.multiplier
        };
    }
}

class ExplosionParticles {
    constructor(canvasManager, x, y) {
        this.canvas = canvasManager;
        this.ctx = canvasManager.ctx;
        this.particles = [];
        this.isActive = false;
        
        this.createParticles(x, y);
    }
    
    createParticles(x, y) {
        const particleCount = this.canvas.performanceSettings.particleCount;
        
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 0.5) * 15,
                life: 1.0,
                decay: 0.015 + Math.random() * 0.01,
                size: 2 + Math.random() * 4,
                color: this.getRandomColor()
            });
        }
        
        this.isActive = true;
    }
    
    getRandomColor() {
        const colors = ['#ff6b6b', '#ffa500', '#ffff00', '#ff4757', '#ff3742'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    update() {
        if (!this.isActive) return;
        
        this.particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.2; // Gravity
            particle.vx *= 0.98; // Air resistance
            particle.life -= particle.decay;
        });
        
        // Remove dead particles
        this.particles = this.particles.filter(particle => particle.life > 0);
        
        if (this.particles.length === 0) {
            this.isActive = false;
        }
    }
    
    draw() {
        if (!this.isActive) return;
        
        const { ctx } = this;
        
        this.particles.forEach(particle => {
            ctx.save();
            ctx.globalAlpha = particle.life;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}

// Performance throttling function
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Export for use in other modules
window.CanvasManager = CanvasManager;
window.RocketCurve = RocketCurve;
window.ExplosionParticles = ExplosionParticles;
