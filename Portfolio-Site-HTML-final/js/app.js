/* =========================================================
   Mango OS — Core JS (clean refactor)
   ========================================================= */

/* ---------- Tiny DOM helpers ---------- */
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const on = (t, s, h, r = document) => r.addEventListener(t, e => {
    const m = e.target.closest(s);
    if (m) h(e, m);
});

/* ---------- Live clock ---------- */
(function clock() {
    const el = qs('.clock');
    if (!el) return;
    const tick = () => {
        const d = new Date();
        let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = ((h + 11) % 12) + 1;
        el.textContent = `${h}:${m} ${ampm}`;
    };
    tick(); setInterval(tick, 1000);
})();

/* =========================================================
   Window Manager (titlebar controls, drag, resize, taskbar)
   ========================================================= */
const WindowMgr = (() => {
    const wins = qsa('.window');
    const pills = new Map(); // id -> .task-btn

    function getPill(id) {
        return pills.get(id) || document.querySelector(`.task-btn[data-win="${id}"]`);
    }
    function registerPill(id, el) {
        if (el) { pills.set(id, el); }
    }


    // attach taskbar pills
    qsa('.task-btn').forEach(p => {
        const id = p.dataset.win;
        if (!id) return;
        pills.set(id, p);
        p.addEventListener('click', () => toggleFromTaskbar(id));
    });

    function bringToFront(win) {
        bringToFront.z = (bringToFront.z || 10) + 1;
        win.style.zIndex = bringToFront.z;
        win.classList.remove('minimized');
    }

    function setActive(id) {
        // toggle for every pill we know about
        pills.forEach((btn, wid) => {
            btn.classList.toggle('is-active', wid === id);
            btn.classList.toggle('is-min', wid !== id);
        });

        // also handle pills that were created but not registered yet
        const btn = getPill(id);
        if (btn) {
            btn.classList.add('is-active');
            btn.classList.remove('is-min');
        }
    }


    function minimize(id) {
        const w = document.getElementById(id);
        const pill = getPill(id);
        if (!w) return;
        w.classList.add('minimized');
        w.classList.remove('maximized');
        pill?.classList.add('is-min');
        pill?.classList.remove('is-active');
    }

    function toggleFromTaskbar(id) {
        const w = document.getElementById(id);
        const pill = getPill(id);
        if (!w) return;

        if (w.classList.contains('minimized')) {
            w.classList.remove('minimized');
            bringToFront(w);
            setActive(id);
            return;
        }
        if (pill?.classList.contains('is-active')) {
            minimize(id);
        } else {
            bringToFront(w);
            setActive(id);
        }
    }

    function toggleMax(id) {
        const w = document.getElementById(id);
        if (!w) return;

        const taskH = qs('.taskbar')?.offsetHeight ?? 84;
        document.documentElement.style.setProperty('--taskbar-h', `${taskH}px`);

        if (w.classList.contains('maximized')) {
            const pb = w._prevBox || {};
            w.classList.remove('maximized');
            Object.assign(w.style, {
                position: pb.position ?? 'absolute',
                left: pb.left ?? '', top: pb.top ?? '',
                right: pb.right ?? '', bottom: pb.bottom ?? '',
                width: pb.width ?? '', height: pb.height ?? '',
                transform: pb.transform ?? '', margin: pb.margin ?? '',
                maxWidth: pb.maxWidth ?? '', maxHeight: pb.maxHeight ?? ''
            });
            return;
        }

        // save current box
        w._prevBox = {
            position: w.style.position, left: w.style.left, top: w.style.top,
            right: w.style.right, bottom: w.style.bottom,
            width: w.style.width, height: w.style.height,
            transform: w.style.transform, margin: w.style.margin,
            maxWidth: w.style.maxWidth, maxHeight: w.style.maxHeight
        };

        w.classList.add('maximized');
        Object.assign(w.style, {
            position: 'fixed', left: '0', top: '0', right: '0',
            bottom: `${taskH}px`, width: '100vw',
            height: `calc(100vh - ${taskH}px)`,
            transform: 'none', margin: '0', maxWidth: 'none', maxHeight: 'none'
        });
    }

    function closeWin(id) {
        const w = document.getElementById(id);
        const pill = getPill(id);
        w?.classList.add('closed');
        pill?.remove();
        pills.delete(id);
    }

    // wire each window once
    wins.forEach(w => {
        const id = w.id;

        // controls
        qs('[data-action="min"]', w)?.addEventListener('click', () => minimize(id));
        qs('[data-action="max"]', w)?.addEventListener('click', () => toggleMax(id));
        qs('[data-action="close"]', w)?.addEventListener('click', () => closeWin(id));
        qs('.titlebar', w)?.addEventListener('dblclick', () => toggleMax(id));

        // drag (disabled while maximized)
        const bar = qs('.titlebar', w);
        let dragging = false, offX = 0, offY = 0;
        bar?.addEventListener('mousedown', (e) => {
            if (w.classList.contains('maximized')) return;
            dragging = true;
            const r = w.getBoundingClientRect();
            offX = e.clientX - r.left; offY = e.clientY - r.top;
            document.body.style.userSelect = 'none';
            const move = (ev) => {
                if (!dragging) return;
                w.style.transform = 'none';
                w.style.left = Math.max(8, ev.clientX - offX) + 'px';
                w.style.top = Math.max(8, ev.clientY - offY) + 'px';
            };
            const up = () => {
                dragging = false;
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', move);
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up, { once: true });
        });

        // resize (SE handle)
        const h = qs('.resizer', w);
        if (h) {
            let rs = false, sx = 0, sy = 0, sw = 0, sh = 0;
            h.addEventListener('mousedown', (e) => {
                rs = true;
                const r = w.getBoundingClientRect();
                sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height;
                const resize = (ev) => {
                    if (!rs) return;
                    w.style.width = Math.max(560, sw + (ev.clientX - sx)) + 'px';
                    w.style.height = Math.max(360, sh + (ev.clientY - sy)) + 'px';
                };
                const stop = () => {
                    rs = false;
                    window.removeEventListener('mousemove', resize);
                };
                window.addEventListener('mousemove', resize);
                window.addEventListener('mouseup', stop, { once: true });
                e.preventDefault();
            });
        }
    });

    return { bringToFront, setActive, minimize, toggleFromTaskbar, toggleMax, closeWin };
})();

