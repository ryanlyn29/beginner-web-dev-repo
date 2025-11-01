// mainJS.js - COMPLETE FIXED VERSION FOR /src/ FOLDER

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
// If you're at /src/index.html, basePath will be "/src"
// If you're at root /index.html, basePath will be ""
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
  "/chat": "Pages/chat.html",
  "/map": "Pages/map.html",
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

  // Normalize path (remove base and trailing slash)
  path = normalizePath(path);

  console.log("Navigating to:", path, "(normalized)"); // Debug log

  // Check for a valid route
  const route = routes[path] || null;

  if (!route) {
    console.log("No route found for:", path); // Debug log
    pageContainer.innerHTML = `<h2>404 Page Not Found</h2><p>Path: ${path}</p>`;
    // Update browser URL to the 404 path
    window.history.replaceState({}, "", buildPath(path));
    // Still update nav state to clear any active highlighting
    if (window.setActiveNavState) window.setActiveNavState();
    return;
  }

  console.log("Loading route:", route); // Debug log

  // Load the corresponding HTML
  await loadHTML(route, "page-content");

  // Call navbar state updater if available
  if (window.setActiveNavState) window.setActiveNavState();
}

// Initialize the SPA
async function initApp() {
  console.log("Initializing app..."); // Debug log
  
  // --- Load the Navbar ---
  await loadHTML("components/navbar.html", "navbar-container");

  // Load navbar JS
  const navbarScript = document.createElement("script");
  navbarScript.src = "javascript/navbar.js";
  document.body.appendChild(navbarScript);
  await new Promise((resolve) => {
    navbarScript.onload = resolve;
    navbarScript.onerror = () => {
      console.error("Failed to load navbar.js");
      resolve(); // Continue anyway
    };
  });
  
  if (window.initNavbar) {
    window.initNavbar();
  } else {
    console.warn("window.initNavbar not found");
  }

  // --- Initial route (based on current URL) ---
  const initialPath = window.location.pathname;
  console.log("Initial path:", initialPath); // Debug log
  
  // If we're at mainapp.html or index.html, go to home
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
    
    // Skip external links and hash links
    if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;

    // Create URL to check if it's internal
    try {
      const url = new URL(href, window.location.origin);
      const path = normalizePath(url.pathname);

      console.log("Link clicked:", href, "-> normalized:", path); // Debug log

      // Only handle internal routes that are defined
      if (routes[path]) {
        e.preventDefault();
        window.history.pushState({}, "", buildPath(path));
        navigate(path);
      } else {
        console.log("Route not defined:", path); // Debug log
      }
    } catch (err) {
      console.error("Error processing link:", href, err);
    }
  });

  // --- Handle browser navigation (back/forward) ---
  window.addEventListener("popstate", () => {
    console.log("Popstate event, navigating to:", window.location.pathname);
    navigate(window.location.pathname);
  });

  console.log("App initialized successfully"); // Debug log
}

// --- Boot up the app ---
// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}