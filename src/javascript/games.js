/**
 * games.js
 * Manages mini-games for the Pomodoro break sessions.
 * Features: Connect 4, Match 3 (Candy Crush), Memory, Endless Runner.
 * UI: Clean, flat, modern, consistent with the "Infinite Whiteboard" aesthetic.
 */

// Inject subtle slide animation style
const gameStyles = document.createElement('style');
gameStyles.innerHTML = `
@keyframes softSlideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
.animate-soft-slide {
    animation: softSlideUp 0.4s ease-out forwards;
}
`;
document.head.appendChild(gameStyles);

const Games = {
    activeGame: null,
    view: null,
    selector: null,
    container: null,
    backBtn: null,
    initialized: false,

    init() {
        this.view = document.getElementById('game-view');
        this.selector = document.getElementById('game-selector');
        this.container = document.getElementById('active-game-container');
        this.backBtn = document.getElementById('back-to-games-btn');

        if (!this.view || !this.selector) {
            console.warn("Game elements not found in DOM.");
            return;
        }

        // Re-bind back button with consistent clean styling
        if (this.backBtn) {
            const newBackBtn = this.backBtn.cloneNode(true);
            if(this.backBtn.parentNode) {
                this.backBtn.parentNode.replaceChild(newBackBtn, this.backBtn);
            }
            this.backBtn = newBackBtn;
            
            // Simple, clean pill button matching other UI elements
            this.backBtn.className = "absolute top-4 left-4 z-20 text-xs font-medium text-gray-400 hover:text-white hidden flex items-center gap-2 bg-[#1a1b1d] border border-[#222426] px-3 py-1.5 rounded-full transition-colors hover:border-gray-600";
            this.backBtn.innerHTML = '<i class="fa-solid fa-arrow-left text-[10px]"></i> <span>Back</span>';
            
            this.backBtn.onclick = () => {
                this.stopActiveGame();
                this.showMenu();
            };
        }

        this.renderMenu();
        this.showMenu(); // Default state
        
        this.initialized = true;
        console.log("Games module initialized (Clean UI).");
    },

    enable() {
        if (!this.initialized) {
            this.init();
        } else if (this.selector && this.selector.children.length === 0) {
            this.renderMenu();
        }
    },

    renderMenu() {
        if (!this.selector) return;
        this.selector.innerHTML = '';
        
        const games = [
            { id: 'connect4', name: 'Connect 4', icon: 'fa-circle-nodes', accent: 'text-blue-500' },
            { id: 'match3', name: 'Candy Match', icon: 'fa-candy-cane', accent: 'text-pink-500' },
            { id: 'memory', name: 'Memory', icon: 'fa-brain', accent: 'text-emerald-500' },
            { id: 'runner', name: 'Dino Run', icon: 'fa-dragon', accent: 'text-orange-500' }
        ];

        games.forEach((g, index) => {
            const btn = document.createElement('button');
            // Clean card styling: dark gray background, subtle border, consistent with settings/popups
            btn.className = `
                flex-shrink-0 w-36 h-40 rounded-xl 
                bg-[#1a1b1d] border border-[#222426] 
                text-gray-300 hover:text-white
                hover:bg-[#222426] hover:border-gray-600 
                transition-all duration-200 ease-out
                flex flex-col items-center justify-center gap-3
                animate-soft-slide cursor-pointer group
            `;
            
            // Stagger animation slightly
            btn.style.animationDelay = `${index * 50}ms`;
            btn.style.opacity = '0'; // Initial state for animation

            const icon = document.createElement('i');
            icon.className = `fa-solid ${g.icon} text-3xl mb-1 text-gray-500 group-hover:${g.accent} transition-colors duration-200`;
            btn.appendChild(icon);

            const label = document.createElement('span');
            label.className = 'text-xs font-semibold tracking-wide';
            label.innerText = g.name;
            btn.appendChild(label);

            btn.onclick = () => this.startGame(g.id);
            this.selector.appendChild(btn);
        });
        
        // Spacer for scroll
        const spacer = document.createElement('div');
        spacer.className = 'w-4 flex-shrink-0';
        this.selector.appendChild(spacer);
    },

    showMenu() {
        if (!this.selector) return;
        
        this.selector.style.display = 'flex';
        this.container.style.display = 'none';
        this.backBtn.style.display = 'none';
        this.container.innerHTML = ''; 
        
        // Re-render to ensure animations trigger nicely
        this.renderMenu(); 
    },

    startGame(gameId) {
        // Simple fade out
        this.selector.style.display = 'none';
        this.container.style.display = 'flex';
        this.backBtn.style.display = 'flex';
        this.container.innerHTML = ''; 
        
        // Fade in container
        this.container.className = "w-full h-full flex flex-col items-center justify-center p-2 animate-soft-slide";

        switch(gameId) {
            case 'connect4':
                this.activeGame = new ConnectFour(this.container);
                break;
            case 'match3':
                this.activeGame = new MatchThree(this.container);
                break;
            case 'memory':
                this.activeGame = new MemoryGame(this.container);
                break;
            case 'runner':
                this.activeGame = new DinoRunner(this.container);
                break;
        }
    },

    stopActiveGame() {
        if (this.activeGame && typeof this.activeGame.destroy === 'function') {
            this.activeGame.destroy();
        }
        this.activeGame = null;
        if (this.container) this.container.innerHTML = '';
    }
};

