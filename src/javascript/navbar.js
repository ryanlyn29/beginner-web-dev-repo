// NAVBAR.JS — pure JS conversion of React logic
window.initNavbar = function () {
const navItems = document.querySelectorAll(".nav-item");
const navHighlight = document.getElementById("navHighlight");
const mobileToggle = document.getElementById("mobileToggle");
const mobileMenu = document.getElementById("mobileMenu");

let activeIndex = -1;

// Move highlight under hovered/active item
function moveHighlight(el) {
  if (!el) {
    navHighlight.style.opacity = "0";
    return;
  }
  const rect = el.getBoundingClientRect();
  const parentRect = el.parentElement.getBoundingClientRect();
  navHighlight.style.left = rect.left - parentRect.left + "px";
  navHighlight.style.width = rect.width + "px";
  navHighlight.style.opacity = "1";
}

// Set active item based on URL
function setActiveByPath() {
  const path = window.location.pathname;
  activeIndex = Array.from(navItems).findIndex(
    (item) => item.getAttribute("href") === path
  );

  navItems.forEach((item, i) => {
    item.style.color = i === activeIndex ? "#000" : "#555";
  });

  if (activeIndex >= 0) moveHighlight(navItems[activeIndex]);
  else navHighlight.style.opacity = "0";
}

navItems.forEach((item, i) => {
  item.addEventListener("click", () => {
    activeIndex = i;
    setActiveByPath();
  });

  item.addEventListener("mouseenter", () => moveHighlight(item));
  item.addEventListener("mouseleave", () => {
    if (activeIndex >= 0) moveHighlight(navItems[activeIndex]);
    else navHighlight.style.opacity = "0";
  });
});

window.addEventListener("resize", () => {
  if (activeIndex >= 0) moveHighlight(navItems[activeIndex]);
});

setActiveByPath();

// Mobile toggle menu
mobileToggle.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.toggle("open");
  mobileToggle.innerHTML = isOpen
    ? '<i class="fa-solid fa-xmark"></i>'
    : '<i class="fa-solid fa-bars"></i>';
});
}
