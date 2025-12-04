window.initChat = async function() {
    console.log("Chat initialized: Connecting to socket and loading profile.");

    // --- State Variables ---
    let isOpen = false;
    let messages = [];
    let currentUser = null;
    let currentBoardId = null;
    let typingTimeout = null;

    // --- DOM Elements ---
    const sidebarContainer = document.getElementById('sidebar-container');
    const toggleCollapsedBtn = document.getElementById('toggle-collapsed');
    const toggleExpandedBtn = document.getElementById('toggle-expanded');
    const sidebarExpanded = document.getElementById('sidebar-expanded');
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator') || createTypingIndicator(); // Ensure element exists

    // Utility Bar Elements
    const userIcon = document.getElementById('user-icon');
    const accountOverlay = document.getElementById('account-overlay');

    // --- Helpers ---
    function getBoardIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('room') || params.get('boardId') || 'default-room';
    }

    function createTypingIndicator() {
        const div = document.createElement('div');
        div.id = 'typing-indicator';
        div.className = 'text-xs text-gray-400 italic px-4 py-1 hidden';
        if (messagesContainer) messagesContainer.parentNode.insertBefore(div, messagesContainer.nextSibling); // Insert below messages
        return div;
    }

    // --- API & Socket Logic ---

    // 1. Fetch User Data
    try {
        const response = await fetch('/api/user-data');
        if (response.ok) {
            currentUser = await response.json();
        } else {
            console.warn("Could not fetch user data, using guest fallback");
            currentUser = { id: 'guest-' + Math.random(), name: 'Guest' };
        }
    } catch (e) {
        console.error("Error fetching user data:", e);
        currentUser = { id: 'guest-' + Math.random(), name: 'Guest' };
    }

    // 2. Setup Socket
    currentBoardId = getBoardIdFromUrl();
    
    if (window.socket) {
        // Ensure we are joined to the specific board room
        window.socket.emit('join', currentBoardId);

        // Listen for History
        window.socket.on('chat:history', (history) => {
            console.log("Received chat history:", history.length);
            messages = history.map(msg => ({
                ...msg,
                fromSelf: msg.senderId === currentUser.id
            }));
            renderMessages();
        });

        // Listen for New Messages
        window.socket.on('chat:message', (msg) => {
            const isSelf = msg.senderId === currentUser.id;
            const formattedMsg = {
                text: msg.text,
                sender: msg.sender, // Name
                senderId: msg.senderId,
                fromSelf: isSelf,
                animated: true // Animate new arrivals
            };
            messages.push(formattedMsg);
            renderMessages();
        });

        // Listen for Typing
        window.socket.on('chat:typing', (data) => {
            if (typingIndicator) {
                if (data.isTyping) {
                    typingIndicator.textContent = `${data.userName} is typing...`;
                    typingIndicator.style.display = 'block';
                } else {
                    typingIndicator.style.display = 'none';
                }
            }
        });
    } else {
        console.error("Socket not initialized! Chat will not work.");
    }

    // --- UI Logic ---

    const renderMessages = () => {
        if (!messagesContainer) return;
        messagesContainer.innerHTML = ''; 

        messages.forEach((msg) => {
            const alignClass = msg.fromSelf ? "flex-col items-end" : "flex-col items-start";
            const bubbleClasses = msg.fromSelf
                ? "bg-blue-600 text-white self-end"
                : "bg-[#2b3037] text-gray-200 self-start";
            const senderClasses = msg.fromSelf ? "self-end" : "self-start";
            const animClass = msg.animated ? "animate-bounce-in" : "";

            const messageDiv = document.createElement('div');
            messageDiv.className = `flex ${alignClass} gap-1 ${animClass} w-full mb-2`;
            
            // Sender Name (Only for others)
            if (!msg.fromSelf) {
                const nameLabel = document.createElement('span');
                nameLabel.className = "text-[10px] text-gray-500 ml-1";
                nameLabel.textContent = msg.sender;
                messageDiv.appendChild(nameLabel);
            }

            // Message Bubble
            const bubble = document.createElement('div');
            bubble.className = `${bubbleClasses} rounded-2xl px-3 py-2 text-[13px] leading-relaxed max-w-[85%] shadow-sm whitespace-pre-wrap break-words`;
            bubble.textContent = msg.text;
            
            // Initials (Optional, simple circle)
            const initials = document.createElement('div');
            initials.className = `w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold bg-gray-300 text-gray-800 ${senderClasses} mt-1`;
            initials.textContent = msg.sender ? msg.sender.charAt(0).toUpperCase() : '?';

            messageDiv.appendChild(bubble);
            // messageDiv.appendChild(initials); // Uncomment if you want avatar bubbles below text

            messagesContainer.appendChild(messageDiv);
            
            // Clear animation flag
            if (msg.animated) msg.animated = false;
        });
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const handleSend = () => {
        const text = messageInput.value.trim();
        if (!text) return;

        if (window.socket) {
            window.socket.emit('chat:message', {
                boardId: currentBoardId,
                message: text,
                senderName: currentUser.name,
                senderId: currentUser.id
            });
            
            // Stop typing status immediately on send
            window.socket.emit('chat:typing', { boardId: currentBoardId, isTyping: false });
        }

        messageInput.value = "";
    };

    const handleTyping = () => {
        if (!window.socket) return;
        
        window.socket.emit('chat:typing', { 
            boardId: currentBoardId, 
            isTyping: true, 
            userName: currentUser.name 
        });

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            window.socket.emit('chat:typing', { 
                boardId: currentBoardId, 
                isTyping: false 
            });
        }, 2000);
    };

    // --- Sidebar Toggle Logic (Preserved) ---
    const onToggle = () => {
        isOpen = !isOpen;
        renderSidebar();
    };

    const renderSidebar = () => {
        if (!sidebarContainer) return;
        
        // Apply dynamic styles
        sidebarContainer.style.top = isOpen ? "7.5%" : "95%";
        sidebarContainer.style.transform = isOpen ? "translateY(0)" : "translateY(-50%)";
        sidebarContainer.style.width = isOpen ? "20rem" : "2.5rem";
        sidebarContainer.style.height = isOpen ? "90vh" : "2.5rem";
        sidebarContainer.style.borderRadius = isOpen ? "1.25rem" : "50%";
        
        if (isOpen) {
            toggleCollapsedBtn.style.opacity = '0';
            toggleCollapsedBtn.style.pointerEvents = 'none';
            sidebarExpanded.style.display = 'flex';
            
            // Force scroll to bottom when opening
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 50);

            setTimeout(() => {
                toggleCollapsedBtn.style.display = 'none';
                sidebarExpanded.style.opacity = '1';
                sidebarExpanded.style.pointerEvents = 'auto';
            }, 150); 
        } else {
            sidebarExpanded.style.opacity = '0';
            sidebarExpanded.style.pointerEvents = 'none';
            toggleCollapsedBtn.style.display = 'flex';
            void toggleCollapsedBtn.offsetWidth;
            toggleCollapsedBtn.style.opacity = '1';
            toggleCollapsedBtn.style.pointerEvents = 'auto';
            setTimeout(() => {
                if (!isOpen) sidebarExpanded.style.display = 'none';
            }, 300);
        }
    };

    // --- Event Listeners ---
    if (toggleCollapsedBtn) toggleCollapsedBtn.addEventListener('click', onToggle);
    if (toggleExpandedBtn) toggleExpandedBtn.addEventListener('click', onToggle);
    
    if (sendButton) sendButton.addEventListener('click', handleSend);
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSend();
        });
        messageInput.addEventListener('input', handleTyping);
    }
    
    // Initial Render
    renderSidebar();
};

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initChat);
} else {
    window.initChat();
}