// Explicitly attach to window
window.Games = Games;

// Initialization Helper
window.initGames = function() {
    if (window.Games) {
        window.Games.init();
    }
};


/* =========================================
   GAME 1: CONNECT FOUR (Clean UI)
   ========================================= */
class ConnectFour {
    constructor(root) {
        this.rows = 6;
        this.cols = 7;
        this.currentPlayer = 1; // 1 = Red, 2 = Yellow
        this.board = []; 
        this.gameOver = false;
        this.root = root;
        this.init();
    }

    init() {
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center gap-4 w-full h-full justify-center';
        
        // Status Indicator
        this.status = document.createElement('div');
        this.status.className = 'text-sm font-medium text-gray-300 flex items-center gap-2 bg-[#1a1b1d] px-3 py-1.5 rounded-lg border border-[#222426]';
        this.status.innerHTML = `<div class="w-2 h-2 rounded-full bg-red-500"></div> Red's Turn`;
        wrapper.appendChild(this.status);

        const grid = document.createElement('div');
        // Flat dark blue board
        grid.className = 'grid grid-cols-7 gap-1.5 bg-[#1e3a8a] p-2 rounded-lg border border-[#172554] shadow-sm';
        grid.style.width = 'fit-content'; 

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = document.createElement('div');
                // Empty cells are dark holes
                cell.className = 'w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-[#0f172a] cursor-pointer hover:bg-[#1e293b] transition-colors';
                cell.dataset.col = c; 
                cell.onclick = () => this.handleClick(c);
                grid.appendChild(cell);
            }
        }
        this.gridEl = grid;
        wrapper.appendChild(grid);

        // Restart Button
        const resetBtn = document.createElement('button');
        resetBtn.className = 'text-xs text-gray-400 hover:text-white bg-transparent hover:bg-[#1a1b1d] border border-transparent hover:border-[#222426] px-3 py-1.5 rounded-md transition-all';
        resetBtn.innerHTML = '<i class="fa-solid fa-rotate-right mr-1"></i> Restart';
        resetBtn.onclick = () => {
            this.root.innerHTML = '';
            this.init();
        };
        wrapper.appendChild(resetBtn);

        this.root.appendChild(wrapper);
    }

    handleClick(col) {
        if (this.gameOver) return;

        let targetRow = -1;
        for (let r = this.rows - 1; r >= 0; r--) {
            if (this.board[r][col] === 0) {
                targetRow = r;
                break;
            }
        }

        if (targetRow !== -1) {
            this.board[targetRow][col] = this.currentPlayer;
            
            const index = targetRow * this.cols + col;
            const cell = this.gridEl.children[index];
            
            cell.classList.remove('bg-[#0f172a]', 'hover:bg-[#1e293b]');
            // Matte colors
            cell.classList.add(this.currentPlayer === 1 ? 'bg-red-500' : 'bg-yellow-400');
            cell.classList.add('animate-soft-slide');

            if (this.checkWin(targetRow, col)) {
                const winner = this.currentPlayer === 1 ? "Red" : "Yellow";
                const colorClass = this.currentPlayer === 1 ? "text-red-400" : "text-yellow-300";
                this.status.innerHTML = `<span class="${colorClass} font-bold">${winner} Wins!</span>`;
                this.status.className = "text-sm font-medium bg-[#1a1b1d] px-4 py-2 rounded-lg border border-[#222426]";
                this.gameOver = true;
            } else {
                this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
                const nextColor = this.currentPlayer === 1 ? "bg-red-500" : "bg-yellow-400";
                const nextName = this.currentPlayer === 1 ? "Red" : "Yellow";
                this.status.innerHTML = `<div class="w-2 h-2 rounded-full ${nextColor}"></div> ${nextName}'s Turn`;
            }
        }
    }

    checkWin(row, col) {
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
        const val = this.board[row][col];

        for (let [dr, dc] of directions) {
            let count = 1;
            for (let i = 1; i < 4; i++) {
                const r = row + dr * i, c = col + dc * i;
                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.board[r][c] === val) count++;
                else break;
            }
            for (let i = 1; i < 4; i++) {
                const r = row - dr * i, c = col - dc * i;
                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.board[r][c] === val) count++;
                else break;
            }
            if (count >= 4) return true;
        }
        return false;
    }
    destroy() {}
}