/* =========================================================
   Hero chips → feature tiles (ONE controller)
   ========================================================= */
(function featureTiles() {
    const chips = qsa('.chip[data-tile]');
    const panels = new Map();
    chips.forEach(chip => {
        const key = chip.dataset.tile;
        const panel = document.getElementById(`tile-${key}`);
        if (panel) panels.set(key, panel);
    });
    const showCaseBtn = document.getElementById('show-case');
    const casePanel = document.getElementById('tile-case');
    if (casePanel) panels.set('case', casePanel);

    let locked = null, hoverTimer = null;

    function hideAll() {
        panels.forEach(p => { p.classList.remove('is-visible'); p.setAttribute('hidden', ''); });
        chips.forEach(c => c.setAttribute('aria-selected', 'false'));
    }
    function show(key, lock = false) {
        const p = panels.get(key);
        if (!p) return;
        hideAll();
        p.removeAttribute('hidden');
        requestAnimationFrame(() => p.classList.add('is-visible'));
        if (lock) {
            locked = key;
            chips.find(c => c.dataset.tile === key)?.setAttribute('aria-selected', 'true');
        }
    }

    chips.forEach(chip => {
        const key = chip.dataset.tile;

        chip.addEventListener('mouseenter', () => {
            if (locked) return;
            if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
            show(key);                  // preview
        });
        chip.addEventListener('mouseleave', () => {
            if (locked) return;
            hoverTimer = setTimeout(() => { hideAll(); hoverTimer = null; }, 120);
        });
        chip.addEventListener('click', e => {
            e.preventDefault();
            if (locked === key) { locked = null; hideAll(); }
            else { show(key, true); }
        });
    });

    showCaseBtn?.addEventListener('click', e => { e.preventDefault(); show('case', true); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') { locked = null; hideAll(); } });
})();

/* =========================================================
   Start & Tray → simple Router (cross-page aware)
   ========================================================= */
(function router() {
    const OPEN_HOME = 'openHome';

    function ensurePill(id, label, icon) {
        if (qs(`.task-btn[data-win="${id}"]`)) return;
        const bar = qs('#taskButtons, .task-buttons');
        if (!bar) return;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'task-btn';
        pill.dataset.win = id;
        pill.innerHTML = `
    <img class="task-icon" src="${icon || 'assets/mascot_head.svg'}" alt="">
    <span class="task-label">${label || 'Portfolio Viewer'}</span>`;
        pill.addEventListener('click', () => WindowMgr.toggleFromTaskbar(id));
        bar.appendChild(pill);

        // NEW: make the window manager aware of this pill
        WindowMgr.registerPill?.(id, pill);
    }


    function openHome() {
        const id = 'window-home';
        const w = document.getElementById(id);
        if (!w) { try { sessionStorage.setItem(OPEN_HOME, '1'); } catch { }; location.href = 'index.html#home'; return; }
        w.classList.remove('is-hidden', 'minimized', 'closed');
        WindowMgr.bringToFront(w);
        ensurePill(id, 'Portfolio Viewer', 'assets/mascot_head.svg');
        WindowMgr.setActive(id);
    }

    window.addEventListener('DOMContentLoaded', () => {
        // Start always opens Home (even from other pages)
        qs('.start')?.addEventListener('click', e => { e.preventDefault(); openHome(); });

        // Desktop icon that links to index should also open/restore Home
        qs('.dock a[href$="index.html"]')?.addEventListener('click', (e) => {
            const onIndex = !!document.getElementById('window-home');
            if (onIndex) { e.preventDefault(); openHome(); }
            else { try { sessionStorage.setItem(OPEN_HOME, '1'); } catch { } }
        });

        // Auto-open Home if we navigated with the flag/hash
        const onIndex = !!document.getElementById('window-home');
        if (onIndex) {
            const viaFlag = (() => { try { return sessionStorage.getItem(OPEN_HOME) === '1'; } catch { return false; } })();
            const viaHash = location.hash === '#home';
            if (viaFlag || viaHash) {
                openHome();
                try { sessionStorage.removeItem(OPEN_HOME); } catch { }
                history.replaceState(null, '', location.pathname);
            }
        }

        // Tray shorcuts: mail→about, folder→work
        qsa('.tray button').forEach(btn => {
            const src = btn.querySelector('img')?.getAttribute('src') || '';
            if (/closed_mail\.png$/i.test(src)) btn.addEventListener('click', () => location.href = 'about.html');
            if (/kawaii_folder(\.png)?$/i.test(src)) btn.addEventListener('click', () => location.href = 'work.html');
        });
    });
})();

/* =========================================================
   Commands Window opener (works from any page)
   ========================================================= */
(function commandsWindow() {
    const HELP_FLAG = '__openHelp';

    function ensurePill(id, label, icon) {
        const bar = document.getElementById('taskButtons') || document.querySelector('.task-buttons');
        if (!bar || document.querySelector(`.task-btn[data-win="${id}"]`)) return;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'task-btn is-active';
        pill.dataset.win = id;
        pill.innerHTML = `
      <img class="task-icon" src="${icon || 'assets/opened_sparkle.png'}" alt="">
      <span class="task-label">${label || 'Commands.txt'}</span>`;
        pill.addEventListener('click', () => WindowMgr.toggleFromTaskbar(id));
        bar.appendChild(pill);
        WindowMgr.registerPill?.(id, pill);   // <-- add this line
    }

    function openWin(id, label, icon) {
        const w = document.getElementById(id);
        if (!w) return false;
        w.classList.remove('is-hidden', 'minimized', 'closed');
        WindowMgr.bringToFront(w);
        ensurePill(id, label, icon);
        WindowMgr.setActive(id);
        return true;
    }

    // Expose helpers used by the command switch
    window._openCommands = () => {
        // If window exists on this page, open it
        if (openWin('window-commands', 'Commands.txt', 'assets/opened_sparkle.png')) return;
        // Otherwise, jump to Home and auto-open
        try { sessionStorage.setItem(HELP_FLAG, '1'); } catch { }
        location.href = 'index.html#help';
    };

    window._openWinver = () => {
        if (openWin('window-winver', 'About This Site', 'assets/opened_sparkle.png')) return;
        // If About window only exists on Home, bounce there and open Home instead
        try { sessionStorage.setItem('__openHome', '1'); } catch { }
        location.href = 'index.html#home';
    };

    // When landing on Home, auto-open Commands if the flag/hash was set
    window.addEventListener('DOMContentLoaded', () => {
        const onHome = !!document.getElementById('window-home');
        if (!onHome) return;

        const needHelp = (() => { try { return sessionStorage.getItem(HELP_FLAG) === '1'; } catch { return false; } })();
        const viaHash = location.hash === '#help';
        if (needHelp || viaHash) {
            openWin('window-commands', 'Commands.txt', 'assets/opened_sparkle.png');
            try { sessionStorage.removeItem(HELP_FLAG); } catch { }
            if (viaHash) history.replaceState(null, '', location.pathname);
        }
    });
})();



/* =========================================================
   Commands box (decorative search) + small FX
   ========================================================= */
(function commands() {
    const $$ = qsa;
    // FX helpers
    function toast(msg, ms = 2200) {
        const t = Object.assign(document.createElement('div'), { className: 'fx-toast', textContent: msg });
        document.body.appendChild(t); setTimeout(() => t.remove(), ms);
    }
    function jiggleIcons(ms = 1500) { document.body.classList.add('jiggle'); setTimeout(() => document.body.classList.remove('jiggle'), ms); }
    function ripples() {
        const c = Object.assign(document.createElement('div'), { className: 'fx-ripple' }); c.style.color = '#ff66aa';
        document.body.appendChild(c);
        c.animate([{ transform: 'scale(1)', opacity: .9 }, { transform: 'scale(20)', opacity: 0 }], { duration: 1500, easing: 'cubic-bezier(.2,.6,0,1)' }).onfinish = () => c.remove();
    }
    function ip() { toast('IPv4 Address . . . . . . . . : 127.0.0.1   (nice)'); }

    function run(raw) {
        const [cmd, arg] = String(raw || '').trim().split(/\s+/);
        switch ((cmd || '').toLowerCase()) {
            case 'help':
                window._openCommands?.();
                break;

            case 'cls':
                qsa('.fx-layer,.fx-toast').forEach(n => n.remove());
                break;

            case 'winver':
                window._openWinver?.();
                break;

            case 'dir':
                jiggleIcons();
                break;

            case 'tree': {                // simple ASCII overlay
                const layer = Object.assign(document.createElement('div'), { className: 'fx-layer' });
                layer.innerHTML = `<pre style="position:absolute;left:12px;top:12px;color:#2b1e45;font-weight:700;opacity:.85">
        🌳
       /|\\
      /_|_\\
        |
      </pre>`;
                document.body.appendChild(layer);
                setTimeout(() => layer.remove(), 2200);
                break;
            }

            case 'ping':
                ripples();
                break;

            case 'ipconfig':
                ip();
                break;

            case 'start': {  // start sparkles/hearts/bubbles/trail
                const mode = (arg || '').toLowerCase();

                if (mode === 'sparkles' || mode === 'hearts' || mode === 'bubbles') {
                    // emoji pools per mode
                    const EMOJI = {
                        sparkles: ['✨', '🌟', '💫', '⭐'],
                        hearts: ['💖', '💗', '💘', '💝', '❤️‍🔥'],
                        bubbles: ['🫧', '⚪', '🔵', '🔹']
                    };
                    const pool = EMOJI[mode] || ['✨'];

                    // helper to spawn one burst with size & duration variety
                    const make = (x, y, dx, dy) => {
                        const e = Object.assign(document.createElement('div'), { className: 'mango-burst' });
                        e.textContent = pool[Math.floor(Math.random() * pool.length)];
                        const size = 24 + Math.random() * 44;            // 24–68px
                        const dur = 1400 + Math.random() * 1100;        // 1.4–2.5s
                        e.style.fontSize = Math.round(size) + 'px';
                        e.style.setProperty('--x', x + 'px');
                        e.style.setProperty('--y', y + 'px');
                        e.style.setProperty('--dx', dx + 'px');
                        e.style.setProperty('--dy', dy + 'px');
                        e.style.setProperty('--dur', Math.round(dur) + 'ms');
                        document.body.appendChild(e);
                        setTimeout(() => e.remove(), dur + 200);
                    };

                    // launch from all four edges with a bit more spread
                    const w = innerWidth, h = innerHeight, N = 36;     // more particles
                    for (let i = 0; i < N; i++) {
                        const fromLeft = i % 4 === 0, fromRight = i % 4 === 1;
                        const fromTop = i % 4 === 2, fromBottom = i % 4 === 3;
                        const x = fromLeft ? 0 : fromRight ? w : Math.random() * w;
                        const y = fromTop ? 0 : fromBottom ? h : Math.random() * h;
                        const dx = (Math.random() * w - w / 2) * 0.8;    // wider spread
                        const dy = (Math.random() * h - h / 2) * 0.8;
                        make(x, y, dx, dy);
                    }
                } else if (mode === 'trail') {
                    let t = Date.now();
                    const move = e => {
                        if (Date.now() - t < 30) return; t = Date.now();
                        const s = Object.assign(document.createElement('div'), { className: 'mango-sparkle star' });
                        s.style.setProperty('--x', e.clientX + 'px');
                        s.style.setProperty('--y', e.clientY + 'px');
                        s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px');
                        s.style.setProperty('--dy', (Math.random() * 20 - 10) + 'px');
                        document.body.appendChild(s); setTimeout(() => s.remove(), 700);
                    };
                    window.addEventListener('mousemove', move, { passive: true });
                    setTimeout(() => window.removeEventListener('mousemove', move), 8000);
                } else {
                    toast('Try: start sparkles | hearts | bubbles | trail');
                }
                break;
            }


            case 'taskkill':
                if (String(arg).toLowerCase() === '/f') {
                    qsa('.window').forEach(w => w.id && WindowMgr.minimize(w.id));
                } else {
                    toast('Did you mean: taskkill /f');
                }
                break;

            case 'color':
                document.documentElement.classList.remove('theme-pink', 'theme-purple', 'theme-aqua');
                if (/pink|purple|aqua/.test(arg)) document.documentElement.classList.add(`theme-${arg}`);
                else toast('Try: color pink | purple | aqua');
                break;

            default:
                toast('Unknown command. Type "help"');
        }

    }

    window.addEventListener('DOMContentLoaded', () => {
        const input = qs('.tb-search input, .decorative-search input, input[type="search"]');
        if (!input) return;
        input.setAttribute('placeholder', 'type a command… (help)');
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { run(input.value); input.value = ''; } });
    });
})();

