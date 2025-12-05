/**
 * games.js
 * Multiplayer Game Engine for Whiteflow.
 * 
 * Features:
 * - Server-Authoritative State Sync (Handling Reconnects).
 * - Profile Color Integration for Game Pieces.
 * - Ghost/Away Status Handling.
 */

const styleId = 'whiteflow-game-styles';
if (!document.getElementById(styleId)) {
    const gameStyles = document.createElement('style');
    gameStyles.id = styleId;
    gameStyles.innerHTML = `
    @keyframes softSlideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes popIn { 0% { transform: scale(0.5); } 80% { transform: scale(1.1); } 100% { transform: scale(1); } }
    @keyframes dropDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes shake { 0% { transform: rotate(0deg); } 25% { transform: rotate(5deg); } 75% { transform: rotate(-5deg); } 100% { transform: rotate(0deg); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .animate-soft-slide { animation: softSlideUp 0.4s ease-out forwards; }
    .animate-pop { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
    .animate-drop { animation: dropDown 0.3s ease-out forwards; }
    .animate-shake { animation: shake 0.5s ease-in-out infinite; }
    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
    
    .game-slot-active { border-color: #3b82f6 !important; background-color: rgba(59, 130, 246, 0.1) !important; }
    .game-slot-ghost { opacity: 0.5; filter: grayscale(1); }
    .c4-cell { will-change: transform, background-color; }
    .ttt-cell { transition: all 0.2s; }
    .ttt-cell:hover { background-color: rgba(255,255,255,0.05); }
    `;
    document.head.appendChild(gameStyles);
}