/* =========================================
   GAME 2: CANDY MATCH (Clean UI)
   ========================================= */
class MatchThree {
    constructor(root) {
        this.width = 8;
        this.height = 8;
        this.colors = ['bg-red-500', 'bg-yellow-400', 'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500'];
        this.board = [];
        this.root = root;
        this.score = 0;
        this.draggedTile = null;
        this.replacedTile = null;
        this.isProcessing = false;
        this.init();
    }

    init() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full w-full';

        this.scoreEl = document.createElement('div');
        this.scoreEl.className = 'text-gray-300 font-mono text-xs mb-3 bg-[#1a1b1d] border border-[#222426] px-3 py-1 rounded';
        this.scoreEl.innerText = 'SCORE: 0';
        wrapper.appendChild(this.scoreEl);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-8 gap-1 bg-[#151313] p-2 rounded-xl border border-[#222426] select-none';
        
        this.gridEl = grid;
        wrapper.appendChild(grid);
        this.root.appendChild(wrapper);

        this.createBoard();
    }

    createBoard() {
        this.gridEl.innerHTML = '';
        this.board = [];
        for (let i = 0; i < this.width * this.height; i++) {
            const tile = document.createElement('div');
            const color = this.randomColor();
            // Simple rounded squares, no fancy effects
            tile.className = `w-7 h-7 rounded-sm cursor-grab active:cursor-grabbing ${color} hover:brightness-110 transition-opacity`;
            tile.setAttribute('draggable', true);
            tile.setAttribute('id', i);
            tile.dataset.color = color;
            
            tile.addEventListener('dragstart', this.dragStart.bind(this));
            tile.addEventListener('dragover', (e) => e.preventDefault());
            tile.addEventListener('dragenter', (e) => e.preventDefault());
            tile.addEventListener('drop', this.dragDrop.bind(this));
            tile.addEventListener('dragend', this.dragEnd.bind(this));

            this.gridEl.appendChild(tile);
            this.board.push(tile);
        }
        this.checkMatchesAndFill(); 
    }

    randomColor() { return this.colors[Math.floor(Math.random() * this.colors.length)]; }

    dragStart(e) { 
        if (this.isProcessing) {
            e.preventDefault();
            return;
        }
        this.draggedTile = e.target; 
        this.draggedTile.style.opacity = '0.5';
    }
    
    dragDrop(e) { this.replacedTile = e.target; }

    dragEnd() {
        if (this.draggedTile) this.draggedTile.style.opacity = '1';
        
        if (!this.replacedTile || !this.draggedTile || this.isProcessing) return;

        let draggedId = parseInt(this.draggedTile.id);
        let replacedId = parseInt(this.replacedTile.id);
        
        const validMoves = [draggedId - 1, draggedId - this.width, draggedId + 1, draggedId + this.width];
        const validMove = validMoves.includes(replacedId);
        const isRowWrap = Math.abs(draggedId % this.width - replacedId % this.width) > 1;

        if (validMove && !isRowWrap) {
            this.swapTiles(this.draggedTile, this.replacedTile);
            
            const matches = this.findMatches();
            if (matches.length === 0) {
                setTimeout(() => this.swapTiles(this.draggedTile, this.replacedTile), 200);
            } else {
                this.checkMatchesAndFill();
            }
        }
        
        this.draggedTile = null;
        this.replacedTile = null;
    }

