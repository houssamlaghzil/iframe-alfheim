import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import axios from 'axios';

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

    return (
        <>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label={open ? 'Fermer le chat' : 'Ouvrir le chat'}
                className="lg:hidden fixed bottom-6 right-6 z-30 btn-primary rounded-full p-3 shadow-lg text-gray-900"
            >
                {open ? '✕' : '💬'}
            </button>

            <aside
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
                            {/* Ajout de text-gray-900 pour forcer côté utilitaire (chargé après components) */}
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
                    {/* Texte sombre explicite + icône hérite de la couleur */}
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
