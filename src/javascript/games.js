/**
 * games.js
 * Manages mini-games for the Pomodoro break sessions.
 * Features: Connect 4, Match 3 (Candy Crush), Memory, Endless Runner.
 */

// Define the Games object first
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

        // Prevent duplicate event listeners by replacing the button if it exists
        if (this.backBtn) {
            const newBackBtn = this.backBtn.cloneNode(true);
            if(this.backBtn.parentNode) {
                this.backBtn.parentNode.replaceChild(newBackBtn, this.backBtn);
            }
            this.backBtn = newBackBtn;
            
            this.backBtn.onclick = () => {
                this.stopActiveGame();
                this.showMenu();
            };
        }

        this.renderMenu();
        this.showMenu(); // Default state inside game view
        
        this.initialized = true;
        console.log("Games module initialized.");
    },

    // Called by Pomodoro to ensure games are ready to be shown
    enable() {
        if (!this.initialized) {
            this.init();
        } else {
            // Ensure menu is rendered if selector is empty
            if (this.selector && this.selector.children.length === 0) {
                this.renderMenu();
            }
        }
    },

    renderMenu() {
        if (!this.selector) return;
        this.selector.innerHTML = '';
        
        const games = [
            { id: 'connect4', name: 'Connect 4', icon: 'fa-circle-nodes', color: 'bg-blue-500 ' },
            { id: 'match3', name: 'Candy Match', icon: 'fa-candy-cane', color: 'bg-pink-500 ' },
            { id: 'memory', name: 'Memory', icon: 'fa-clone', color: 'bg-emerald-700' },
            { id: 'runner', name: 'Dino Run', icon: 'fa-dragon', color: 'bg-orange-500 ' }
        ];

        games.forEach(g => {
            const btn = document.createElement('button');
            // Rounded rectangle card styling
            btn.className = `snap-center flex-shrink-0 w-36 h-48 rounded-2xl ${g.color} text-white  transition-all duration-300 flex flex-col items-center justify-center gap-4 relative overflow-hidden group border border-white/10 cursor-pointer`;
            
            // Shine effect
            const shine = document.createElement('div');
            shine.className = 'absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300';
            btn.appendChild(shine);

            // Content
            const icon = document.createElement('i');
            icon.className = `fa-solid ${g.icon} fa-3x `;
            btn.appendChild(icon);

            const label = document.createElement('span');
            label.className = 'text-sm font-bold tracking-wide drop-shadow-sm';
            label.innerText = g.name;
            btn.appendChild(label);

            btn.onclick = () => this.startGame(g.id);
            this.selector.appendChild(btn);
        });
        
        // Add padding element for better scrolling experience
        const spacer = document.createElement('div');
        spacer.className = 'w-4 flex-shrink-0';
        this.selector.appendChild(spacer);
    },

    showMenu() {
        if (!this.selector) return;
        this.selector.style.display = 'flex'; // Ensure flex display for horizontal scroll
        this.container.style.display = 'none';
        this.backBtn.style.display = 'none';
        this.container.innerHTML = ''; 
    },

    startGame(gameId) {
        this.selector.style.display = 'none';
        this.container.style.display = 'flex';
        this.backBtn.style.display = 'block';
        this.container.innerHTML = ''; 

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
    console.log("Initializing Games module via initGames...");
    if (window.Games) {
        window.Games.init();
    }
};