    swapTiles(tile1, tile2) {
        const color1 = tile1.dataset.color;
        const color2 = tile2.dataset.color;
        
        tile1.className = tile1.className.replace(color1, color2);
        tile2.className = tile2.className.replace(color2, color1);

        tile1.dataset.color = color2;
        tile2.dataset.color = color1;
    }

    findMatches() {
        const matchedIndices = new Set();

        // Horizontal
        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width - 2; c++) {
                let idx = r * this.width + c;
                let matchLen = 1;
                while (c + matchLen < this.width && 
                       this.board[idx].dataset.color === this.board[idx + matchLen].dataset.color &&
                       this.board[idx].dataset.color !== 'transparent') {
                    matchLen++;
                }
                if (matchLen >= 3) {
                    for (let k = 0; k < matchLen; k++) matchedIndices.add(idx + k);
                    c += matchLen - 1;
                }
            }
        }

        // Vertical
        for (let c = 0; c < this.width; c++) {
            for (let r = 0; r < this.height - 2; r++) {
                let idx = r * this.width + c;
                let matchLen = 1;
                while (r + matchLen < this.height && 
                       this.board[idx].dataset.color === this.board[idx + matchLen * this.width].dataset.color &&
                       this.board[idx].dataset.color !== 'transparent') {
                    matchLen++;
                }
                if (matchLen >= 3) {
                    for (let k = 0; k < matchLen; k++) matchedIndices.add(idx + k * this.width);
                    r += matchLen - 1;
                }
            }
        }
        return Array.from(matchedIndices);
    }

    async checkMatchesAndFill() {
        this.isProcessing = true;
        const matches = this.findMatches();
        
        if (matches.length > 0) {
            this.score += matches.length * 10;
            this.scoreEl.innerText = `SCORE: ${this.score}`;

            matches.forEach(idx => {
                const tile = this.board[idx];
                const oldColor = tile.dataset.color;
                tile.classList.remove(oldColor);
                tile.classList.add('bg-transparent');
                tile.dataset.color = 'transparent';
            });

            await new Promise(r => setTimeout(r, 200));

            this.applyGravity();
            this.refillBoard();

            setTimeout(() => this.checkMatchesAndFill(), 300);
        } else {
            this.isProcessing = false;
        }
    }

    applyGravity() {
        for (let c = 0; c < this.width; c++) {
            let writeRow = this.height - 1;
            for (let r = this.height - 1; r >= 0; r--) {
                let idx = r * this.width + c;
                if (this.board[idx].dataset.color !== 'transparent') {
                    if (writeRow !== r) {
                        let writeIdx = writeRow * this.width + c;
                        let tile = this.board[idx];
                        let target = this.board[writeIdx];
                        
                        const color = tile.dataset.color;
                        target.className = target.className.replace(target.dataset.color, color);
                        if (target.classList.contains('bg-transparent')) {
                            target.classList.remove('bg-transparent');
                        }
                        target.dataset.color = color;
                        
                        tile.className = tile.className.replace(color, 'bg-transparent');
                        tile.dataset.color = 'transparent';
                    }
                    writeRow--;
                }
            }
        }
    }

    refillBoard() {
        for (let i = 0; i < this.width * this.height; i++) {
            if (this.board[i].dataset.color === 'transparent') {
                const color = this.randomColor();
                this.board[i].classList.remove('bg-transparent');
                this.board[i].classList.add(color);
                this.board[i].dataset.color = color;
            }
        }
    }

    destroy() {}
}

/* =========================================
   GAME 3: MEMORY MATCH (Clean UI)
   ========================================= */
class MemoryGame {
    constructor(root) {
        this.root = root;
        this.cards = [];
        this.hasFlippedCard = false;
        this.lockBoard = false;
        this.firstCard = null;
        this.secondCard = null;
        this.matchesFound = 0;
        this.init();
    }

    init() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full gap-4';

