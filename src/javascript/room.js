/**
 * room.js - SPA Adapted
 * Handles UI logic for Room Creation/Joining.
 * Wrapped in init/cleanup functions to support page navigation.
 */

let roomAbortController = null; // Used to clean up event listeners automatically

window.initRoom = function() {
    console.log("Initializing Room Page Logic...");

    // 1. Select DOM Elements (Freshly selected every time the page loads)
    const actionSelection = document.getElementById('action-selection');
    const createRoomForm = document.getElementById('create-room-form');
    const joinRoomForm = document.getElementById('join-room-form');
    const titleText = document.getElementById('title-text');
    const descriptionText = document.getElementById('description-text');
    const backButtons = document.querySelectorAll('.back-to-selection');
    const roomNameInput = document.getElementById('room-name');
    const customCodeInput = document.getElementById('custom-code');
    const roomCodeInput = document.getElementById('room-code');

    // Initialize AbortController for easy event cleanup
    if (roomAbortController) roomAbortController.abort();
    roomAbortController = new AbortController();
    const signal = { signal: roomAbortController.signal };

    // 2. Define UI Helper Functions
    
    function hideAll() {
        if (actionSelection) actionSelection.style.display = 'none';
        if (createRoomForm) createRoomForm.style.display = 'none';
        if (joinRoomForm) joinRoomForm.style.display = 'none';
    }

    function generateRoomCode() {
        // Generate a random 6-character alphanumeric code
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Expose these to window so inline HTML onclick attributes (if any) still work,
    // or simply for external control.
    window.showCreateRoom = function () {
        hideAll();
        if (createRoomForm) createRoomForm.style.display = 'flex';
        if (titleText) titleText.textContent = 'Create Your Room';
        if (descriptionText) descriptionText.textContent = 'Enter a name and an optional custom code to start a new collaborative session.';
    };

    window.showJoinRoom = function () {
        hideAll();
        if (joinRoomForm) joinRoomForm.style.display = 'flex';
        if (titleText) titleText.textContent = 'Join a Room';
        if (descriptionText) descriptionText.textContent = 'Enter the unique room code provided by the host to join an existing session.';
    };

/**Resets the page view to the initial action selection screen.*/
window.resetPage = function () {
    hideAll();
    if (actionSelection) actionSelection.style.display = 'flex';
    if (titleText) titleText.textContent = 'Join or Create a Room';
    if (descriptionText) descriptionText.textContent = 'Choose an option below to either create a new collaborative space or join an existing one with a room code.';
};

socket.on('roomCreated', (data) => {
    console.log('Room created:', data);
    alert(`Room created. Code: ${data.roomCode}`);
    window.location.href = `/board?room=${data.roomCode}`;
});

socket.on('roomJoined', (data) => {
    console.log('Joined room:', data);
    window.location.href = `/board?room=${data.roomCode}`;
});

socket.on('roomError', (message) => {
    console.error('Room error:', message);
    alert(`Error: ${message}`);
});

    // 3. Attach Event Listeners (using signal for easy cleanup)

    // Create Room Handler
    if (createRoomForm) {
        createRoomForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const nameVal = roomNameInput ? roomNameInput.value : 'Untitled Room';
            let codeVal = customCodeInput ? customCodeInput.value.trim() : '';
            
            if (!codeVal) {
                codeVal = generateRoomCode();
            }

            console.log('Creating room with Name:', nameVal, 'and Code:', codeVal);
            
            // Navigate to the board with query parameters
            // Note: We use pushState to set the URL params, then call navigate to load the board script/html
            const targetUrl = `/board?room=${encodeURIComponent(codeVal)}&role=host&name=${encodeURIComponent(nameVal)}`;
            
            // Push state so the URL bar updates
            window.history.pushState({}, "", targetUrl);
            
            // Call the SPA router to load the board content
            if (typeof navigate === 'function') {
                navigate('/board'); 
            } else {
                window.location.href = targetUrl; // Fallback
            }

        }, signal);
    }

    // Join Room Handler
    if (joinRoomForm) {
        joinRoomForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const codeVal = roomCodeInput ? roomCodeInput.value.trim() : '';

            if (!codeVal) {
                alert("Please enter a valid room code.");
                return;
            }

            console.log('Joining room with Code:', codeVal);
            
            const targetUrl = `/board?room=${encodeURIComponent(codeVal)}&role=guest`;

            window.history.pushState({}, "", targetUrl);

            if (typeof navigate === 'function') {
                navigate('/board');
            } else {
                window.location.href = targetUrl;
            }
        }, signal);
    }

    // Back Buttons Handler
    backButtons.forEach(button => {
        button.addEventListener('click', window.resetPage, signal);
    });

    // Initialize view
    window.resetPage();
};

/**
 * Cleans up event listeners and resets global state when leaving the room page.
 */
window.cleanupRoom = function() {
    console.log("Cleaning up Room Page Logic...");
    
    // Remove event listeners
    if (roomAbortController) {
        roomAbortController.abort();
        roomAbortController = null;
    }

    // Optional: Nullify DOM references to prevent memory leaks
    window.showCreateRoom = null;
    window.showJoinRoom = null;
    window.resetPage = null;
};

// Check if script was loaded after DOM ready (hot reload/direct navigation)
if (document.getElementById('action-selection')) {
    window.initRoom();
}