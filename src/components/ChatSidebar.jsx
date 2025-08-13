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

function ChatSidebar({ env, pois }, ref) {
    const [msgs, setMsgs] = useState([{ role: 'system', content: buildSystem(env, pois) }]);
    const [input, setInput] = useState('');
    const [open, setOpen] = useState(window.innerWidth >= 1024);
    const [thinking, setThinking] = useState(false);
    const bottom = useRef(null);

    // NEW: ref pour mesurer la largeur réelle du chat (desktop) et mettre à jour les variables CSS
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

    /* =========================================================
     *  MISE À JOUR DU LAYOUT (desktop & mobile)
     *  - Définit des variables CSS :
     *      --chat-width: largeur utile du chat (desktop uniquement)
     *      --chat-open: 0/1
     *      --chat-is-overlay: 0/1 (mobile/tablette quand le chat slide en overlay)
     *      --chat-drawer-width: largeur du drawer overlay (mobile)
     *  - Ajoute des classes <body> pour simplifier les règles CSS:
     *      body.chat-open .chat-overlay
     * ========================================================= */
    useEffect(() => {
        const root = document.documentElement;

        const updateLayout = () => {
            const isOverlay = window.innerWidth < 1024; // <lg => overlay
            const measured = asideRef.current ? asideRef.current.offsetWidth : 0;

            // --chat-width n'est utile qu'en desktop (le chat est "dans" la grille)
            const chatWidth = (!isOverlay && open) ? measured : 0;
            root.style.setProperty('--chat-width', `${chatWidth}px`);
            root.style.setProperty('--chat-open', open ? '1' : '0');
            root.style.setProperty('--chat-is-overlay', (isOverlay && open) ? '1' : '0');
            root.style.setProperty('--chat-drawer-width', (isOverlay && open) ? `${measured}px` : '0px');

            // Classes sur <body> pour règles ciblées
            document.body.classList.toggle('chat-open', open);
            document.body.classList.toggle('chat-overlay', isOverlay && open);

            console.log('[ChatSidebar] layout update', {
                open,
                isOverlay,
                measuredWidth: measured,
                css: {
                    chatWidth: root.style.getPropertyValue('--chat-width'),
                    chatOpen: root.style.getPropertyValue('--chat-open'),
                    chatIsOverlay: root.style.getPropertyValue('--chat-is-overlay'),
                    chatDrawerWidth: root.style.getPropertyValue('--chat-drawer-width'),
                }
            });
        };

        // 1) mise à jour immédiate
        updateLayout();

        // 2) observe la taille réelle de l’aside (utile quand scrollbars/chrome changent)
        const ro = new ResizeObserver(() => updateLayout());
        if (asideRef.current) ro.observe(asideRef.current);

        // 3) réagit aux resize fenêtrés
        window.addEventListener('resize', updateLayout);

        return () => {
            window.removeEventListener('resize', updateLayout);
            ro.disconnect();
            // Nettoyage des classes/vars si le composant se démonte
            document.body.classList.remove('chat-open', 'chat-overlay');
            root.style.removeProperty('--chat-width');
            root.style.removeProperty('--chat-open');
            root.style.removeProperty('--chat-is-overlay');
            root.style.removeProperty('--chat-drawer-width');
        };
    }, [open]);

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
                <div className="flex items-center justify-between p-4 border-b border-[--color-border]">
                    <h3 className="font-semibold text-gray-900">Chat&nbsp;IA</h3>
                    <button className="lg:hidden btn-ghost h-8 px-2 text-gray-900" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
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