        const info = document.createElement('div');
        info.innerText = 'Find Pairs';
        info.className = 'text-gray-400 text-xs font-bold uppercase tracking-widest';
        wrapper.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-4 gap-2 p-2';
        
        const icons = ['fa-cat', 'fa-dog', 'fa-fish', 'fa-crow', 'fa-dragon', 'fa-hippo', 'fa-spider', 'fa-horse'];
        const items = [...icons, ...icons].sort(() => 0.5 - Math.random());

        items.forEach(iconClass => {
            const card = document.createElement('div');
            // Solid dark gray back, minimal styles
            card.className = 'w-12 h-12 sm:w-14 sm:h-14 bg-[#222426] border border-[#333] rounded-lg cursor-pointer flex items-center justify-center text-white text-xl transition-colors duration-200 hover:border-gray-500';
            card.dataset.icon = iconClass;

            const front = document.createElement('i');
            front.className = `fa-solid ${iconClass} hidden animate-soft-slide text-xl`;
            card.appendChild(front);

            const back = document.createElement('div');
            back.innerHTML = '<i class="fa-solid fa-question text-[#333] text-sm"></i>';
            card.appendChild(back);

            card.onclick = () => this.flipCard(card, front, back);
            grid.appendChild(card);
        });

        wrapper.appendChild(grid);
        this.root.appendChild(wrapper);
    }

    flipCard(card, front, back) {
        if (this.lockBoard) return;
        if (card === this.firstCard) return;

        // Flip visual state
        card.classList.remove('bg-[#222426]', 'border-[#333]');
        card.classList.add('bg-emerald-600', 'border-emerald-500'); 
        back.classList.add('hidden');
        front.classList.remove('hidden');

        if (!this.hasFlippedCard) {
            this.hasFlippedCard = true;
            this.firstCard = card;
            return;
        }

        this.secondCard = card;
        this.checkForMatch();
    }

    checkForMatch() {
        let isMatch = this.firstCard.dataset.icon === this.secondCard.dataset.icon;
        isMatch ? this.disableCards() : this.unflipCards();
    }

    disableCards() {
        this.firstCard.onclick = null;
        this.secondCard.onclick = null;
        
        // Matched state: slightly dimmer green
        const matchedClass = ['bg-green-800/50', 'border-green-700', 'text-green-400'];
        const activeClass = ['bg-emerald-600', 'border-emerald-500', 'text-white'];
        
        this.firstCard.classList.remove(...activeClass);
        this.firstCard.classList.add(...matchedClass);
        
        this.secondCard.classList.remove(...activeClass);
        this.secondCard.classList.add(...matchedClass);
        
        this.matchesFound++;
        this.resetBoard();
        
        if (this.matchesFound === 8) {
            const msg = document.createElement('div');
            msg.innerText = 'Complete!';
            msg.className = 'text-green-400 font-bold mt-2 text-sm';
            this.root.querySelector('div').appendChild(msg);
        }
    }

    unflipCards() {
        this.lockBoard = true;
        setTimeout(() => {
            if (this.firstCard) {
                this.firstCard.className = 'w-12 h-12 sm:w-14 sm:h-14 bg-[#222426] border border-[#333] rounded-lg cursor-pointer flex items-center justify-center text-white text-xl transition-colors duration-200 hover:border-gray-500';
                this.firstCard.querySelector('.fa-solid').classList.add('hidden');
                this.firstCard.lastChild.classList.remove('hidden');
            }
            if (this.secondCard) {
                this.secondCard.className = 'w-12 h-12 sm:w-14 sm:h-14 bg-[#222426] border border-[#333] rounded-lg cursor-pointer flex items-center justify-center text-white text-xl transition-colors duration-200 hover:border-gray-500';
                this.secondCard.querySelector('.fa-solid').classList.add('hidden');
                this.secondCard.lastChild.classList.remove('hidden');
            }
            this.resetBoard();
        }, 700);
    }

    resetBoard() {
        [this.hasFlippedCard, this.lockBoard] = [false, false];
        [this.firstCard, this.secondCard] = [null, null];
    }
    destroy() {}
}

/* =========================================
   GAME 4: DINO RUNNER (Clean UI)
   ========================================= */
