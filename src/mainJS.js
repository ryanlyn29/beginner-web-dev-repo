// Load partial HTML into a container
async function loadHTML(path, containerId) {
  const container = document.getElementById(containerId);
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = "<p>Error loading page.</p>";
    console.error("Failed to load HTML:", path, err);
  }
}

// Simple router
async function navigate(path) {
  const pageContainer = document.getElementById("page-content");

  // Normalize path
  path = path.replace(/\/$/, "");

  // Map "/" or "" to homepage
  if (path === "" || path === "/") path = "/home";

  // Route mapping
  if (path === "/home") {
    await loadHTML("pages/homepage.html", "page-content");
  } else if (path === "/chat") {
    await loadHTML("pages/chat.html", "page-content");
  } else if (path === "/board") {
    await loadHTML("pages/board.html", "page-content");
  } else {
    pageContainer.innerHTML = "<h2>404 Page Not Found</h2>";
  }
}

// Initialize app
async function initApp() {
  // Load navbar first
  await loadHTML("components/navbar.html", "navbar-container");

  // Load navbar JS after HTML loads
  const navbarScript = document.createElement("script");
  navbarScript.src = "javascript/navbar.js";
  document.body.appendChild(navbarScript);
  await new Promise((resolve) => (navbarScript.onload = resolve));
  if (window.initNavbar) window.initNavbar();

  // Load initial page
  await navigate("/home");

  // Handle internal link clicks
  document.body.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, window.location.origin);
    const path = url.pathname;

    if (path.startsWith("/")) {
      e.preventDefault();
      window.history.pushState({}, "", path);
      navigate(path);
    }
  });

  // Handle browser back/forward
  window.addEventListener("popstate", () => navigate(window.location.pathname));
}

// Start the app
initApp();