/* =========================================
   GAME 1: CONNECT FOUR
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
        wrapper.className = 'flex flex-col items-center gap-1 w-full h-full justify-center';
        
        this.status = document.createElement('div');
        this.status.className = 'text-sm font-bold text-white';
        this.status.innerText = "Red's Turn";
        wrapper.appendChild(this.status);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-7 gap-1 bg-blue-800 p-1.5 rounded-lg border-2 border-blue-900 shadow-lg';
        grid.style.width = 'fit-content'; 

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'w-6 h-6 rounded-full bg-blue-900 cursor-pointer hover:bg-blue-700 transition-colors shadow-inner';
                cell.dataset.col = c; 
                cell.onclick = () => this.handleClick(c);
                grid.appendChild(cell);
            }
        }
        this.gridEl = grid;
        wrapper.appendChild(grid);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-full text-white mt-2 transition-colors';
        resetBtn.innerText = 'Restart Game';
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
            cell.classList.remove('bg-blue-900', 'hover:bg-blue-700');
            cell.classList.add(this.currentPlayer === 1 ? 'bg-red-500' : 'bg-yellow-400');
            cell.classList.add('animate-bounce-in', 'shadow-md');

            if (this.checkWin(targetRow, col)) {
                this.status.innerText = (this.currentPlayer === 1 ? "Red" : "Yellow") + " Wins!";
                this.status.className = `text-base font-bold ${this.currentPlayer === 1 ? 'text-red-400' : 'text-yellow-300'} animate-bounce-in`;
                this.gameOver = true;
            } else {
                this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
                this.status.innerText = (this.currentPlayer === 1 ? "Red" : "Yellow") + "'s Turn";
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
   GAME 2: CANDY MATCH (Match 3)
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
        this.isProcessing = false; // Prevent moves while animating
        this.init();
    }

    init() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full w-full';

        this.scoreEl = document.createElement('div');
        this.scoreEl.className = 'text-white font-bold mb-2 text-sm bg-gray-800 px-3 py-1 rounded-full';
        this.scoreEl.innerText = 'Score: 0';
        wrapper.appendChild(this.scoreEl);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-8 gap-0.5 bg-gray-800 p-1 rounded border border-gray-600 shadow-xl select-none';
        
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
            tile.className = `w-6 h-6 rounded-sm cursor-grab active:cursor-grabbing ${color} transition-transform hover:scale-105`;
            tile.setAttribute('draggable', true);
            tile.setAttribute('id', i);
            tile.dataset.color = color; // Use dataset for easier checking
            
            tile.addEventListener('dragstart', this.dragStart.bind(this));
            tile.addEventListener('dragover', (e) => e.preventDefault());
            tile.addEventListener('dragenter', (e) => e.preventDefault());
            tile.addEventListener('drop', this.dragDrop.bind(this));
            tile.addEventListener('dragend', this.dragEnd.bind(this));

            this.gridEl.appendChild(tile);
            this.board.push(tile);
        }
        
        // Initial check to ensure playable state, but let's leave randomness for fun
        // If we wanted no matches at start, we'd run checkMatchesAndFill() here.
        this.checkMatchesAndFill(); 
    }

    randomColor() { return this.colors[Math.floor(Math.random() * this.colors.length)]; }

    dragStart(e) { 
        if (this.isProcessing) {
            e.preventDefault();
            return;
        }
        this.draggedTile = e.target; 
    }
    
    dragDrop(e) { this.replacedTile = e.target; }

    dragEnd() {
        if (!this.replacedTile || !this.draggedTile || this.isProcessing) return;

        let draggedId = parseInt(this.draggedTile.id);
        let replacedId = parseInt(this.replacedTile.id);
        
        // Check adjacency
        const validMoves = [draggedId - 1, draggedId - this.width, draggedId + 1, draggedId + this.width];
        const validMove = validMoves.includes(replacedId);
        
        // Prevent wrapping moves (e.g. left edge to right edge of previous row)
        const isRowWrap = Math.abs(draggedId % this.width - replacedId % this.width) > 1;

        if (validMove && !isRowWrap) {
            this.swapTiles(this.draggedTile, this.replacedTile);
            
            const matches = this.findMatches();
            if (matches.length === 0) {
                // Swap back if no match
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
        
        // Update visual classes
        tile1.classList.remove(color1);
        tile1.classList.add(color2);
        
        tile2.classList.remove(color2);
        tile2.classList.add(color1);

        // Update data state
        tile1.dataset.color = color2;
        tile2.dataset.color = color1;
    }

    findMatches() {
        const matchedIndices = new Set();

        // 1. Horizontal Matches (3+)
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
                    c += matchLen - 1; // Skip detected match
                }
            }
        }

        // 2. Vertical Matches (3+)
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

        // 3. Square/Rectangular Matches (2x2)
        for (let r = 0; r < this.height - 1; r++) {
            for (let c = 0; c < this.width - 1; c++) {
                let idx = r * this.width + c;
                const color = this.board[idx].dataset.color;
                if (color === 'transparent') continue;

                if (this.board[idx + 1].dataset.color === color &&
                    this.board[idx + this.width].dataset.color === color &&
                    this.board[idx + this.width + 1].dataset.color === color) {
                    
                    matchedIndices.add(idx);
                    matchedIndices.add(idx + 1);
                    matchedIndices.add(idx + this.width);
                    matchedIndices.add(idx + this.width + 1);
                }
            }
        }

        return Array.from(matchedIndices);
    }

    async checkMatchesAndFill() {
        this.isProcessing = true;
        const matches = this.findMatches();
        
        if (matches.length > 0) {
            this.score += matches.length * 10; // Better scoring
            this.scoreEl.innerText = `Score: ${this.score}`;

            // Remove matches
            matches.forEach(idx => {
                const tile = this.board[idx];
                const oldColor = tile.dataset.color;
                tile.classList.remove(oldColor);
                tile.classList.add('bg-transparent'); // Invisible
                tile.dataset.color = 'transparent';
            });

            // Wait for visual clear
            await new Promise(r => setTimeout(r, 250));

            // Apply Gravity
            this.applyGravity();
            
            // Refill top
            this.refillBoard();

            // Check again recursively
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
                        // Move tile down
                        let writeIdx = writeRow * this.width + c;
                        let tile = this.board[idx];
                        let target = this.board[writeIdx];
                        
                        // Copy color/state
                        const color = tile.dataset.color;
                        target.className = target.className.replace(target.dataset.color, color);
                        if (target.classList.contains('bg-transparent')) {
                            target.classList.remove('bg-transparent');
                            target.classList.add(color);
                        }
                        target.dataset.color = color;
                        
                        // Clear source
                        tile.classList.remove(color);
                        tile.classList.add('bg-transparent');
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
   GAME 3: MEMORY MATCH
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
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));

        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full gap-3';

        const info = document.createElement('div');
        info.innerText = 'Find pairs!';
        info.className = 'text-white font-bold text-sm bg-gray-800 px-3 py-1 rounded-full';
        wrapper.appendChild(info);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-4 gap-2 p-2 bg-gray-800 rounded-lg';
        
        const icons = ['fa-cat', 'fa-dog', 'fa-fish', 'fa-crow', 'fa-dragon', 'fa-hippo', 'fa-spider', 'fa-horse'];
        const items = [...icons, ...icons].sort(() => 0.5 - Math.random());

        items.forEach(iconClass => {
            const card = document.createElement('div');
            card.className = 'w-10 h-10 bg-gray-600 rounded cursor-pointer relative flex items-center justify-center text-white text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg';
            card.dataset.icon = iconClass;

            const front = document.createElement('i');
            front.className = `fa-solid ${iconClass} hidden animate-bounce-in`;
            card.appendChild(front);

            const back = document.createElement('div');
            back.className = 'absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-800 rounded flex items-center justify-center';
            back.innerHTML = '<i class="fa-solid fa-question text-blue-300/50 text-xs"></i>';
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

        card.classList.remove('bg-gray-600');
        card.classList.add('bg-green-600', 'rotate-y-180'); // Simulate flip effect via colors/state
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
        this.firstCard.classList.add('opacity-50', 'cursor-default');
        this.secondCard.classList.add('opacity-50', 'cursor-default');
        
        this.matchesFound++;
        this.resetBoard();
        if (this.matchesFound === 8) {
            const msg = document.createElement('div');
            msg.innerText = 'Nice Job!';
            msg.className = 'text-green-400 font-bold mt-2 text-base animate-bounce-in';
            this.root.querySelector('div').appendChild(msg);
        }
    }

    unflipCards() {
        this.lockBoard = true;
        setTimeout(() => {
            if (this.firstCard) {
                this.firstCard.classList.add('bg-gray-600');
                this.firstCard.classList.remove('bg-green-600');
                this.firstCard.querySelector('.fa-solid').classList.add('hidden');
                this.firstCard.lastChild.classList.remove('hidden');
            }
            if (this.secondCard) {
                this.secondCard.classList.add('bg-gray-600');
                this.secondCard.classList.remove('bg-green-600');
                this.secondCard.querySelector('.fa-solid').classList.add('hidden');
                this.secondCard.lastChild.classList.remove('hidden');
            }
            this.resetBoard();
        }, 800);
    }

    resetBoard() {
        [this.hasFlippedCard, this.lockBoard] = [false, false];
        [this.firstCard, this.secondCard] = [null, null];
    }
    destroy() {}
}

/* =========================================
   GAME 4: DINO RUNNER
   ========================================= */
