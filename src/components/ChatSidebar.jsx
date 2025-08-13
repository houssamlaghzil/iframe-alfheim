import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import axios from 'axios';

/* Construit le message système pour l'IA */
function buildSystem(env, pois) {
    if (!env) return 'You are Alfheim, a 3D assistant.';
    const header = `ENVIRONMENT:\n${env.title}\n${env.description ?? ''}`;
    const poiTxt = pois?.length
        ? '\n\nPOINTS OF INTEREST:\n' + pois.map(p => `• ${p.label}: ${p.desc}`).join('\n')
        : '';
    return `${header}${poiTxt}`;
}

/* Confetti minimaliste (canvas) — couleurs froides (violet/indigo/noir) */
function fireConfettiFromRect(rect) {
    try {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        Object.assign(canvas.style, {
            position: 'fixed', inset: '0', width: '100vw', height: '100vh',
            zIndex: '9999', pointerEvents: 'none'
        });
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        const originX = ((rect.left + rect.right) / 2) * dpr;
        const originY = ((rect.top + rect.bottom) / 2) * dpr;

        const P = [];
        const N = 140; // nb de particules
        const colors = ['#7c3aed','#8b5cf6','#a78bfa','#6366f1','#0ea5e9','#111827']; // violet/indigo/cyan/noir
        for (let i = 0; i < N; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            P.push({
                x: originX, y: originY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 6, // petit jet initial
                g: 0.22, // gravité
                s: 2 + Math.random() * 3, // taille
                a: Math.random() * Math.PI, // angle
                w: (Math.random() * 0.2 + 0.05) * (Math.random() < 0.5 ? 1 : -1), // spin
                life: 60 + Math.floor(Math.random() * 40),
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }

        console.log('[Confetti] start', { originX, originY, count: N });

        let frame = 0, raf = null;
        const draw = () => {
            frame++;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const p of P) {
                if (p.life <= 0) continue;
                p.vy += p.g;      // gravité
                p.x += p.vx;
                p.y += p.vy;
                p.a += p.w;       // rotation
                p.life--;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.a);
                ctx.fillStyle = p.color;
                // rectangles fins pour un rendu “papier”
                ctx.fillRect(-p.s, -p.s * 0.5, p.s * 2, p.s);
                ctx.restore();
            }
            if (frame < 120) { // ~2s max suivant perf
                raf = requestAnimationFrame(draw);
            } else {
                cancelAnimationFrame(raf);
                canvas.remove();
                console.log('[Confetti] end');
            }
        };
        draw();
    } catch (e) {
        console.warn('[Confetti] fallback (désactivé):', e);
    }
}

