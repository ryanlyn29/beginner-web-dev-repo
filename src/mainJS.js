
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

    // Normalize path
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

    // --- Navigation Cleanup & Reset ---
    
    // 1. Clean up homepage scroll listener
    if (window.homepageScrollListener) {
        window.removeEventListener('scroll', window.homepageScrollListener);
        window.homepageScrollListener = null;
        console.log("Cleanup: Removed homepage scroll listener");
    }

    // 2. Reset Navbar Appearance
    const navbar = document.getElementById('mainNavbar');
    if (navbar) {
        navbar.classList.remove('navbar-blur');
        console.log("Cleanup: Reset navbar blur state");
    }

    // 3. Reset scroll position to top
    window.scrollTo(0, 0);

    console.log("Loading route content:", route);

    // Show/Hide Navbar based on route
    if (navbarContainer) {
        // HIDE navbar for specific pages
        if (path === "/board" || path === "/chat" || path === "/login" || path === "/signin") {
            navbarContainer.style.display = 'none';
        } else {
            navbarContainer.style.display = '';
        }
    }

    // Load the HTML
    await loadHTML(route, "page-content");

    // Update Navbar Active State
    if (window.setActiveNavState) window.setActiveNavState();

    // ----------------------------------------------------------------------
    // --- LOAD ROUTE-SPECIFIC JS ---
    // ----------------------------------------------------------------------

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

    // --- HOMEPAGE ROUTE ---
    if (path === "/" || path === "/home") {
        try {
            await loadScript("javascript/homepage.js");
            if (window.initHomepage) window.initHomepage();
        } catch (err) {
            console.error("Failed to load homepage script:", err);
        }
    }

    // --- BOARD ROUTE ---
    else if (path === "/board") {
        try {
            await loadScript("javascript/games.js");
            await loadScript("javascript/board.js");
            await loadScript("javascript/chat.js");
            await loadScript("javascript/pomodoro.js");

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
    
    // --- AUTH ROUTES ---
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
        } catch (err) { console.error(err); }
    } 
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
        } catch (err) { console.error(err); }
    }
    
    // --- ROOM ROUTE ---
    else if (path === "/room") { 
        try {
            if (!window.roomInitialized) {
                const old = document.querySelector('script[src*="room.js"]');
                if(old) old.remove();
                await loadScript("javascript/room.js"); 
                window.roomInitialized = true;
            }
        } catch (err) { console.error(err); }
    }
}

// Initialize the SPA
async function initApp() {
    console.log("Initializing app...");

    // --- Inject Socket.IO Client ---
    if (!document.querySelector('script[src="/socket.io/socket.io.js"]')) {
        const socketScript = document.createElement('script');
        socketScript.src = '/socket.io/socket.io.js';
        document.head.appendChild(socketScript);
    }

    // --- Load the Navbar First ---
    // We await this to ensure the DOM element #mainNavbar exists before routing to homepage
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

    // --- Initial route ---
    const initialPath = window.location.pathname;
    
    if (initialPath.endsWith('mainapp.html') || initialPath.endsWith('index.html')) {
        window.history.replaceState({}, "", buildPath('/'));
        await navigate('/');
    } else {
        await navigate(initialPath);
    }

    // --- Handle link clicks ---
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

    // --- Handle browser navigation ---
    window.addEventListener("popstate", () => {
        navigate(window.location.pathname);
    });

    console.log("App initialized successfully");
}

// --- Boot up ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