const Games = {
    socket: null,
    currentUser: null,
    boardId: null,
    activeGame: null,
    view: null,
    selector: null,
    container: null,
    backBtn: null,
    initialized: false,

    init(socket, user, boardId) {
        if (this.initialized && socket) {
            this.socket = socket;
            this.currentUser = user || this.currentUser;
            this.boardId = boardId || this.boardId;
            return;
        }

        if (this.initialized) return;
        
        this.socket = socket;
        this.currentUser = user || { id: 'guest', name: 'Guest', mouseColor: '#3b82f6' };
        this.boardId = boardId;

        this.view = document.getElementById('game-view');
        this.selector = document.getElementById('game-selector');
        this.container = document.getElementById('active-game-container');
        this.backBtn = document.getElementById('back-to-games-btn');

        if (!this.view) return;

        this.setupBackButton();
        this.renderMenu();
        
        // Listen for Server Restoration of Game State (Reconnects)
        if (this.socket) {
            this.socket.on('game:restore', (state) => {
                if (state && state.activeGameId) {
                    // Only auto-restore if we are in game view
                    if (this.view && !this.view.classList.contains('hidden') && !this.activeGame) {
                        this.startGame(state.activeGameId, true); // true = restore mode
                        setTimeout(() => {
                            if (this.activeGame && this.activeGame.applyState) {
                                this.activeGame.applyState(state);
                            }
                        }, 100);
                    }
                }
            });
            
            // Listen for general game actions to update UI real-time
            this.socket.on('game:action', (data) => {
                if (this.activeGame) {
                    this.handleEvent(data);
                }
            });

            // Listen for user ghost status to update UI
            this.socket.on('user:ghost', (data) => {
                if (this.activeGame && this.activeGame.handleGhost) {
                    this.activeGame.handleGhost(data.userId, data.isGhost);
                }
            });
        }

        this.initialized = true;
    },

    enable() {
        if (!this.initialized) this.init(null, null, null);
        if (!this.activeGame) this.showMenu();
        else this.activeGame.emitResize();
    },

    setupBackButton() {
        if (!this.backBtn) return;
        const newBackBtn = this.backBtn.cloneNode(true);
        if(this.backBtn.parentNode) this.backBtn.parentNode.replaceChild(newBackBtn, this.backBtn);
        this.backBtn = newBackBtn;
        
        this.backBtn.className = "absolute top-4 left-4 z-20 text-xs font-medium text-gray-400 hover:text-white hidden flex items-center gap-2 bg-[#1a1b1d] border border-[#222426] px-3 py-1.5 rounded-full transition-colors hover:border-gray-600 cursor-pointer";
        this.backBtn.innerHTML = '<i class="fa-solid fa-arrow-left text-[10px]"></i> <span>Exit Game</span>';
        this.backBtn.onclick = () => {
            if (this.activeGame) {
                if(this.activeGame.onLeave) this.activeGame.onLeave();
                this.activeGame.destroy();
            }
            this.activeGame = null;
            this.showMenu();
        };
    },

    send(type, payload) {
        if (this.socket) {
            this.socket.emit('game:action', {
                boardId: this.boardId,
                userId: this.currentUser.id,
                userName: this.currentUser.name,
                userColor: this.currentUser.mouseColor, // Send color for consistency
                type: type,
                payload: payload
            });
        }
    },

    // Broadcast state for persistence when WE make a move that changes state
    persist(fullState) {
        if (this.socket) {
            this.socket.emit('game:persist_state', {
                boardId: this.boardId,
                fullState: {
                    activeGameId: this.activeGame.id,
                    ...fullState
                }
            });
        }
    },

    handleEvent(data) {
        if (this.activeGame && this.activeGame.onRemoteData) {
            this.activeGame.onRemoteData(data);
        }
    },

    dispatchResize(width, height) {
        const event = new CustomEvent('pomodoro-resize', { detail: { width, height } });
        window.dispatchEvent(event);
    },

    renderMenu() {
        if (!this.selector) return;
        this.selector.innerHTML = '';
        const games = [
            { id: 'connect4', name: 'Connect 4', icon: 'fa-circle-nodes', accent: 'text-blue-500', desc: '2 Player PvP' },
            { id: 'tictactoe', name: 'Tic Tac Toe', icon: 'fa-xmarks-lines', accent: 'text-cyan-400', desc: 'Classic PvP' },
            { id: 'rps', name: 'Rock Paper Scissors', icon: 'fa-hand-scissors', accent: 'text-yellow-400', desc: 'Quick PvP' },
            { id: 'match3', name: 'Candy Match', icon: 'fa-candy-cane', accent: 'text-pink-500', desc: 'Score Attack' },
            { id: 'memory', name: 'Memory', icon: 'fa-brain', accent: 'text-emerald-500', desc: 'Solo Puzzle' },
            { id: 'runner', name: 'Dino Run', icon: 'fa-dragon', accent: 'text-orange-500', desc: 'Endless' }
        ];

        games.forEach((g, index) => {
            const btn = document.createElement('button');
            btn.className = `flex-shrink-0 w-36 h-44 rounded-xl bg-[#1a1b1d] border border-[#222426] text-gray-300 hover:text-white hover:bg-[#222426] hover:border-gray-500 transition-all duration-200 flex flex-col items-center justify-center gap-2 animate-soft-slide group`;
            btn.style.animationDelay = `${index * 50}ms`;
            btn.innerHTML = `
                <i class="fa-solid ${g.icon} text-3xl mb-2 text-gray-500 group-hover:${g.accent} transition-colors"></i>
                <span class="text-sm font-bold tracking-wide">${g.name}</span>
                <span class="text-[10px] text-gray-500 uppercase tracking-widest">${g.desc}</span>
            `;
            btn.onclick = () => this.startGame(g.id);
            this.selector.appendChild(btn);
        });
        const spacer = document.createElement('div');
        spacer.className = 'w-2 flex-shrink-0';
        this.selector.appendChild(spacer);
    },

    showMenu() {
        this.selector.style.display = 'flex';
        this.container.style.display = 'none';
        if (this.backBtn) this.backBtn.style.display = 'none';
        this.dispatchResize('480px', '260px');
    },

    startGame(gameId, isRestore = false) {
        this.selector.style.display = 'none';
        this.container.style.display = 'flex';
        if (this.backBtn) this.backBtn.style.display = 'flex';
        this.container.innerHTML = '';
        this.container.className = "w-full h-full flex flex-col items-center justify-center p-2 animate-soft-slide";

        // Pass Send Wrapper that injects user color
        const emitFn = (t, p) => this.send(t, p);
        const persistFn = (s) => this.persist(s);

        switch(gameId) {
            case 'connect4':
                this.dispatchResize('520px', '600px');
                this.activeGame = new ConnectFour(this.container, this.currentUser, emitFn, persistFn);
                break;
            case 'tictactoe':
                this.dispatchResize('380px', '500px');
                this.activeGame = new TicTacToe(this.container, this.currentUser, emitFn, persistFn);
                break;
            case 'rps':
                this.dispatchResize('420px', '550px');
                this.activeGame = new RockPaperScissors(this.container, this.currentUser, emitFn, persistFn);
                break;
            case 'match3':
                this.dispatchResize('400px', '580px');
                this.activeGame = new MatchThree(this.container, this.currentUser);
                break;
            case 'memory':
                this.dispatchResize('400px', '500px');
                this.activeGame = new MemoryGame(this.container);
                break;
            case 'runner':
                this.dispatchResize('400px', '320px');
                this.activeGame = new DinoRunner(this.container);
                break;
        }

        // If not a restore (new click), request state from others just in case server is fresh
        if (!isRestore && this.activeGame && this.activeGame.emit) {
            this.activeGame.emit(this.activeGame.prefix + '_STATE_REQ', {});
        }
    },
    
    stopActiveGame() {
        if (this.activeGame && typeof this.activeGame.destroy === 'function') {
            this.activeGame.destroy();
        }
        this.activeGame = null;
        this.container.innerHTML = '';
    }
};

/* =========================================
   BASE CLASS
   ========================================= */
class MultiplayerGame {
    constructor(root, currentUser, emitFn, persistFn) {
        this.root = root;
        this.currentUser = currentUser;
        this.emit = emitFn;
        this.persist = persistFn;
        this.players = { 1: null, 2: null };
        this.turn = 1;
        this.gameOver = false;
    }

    createPlayerSlot(bgClass, pid) {
        const el = document.createElement('div');
        el.className = 'flex flex-col items-center gap-2 p-3 rounded-lg border border-transparent transition-all duration-300';
        el.innerHTML = `
            <div class="avatar w-12 h-12 rounded-full ${bgClass} flex items-center justify-center text-black font-bold text-xl shadow-lg relative">
                <i class="fa-solid fa-user"></i>
                <div class="ghost-indicator absolute -top-1 -right-1 w-3 h-3 bg-gray-400 rounded-full hidden border-2 border-[#1a1b1d]" title="User is away"></div>
            </div>
            <div class="name text-xs text-gray-400 font-bold uppercase">Empty</div>
            <button class="sit-btn text-[10px] bg-[#333] hover:bg-[#444] text-white px-3 py-1 rounded-full mt-1">Sit Here</button>
        `;
        
        const btn = el.querySelector('.sit-btn');
        btn.onclick = () => this.emit(this.prefix + '_SIT', { seat: pid, user: this.currentUser });
        
        return { el, btn, pid };
    }

