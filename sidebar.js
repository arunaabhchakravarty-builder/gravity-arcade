// sidebar.js
// Single source of truth for the Gravity OS Brand Header and Navigation Links

document.addEventListener("DOMContentLoaded", () => {
    // Dynamically ensure sidebar.css is linked
    if (!document.querySelector('link[href*="sidebar.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'sidebar.css';
        document.head.appendChild(link);
    }

    const isLocalFile = window.location.protocol === 'file:';
    const mapHref = isLocalFile ? "http://localhost:8080/architecture_map.html" : "architecture_map.html";

    const navHtml = `
        <div class="brand">
          <div class="brand-header">
            <!-- Sleek cybernetic rotating logo -->
            <div class="brand-logo-container">
              <div class="brand-logo-ring1"></div>
              <div class="brand-logo-ring2"></div>
              <span class="brand-logo-char">G</span>
            </div>
            <div class="brand-text">
              <div class="brand-name">GRAVITY OS</div>
              <div class="brand-sub" id="brandSub">// CYBER HUD</div>
            </div>
          </div>
          
          <!-- Premium themed select element -->
          <div class="sidebar-select-wrapper">
            <select id="editionSelect" onchange="switchTheme(this.value)" class="sidebar-select">
              <option value="cyber">CYBER OBSIDIAN</option>
              <option value="sovereign">SOVEREIGN LIGHT</option>
              <option value="holographic">HOLOGRAPHIC GLASS</option>
              <option value="nord">NORD FROST</option>
              <option value="emerald">EMERALD LUSH</option>
              <option value="neobrutalism">NEO-BRUTALISM</option>
              <option value="tailadmin">TAILADMIN BLUE</option>
            </select>
            <div class="sidebar-select-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <nav class="nav-links" id="sidebarNav">
          <a href="dashboard.html" class="nav-link">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
            </span> 
            WEB APPS STUDIO
          </a>
          <a href="retro_arcade.html" class="nav-link">
            <span class="nav-icon">🕹️</span> 
            RETRO ARCADE
          </a>
          <a href="upi_tracker.html" class="nav-link">
            <span class="nav-icon">💸</span> 
            FINANCE AUDITOR
          </a>
          <a href="mutual_funds.html" class="nav-link">
            <span class="nav-icon">📈</span> 
            MUTUAL FUNDS
          </a>
          <a href="news.html" class="nav-link">
            <span class="nav-icon">📰</span> 
            FINANCE AGGREGATOR
          </a>
          <a href="contra_guide.html" class="nav-link">
            <span class="nav-icon">🔥</span> 
            CONTRA GUIDE
          </a>
          <a href="spy_hunter_guide.html" class="nav-link">
            <span class="nav-icon">🚔</span> 
            SPY HUNTER GUIDE
          </a>
          <a href="game_genie_manager.html" class="nav-link">
            <span class="nav-icon">🪄</span> 
            CHEAT CODE MANAGER
          </a>
          <a href="next_gen_vault.html" class="nav-link">
            <span class="nav-icon">💿</span> 
            NEXT-GEN VAULT
          </a>
        </nav>
    `;

    const container = document.getElementById("sidebar-nav-container");
    if (container) {
        container.innerHTML = navHtml;

        // Auto-highlight active link based on current path
        const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
        const navLinks = document.querySelectorAll("#sidebarNav a");
        navLinks.forEach(link => {
            const href = link.getAttribute("href");
            if (href) {
                const linkPath = href.split("/").pop().split("?")[0];
                if (linkPath === currentPath) {
                    link.classList.add("active");
                } else {
                    link.classList.remove("active");
                }
            }
        });

        // Sync Theme Select with validation
        if (typeof switchTheme === "function") {
            const validThemes = ['cyber', 'sovereign', 'holographic', 'nord', 'emerald', 'neobrutalism', 'tailadmin'];
            let savedTheme = localStorage.getItem('gravity_theme') || 'cyber';
            if (!validThemes.includes(savedTheme)) {
                savedTheme = 'cyber';
            }
            const selectEl = document.getElementById('editionSelect');
            if (selectEl) selectEl.value = savedTheme;
            switchTheme(savedTheme);
        }
    }
});