/* =========================================================
   JellyPod Mini (floating music widget — optional)
   ========================================================= */
window.JellyPod = (() => {
    const AUDIO_SRC = 'assets/happy-future-bass-music-409358.mp3'; // change if needed
    let wrap, audio, pill, hidden = false, z = 1000;

    function taskbar() { return document.getElementById('taskButtons') || qs('.task-buttons'); }
    function bring() { if (wrap) wrap.style.zIndex = String(++z); }
    // inside JellyPod module…

    function ensurePill(active = true) {
        const bar = taskbar(); if (!bar) return;
        if (!pill) {
            pill = document.createElement('button');
            pill.className = 'task-btn';
            pill.innerHTML = `<img class="task-icon" src="assets/headphone_sparkle.png" alt=""><span>Music</span>`;
            pill.addEventListener('click', () => {
                if (!wrap) return;
                const nowHidden = hidden || wrap.style.display === 'none';
                if (nowHidden) { wrap.style.display = 'block'; hidden = false; pill.classList.add('is-active'); bring(); }
                else { wrap.style.display = 'none'; hidden = true; pill.classList.remove('is-active'); }
            });
            bar.appendChild(pill);
        }
        // make sure it visually reflects current state
        pill.classList.toggle('is-active', active && !hidden);
    }

    return {
        open() {
            if (!wrap) create();
            wrap.style.display = 'block';
            hidden = false;
            bring();
            ensurePill(true);
        },

        close() {
            // hide the widget and remove the pill entirely
            if (!wrap) return;
            audio && audio.pause();
            wrap.style.display = 'none';
            hidden = true;

            if (pill) {                 // <-- remove the taskbar pill
                pill.remove();
                pill = null;
            }
        }
    };


    function create() {
        wrap = document.createElement('div');
        wrap.className = 'jellypod jellypod--berry';
        wrap.innerHTML = `
      <div class="jellypod__card">
        <div class="jellypod__header"><div class="jellypod__drag"></div><button class="jellypod__close" aria-label="Close">✕</button></div>
        <div class="jellypod__disc-wrap"><div class="jellypod__disc"></div></div>
        <div class="jellypod__pulse"></div>
        <div class="jellypod__meta"><div class="jellypod__title">Happy Future Bass</div><div class="jellypod__artist">Generique</div></div>
        <div class="jellypod__controls"><button class="jp-btn" data-act="prev">⟲</button><button class="jp-btn" data-act="play">▶</button><button class="jp-btn" data-act="next">⟳</button></div>
        <div class="jellypod__seek"><span class="jp-time" data-now>0:00</span><input class="jp-range" type="range" min="0" max="100" value="0" step="1"/><span class="jp-time" data-all>0:00</span></div>
        <div class="jellypod__vol"><span class="jp-time">VOL</span><input class="jp-vol" type="range" min="0" max="1" step="0.01" value="1"></div>
      </div>`;
        document.body.appendChild(wrap);
        ensurePill(true);

        audio = new Audio(AUDIO_SRC);
        const play = qs('.jp-btn[data-act="play"]', wrap);
        const prev = qs('.jp-btn[data-act="prev"]', wrap);
        const next = qs('.jp-btn[data-act="next"]', wrap);
        const range = qs('.jp-range', wrap);
        const now = qs('[data-now]', wrap);
        const all = qs('[data-all]', wrap);
        const vol = qs('.jp-vol', wrap);

        const fmt = t => isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00';
        const ui = () => { range.value = audio.duration ? Math.round((audio.currentTime / audio.duration) * 100) : 0; now.textContent = fmt(audio.currentTime); all.textContent = fmt(audio.duration || 0); };

        wrap.addEventListener('pointerdown', bring);
        qs('.jellypod__close', wrap).addEventListener('click', () => JellyPod.close());
        play.addEventListener('click', () => { if (audio.paused) { audio.play().catch(() => { }); wrap.classList.add('is-playing'); play.textContent = '⏸'; } else { audio.pause(); wrap.classList.remove('is-playing'); play.textContent = '▶'; } });
        prev.addEventListener('click', () => { audio.currentTime = 0; ui(); });
        next.addEventListener('click', () => { audio.currentTime = 0; ui(); });
        range.addEventListener('input', () => { if (!audio.duration) return; audio.currentTime = (range.value / 100) * audio.duration; });
        vol.addEventListener('input', () => audio.volume = +vol.value);
        audio.addEventListener('loadedmetadata', ui);
        audio.addEventListener('timeupdate', ui);
        audio.addEventListener('ended', () => { wrap.classList.remove('is-playing'); play.textContent = '▶'; });

        // drag by header
        const head = qs('.jellypod__header', wrap);
        let drag = false, dx = 0, dy = 0;
        head.addEventListener('pointerdown', e => {
            drag = true; wrap.classList.add('dragging');
            const r = wrap.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top;
            const move = ev => {
                if (!drag) return;
                const x = Math.max(8, Math.min(innerWidth - wrap.offsetWidth - 8, ev.clientX - dx));
                const y = Math.max(8, Math.min(innerHeight - wrap.offsetHeight - 8, ev.clientY - dy));
                Object.assign(wrap.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
            };
            const up = () => { drag = false; wrap.classList.remove('dragging'); window.removeEventListener('pointermove', move); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up, { once: true });
        });

        if (audio.readyState >= 1) ui();
    }

    return {
        open() { if (!wrap) create(); wrap.style.display = 'block'; hidden = false; bring(); ensurePill(true); },
        close() { if (!wrap) return; audio && audio.pause(); wrap.style.display = 'none'; hidden = true; pill?.classList.remove('is-active'); }
    };
})();