    updatePlayerSlotUI(slot, player, isActive) {
        const avatar = slot.el.querySelector('.avatar');
        const name = slot.el.querySelector('.name');
        const ghostInd = slot.el.querySelector('.ghost-indicator');
        
        if (player) {
            const isMe = player.id === this.currentUser.id;
            name.innerText = isMe ? "You" : (player.name || 'User');
            
            // USE PROFILE COLOR if available, else default
            if (player.mouseColor) {
                avatar.style.backgroundColor = player.mouseColor;
                avatar.className = `avatar w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg relative`;
            }

            avatar.innerHTML = `<span class="drop-shadow-md">${(player.name || 'U').substring(0,2).toUpperCase()}</span>`;
            if (ghostInd) avatar.appendChild(ghostInd); // Re-append ghost indicator

            slot.btn.style.display = 'none';
            if (isActive) slot.el.classList.add('game-slot-active');
            else slot.el.classList.remove('game-slot-active');
            
            slot.el.style.opacity = '1';
        } else {
            name.innerText = 'Empty';
            avatar.style.backgroundColor = ''; // Reset
            avatar.className = `avatar w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-gray-500 font-bold text-xl shadow-lg relative`;
            avatar.innerHTML = '<i class="fa-solid fa-plus"></i>';
            slot.btn.style.display = 'block';
            slot.el.classList.remove('game-slot-active');
            slot.el.style.opacity = '0.5';
        }
    }

    handleGhost(userId, isGhost) {
        [this.players[1], this.players[2]].forEach((p, idx) => {
            if (p && p.id === userId) {
                const slot = idx === 0 ? this.p1Slot : this.p2Slot;
                const ind = slot.el.querySelector('.ghost-indicator');
                if (ind) ind.classList.toggle('hidden', !isGhost);
                slot.el.classList.toggle('game-slot-ghost', isGhost);
            }
        });
    }

    processCommonEvents(data) {
        if (data.type === this.prefix + '_SIT') {
            const { seat, user } = data.payload;
            this.players[seat] = user;
            this.updatePlayerUI();
            // Sync state back to server so late joiners see this player
            if (this.players[1] && this.players[1].id === this.currentUser.id) this.syncToServer();
        } else if (data.type === this.prefix + '_LEAVE') {
             // Optional logic
        }
    }
    
    syncToServer() {
        if (this.persist) {
            this.persist({
                players: this.players,
                board: this.board,
                turn: this.turn,
                gameOver: this.gameOver
            });
        }
    }
    
    onLeave() {
        this.emit(this.prefix + '_LEAVE', {});
    }
    
    // Abstract
    emitResize() {}
    destroy() {}
}

/* =========================================
   GAME 1: CONNECT FOUR
   ========================================= */
class ConnectFour extends MultiplayerGame {
    constructor(root, currentUser, emitFn, persistFn) {
        super(root, currentUser, emitFn, persistFn);
        this.id = 'connect4';
        this.prefix = 'C4';
        this.rows = 6;
        this.cols = 7;
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.initUI();
    }
    emitResize() { Games.dispatchResize('520px', '600px'); }

    initUI() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center gap-6 w-full h-full justify-center max-w-lg';
        
        const header = document.createElement('div');
        header.className = 'flex justify-between w-full px-4 items-center';
        this.p1Slot = this.createPlayerSlot('bg-red-500', 1);
        header.appendChild(this.p1Slot.el);
        header.appendChild(document.createTextNode('VS'));
        this.p2Slot = this.createPlayerSlot('bg-yellow-400', 2);
        header.appendChild(this.p2Slot.el);
        wrapper.appendChild(header);

