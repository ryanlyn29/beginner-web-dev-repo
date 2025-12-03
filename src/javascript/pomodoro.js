
/**
 * POMODORO TIMER - UPDATED FOR GAMING & STALE CLOSURE FIX
 * 
 * Features:
 * 1. Persistence & Auto-Resume.
 * 2. Adaptive Sizing: Automatically expands significantly for specific PvP games.
 * 3. Game Engine Hooks: Detects game start/stop to resize container immediately.
 * 4. Fixes stale closure issues causing unwanted collapsing.
 */

window.initPomodoro = function() {
    console.log("Initializing Pomodoro Timer with Persistence & Adaptive Gaming Mode...");

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

    // Check existence to prevent errors if HTML isn't loaded
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
        LONG_BREAK_INTERVAL: 4,
        STORAGE_KEY: 'pomodoro_state_v2'
    };

    // --- 4. STATE MANAGEMENT ---
    
    // Default State
    let state = {
        currentPhase: 'pomodoro', // 'pomodoro', 'short-break', 'long-break'
        targetTime: null,         // Timestamp (Date.now() + remaining) when running
        remainingTime: CONFIG.TIME_POMODORO, // Seconds remaining when paused
        isRunning: false,
        pomodoroCount: 0,
        isPomodoroOpen: false,
        isGameViewActive: false,
        lastUpdated: Date.now()
    };

    // Initialize Games module without overriding board.js initialization
    if (window.Games && !window.Games.initialized) {
        // Init with null to setup DOM references, wait for Board to provide socket
        window.Games.init(null, null, null); 
    }

    // --- 5. PERSISTENCE FUNCTIONS ---

    const saveState = () => {
        try {
            // Update lastUpdated timestamp for freshness checks
            state.lastUpdated = Date.now();
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Failed to save Pomodoro state", e);
        }
    };

    const loadState = () => {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                
                // Merge saved state with defaults to ensure all keys exist
                state = { ...state, ...parsed };
                
                // Logic: Handle time passed while tab was closed
                if (state.isRunning && state.targetTime) {
                    const now = Date.now();
                    const secondsLeft = Math.ceil((state.targetTime - now) / 1000);
                    
                    if (secondsLeft <= 0) {
                        // Timer finished while away
                        // Mark a flag so we can handle the phase switch in the init logic
                        state.hasExpiredWhileAway = true;
                        state.remainingTime = 0;
                        // We do NOT set isRunning=false here, so we can transition seamlessly
                    } else {
                        // Timer still running, just update current view
                        state.remainingTime = secondsLeft;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load Pomodoro state", e);
        }
    };

    // --- 6. HELPER FUNCTIONS ---

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
        if (collapsedTimerDisplay) {
            collapsedTimerDisplay.textContent = time;
        }
        
        // Update Start/Stop Button Icon & Title
        if (state.isRunning) {
            if(startStopIcon) startStopIcon.className = "fa-solid fa-pause fa-lg";
            startStopButton.title = "Pause Timer";
            if (collapsedStateIcon) {
                collapsedStateIcon.className = "fa-solid fa-pause text-red-500";
                collapsedButton.title = "Timer is running (Click to expand)";
            }
        } else {
            if(startStopIcon) startStopIcon.className = "fa-solid fa-play fa-lg ml-1";
            startStopButton.title = "Start Timer";
            if (collapsedStateIcon) {
                collapsedStateIcon.className = "fa-solid fa-stopwatch text-red-500";
                collapsedButton.title = "Timer is paused (Click to expand)";
            }
        }
        
        // Theme Colors based on Phase (Text only, button remains white)
        const phaseColors = {
            'pomodoro': 'text-red-400',
            'short-break': 'text-green-400',
            'long-break': 'text-blue-400'
        };

        // Reset text colors
        timerPhase.classList.remove('text-red-400', 'text-green-400', 'text-blue-400');
        
        // Apply new text color
        timerPhase.classList.add(phaseColors[state.currentPhase]);
    };

    const renderPomodoro = () => {
        // Dimensions
        const collapsedWidth = '120px'; 
        const collapsedHeight = '35.5px'; 
        const collapsedBorderRadius = '1.1rem';

        const expandedWidth = '320px'; // Timer View
        const expandedHeight = '380px'; 
        const expandedBorderRadius = '1.2rem'; 
        
        // Default Game Menu Size (fits 6 game cards comfortably)
        const defaultGameWidth = '450px';
        const defaultGameHeight = '550px';
        
        // LARGE Game Size (For Tic Tac Toe, RPS, Connect 4)
        // Significantly larger to provide immersive play area
        const largeGameWidth = '750px';
        const largeGameHeight = '800px';

        pomodoroContainer.style.top = '7.5%';
        pomodoroContainer.style.left = '50%'; 
        pomodoroContainer.style.transform = 'translateX(-50%)'; 
        
        if (state.isPomodoroOpen) {
            // Expanded State - Determine Target Dimensions
            let targetWidth = expandedWidth;
            let targetHeight = expandedHeight;

            if (state.isGameViewActive) {
                // Base size for Game Menu
                targetWidth = defaultGameWidth;
                targetHeight = defaultGameHeight;

                // Check active game for resizing
                // We access window.Games directly to see what's playing
                if (window.Games && window.Games.activeGame) {
                    const activeId = window.Games.activeGame.id;
                    const largeGames = ['connect4', 'tictactoe', 'rps'];
                    
                    if (largeGames.includes(activeId)) {
                        targetWidth = largeGameWidth;
                        targetHeight = largeGameHeight;
                    }
                }
            }

            // Apply Dimensions
            pomodoroContainer.style.width = targetWidth;
            pomodoroContainer.style.height = targetHeight;
            pomodoroContainer.style.borderRadius = expandedBorderRadius;
            
            // Animation Visibility Logic
            collapsedButton.style.opacity = '0';
            collapsedButton.style.pointerEvents = 'none';
            
            expandedPanel.style.display = 'flex';
            // Double RAF for transition effect
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    expandedPanel.style.opacity = '1';
                    expandedPanel.style.pointerEvents = 'auto';
                    collapsedButton.style.display = 'none';
                });
            });

        } else {
            // Collapsed State
            pomodoroContainer.style.width = collapsedWidth;
            pomodoroContainer.style.height = collapsedHeight; 
            pomodoroContainer.style.borderRadius = collapsedBorderRadius; 

            expandedPanel.style.opacity = '0';
            expandedPanel.style.pointerEvents = 'none';
            
            setTimeout(() => {
                if (!state.isPomodoroOpen) {
                    expandedPanel.style.display = 'none';
                    collapsedButton.style.display = 'flex';
                    requestAnimationFrame(() => {
                        collapsedButton.style.opacity = '1';
                        collapsedButton.style.pointerEvents = 'auto';
                    });
                }
            }, 300);
        }
    };

    // CRITICAL FIX: Expose render function globally
    // This allows the Game Engine hooks to call the *active* closure's render function,
    // avoiding stale state issues where the timer might collapse unexpectedly.
    window.pomodoroResizeHandler = renderPomodoro;

    const toggleGameView = (showGame = null) => {
        if (showGame === null) {
            state.isGameViewActive = !state.isGameViewActive;
        } else {
            state.isGameViewActive = showGame;
        }
        
        saveState();

        if (state.isGameViewActive) {
            timerView.classList.add('hidden');
            gameView.classList.remove('hidden');
            gameView.style.display = 'flex'; 
            
            // Enable games module (render menu)
            if(window.Games && window.Games.enable) window.Games.enable();
            
            gamesToggleButton.classList.add('ring-2', 'ring-white', 'ring-offset-2', 'ring-offset-gray-900');
        } else {
            gameView.classList.add('hidden');
            gameView.style.display = 'none';
            timerView.classList.remove('hidden');
            gamesToggleButton.classList.remove('ring-2', 'ring-white', 'ring-offset-2', 'ring-offset-gray-900');
        }
        
        renderPomodoro();
    };

    // --- 7. TIMER LOGIC ---

    const tick = () => {
        if (!state.isRunning) return;

        const now = Date.now();
        // Calculate remaining time based on target timestamp
        const secondsLeft = Math.ceil((state.targetTime - now) / 1000);

        state.remainingTime = secondsLeft;

        if (state.remainingTime <= 0) {
            state.remainingTime = 0;
            clearInterval(window.pomodoroIntervalId);
            window.pomodoroIntervalId = null;
            
            handlePhaseEnd();
        } else {
            updateDisplay();
        }
    };

    const startTimer = () => {
        state.isRunning = true;
        state.targetTime = Date.now() + (state.remainingTime * 1000);
        
        saveState(); 
        updateDisplay(); 

        if (window.pomodoroIntervalId) clearInterval(window.pomodoroIntervalId);
        window.pomodoroIntervalId = setInterval(tick, 1000);
    };

    const pauseTimer = () => {
        if (!state.isRunning) return;
        
        state.isRunning = false;
        
        const now = Date.now();
        if (state.targetTime) {
             state.remainingTime = Math.max(0, Math.ceil((state.targetTime - now) / 1000));
        }
        state.targetTime = null; 

        if (window.pomodoroIntervalId) clearInterval(window.pomodoroIntervalId);
        window.pomodoroIntervalId = null;
        
        saveState(); 
        updateDisplay(); 
    };

    const resetTimer = () => {
        pauseTimer(); 
        
        if (state.currentPhase === 'pomodoro') {
            state.remainingTime = CONFIG.TIME_POMODORO;
        } else if (state.currentPhase === 'short-break') {
            state.remainingTime = CONFIG.TIME_SHORT_BREAK;
        } else if (state.currentPhase === 'long-break') {
            state.remainingTime = CONFIG.TIME_LONG_BREAK;
        }
        
        saveState();
        updateDisplay();
    };

    const handlePhaseEnd = () => {
        if (state.currentPhase === 'pomodoro') {
            state.pomodoroCount++;
            
            if (state.pomodoroCount % CONFIG.LONG_BREAK_INTERVAL === 0) {
                state.currentPhase = 'long-break';
                state.remainingTime = CONFIG.TIME_LONG_BREAK;
            } else {
                state.currentPhase = 'short-break';
                state.remainingTime = CONFIG.TIME_SHORT_BREAK;
            }
            
            if (state.isPomodoroOpen) {
                toggleGameView(true);
            }
            window.showCustomAlert("Pomodoro Session Complete!", "Great work! Starting your break now.", "success");
            
        } else {
            state.currentPhase = 'pomodoro';
            state.remainingTime = CONFIG.TIME_POMODORO;
            toggleGameView(false);
            window.showCustomAlert("Break is Over!", "Time to focus again.", "info");
        }
        
        updateDisplay();
        startTimer();
    };

    const toggleStartStop = () => {
        if (state.isRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    };
    
    const onPomodoroToggle = () => {
        state.isPomodoroOpen = !state.isPomodoroOpen;
        saveState();
        renderPomodoro();
    };
    
    // --- 8. GAME ENGINE HOOKS ---
    // Detects when games start/stop to trigger resize logic
    // Using window.pomodoroResizeHandler to ensure we use the ACTIVE closure
    if (window.Games && !window.Games._pomodoroHooked) {
        const originalStart = window.Games.startGame;
        const originalStop = window.Games.stopActiveGame;

        window.Games.startGame = function(id) {
            originalStart.apply(window.Games, arguments);
            // Trigger resize via global handler
            if (window.pomodoroResizeHandler) window.pomodoroResizeHandler();
        };

        window.Games.stopActiveGame = function() {
            originalStop.apply(window.Games, arguments);
            // Trigger resize via global handler
            if (window.pomodoroResizeHandler) window.pomodoroResizeHandler();
        };

        window.Games._pomodoroHooked = true;
    }
    
    // --- 9. EVENT LISTENERS ---
    collapsedButton.onclick = onPomodoroToggle;
    closeButton.onclick = onPomodoroToggle;
    startStopButton.onclick = toggleStartStop;
    resetButton.onclick = resetTimer;
    
    if(gamesToggleButton) {
        gamesToggleButton.onclick = () => toggleGameView();
    }
    
    // --- 10. INITIALIZATION EXECUTION ---

    expandedPanel.style.transition = 'opacity 0.3s ease-in-out';
    collapsedButton.style.transition = 'opacity 0.3s ease-in-out';

    // LOAD SAVED STATE
    loadState();

    // CHECK EXPIRATION OR RESUME
    if (state.hasExpiredWhileAway) {
        delete state.hasExpiredWhileAway;
        handlePhaseEnd(); 
    } else if (state.isRunning) {
        if (window.pomodoroIntervalId) clearInterval(window.pomodoroIntervalId);
        window.pomodoroIntervalId = setInterval(tick, 1000);
    }

    // Sync UI
    updateDisplay();
    renderPomodoro();
    
    // Resume Game View visibility and ensure menu is shown
    if (state.isGameViewActive) {
        gameView.classList.remove('hidden');
        timerView.classList.add('hidden');
        gameView.style.display = 'flex';
        // Safe check before enable
        if(window.Games && window.Games.enable) window.Games.enable();
    } else {
        gameView.classList.add('hidden');
        gameView.style.display = 'none';
        timerView.classList.remove('hidden');
    }

    // Tab Visibility Handler
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && state.isRunning) {
            tick(); 
        }
    });

    console.log("Pomodoro Initialized Successfully.");
};

// Auto-init for direct page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initPomodoro);
} else {
    window.initPomodoro();
}