class DinoRunner {
    constructor(root) {
        this.root = root;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full gap-3';

        this.canvas = document.createElement('canvas');
        this.canvas.width = 320;
        this.canvas.height = 160;
        // Minimal canvas border
        this.canvas.className = 'bg-[#151313] border border-[#222426] rounded-lg cursor-pointer';
        
        wrapper.appendChild(this.canvas);
        
        this.scoreEl = document.createElement('div');
        this.scoreEl.className = 'text-gray-500 text-[10px] font-mono tracking-widest uppercase';
        this.scoreEl.innerText = 'Click or Space to Jump';
        wrapper.appendChild(this.scoreEl);
        
        this.root.appendChild(wrapper);
        
        this.ctx = this.canvas.getContext('2d');
        this.running = true;
        
        this.dino = { x: 30, y: 130, w: 16, h: 16, dy: 0, jumpForce: 7, grounded: true };
        this.gravity = 0.4;
        this.obstacles = [];
        this.frame = 0;
        this.score = 0;
        this.speed = 3.5;

        this.bindInput();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    bindInput() {
        this.handleJump = (e) => {
            if ((e.code === 'Space' || e.type === 'mousedown') && this.dino.grounded && this.running) {
                this.dino.dy = -this.dino.jumpForce;
                this.dino.grounded = false;
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', this.handleJump);
        this.canvas.addEventListener('mousedown', this.handleJump);
    }

    update() {
        if (!this.running) return;

        this.dino.dy += this.gravity;
        this.dino.y += this.dino.dy;

        if (this.dino.y > 140 - this.dino.h) { 
            this.dino.y = 140 - this.dino.h;
            this.dino.dy = 0;
            this.dino.grounded = true;
        }

        this.frame++;
        if (this.frame % 90 === 0) {
            this.obstacles.push({ x: 320, y: 140 - (Math.random() > 0.8 ? 24 : 14), w: 10, h: 14 });
        }

        for (let i = 0; i < this.obstacles.length; i++) {
            let obs = this.obstacles[i];
            obs.x -= this.speed;

            if (this.dino.x < obs.x + obs.w && this.dino.x + this.dino.w > obs.x &&
                this.dino.y < obs.y + obs.h && this.dino.h + this.dino.y > obs.y) {
                this.running = false;
            }

            if (obs.x + obs.w < 0) {
                this.obstacles.splice(i, 1);
                this.score++;
                i--;
            }
        }
        
        this.scoreEl.innerText = `SCORE: ${this.score}`;
        if(this.score % 10 === 0) this.speed += 0.001; 
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Floor Line
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 140);
        this.ctx.lineTo(320, 140);
        this.ctx.stroke();

        // Dino (Green Square)
        this.ctx.fillStyle = '#10b981'; // Emerald-500
        this.ctx.fillRect(this.dino.x, this.dino.y, this.dino.w, this.dino.h);

        // Obstacles (Red Rects)
        this.ctx.fillStyle = '#ef4444'; // Red-500
        this.obstacles.forEach(obs => this.ctx.fillRect(obs.x, obs.y, obs.w, obs.h));

        if (!this.running) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 20px Inter, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', this.canvas.width/2, 70);
            
            this.ctx.fillStyle = '#9ca3af';
            this.ctx.font = '11px Inter, sans-serif';
            this.ctx.fillText('Click or Press Space to Restart', this.canvas.width/2, 95);
            
            this.canvas.onclick = () => {
                this.destroy();
                this.root.innerHTML = '';
                new DinoRunner(this.root);
                Games.activeGame = this; 
            };
            // Also restart on space
            const restartHandler = (e) => {
                if (e.code === 'Space' && !this.running) {
                    document.removeEventListener('keydown', restartHandler);
                    this.destroy();
                    this.root.innerHTML = '';
                    new DinoRunner(this.root);
                    Games.activeGame = this; 
                }
            };
            document.addEventListener('keydown', restartHandler);
        }
    }

    loop() {
        if(!this.root.contains(this.canvas)) return; 
        this.update();
        this.draw();
        if (this.running) requestAnimationFrame(this.loop);
    }

    destroy() {
        this.running = false;
        document.removeEventListener('keydown', this.handleJump);
        if (this.canvas) this.canvas.onclick = null;
    }
}