        this.statusEl = document.createElement('div');
        this.statusEl.className = 'text-sm font-mono text-gray-300 bg-[#222426] px-4 py-2 rounded-full border border-[#333]';
        this.statusEl.innerText = 'Waiting...';
        wrapper.appendChild(this.statusEl);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-7 gap-2 bg-blue-900 p-3 rounded-xl border-b-8 border-blue-950 shadow-2xl';
        this.cells = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0f172a] shadow-inner cursor-pointer transition-colors duration-300';
                cell.onclick = () => this.handleLocalClick(c);
                grid.appendChild(cell);
                this.cells.push(cell);
            }
        }
        wrapper.appendChild(grid);
        this.root.appendChild(wrapper);
    }

    updatePlayerUI() {
        this.updatePlayerSlotUI(this.p1Slot, this.players[1], this.turn === 1);
        this.updatePlayerSlotUI(this.p2Slot, this.players[2], this.turn === 2);
        
        if (this.gameOver) {
             // Status set in checkWin
        } else if (!this.players[1] || !this.players[2]) {
             this.statusEl.innerText = "Waiting for players...";
        } else {
             const isMe = this.players[this.turn]?.id === this.currentUser.id;
             this.statusEl.innerText = isMe ? "YOUR TURN" : `${this.players[this.turn].name}'s Turn`;
             this.statusEl.style.color = isMe ? '#4ade80' : '#9ca3af';
        }
    }

    handleLocalClick(col) {
        if (this.gameOver) return;
        const mySeat = this.players[1]?.id === this.currentUser.id ? 1 : (this.players[2]?.id === this.currentUser.id ? 2 : 0);
        if (mySeat === 0 || this.turn !== mySeat) return;
        this.emit('C4_MOVE', { col, player: mySeat });
    }

    onRemoteData(data) {
        if (data.type.startsWith('C4_')) this.processCommonEvents(data);
        if (data.type === 'C4_MOVE') this.performMove(data.payload.col, data.payload.player);
        if (data.type === 'C4_RESET') this.resetBoard();
        // Respond to sync requests
        if (data.type === 'C4_STATE_REQ' && this.players[1]?.id === this.currentUser.id) {
             this.syncToServer();
        }
    }
    
    applyState(state) {
        this.players = state.players || this.players;
        this.board = state.board || this.board;
        this.turn = state.turn || 1;
        this.gameOver = state.gameOver || false;
        this.redrawBoard();
        this.updatePlayerUI();
    }

    performMove(col, pIdx) {
        let r = -1;
        for (let i = this.rows - 1; i >= 0; i--) {
            if (this.board[i][col] === 0) { r = i; break; }
        }
        if (r === -1) return;

        this.board[r][col] = pIdx;
        this.redrawBoard();
        
        // Sync new state to server
        if (this.checkWin(r, col, pIdx)) {
            this.gameOver = true;
            this.statusEl.innerText = `${this.players[pIdx].name} Wins!`;
            if (this.players[1]?.id === this.currentUser.id) setTimeout(() => this.emit('C4_RESET', {}), 5000);
        } else {
            this.turn = pIdx === 1 ? 2 : 1;
        }
        
        // Save state to server
        if (this.players[1]?.id === this.currentUser.id) this.syncToServer();
        this.updatePlayerUI();
    }

    redrawBoard() {
        this.cells.forEach((cell, i) => {
            const r = Math.floor(i / this.cols);
            const c = i % this.cols;
            const val = this.board[r][c];
            cell.style.backgroundColor = ''; 
            cell.className = 'w-9 h-9 sm:w-10 sm:h-10 rounded-full shadow-inner cursor-pointer transition-colors duration-300 ' + 
                             (val === 0 ? 'bg-[#0f172a]' : '');
            
            // Use User Colors if available
            if (val !== 0) {
                 const p = this.players[val];
                 if (p && p.mouseColor) cell.style.backgroundColor = p.mouseColor;
                 else cell.classList.add(val === 1 ? 'bg-red-500' : 'bg-yellow-400');
            }
        });
    }

    checkWin(r, c, p) {
        const dirs = [[0,1], [1,0], [1,1], [1,-1]];
        return dirs.some(([dr, dc]) => {
            let count = 1;
            for(let k=1; k<4; k++) {
                const nr=r+dr*k, nc=c+dc*k;
                if(nr<0||nr>=this.rows||nc<0||nc>=this.cols||this.board[nr][nc]!==p) break;
                count++;
            }
            for(let k=1; k<4; k++) {
                const nr=r-dr*k, nc=c-dc*k;
                if(nr<0||nr>=this.rows||nc<0||nc>=this.cols||this.board[nr][nc]!==p) break;
                count++;
            }
            return count >= 4;
        });
    }
    
    resetBoard() {
        this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(0));
        this.gameOver = false;
        this.turn = 1;
        this.redrawBoard();
        this.updatePlayerUI();
        this.syncToServer();
    }
}

/* =========================================
   GAME 2: TIC TAC TOE
   ========================================= */
class TicTacToe extends MultiplayerGame {
    constructor(root, currentUser, emitFn, persistFn) {
        super(root, currentUser, emitFn, persistFn);
        this.id = 'tictactoe';
        this.prefix = 'TTT';
        this.board = Array(9).fill(null);
        this.initUI();
    }
    emitResize() { Games.dispatchResize('380px', '500px'); }

    initUI() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center gap-6 w-full h-full justify-center max-w-sm';
        
        const header = document.createElement('div');
        header.className = 'flex justify-between w-full px-2 items-center';
        this.p1Slot = this.createPlayerSlot('bg-cyan-500', 1);
        this.p2Slot = this.createPlayerSlot('bg-pink-500', 2);
        header.appendChild(this.p1Slot.el);
        header.appendChild(document.createTextNode('VS'));
        header.appendChild(this.p2Slot.el);
        wrapper.appendChild(header);

        this.statusEl = document.createElement('div');
        this.statusEl.className = 'text-sm font-mono text-gray-300 bg-[#222426] px-4 py-2 rounded-full border border-[#333]';
        this.statusEl.innerText = 'Waiting...';
        wrapper.appendChild(this.statusEl);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-3 gap-2 bg-[#222426] p-2 rounded-xl';
        this.cells = [];
        for(let i=0; i<9; i++) {
            const cell = document.createElement('div');
            cell.className = 'w-20 h-20 bg-[#151313] rounded-lg flex items-center justify-center text-4xl font-bold cursor-pointer hover:bg-[#1a1b1d]';
            cell.onclick = () => this.handleMove(i);
            this.cells.push(cell);
            grid.appendChild(cell);
        }
        wrapper.appendChild(grid);
        this.root.appendChild(wrapper);
    }

    updatePlayerUI() {
        this.updatePlayerSlotUI(this.p1Slot, this.players[1], this.turn === 1);
        this.updatePlayerSlotUI(this.p2Slot, this.players[2], this.turn === 2);
        if(!this.gameOver && this.players[1] && this.players[2]) {
            const isMe = this.players[this.turn]?.id === this.currentUser.id;
            this.statusEl.innerText = isMe ? "Your Turn" : "Opponent's Turn";
        }
    }

    handleMove(idx) {
        if (this.gameOver || this.board[idx]) return;
        const mySeat = this.players[1]?.id === this.currentUser.id ? 1 : (this.players[2]?.id === this.currentUser.id ? 2 : 0);
        if (mySeat !== 0 && this.turn === mySeat) this.emit('TTT_MOVE', { index: idx, player: mySeat });
    }