class DinoRunner {
    constructor(root) {
        this.root = root;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 280;
        this.canvas.height = 140;
        this.canvas.className = 'bg-gray-800 border border-gray-600 rounded cursor-pointer shadow-lg';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full';
        wrapper.appendChild(this.canvas);
        
        this.scoreEl = document.createElement('div');
        this.scoreEl.className = 'text-white text-xs mt-2 font-mono';
        this.scoreEl.innerText = "Click / Space to Jump";
        wrapper.appendChild(this.scoreEl);
        
        this.root.appendChild(wrapper);
        
        this.ctx = this.canvas.getContext('2d');
        this.running = true;
        
        this.dino = { x: 20, y: 110, w: 15, h: 15, dy: 0, jumpForce: 7, grounded: true };
        this.gravity = 0.4;
        this.obstacles = [];
        this.frame = 0;
        this.score = 0;
        this.speed = 3;

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

        if (this.dino.y > 140 - 10 - this.dino.h) { // Ground level
            this.dino.y = 140 - 10 - this.dino.h;
            this.dino.dy = 0;
            this.dino.grounded = true;
        }

        this.frame++;
        if (this.frame % 90 === 0) {
            this.obstacles.push({ x: 280, y: 140 - 10 - (Math.random() > 0.8 ? 25 : 12), w: 8, h: 12 });
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
        
        this.scoreEl.innerText = `Score: ${this.score}`;
        if(this.score % 10 === 0) this.speed += 0.001; 
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Ground
        this.ctx.fillStyle = '#555';
        this.ctx.fillRect(0, 130, this.canvas.width, 10);

        // Dino
        this.ctx.fillStyle = '#4ade80';
        this.ctx.fillRect(this.dino.x, this.dino.y, this.dino.w, this.dino.h);

        // Obstacles
        this.ctx.fillStyle = '#f87171';
        this.obstacles.forEach(obs => this.ctx.fillRect(obs.x, obs.y, obs.w, obs.h));

        if (!this.running) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Game Over', this.canvas.width/2, 60);
            this.ctx.font = '12px Arial';
            this.ctx.fillText('Click to restart', this.canvas.width/2, 85);
            
            this.canvas.onclick = () => {
                this.destroy();
                this.root.innerHTML = '';
                new DinoRunner(this.root);
                Games.activeGame = this; 
            };
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