function ChatSidebar({ env, pois }, ref) {
    const [msgs, setMsgs] = useState([{ role: 'system', content: buildSystem(env, pois) }]);
    const [input, setInput] = useState('');
    const [open, setOpen] = useState(window.innerWidth >= 1024);
    const [thinking, setThinking] = useState(false);
    const bottom = useRef(null);

    // Mesure largeur réelle du chat (desktop) pour l’offset de la toolbar
    const asideRef = useRef(null);

    useEffect(() => {
        setMsgs(m => [{ role: 'system', content: buildSystem(env, pois) }, ...m.filter(x => x.role !== 'system')]);
    }, [env, pois]);

    useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, thinking]);

    useImperativeHandle(ref, () => ({ send }));

    async function send(text) {
        const content = text ?? input;
        if (!content.trim()) return;
        const next = [...msgs, { role: 'user', content }];
        setMsgs(next);
        if (!text) setInput('');
        try {
            setThinking(true);
            const { data } = await axios.post('/api/chat', { messages: next });
            setMsgs([...next, data.choices[0].message]);
        } catch {
            setMsgs([...next, { role: 'assistant', content: 'Erreur réseau' }]);
        } finally {
            setThinking(false);
        }
    }

    /* ===== Layout (desktop & mobile) -> variables CSS globales ===== */
    useEffect(() => {
        const root = document.documentElement;
        const updateLayout = () => {
            const isOverlay = window.innerWidth < 1024; // <lg => overlay
            const measured = asideRef.current ? asideRef.current.offsetWidth : 0;

            const chatWidth = (!isOverlay && open) ? measured : 0;
            root.style.setProperty('--chat-width', `${chatWidth}px`);
            root.style.setProperty('--chat-open', open ? '1' : '0');
            root.style.setProperty('--chat-is-overlay', (isOverlay && open) ? '1' : '0');
            root.style.setProperty('--chat-drawer-width', (isOverlay && open) ? `${measured}px` : '0px');

            document.body.classList.toggle('chat-open', open);
            document.body.classList.toggle('chat-overlay', isOverlay && open);

            console.log('[ChatSidebar] layout update', { open, isOverlay, measured });
        };

        updateLayout();
        const ro = new ResizeObserver(() => updateLayout());
        if (asideRef.current) ro.observe(asideRef.current);
        window.addEventListener('resize', updateLayout);

        return () => {
            window.removeEventListener('resize', updateLayout);
            ro.disconnect();
            document.body.classList.remove('chat-open', 'chat-overlay');
            const vars = ['--chat-width','--chat-open','--chat-is-overlay','--chat-drawer-width'];
            vars.forEach(v => document.documentElement.style.removeProperty(v));
        };
    }, [open]);

    /* Double-clic sur la capsule => pluie de confettis */
    const onBadgeDoubleClick = (e) => {
        // On calcule la position de départ depuis la capsule
        const rect = e.currentTarget.getBoundingClientRect();
        console.log('[ChatSidebar] badge dblclick → confetti', rect);
        fireConfettiFromRect(rect);
    };

    return (
        <>
            {/* Bouton flottant (mobile) */}
            <button
                onClick={() => setOpen(o => !o)}
                aria-label={open ? 'Fermer le chat' : 'Ouvrir le chat'}
                className="lg:hidden fixed bottom-6 right-6 z-30 btn-primary rounded-full p-3 shadow-lg text-gray-900"
            >
                {open ? '✕' : '💬'}
            </button>

            {/* Panneau chat */}
            <aside
                ref={asideRef}
                className={`fixed lg:static top-0 right-0 h-full lg:h-auto w-full lg:w-80 max-w-full card flex flex-col
                    transform ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} transition`}
                aria-live="polite"
            >
                {/* Header avec branding + capsule Powered by GPT-5 */}
                <div className="flex items-center justify-between p-4 border-b border-[--color-border]">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 tracking-tight">ALFHEIM&nbsp;AI</h3>

                        {/* Capsule marketing — double-clic = confettis */}
                        <button
                            type="button"
                            onDoubleClick={onBadgeDoubleClick}
                            title="Double-clique pour célébrer 🎉"
                            className="
                relative select-none rounded-full px-3 py-1 text-[11px] font-semibold text-white
                bg-gradient-to-r from-violet-600 via-violet-700 to-black
                ring-1 ring-violet-400/40 shadow-sm hover:brightness-110 active:brightness-125
              "
                        >
                            Powered by GPT-5
                        </button>
                    </div>

                    <button
                        className="lg:hidden btn-ghost h-8 px-2 text-gray-900"
                        onClick={() => setOpen(false)}
                        aria-label="Fermer"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {msgs.filter(m => m.role !== 'system').map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <p className={`${m.role === 'user' ? 'bubble-user' : 'bubble-ai'} text-gray-900`}>
                                {m.content}
                            </p>
                        </div>
                    ))}
                    {thinking && (
                        <div className="flex justify-start">
                            <p className="bubble-ai text-gray-900 flex items-center">
                                <span className="dot inline-block w-1.5 h-1.5 bg-black/50 rounded-full mx-0.5"></span>
                                <span className="dot inline-block w-1.5 h-1.5 bg-black/50 rounded-full mx-0.5 [animation-delay:.15s]"></span>
                                <span className="dot inline-block w-1.5 h-1.5 bg-black/50 rounded-full mx-0.5 [animation-delay:.3s]"></span>
                            </p>
                        </div>
                    )}
                    <div ref={bottom} />
                </div>

                <div className="p-3 border-t border-[--color-border] bg-[--color-surface-2] flex gap-2">
          <textarea
              className="input resize-none"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
              rows="2"
              placeholder="Votre question…"
          />
                    <button onClick={() => send()} className="btn-primary px-3 py-2 text-gray-900" aria-label="Envoyer">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </aside>
        </>
    );
}
export default forwardRef(ChatSidebar);