    onRemoteData(data) {
        if (data.type.startsWith('TTT_')) this.processCommonEvents(data);
        if (data.type === 'TTT_MOVE') this.performMove(data.payload.index, data.payload.player);
        if (data.type === 'TTT_RESET') this.resetBoard();
        if (data.type === 'TTT_STATE_REQ' && this.players[1]?.id === this.currentUser.id) this.syncToServer();
    }

    applyState(state) {
        this.players = state.players || this.players;
        this.board = state.board || this.board;
        this.turn = state.turn || 1;
        this.gameOver = state.gameOver || false;
        this.redrawBoard();
        this.updatePlayerUI();
    }

    performMove(idx, p) {
        this.board[idx] = p;
        this.turn = p === 1 ? 2 : 1;
        this.redrawBoard();
        
        const win = this.checkWin();
        if (win) {
            this.gameOver = true;
            this.statusEl.innerText = `${this.players[win].name} Wins!`;
            if (this.players[1]?.id === this.currentUser.id) setTimeout(() => this.emit('TTT_RESET', {}), 3000);
        }
        if (this.players[1]?.id === this.currentUser.id) this.syncToServer();
        this.updatePlayerUI();
    }

    redrawBoard() {
        this.cells.forEach((c, i) => {
            const v = this.board[i];
            c.innerHTML = '';
            if (v) {
                const p = this.players[v];
                const color = p && p.mouseColor ? p.mouseColor : (v === 1 ? '#06b6d4' : '#ec4899');
                c.innerHTML = `<i class="fa-solid ${v===1?'fa-xmark':'fa-o'}" style="color:${color}"></i>`;
            }
        });
    }

    checkWin() {
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (let [a,b,c] of wins) if (this.board[a] && this.board[a]===this.board[b] && this.board[a]===this.board[c]) return this.board[a];
        return null;
    }
    
    resetBoard() {
        this.board = Array(9).fill(null);
        this.gameOver = false;
        this.turn = 1;
        this.redrawBoard();
        this.updatePlayerUI();
        this.syncToServer();
    }
}

/* =========================================
   GAME 3: ROCK PAPER SCISSORS
   ========================================= */
class RockPaperScissors extends MultiplayerGame {
    constructor(root, currentUser, emitFn, persistFn) {
        super(root, currentUser, emitFn, persistFn);
        this.id = 'rps';
        this.prefix = 'RPS';
        this.myMove = null;
        this.p1Move = null; 
        this.p2Move = null;
        this.initUI();
        this.emit('RPS_STATE_REQ', {});
    }
    
    emitResize() { Games.dispatchResize('420px', '550px'); }

    initUI() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center gap-8 w-full h-full justify-center max-w-md';

        const header = document.createElement('div');
        header.className = 'flex justify-between w-full px-4 items-center';
        this.p1Slot = this.createPlayerSlot('bg-blue-500', 1);
        const vs = document.createElement('div');
        vs.className = 'text-gray-600 font-bold text-xl italic';
        vs.innerText = 'VS';
        this.p2Slot = this.createPlayerSlot('bg-orange-500', 2);
        header.appendChild(this.p1Slot.el);
        header.appendChild(vs);
        header.appendChild(this.p2Slot.el);
        wrapper.appendChild(header);

        // Action Area
        this.actionArea = document.createElement('div');
        this.actionArea.className = 'flex gap-4';
        
        ['rock', 'paper', 'scissors'].forEach(move => {
            const btn = document.createElement('button');
            btn.className = 'w-16 h-16 rounded-full bg-[#222426] border border-[#333] hover:border-gray-500 flex items-center justify-center text-2xl transition-all hover:scale-110';
            btn.innerHTML = `<i class="fa-solid fa-hand-${move} text-gray-300"></i>`;
            btn.onclick = () => this.handleMove(move);
            this.actionArea.appendChild(btn);
        });
        wrapper.appendChild(this.actionArea);

        // Result Display
        this.resultEl = document.createElement('div');
        this.resultEl.className = 'h-16 flex items-center justify-center';
        this.resultEl.innerHTML = '<span class="text-gray-500 font-mono text-xs">Waiting for moves...</span>';
        wrapper.appendChild(this.resultEl);

