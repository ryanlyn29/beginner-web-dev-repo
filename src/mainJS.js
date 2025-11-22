// Load partial HTML into a container
async function loadHTML(path, containerId) {
    const container = document.getElementById(containerId);
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p>Error loading page: ${path}</p>`;
        console.error("Failed to load HTML:", path, err);
    }
}

// --- ROUTER ---

// Get the base path from the current location
function getBasePath() {
    const path = window.location.pathname;
    // If accessing mainapp.html or index.html, get the directory
    if (path.includes('/src/')) {
        return '/src';
    }
    return '';
}

const BASE_PATH = getBasePath();
console.log("Base path detected:", BASE_PATH || "(root)");

// Centralized route map
const routes = {
    "/": "Pages/homepage.html",
    "/home": "Pages/homepage.html",
    "/board": "Pages/board.html",
    "/chat": "Pages/chats.html",
    "/login": "Pages/login.html",
    "/signin": "Pages/signin.html",
    "/room": "Pages/room.html",
};

// Normalize path helper - removes base path and trailing slashes
function normalizePath(path) {
    // Remove base path if present
    if (BASE_PATH && path.startsWith(BASE_PATH)) {
        path = path.substring(BASE_PATH.length);
    }
    // Remove trailing slash, but keep single "/" as is
    path = path.replace(/\/$/, "") || "/";
    return path;
}

// Build full path with base
function buildPath(route) {
    return BASE_PATH + route;
}

// Navigate to a route (no reload)
async function navigate(path) {
    const pageContainer = document.getElementById("page-content");
    const navbarContainer = document.getElementById("navbar-container");

    // Normalize path (remove base and trailing slash)
    path = normalizePath(path);
    console.log("Navigating to:", path);

    // Check for a valid route
    const route = routes[path] || null;
    if (!route) {
        pageContainer.innerHTML = `<h2>404 Page Not Found</h2><p>Path: ${path}</p>`;
        window.history.replaceState({}, "", buildPath(path));
        if (window.setActiveNavState) window.setActiveNavState();
        return;
    }

    console.log("Loading route:", route);

    // Show/Hide Navbar 
    if (navbarContainer) {
        // HIDE navbar for specific pages including /room and /chat
        if (path === "/board" || path === "/chat" || path === "/login" || path === "/signin") {
            navbarContainer.style.display = 'none';
            console.log("Navbar hidden for:", path);
        } else {
            // Show navbar for all other pages
            navbarContainer.style.display = '';
            console.log("Navbar shown.");
        }
    }

    // Load the HTML
    await loadHTML(route, "page-content");

    // Call navbar state updater
    if (window.setActiveNavState) window.setActiveNavState();

    // ----------------------------------------------------------------------
    // --- LOAD ROUTE-SPECIFIC JS ---
    // ----------------------------------------------------------------------

    // Function to load a script safely
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            let script = document.querySelector(`script[src="${src}"]`);
            if (!script) {
                script = document.createElement("script");
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.body.appendChild(script);
            } else {
                resolve(); // Script already loaded
            }
        });
    };

    // --- HOMEPAGE ROUTE (/ or /home) ---
    if (path === "/" || path === "/home") {
        try {
            await loadScript("javascript/homepage.js");
            if (window.initHomepage) window.initHomepage();
        } catch (err) {
            console.error("Failed to load homepage script:", err);
        }
    }

    // --- BOARD ROUTE (/board) ---
    else if (path === "/board") {
        try {
            // Load dependencies sequentially or in parallel
            await loadScript("javascript/games.js");
            await loadScript("javascript/board.js");
            await loadScript("javascript/chat.js");
            await loadScript("javascript/pomodoro.js");

            // Initialize functionality
            setTimeout(() => {
                if (window.initGames) window.initGames();
                if (window.initBoard) window.initBoard();
                if (window.initChat) window.initChat();
                if (window.initPomodoro) window.initPomodoro();
            }, 50);

        } catch (err) {
            console.error("Failed to load board scripts:", err);
        }
    } 
    
    // --- LOGIN ROUTE (/login) ---
    else if (path === "/login") {
        try {
             if (!window.loginInitialized) {
                const old = document.querySelector('script[src*="login.js"]');
                if(old) old.remove();
                await loadScript("javascript/login.js");
                window.loginInitialized = true;
             } else {
                const event = new Event('DOMContentLoaded');
                document.dispatchEvent(event);
             }
        } catch (err) {
            console.error("Failed to load login script:", err);
        }
    } 
    
    // --- SIGNIN ROUTE (/signin) --- 
    else if (path === "/signin") {
        try {
            if (!window.signinInitialized) {
                const old = document.querySelector('script[src*="signin.js"]');
                if(old) old.remove();
                await loadScript("javascript/signin.js");
                window.signinInitialized = true;
            } else {
                const event = new Event('DOMContentLoaded');
                document.dispatchEvent(event);
            }
        } catch (err) {
            console.error("Failed to load signin script:", err);
        }
    }
    
    // --- ROOM ROUTE (/room) ---
    else if (path === "/room") { 
        try {
            if (!window.roomInitialized) {
                const old = document.querySelector('script[src*="room.js"]');
                if(old) old.remove();
                await loadScript("javascript/room.js"); 
                window.roomInitialized = true;
            }
        } catch (err) {
            console.error("Failed to load room script:", err);
        }
    }
}

// Initialize the SPA
async function initApp() {
    console.log("Initializing app...");

    // --- Inject Socket.IO Client dynamically ---
    // This ensures the socket.io client library is available for all pages (board, chat, room)
    const socketScript = document.createElement('script');
    socketScript.src = '/socket.io/socket.io.js'; // Served automatically by socket.io server
    document.head.appendChild(socketScript);

    // --- Load the Navbar ---
    await loadHTML("components/navbar.html", "navbar-container");

    // Load navbar JS
    const navbarScript = document.createElement("script");
    navbarScript.src = "javascript/navbar.js";
    document.body.appendChild(navbarScript);
    await new Promise((resolve) => {
        navbarScript.onload = resolve;
        navbarScript.onerror = resolve;
    });

    if (window.initNavbar) window.initNavbar();

    // --- Initial route (based on current URL) ---
    const initialPath = window.location.pathname;
    
    if (initialPath.endsWith('mainapp.html') || initialPath.endsWith('index.html')) {
        window.history.replaceState({}, "", buildPath('/'));
        await navigate('/');
    } else {
        await navigate(initialPath);
    }

    // --- Handle link clicks (intercept) ---
    document.body.addEventListener("click", (e) => {
        const link = e.target.closest("a[href]");
        if (!link) return;
        const href = link.getAttribute("href");
        if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;

        try {
            const url = new URL(href, window.location.origin);
            const path = normalizePath(url.pathname);
            if (routes[path]) {
                e.preventDefault();
                window.history.pushState({}, "", buildPath(path));
                navigate(path);
            }
        } catch (err) {
            console.error("Error processing link:", href, err);
        }
    });

    // --- Handle browser navigation (back/forward) ---
    window.addEventListener("popstate", () => {
        navigate(window.location.pathname);
    });

    console.log("App initialized successfully");
}

// --- Boot up the app ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}