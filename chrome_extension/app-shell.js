// Shared navigation and small, accessible UI behaviors for extension pages.
(() => {
    const icons = {
        book: '<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Z"/><path d="M12 5v15"/>',
        library: '<path d="M4 4v16M9 4v16M14 4v16M18 4l3 16"/>',
        upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
        queue: '<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="15" width="18" height="5" rx="1"/><path d="M7 6.5h.01M7 17.5h.01"/>',
        settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
        web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z"/>',
        arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
        search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>'
    };
    const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
    document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
    const page = document.body.dataset.page;
    if (!page || page === 'popup' || page === 'sidebar') return;
    const nav = document.createElement('aside');
    nav.className = 'app-nav';
    nav.setAttribute('aria-label', 'Workspace navigation');
    nav.innerHTML = `
        <a class="app-brand" href="viewer.html"><span class="brand-mark">${icon('book')}</span><span>Shiur AI<span class="brand-caption">A companion for learning</span></span></a>
        <div class="nav-section-label">YOUR WORKSPACE</div>
        <nav>${[
            ['viewer', 'library', 'Library', 'viewer.html'],
            ['upload', 'upload', 'New notes', 'upload.html'],
            ['queue', 'queue', 'Processing queue', 'bulk-monitor.html'],
            ['options', 'settings', 'Settings', 'options.html']
        ].map(([id, glyph, label, href]) => `<a href="${href}" class="nav-link${page === id ? ' active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${page === id ? '<span class="nav-active-dot"></span>' : ''}</a>`).join('')}</nav>
        <div class="nav-bottom"><div class="nav-note">A little more clarity.<br>A little deeper learning.</div><div class="local-label"><span></span> Notes saved in your browser</div><a class="nav-help" href="https://shiurnotes.com/" target="_blank" rel="noopener noreferrer">Use the web app ↗</a><a class="nav-help" href="SETUP.md" target="_blank">Getting started ↗</a></div>`;
    document.body.prepend(nav);
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#mainContent';
    skip.textContent = 'Skip to content';
    document.body.prepend(skip);
    const main = document.querySelector('main');
    if (main) main.id = 'mainContent';
    // Support keyboard dismissal and focus containment for the existing modals.
    let returnFocus;
    document.querySelectorAll('.modal').forEach(modal => {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', modal.querySelector('h3')?.textContent || 'Dialog');
        new MutationObserver(() => {
            if (modal.style.display === 'flex') {
                returnFocus = document.activeElement;
                modal.querySelector('input, button, select')?.focus();
            } else if (modal.style.display === 'none') returnFocus?.focus();
        }).observe(modal, { attributes: true, attributeFilter: ['style'] });
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') modal.style.display = 'none';
            if (event.key !== 'Tab') return;
            const controls = [...modal.querySelectorAll('button, input, select, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
        modal.addEventListener('click', event => { if (event.target === modal) modal.style.display = 'none'; });
    });
})();