        this.root.appendChild(wrapper);
    }

    updatePlayerUI() {
        this.updatePlayerSlotUI(this.p1Slot, this.players[1], false);
        this.updatePlayerSlotUI(this.p2Slot, this.players[2], false);
        
        // Show readiness
        if(this.p1Move) this.p1Slot.el.querySelector('.fa-user').className = "fa-solid fa-check text-green-400";
        else this.p1Slot.el.querySelector('.fa-user').className = "fa-solid fa-user";
        
        if(this.p2Move) this.p2Slot.el.querySelector('.fa-user').className = "fa-solid fa-check text-green-400";
        else this.p2Slot.el.querySelector('.fa-user').className = "fa-solid fa-user";
    }

    handleMove(move) {
        const mySeat = this.players[1]?.id === this.currentUser.id ? 1 : (this.players[2]?.id === this.currentUser.id ? 2 : 0);
        if (mySeat === 0) return window.showCustomAlert("Spectator", "Sit to play!", "info");
        if (this.myMove) return; // Already moved

        this.myMove = move;
        this.actionArea.style.opacity = '0.5';
        this.actionArea.style.pointerEvents = 'none';
        this.resultEl.innerHTML = '<span class="text-yellow-400 font-bold animate-pulse">Locked In!</span>';
        
        // Emit Commit (Hidden move)
        this.emit('RPS_COMMIT', { player: mySeat });
    }

    onRemoteData(data) {
        if (data.type.startsWith('RPS_')) this.processCommonEvents(data);

        if (data.type === 'RPS_COMMIT') {
            const p = data.payload.player;
            if (p === 1) this.p1Move = 'hidden';
            if (p === 2) this.p2Move = 'hidden';
            this.updatePlayerUI();
            this.checkReveal();
        } else if (data.type === 'RPS_REVEAL_MINE') {
            const { player, move } = data.payload;
            if (player === 1) this.p1Move = move;
            if (player === 2) this.p2Move = move;
            if (this.p1Move !== 'hidden' && this.p2Move !== 'hidden' && this.p1Move && this.p2Move) {
                this.showResult(this.p1Move, this.p2Move);
            }
        } else if (data.type === 'RPS_RESET') {
            this.resetGame();
        }
    }
    
    applyState(state) {
        this.players = state.players;
        // RPS state is transient mostly
    }

    checkReveal() {
        const mySeat = this.players[1]?.id === this.currentUser.id ? 1 : (this.players[2]?.id === this.currentUser.id ? 2 : 0);
        
        if (this.p1Move && this.p2Move && mySeat !== 0 && this.myMove) {
            this.emit('RPS_REVEAL_MINE', { player: mySeat, move: this.myMove });
        }
    }

    showResult(m1, m2) {
        let res = '';
        if (m1 === m2) res = 'Draw!';
        else if ((m1==='rock'&&m2==='scissors') || (m1==='paper'&&m2==='rock') || (m1==='scissors'&&m2==='paper')) res = 'Player 1 Wins!';
        else res = 'Player 2 Wins!';

        this.resultEl.innerHTML = `
            <div class="flex flex-col items-center gap-1 animate-pop">
                <div class="flex gap-4 text-3xl mb-1">
                    <i class="fa-solid fa-hand-${m1} text-blue-400"></i>
                    <span class="text-gray-600 text-sm">vs</span>
                    <i class="fa-solid fa-hand-${m2} text-orange-400"></i>
                </div>
                <div class="text-white font-bold text-lg">${res}</div>
            </div>
        `;
        
        // Auto reset
        if (this.players[1] && this.players[1].id === this.currentUser.id) {
            setTimeout(() => this.emit('RPS_RESET', {}), 3000);
        }
    }

    resetGame() {
        this.myMove = null;
        this.p1Move = null;
        this.p2Move = null;
        this.actionArea.style.opacity = '1';
        this.actionArea.style.pointerEvents = 'auto';
        this.resultEl.innerHTML = '<span class="text-gray-500 font-mono text-xs">Waiting for moves...</span>';
        this.updatePlayerUI();
    }
}

/* =========================================
   GAME 4: CANDY MATCH (SOLO)
   ========================================= */
class MatchThree {
    constructor(root, currentUser) {
        this.root = root;
        this.width = 8;
        this.height = 8;
        this.colors = ['bg-red-500', 'bg-yellow-400', 'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500'];
        this.board = [];
        this.score = 0;
        this.movesLeft = 20;
        this.isGameOver = false;
        this.draggedTile = null;
        this.replacedTile = null;
        this.isProcessing = false;
        this.init();
    }
    
    emitResize() { Games.dispatchResize('400px', '580px'); }

    init() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full w-full gap-3';

        // Header (Score & Moves)
        const header = document.createElement('div');
        header.className = 'flex justify-between w-full max-w-[280px] text-xs font-mono text-gray-300 mb-2';
        
        this.scoreEl = document.createElement('div');
        this.scoreEl.className = 'bg-[#222426] px-3 py-1.5 rounded border border-[#333]';
        this.scoreEl.innerText = 'SCORE: 0';
        
        this.movesEl = document.createElement('div');
        this.movesEl.className = 'bg-[#222426] px-3 py-1.5 rounded border border-[#333] text-orange-400';
        this.movesEl.innerText = `MOVES: ${this.movesLeft}`;
        
        header.appendChild(this.scoreEl);
        header.appendChild(this.movesEl);
        wrapper.appendChild(header);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-8 gap-1 bg-[#151313] p-2 rounded-xl border border-[#222426] select-none';
        this.gridEl = grid;
        wrapper.appendChild(grid);
        
        // Game Over Overlay (Hidden initially)
        this.gameOverEl = document.createElement('div');
        this.gameOverEl.className = 'absolute inset-0 bg-black/80 z-10 flex flex-col items-center justify-center hidden';
        this.gameOverEl.innerHTML = `
            <div class="text-2xl font-bold text-white mb-2">Time's Up!</div>
            <div class="text-sm text-gray-400 mb-4">Final Score: <span id="final-score" class="text-white">0</span></div>
            <button id="restart-match3" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-xs transition">Play Again</button>
        `;
        wrapper.appendChild(this.gameOverEl);
        
        // Bind Restart
        setTimeout(() => {
            const btn = document.getElementById('restart-match3');
            if(btn) btn.onclick = () => this.resetGame();
        }, 0);

        this.root.appendChild(wrapper);
        this.createBoard();
    }

    createBoard() {
        this.gridEl.innerHTML = '';
        this.board = [];
        
        // Generate valid initial board (No matches)
        for (let i = 0; i < this.width * this.height; i++) {
            const tile = document.createElement('div');
            tile.setAttribute('draggable', true);
            tile.setAttribute('id', i);
            
            // Events
            tile.addEventListener('dragstart', this.dragStart.bind(this));
            tile.addEventListener('dragover', (e) => e.preventDefault());
            tile.addEventListener('dragenter', (e) => e.preventDefault());
            tile.addEventListener('drop', this.dragDrop.bind(this));
            tile.addEventListener('dragend', this.dragEnd.bind(this));

            this.gridEl.appendChild(tile);
            this.board.push(tile);
        }

        // Fill recursively until stable without matches
        this.fillBoardNoMatches();
    }

