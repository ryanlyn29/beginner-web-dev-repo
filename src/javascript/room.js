const socket = io();

// Define UI elements once the script loads (assuming room.html content is in the DOM)
const actionSelection = document.getElementById('action-selection');
const createRoomForm = document.getElementById('create-room-form');
const joinRoomForm = document.getElementById('join-room-form');
const titleText = document.getElementById('title-text');
const descriptionText = document.getElementById('description-text');
const backButtons = document.querySelectorAll('.back-to-selection');

/**Hides all main content sections (forms and selection screen).*/
function hideAll() {
    if (actionSelection) actionSelection.style.display = 'none';
    if (createRoomForm) createRoomForm.style.display = 'none';
    if (joinRoomForm) joinRoomForm.style.display = 'none';
}

/** Shows the Create Room form and updates the page headers.*/
window.showCreateRoom = function () {
    hideAll();
    if (createRoomForm) createRoomForm.style.display = 'flex';
    if (titleText) titleText.textContent = 'Create Your Room';
    if (descriptionText) descriptionText.textContent = 'Enter a name and an optional custom code to start a new collaborative session.';
};

/** Shows the Join Room form and updates the page headers.*/
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

// --- Form Submission Handlers ---

// Listen for form submissions (must be done after the script loads)
if (createRoomForm) {
    createRoomForm.addEventListener('submit', function(event) {
        event.preventDefault();
        const roomName = document.getElementById('room-name').value;
        const customCode = document.getElementById('custom-code').value;
        console.log('Creating room with Name:', document.getElementById('room-name').value, 'and Code:', document.getElementById('custom-code').value);
        socket.emit('create-room', {
            roomName: roomName,
            customCode: customCode || null
        });
    });
}

if (joinRoomForm) {
    joinRoomForm.addEventListener('submit', function(event) {
        event.preventDefault();
        const roomCode = document.getElementById('room-code').value;
        console.log('Joining room with Code:', document.getElementById('room-code').value);
        socket.emit('join-room', roomCode);
    });
}

// --- Event Listeners for Back Buttons ---

// Use a loop for any button with the class 'back-to-selection'
backButtons.forEach(button => {
    button.addEventListener('click', window.resetPage);
});


window.resetPage();

