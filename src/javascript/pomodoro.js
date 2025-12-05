/**
 * POMODORO TIMER - SOCKET SYNCED
 * 
 * Features:
 * 1. Global Sync: Actions (Start/Stop) are sent to server.
 * 2. Persistence: State is retrieved from server on load.
 * 3. Adaptive Sizing: Expands for games.
 */

window.initPomodoro = function() {
    console.log("Initializing Socket-Synced Pomodoro Timer...");
    
    // Attempt to locate the global socket object (usually on window.socket or via Games)
    // If not found, we cannot sync.
    const socket = window.socket || (window.Games ? window.Games.socket : null);
    const boardId = window.currentBoardId || (new URLSearchParams(window.location.search).get('room'));

    if (!socket) {
        console.warn("Socket not found. Pomodoro running in local-only mode (No Sync).");
    }

    // --- 1. GLOBAL CLEANUP ---
    if (window.pomodoroIntervalId) {
        clearInterval(window.pomodoroIntervalId);
        window.pomodoroIntervalId = null;
    }

    // --- 2. DOM ELEMENTS ---
    const pomodoroContainer = document.getElementById('pomodoro-container');
    const collapsedButton = document.getElementById('pomodoro-toggle-collapsed');
    const collapsedTimerDisplay = document.getElementById('collapsed-timer-display');
    const collapsedStateIcon = document.getElementById('collapsed-state-icon');
    const expandedPanel = document.getElementById('pomodoro-expanded');
    const closeButton = document.getElementById('pomodoro-toggle-expanded');
    const timerDisplay = document.getElementById('timer-display');
    const startStopButton = document.getElementById('pomodoro-start-stop');
    const resetButton = document.getElementById('pomodoro-reset');
    const timerPhase = document.getElementById('timer-phase');
    const pomodoroCountDisplay = document.getElementById('pomodoro-count');
    
    // Game Toggle Elements
    const gamesToggleButton = document.getElementById('pomodoro-games-toggle');
    const timerView = document.getElementById('timer-view');
    const gameView = document.getElementById('game-view');

    if (!pomodoroContainer || !collapsedButton || !expandedPanel || !startStopButton) {
        console.warn("Pomodoro DOM elements missing. Aborting init.");
        return;
    }

    const startStopIcon = startStopButton.querySelector('i');

    // --- 3. CONSTANTS & CONFIG ---
    const CONFIG = {
        TIME_POMODORO: 25 * 60,
        TIME_SHORT_BREAK: 5 * 60,
        TIME_LONG_BREAK: 15 * 60,
        LONG_BREAK_INTERVAL: 4
    };

    // --- 4. STATE MANAGEMENT ---
    let state = {
        currentPhase: 'pomodoro', 
        targetTime: null,         // Timestamp (Date.now() + remaining)
        remainingTime: CONFIG.TIME_POMODORO,
        isRunning: false,
        pomodoroCount: 0,
        isPomodoroOpen: false, // Local UI state
        isGameViewActive: false
    };

    // --- 5. UI UPDATES ---
    const formatTime = (seconds) => {
        if (seconds < 0) seconds = 0;
        const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        return `${minutes}:${secs}`;
    };

    const updateDisplay = () => {
        const time = formatTime(state.remainingTime);
        
        // Expanded display
        if (timerDisplay) timerDisplay.textContent = time;
        if (timerPhase) timerPhase.textContent = state.currentPhase.replace('-', ' ').toUpperCase();
        if (pomodoroCountDisplay) pomodoroCountDisplay.textContent = state.pomodoroCount;
        
        // Collapsed display
        if (collapsedTimerDisplay) collapsedTimerDisplay.textContent = time;
        
        // Icons
        if (state.isRunning) {
            if(startStopIcon) startStopIcon.className = "fa-solid fa-pause fa-lg";
            startStopButton.title = "Pause Timer (Global)";
            if (collapsedStateIcon) collapsedStateIcon.className = "fa-solid fa-pause text-red-500";
        } else {
            if(startStopIcon) startStopIcon.className = "fa-solid fa-play fa-lg ml-1";
            startStopButton.title = "Start Timer (Global)";
            if (collapsedStateIcon) collapsedStateIcon.className = "fa-solid fa-stopwatch text-red-500";
        }
        
        // Theme Colors
        const phaseColors = { 'pomodoro': 'text-red-400', 'short-break': 'text-green-400', 'long-break': 'text-blue-400' };
        timerPhase.classList.remove('text-red-400', 'text-green-400', 'text-blue-400');
        timerPhase.classList.add(phaseColors[state.currentPhase]);
    };

    const renderPomodoro = () => {
        // ... (Same rendering logic as before for dimensions) ...
        const collapsedWidth = '120px'; 
        const collapsedHeight = '35.5px'; 
        const expandedWidth = '320px';
        const expandedHeight = '380px'; 
        const defaultGameWidth = '450px';
        const defaultGameHeight = '550px';
        const largeGameWidth = '700px';
        const largeGameHeight = '750px';

        pomodoroContainer.style.top = '7.5%';
        pomodoroContainer.style.left = '50%'; 
        pomodoroContainer.style.transform = 'translateX(-50%)'; 
        
        if (state.isPomodoroOpen) {
            let targetWidth = expandedWidth;
            let targetHeight = expandedHeight;

            if (state.isGameViewActive) {
                targetWidth = defaultGameWidth;
                targetHeight = defaultGameHeight;
                if (window.Games && window.Games.activeGame) {
                    const activeId = window.Games.activeGame.id;
                    if (['connect4', 'tictactoe', 'rps'].includes(activeId)) {
                        targetWidth = largeGameWidth;
                        targetHeight = largeGameHeight;
                    }
                }
            }
            pomodoroContainer.style.width = targetWidth;
            pomodoroContainer.style.height = targetHeight;
            pomodoroContainer.style.borderRadius = '1.2rem';
            
            collapsedButton.style.opacity = '0';
            collapsedButton.style.pointerEvents = 'none';
            expandedPanel.style.display = 'flex';
            requestAnimationFrame(() => {
                expandedPanel.style.opacity = '1';
                expandedPanel.style.pointerEvents = 'auto';
                collapsedButton.style.display = 'none';
            });
        } else {
            pomodoroContainer.style.width = collapsedWidth;
            pomodoroContainer.style.height = collapsedHeight; 
            pomodoroContainer.style.borderRadius = '1.1rem'; 
            expandedPanel.style.opacity = '0';
            expandedPanel.style.pointerEvents = 'none';
            setTimeout(() => {
                if (!state.isPomodoroOpen) {
                    expandedPanel.style.display = 'none';
                    collapsedButton.style.display = 'flex';
                    collapsedButton.style.opacity = '1';
                    collapsedButton.style.pointerEvents = 'auto';
                }
            }, 300);
        }
    };
    
    // Expose for Games.js
    window.pomodoroResizeHandler = renderPomodoro;

    // --- 6. TICKER LOGIC ---
    const tick = () => {
        if (!state.isRunning) return;
        const now = Date.now();
        const secondsLeft = Math.ceil((state.targetTime - now) / 1000);
        state.remainingTime = secondsLeft;

        if (state.remainingTime <= 0) {
            state.remainingTime = 0;
            clearInterval(window.pomodoroIntervalId);
            window.pomodoroIntervalId = null;
            state.isRunning = false;
            
            // Phase Switch Logic (Client triggers the switch for everyone if they are the host, 
            // but for simplicity, we let the first client to tick down send the sync)
            handlePhaseEnd(); 
        } else {
            updateDisplay();
        }
    };

    // --- 7. ACTIONS (SEND TO SERVER) ---
    const toggleStartStop = () => {
        const action = state.isRunning ? 'pause' : 'start';
        if (socket && boardId) {
            socket.emit('pomodoro:action', { boardId, action });
        } else {
            // Local fallback
            if(action === 'start') { state.isRunning = true; state.targetTime = Date.now() + state.remainingTime*1000; window.pomodoroIntervalId = setInterval(tick, 1000); }
            else { state.isRunning = false; clearInterval(window.pomodoroIntervalId); }
            updateDisplay();
        }
    };

    const resetTimer = () => {
        const defaultTime = state.currentPhase === 'pomodoro' ? CONFIG.TIME_POMODORO : 
                           (state.currentPhase === 'short-break' ? CONFIG.TIME_SHORT_BREAK : CONFIG.TIME_LONG_BREAK);
        
        if (socket && boardId) {
            socket.emit('pomodoro:action', { 
                boardId, 
                action: 'reset',
                payload: { phase: state.currentPhase, time: defaultTime }
            });
        }
    };

    const handlePhaseEnd = () => {
        // Calculate next phase
        let nextPhase = state.currentPhase;
        let nextTime = CONFIG.TIME_POMODORO;
        
        if (state.currentPhase === 'pomodoro') {
            state.pomodoroCount++;
            if (state.pomodoroCount % CONFIG.LONG_BREAK_INTERVAL === 0) {
                nextPhase = 'long-break';
                nextTime = CONFIG.TIME_LONG_BREAK;
            } else {
                nextPhase = 'short-break';
                nextTime = CONFIG.TIME_SHORT_BREAK;
            }
            window.showCustomAlert("Pomodoro Complete!", "Break started.", "success");
        } else {
            nextPhase = 'pomodoro';
            nextTime = CONFIG.TIME_POMODORO;
            window.showCustomAlert("Break Over!", "Focus time.", "info");
        }

        // Send Sync to Server
        if (socket && boardId) {
            socket.emit('pomodoro:action', {
                boardId,
                action: 'sync',
                payload: {
                    phase: nextPhase,
                    remainingTime: nextTime,
                    isRunning: true // Auto start next phase? Or false to wait. Let's auto-start.
                }
            });
        }
    };

    // --- 8. SOCKET LISTENERS ---
    if (socket) {
        socket.on('pomodoro:sync', (serverState) => {
            // Update local state from server
            state.currentPhase = serverState.phase;
            state.remainingTime = serverState.remainingTime;
            state.isRunning = serverState.isRunning;
            
            // Clean existing interval
            if (window.pomodoroIntervalId) clearInterval(window.pomodoroIntervalId);
            
            if (state.isRunning) {
                // Determine target time relative to client clock based on remaining seconds
                state.targetTime = Date.now() + (state.remainingTime * 1000);
                window.pomodoroIntervalId = setInterval(tick, 1000);
            } else {
                window.pomodoroIntervalId = null;
            }
            
            updateDisplay();
        });
    }

    // --- 9. VIEW CONTROLS ---
    const toggleGameView = () => {
        state.isGameViewActive = !state.isGameViewActive;
        if (state.isGameViewActive) {
            timerView.classList.add('hidden');
            gameView.classList.remove('hidden');
            gameView.style.display = 'flex'; 
            if(window.Games && window.Games.enable) window.Games.enable();
            gamesToggleButton.classList.add('ring-2', 'ring-white');
        } else {
            gameView.classList.add('hidden');
            gameView.style.display = 'none';
            timerView.classList.remove('hidden');
            gamesToggleButton.classList.remove('ring-2', 'ring-white');
        }
        renderPomodoro();
    };

    const onPomodoroToggle = () => {
        state.isPomodoroOpen = !state.isPomodoroOpen;
        renderPomodoro();
    };

    // Listeners
    collapsedButton.onclick = onPomodoroToggle;
    closeButton.onclick = onPomodoroToggle;
    startStopButton.onclick = toggleStartStop;
    resetButton.onclick = resetTimer;
    if(gamesToggleButton) gamesToggleButton.onclick = toggleGameView;

    // --- 10. INIT ---
    updateDisplay();
    renderPomodoro();
    console.log("Pomodoro Initialized.");
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initPomodoro);
} else {
    window.initPomodoro();
}