    fillBoardNoMatches() {
        for (let i = 0; i < this.board.length; i++) {
            let color = this.randomColor();
            const c = i % this.width;
            const r = Math.floor(i / this.width);
            
            let attempts = 0;
            while (
                (c >= 2 && this.board[i-1].dataset.color === color && this.board[i-2].dataset.color === color) ||
                (r >= 2 && this.board[i-this.width].dataset.color === color && this.board[i-this.width*2].dataset.color === color)
            ) {
                color = this.randomColor();
                attempts++;
                if(attempts > 10) break;
            }
            
            this.board[i].className = `w-7 h-7 rounded-sm cursor-grab active:cursor-grabbing ${color} hover:brightness-110 transition-all duration-200`;
            this.board[i].dataset.color = color;
        }
    }

    randomColor() { return this.colors[Math.floor(Math.random() * this.colors.length)]; }

    dragStart(e) { 
        if (this.isProcessing || this.isGameOver) { e.preventDefault(); return; }
        this.draggedTile = e.target; 
        this.draggedTile.style.opacity = '0.5';
    }
    
    dragDrop(e) { this.replacedTile = e.target; }

    async dragEnd() {
        if (this.draggedTile) this.draggedTile.style.opacity = '1';
        if (!this.replacedTile || !this.draggedTile || this.isProcessing || this.isGameOver) return;

        let currId = parseInt(this.draggedTile.id);
        let targetId = parseInt(this.replacedTile.id);
        
        const validMoves = [currId - 1, currId - this.width, currId + 1, currId + this.width];
        const isRowWrap = Math.abs(currId % this.width - targetId % this.width) > 1;

        if (validMoves.includes(targetId) && !isRowWrap) {
            this.swapColors(this.draggedTile, this.replacedTile);
            const matches = this.findMatches();
            if (matches.length === 0) {
                await new Promise(r => setTimeout(r, 200));
                this.swapColors(this.draggedTile, this.replacedTile);
            } else {
                this.movesLeft--;
                this.movesEl.innerText = `MOVES: ${this.movesLeft}`;
                await this.processMatches();
                if (this.movesLeft <= 0) this.endGame();
            }
        }
        this.draggedTile = null;
        this.replacedTile = null;
    }

    swapColors(t1, t2) {
        const c1 = t1.dataset.color;
        const c2 = t2.dataset.color;
        t1.className = t1.className.replace(c1, c2);
        t2.className = t2.className.replace(c2, c1);
        t1.dataset.color = c2;
        t2.dataset.color = c1;
    }

    findMatches() {
        const matches = new Set();
        for (let i = 0; i < this.height * this.width; i++) {
            if (i % this.width < this.width - 2) {
                const c1 = this.board[i].dataset.color;
                const c2 = this.board[i+1].dataset.color;
                const c3 = this.board[i+2].dataset.color;
                if (c1 === c2 && c2 === c3 && c1 !== 'transparent') {
                    matches.add(i); matches.add(i+1); matches.add(i+2);
                }
            }
        }
        for (let i = 0; i < this.width * (this.height - 2); i++) {
            const c1 = this.board[i].dataset.color;
            const c2 = this.board[i+this.width].dataset.color;
            const c3 = this.board[i+this.width*2].dataset.color;
            if (c1 === c2 && c2 === c3 && c1 !== 'transparent') {
                matches.add(i); matches.add(i+this.width); matches.add(i+this.width*2);
            }
        }
        return Array.from(matches);
    }

    async processMatches() {
        this.isProcessing = true;
        let matches = this.findMatches();
        while (matches.length > 0) {
            this.score += matches.length * 10;
            this.scoreEl.innerText = `SCORE: ${this.score}`;
            matches.forEach(id => {
                this.board[id].dataset.color = 'transparent';
                this.board[id].className = 'w-7 h-7 rounded-sm bg-transparent transition-all';
            });
            await new Promise(r => setTimeout(r, 300));
            this.applyGravity();
            await new Promise(r => setTimeout(r, 300));
            matches = this.findMatches();
        }
        this.isProcessing = false;
    }

    applyGravity() {
        for (let c = 0; c < this.width; c++) {
            let columnIndices = [];
            for (let r = 0; r < this.height; r++) columnIndices.push(r * this.width + c);
            let colors = columnIndices.map(i => this.board[i].dataset.color);
            let validColors = colors.filter(c => c !== 'transparent');
            let missing = this.height - validColors.length;
            for(let k=0; k<missing; k++) validColors.unshift(this.randomColor());
            for(let r=0; r<this.height; r++) {
                const idx = columnIndices[r];
                const color = validColors[r];
                this.board[idx].dataset.color = color;
                this.board[idx].className = `w-7 h-7 rounded-sm cursor-grab active:cursor-grabbing ${color} hover:brightness-110 transition-all duration-200 animate-drop`;
            }
        }
    }

    endGame() {
        this.isGameOver = true;
        document.getElementById('final-score').innerText = this.score;
        this.gameOverEl.classList.remove('hidden');
        this.gameOverEl.classList.add('flex');
    }

