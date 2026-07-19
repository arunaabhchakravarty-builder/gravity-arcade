// app_header.js
// Slim standalone app header bar for non-hub pages
// Replaces the full sidebar with a "← Back to Web Apps Studio" button + theme selector
// Replaces the full sidebar with a "← Back to Web Apps Studio" button + theme selector

window.switchTheme = function(theme) {
    const validThemes = ['cyber', 'sovereign', 'holographic', 'nord', 'emerald', 'neobrutalism', 'tailadmin'];
    if (!validThemes.includes(theme)) theme = 'cyber';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gravity_theme', theme);
};

document.addEventListener("DOMContentLoaded", () => {
    // Dynamically ensure app_header.css is linked
    if (!document.querySelector('link[href*="app_header.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'app_header.css?v=2';
        document.head.appendChild(link);
    }

    const headerHtml = `
        <div class="app-header-left">
          <a href="dashboard.html" class="back-to-studio">
            <span class="back-arrow">←</span>
            Web Apps Studio
          </a>
          <div class="app-header-sep"></div>
          <div class="app-header-brand">
            <div class="app-header-logo">
              <div class="app-header-logo-ring"></div>
              <span class="app-header-logo-char">G</span>
            </div>
            <span class="app-header-title">GRAVITY OS</span>
          </div>
        </div>
        <div class="app-header-right">
          <div class="app-header-theme-wrapper">
            <select id="appHeaderThemeSelect" onchange="switchTheme(this.value)" class="app-header-theme-select">
              <option value="cyber">CYBER OBSIDIAN</option>
              <option value="sovereign">SOVEREIGN LIGHT</option>
              <option value="holographic">HOLOGRAPHIC GLASS</option>
              <option value="nord">NORD FROST</option>
              <option value="emerald">EMERALD LUSH</option>
              <option value="neobrutalism">NEO-BRUTALISM</option>
              <option value="tailadmin">TAILADMIN BLUE</option>
            </select>
            <div class="app-header-theme-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
    `;

    const container = document.getElementById("app-header-container");
    if (container) {
        container.innerHTML = headerHtml;

        // Sync Theme Select with saved value
        const validThemes = ['cyber', 'sovereign', 'holographic', 'nord', 'emerald', 'neobrutalism', 'tailadmin'];
        let savedTheme = localStorage.getItem('gravity_theme') || 'cyber';
        if (!validThemes.includes(savedTheme)) {
            savedTheme = 'cyber';
        }
        const selectEl = document.getElementById('appHeaderThemeSelect');
        if (selectEl) selectEl.value = savedTheme;
        window.switchTheme(savedTheme);
    }
});
