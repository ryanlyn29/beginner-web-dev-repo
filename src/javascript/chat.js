window.initChat = function() {
    console.log("Chat initialized: Setting up listeners and state.");

    // --- State Variables ---
    let isOpen = false; // Initial state: Collapsed
    let messages = [];
    let showAccount = false;
    
    // --- DOM Elements ---
    const sidebarContainer = document.getElementById('sidebar-container');
    const toggleCollapsedBtn = document.getElementById('toggle-collapsed');
    const toggleExpandedBtn = document.getElementById('toggle-expanded');
    const sidebarExpanded = document.getElementById('sidebar-expanded');
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    // Utility Bar Elements (Account Only - Settings/Save handled by board.js)
    const userIcon = document.getElementById('user-icon');
    const accountOverlay = document.getElementById('account-overlay');

    // --- Configuration ---
    const defaultMessages = [
        { text: "Hey, did you finish the wireframe?", sender: "A", fromSelf: false },
        { text: "Almost! I’m updating the sticky note layout.", sender: "L", fromSelf: true },
        { text: "Nice — send it over when ready.", sender: "S", fromSelf: false },
    ];
    
    // --- Core Functions ---

    const loadMessages = () => {
        const saved = localStorage.getItem("chatMessages");
        try {
            messages = saved ? JSON.parse(saved) : defaultMessages;
        } catch (e) {
            console.error("Error parsing messages from localStorage:", e);
            messages = defaultMessages;
        }
    };

    const saveMessages = () => {
        localStorage.setItem("chatMessages", JSON.stringify(messages));
    };

    /**
     * Renders all messages to the DOM and scrolls to the bottom.
     */
    const renderMessages = () => {
        if (!messagesContainer) return;
        messagesContainer.innerHTML = ''; // Clear previous messages
        messages.forEach((msg) => {
            // Determine alignment and colors
            const alignClass = msg.fromSelf ? "flex-col items-end" : "flex-col items-start";
            const bubbleClasses = msg.fromSelf
                ? "bg-blue-600 text-white self-end"
                : "bg-[#2b3037] text-gray-200 self-start";
            const senderClasses = msg.fromSelf ? "self-end" : "self-start";

            const messageDiv = document.createElement('div');
            messageDiv.className = `flex ${alignClass} gap-1 animate-bounce-in w-full`;
            
            // Message Bubble
            const bubble = document.createElement('div');
            bubble.className = `${bubbleClasses} rounded-2xl px-3 py-2 text-[12px] leading-relaxed max-w-[80%] shadow-sm whitespace-pre-wrap`;
            bubble.style.wordWrap = 'break-word';
            bubble.style.overflowWrap = 'break-word';
            bubble.textContent = msg.text;
            

            // Sender Initials
            const senderInitials = document.createElement('div');
            senderInitials.className = `rounded-full flex items-center justify-center text-black text-xs px-2 py-0.5 font-semibold bg-gray-200 ${senderClasses}`;
            senderInitials.textContent = msg.sender;

            messageDiv.appendChild(bubble);
            messageDiv.appendChild(senderInitials);
            messagesContainer.appendChild(messageDiv);
        });

        // Scroll to the bottom of the chat
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const onToggle = () => {
        isOpen = !isOpen;
        renderSidebar();
    };

    /**
     * Applies the dynamic sizing styles based on the isOpen state.
     */
    const renderSidebar = () => {
        if (!sidebarContainer) return;

        // Apply main container styles (Animation handled by CSS transition on container)
        sidebarContainer.style.top = isOpen ? "7.5%" : "95%";
        sidebarContainer.style.transform = isOpen ? "translateY(0)" : "translateY(-50%)";
        sidebarContainer.style.width = isOpen ? "20rem" : "2.5rem";
        sidebarContainer.style.height = isOpen ? "90vh" : "2.5rem";
        sidebarContainer.style.borderRadius = isOpen ? "1.25rem" : "50%";
        
        // Smoothly transition content
        if (isOpen) {
            // 1. Fade out collapsed button
            toggleCollapsedBtn.style.opacity = '0';
            toggleCollapsedBtn.style.pointerEvents = 'none';

            // 2. Prepare expanded content
            sidebarExpanded.style.display = 'flex';
            
            // 3. Render messages immediately so layout is ready
            renderMessages();

            // 4. Delay fade-in slightly to allow container to start expanding
            setTimeout(() => {
                toggleCollapsedBtn.style.display = 'none'; // Hide button after fade
                sidebarExpanded.style.opacity = '1';
                sidebarExpanded.style.pointerEvents = 'auto';
            }, 150); 

        } else {
            // 1. Fade out expanded content immediately
            sidebarExpanded.style.opacity = '0';
            sidebarExpanded.style.pointerEvents = 'none';

            // 2. Fade in collapsed button
            toggleCollapsedBtn.style.display = 'flex';
            // Force reflow for transition
            void toggleCollapsedBtn.offsetWidth;
            toggleCollapsedBtn.style.opacity = '1';
            toggleCollapsedBtn.style.pointerEvents = 'auto';

            // 3. Hide expanded content from DOM after transition
            setTimeout(() => {
                if (!isOpen) { // Check in case user toggled back quickly
                    sidebarExpanded.style.display = 'none';
                }
            }, 300); // Match standard transition time
        }
    };

    const handleSend = () => {
        const text = messageInput.value.trim();
        if (!text) return;

        const newMessageObj = { text: text, sender: "L", fromSelf: true };
        messages.push(newMessageObj);
        
        messageInput.value = ""; // Clear input
        saveMessages();
        renderMessages();
    };

    const toggleAccount = (show) => {
        showAccount = typeof show === 'boolean' ? show : !showAccount;
        if (accountOverlay) {
            accountOverlay.style.display = showAccount ? 'flex' : 'none';
        }
    };

    // --- Event Listeners & Initialization ---
    
    // 1. Load data
    loadMessages();

    // 2. Apply initial transition styles via JS
    if (sidebarExpanded) {
        sidebarExpanded.style.transition = 'opacity 0.3s ease-in-out';
        sidebarExpanded.style.opacity = '0';
    }
    if (toggleCollapsedBtn) {
        toggleCollapsedBtn.style.transition = 'opacity 0.3s ease-in-out';
    }
    
    // 3. Initial render for all dynamic elements
    renderSidebar();

    // 4. Attach Sidebar listeners
    if (toggleCollapsedBtn) toggleCollapsedBtn.addEventListener('click', onToggle);
    if (toggleExpandedBtn) toggleExpandedBtn.addEventListener('click', onToggle);
    
    if (sendButton) sendButton.addEventListener('click', handleSend);
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleSend();
            }
        });
    }

    // 5. Attach Utility Bar listeners (Account Only)
    if (userIcon) userIcon.addEventListener('click', () => toggleAccount(true));

    // 6. Add click listeners to close overlays (backdrop clicks)
    if (accountOverlay) {
        accountOverlay.addEventListener('click', (e) => {
            if (e.target === accountOverlay) toggleAccount(false);
        });
    }
    
    // Expose toggle functions globally for use in modal buttons (HTML onclicks)
    window.toggleAccount = toggleAccount;
};

// Auto-init for direct page loads or when script is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initChat);
} else {
    window.initChat();
}