    resetGame() {
        this.score = 0;
        this.movesLeft = 20;
        this.isGameOver = false;
        this.scoreEl.innerText = 'SCORE: 0';
        this.movesEl.innerText = 'MOVES: 20';
        this.gameOverEl.classList.add('hidden');
        this.gameOverEl.classList.remove('flex');
        this.createBoard();
    }
    destroy() {}
}

/* =========================================
   GAME 5: MEMORY MATCH (SOLO)
   ========================================= */
class MemoryGame {
    constructor(root) {
        this.root = root;
        this.init();
    }
    emitResize() { Games.dispatchResize('400px', '500px'); }
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
        
        let firstCard = null, secondCard = null, lock = false, matches = 0;

        items.forEach(iconClass => {
            const card = document.createElement('div');
            card.className = 'w-12 h-12 sm:w-14 sm:h-14 bg-[#222426] border border-[#333] rounded-lg cursor-pointer flex items-center justify-center text-white text-xl transition-all duration-200 hover:border-gray-500';
            
            const front = document.createElement('i');
            front.className = `fa-solid ${iconClass} hidden animate-soft-slide`;
            const back = document.createElement('i');
            back.className = 'fa-solid fa-question text-[#333] text-sm';
            
            card.appendChild(front);
            card.appendChild(back);
            grid.appendChild(card);

            card.onclick = () => {
                if (lock || card === firstCard || card.classList.contains('matched')) return;
                
                card.classList.add('bg-emerald-600', 'border-emerald-500');
                back.classList.add('hidden');
                front.classList.remove('hidden');

                if (!firstCard) {
                    firstCard = card;
                    return;
                }

                secondCard = card;
                lock = true;

                if (firstCard.firstChild.className === secondCard.firstChild.className) {
                    firstCard.classList.add('matched', 'opacity-50');
                    secondCard.classList.add('matched', 'opacity-50');
                    matches++;
                    [firstCard, secondCard, lock] = [null, null, false];
                    if (matches === 8) info.innerText = "You Win!";
                } else {
                    setTimeout(() => {
                        [firstCard, secondCard].forEach(c => {
                            c.classList.remove('bg-emerald-600', 'border-emerald-500');
                            c.firstChild.classList.add('hidden');
                            c.lastChild.classList.remove('hidden');
                        });
                        [firstCard, secondCard, lock] = [null, null, false];
                    }, 800);
                }
            };
        });
        wrapper.appendChild(grid);
        this.root.appendChild(wrapper);
    }
    onRemoteData() {}
    destroy() {}
}

/* =========================================
   GAME 6: DINO RUNNER (SOLO)
   ========================================= */
class DinoRunner {
    constructor(root) {
        this.root = root;
        this.init();
    }
    emitResize() { Games.dispatchResize('400px', '320px'); }
    init() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center h-full gap-3';
        this.canvas = document.createElement('canvas');
        this.canvas.width = 320;
        this.canvas.height = 160;
        this.canvas.className = 'bg-[#151313] border border-[#222426] rounded-lg cursor-pointer';
        wrapper.appendChild(this.canvas);
        const score = document.createElement('div');
        score.className = 'text-gray-500 text-[10px] font-mono uppercase';
        score.innerText = 'Click to Jump';
        wrapper.appendChild(score);
        this.root.appendChild(wrapper);
        this.ctx = this.canvas.getContext('2d');
        this.running = true;
        this.dino = { x: 30, y: 130, w: 16, h: 16, dy: 0, jump: 7, grounded: true };
        this.obs = [];
        this.frame = 0;
        this.score = 0;
        this.speed = 3.5;
        this.scoreEl = score;
        
        this.jump = () => { if(this.dino.grounded && this.running) { this.dino.dy = -this.dino.jump; this.dino.grounded = false; } };
        this.canvas.onclick = this.jump;
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }
    
    loop() {
        if(!this.root.contains(this.canvas)) return;
        if(!this.running) {
            this.ctx.fillStyle = 'white';
            this.ctx.fillText("Game Over. Click to restart", 80, 80);
            this.canvas.onclick = () => { this.root.innerHTML=''; new DinoRunner(this.root); };
            return;
        }
        
        this.ctx.clearRect(0,0,320,160);
        this.dino.dy += 0.4;
        this.dino.y += this.dino.dy;
        if(this.dino.y > 130) { this.dino.y = 130; this.dino.dy=0; this.dino.grounded=true; }
        
        this.frame++;
        if(this.frame % 90 === 0) this.obs.push({x:320, y:130, w:10, h:16});
        
        this.ctx.fillStyle = '#10b981';
        this.ctx.fillRect(this.dino.x, this.dino.y, 16, 16);
        
        this.ctx.fillStyle = '#ef4444';
        this.obs.forEach((o, i) => {
            o.x -= this.speed;
            this.ctx.fillRect(o.x, o.y, o.w, o.h);
            if(o.x+o.w < 0) { this.obs.splice(i,1); this.score++; this.scoreEl.innerText = "SCORE: "+this.score; }
            if(this.dino.x < o.x + o.w && this.dino.x + 16 > o.x && this.dino.y < o.y + o.h && this.dino.y + 16 > o.y) this.running = false;
        });
        
        this.ctx.strokeStyle = '#333';
        this.ctx.beginPath(); this.ctx.moveTo(0,146); this.ctx.lineTo(320,146); this.ctx.stroke();
        
        requestAnimationFrame(this.loop);
    }
    onRemoteData() {}
    destroy() { this.running = false; }
}

// Explicitly attach to window
window.Games = Games;

// Initialization Helper
window.initGames = function() {
    if (window.Games) {
        window.Games.enable();
    }
};
