window.initHomepage = function() {
    console.log("Homepage initialized");
    
    // Scroll Reveal Observer
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach(el => observer.observe(el));

    // Down arrow scroll functionality
    const downArrow = document.getElementById('downArrow');
    if (downArrow) {
        // Clone to remove old listeners if SPA navigation causes re-init
        const newArrow = downArrow.cloneNode(true);
        if (downArrow.parentNode) {
            downArrow.parentNode.replaceChild(newArrow, downArrow);
            newArrow.addEventListener('click', () => {
                window.scrollTo({
                    top: window.innerHeight,
                    behavior: 'smooth'
                });
            });
        }
    }
};