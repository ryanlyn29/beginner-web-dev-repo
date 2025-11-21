/**
 * POMODORO TIMER - PERSISTENCE & LOGIC FIX
 * 
 * Features:
 * 1. LocalStorage Persistence: Saves state (phase, time, isRunning) on every change.
 * 2. Timestamp Tracking: Uses Date.now() to calculate remaining time, ensuring accuracy
 *    even if the browser tab is closed or throttled.
 * 3. Auto-Start: Automatically starts the next phase (Work -> Break -> Work) for continuous flow.
 * 4. Smart Resume: Detects if timer expired while tab was closed and handles it immediately.
 */

window.initPomodoro = function() {
    console.log("Initializing Pomodoro Timer with Persistence...");

    // --- 1. GLOBAL CLEANUP ---
    // If an interval is already running from a previous page load, clear it.
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

    // Initialize Games if available
    if (window.Games && window.Games.init) {
        window.Games.init();
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
        // Dimensions must match CSS defaults to prevent jumps
        const collapsedWidth = '120px'; 
        const collapsedHeight = '40px'; 
        const collapsedBorderRadius = '1rem'; // rounded-2xl (16px)

        const expandedTop = '7.5%';
        const expandedWidth = '320px'; // 20rem
        const expandedHeight = '380px'; 
        const expandedBorderRadius = '1rem'; 
        
        const gameWidth = '450px';
        const gameHeight = '550px';

        pomodoroContainer.style.top = '7.5%';
        pomodoroContainer.style.left = '50%'; 
        pomodoroContainer.style.transform = 'translateX(-50%)'; 
        
        if (state.isPomodoroOpen) {
            // Expanded State
            if (state.isGameViewActive) {
                pomodoroContainer.style.width = gameWidth;
                pomodoroContainer.style.height = gameHeight;
            } else {
                pomodoroContainer.style.width = expandedWidth;
                pomodoroContainer.style.height = expandedHeight;
            }
            pomodoroContainer.style.borderRadius = expandedBorderRadius;
            
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
            gameView.style.display = 'flex'; // Ensure proper display
            if(window.Games) window.Games.enable();
            gamesToggleButton.classList.add('ring-2', 'ring-white', 'ring-offset-2', 'ring-offset-gray-900');
        } else {
            gameView.classList.add('hidden');
            gameView.style.display = 'none';
            timerView.classList.remove('hidden');
            gamesToggleButton.classList.remove('ring-2', 'ring-white', 'ring-offset-2', 'ring-offset-gray-900');
        }
        
        renderPomodoro();
    };

    // --- 7. TIMER LOGIC (The Core Fix) ---

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
        // 1. Set Running Flag
        state.isRunning = true;
        
        // 2. Calculate Target Time (Now + Remaining)
        // This ensures accurate counting even if execution lags
        state.targetTime = Date.now() + (state.remainingTime * 1000);
        
        saveState(); 
        updateDisplay(); 

        // 3. Clear any existing interval to prevent stacking
        if (window.pomodoroIntervalId) clearInterval(window.pomodoroIntervalId);
        
        // 4. Start new interval
        window.pomodoroIntervalId = setInterval(tick, 1000);
    };

    const pauseTimer = () => {
        if (!state.isRunning) return;
        
        state.isRunning = false;
        
        // Calculate exact remaining time before pausing
        const now = Date.now();
        if (state.targetTime) {
             state.remainingTime = Math.max(0, Math.ceil((state.targetTime - now) / 1000));
        }
        state.targetTime = null; // Clear target

        // Stop Interval
        if (window.pomodoroIntervalId) clearInterval(window.pomodoroIntervalId);
        window.pomodoroIntervalId = null;
        
        saveState(); 
        updateDisplay(); 
    };

    const resetTimer = () => {
        pauseTimer(); // Stop first
        
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
            
            // Auto-open games on break if timer is expanded
            if (state.isPomodoroOpen) {
                toggleGameView(true);
            }
            window.showCustomAlert("Pomodoro Session Complete!", "Great work! Starting your break now.", "success");
            
        } else {
            // Break finished
            state.currentPhase = 'pomodoro';
            state.remainingTime = CONFIG.TIME_POMODORO;
            
            // Auto-hide games
            toggleGameView(false);
            window.showCustomAlert("Break is Over!", "Time to focus again.", "info");
        }
        
        updateDisplay();
        // Auto-Start next phase
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
    
    // --- 8. EVENT LISTENERS ---
    collapsedButton.onclick = onPomodoroToggle;
    closeButton.onclick = onPomodoroToggle;
    startStopButton.onclick = toggleStartStop;
    resetButton.onclick = resetTimer;
    
    if(gamesToggleButton) {
        gamesToggleButton.onclick = () => toggleGameView();
    }
    
    // --- 9. INITIALIZATION EXECUTION ---

    expandedPanel.style.transition = 'opacity 0.3s ease-in-out';
    collapsedButton.style.transition = 'opacity 0.3s ease-in-out';

    // LOAD SAVED STATE
    loadState();

    // CHECK EXPIRATION OR RESUME
    if (state.hasExpiredWhileAway) {
        // Time passed while tab was closed
        delete state.hasExpiredWhileAway;
        handlePhaseEnd(); 
    } else if (state.isRunning) {
        // Resume Interrupted Timer
        if (window.pomodoroIntervalId) clearInterval(window.pomodoroIntervalId);
        window.pomodoroIntervalId = setInterval(tick, 1000);
    }

    // Sync UI
    updateDisplay();
    renderPomodoro();
    
    // Resume Game View visibility
    if (state.isGameViewActive) {
        gameView.classList.remove('hidden');
        timerView.classList.add('hidden');
        gameView.style.display = 'flex';
        if(window.Games) window.Games.enable();
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