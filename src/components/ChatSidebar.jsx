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
    const bottom = useRef(null);

    /* refresh contexte système */
    useEffect(() => {
        setMsgs(m => [{ role: 'system', content: buildSystem(env, pois) }, ...m.filter(x => x.role !== 'system')]);
    }, [env, pois]);

    useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [msgs]);

    useImperativeHandle(ref, () => ({ send }));

    async function send(text) {
        const content = text ?? input;
        if (!content.trim()) return;
        const next = [...msgs, { role: 'user', content }];
        setMsgs(next);
        if (!text) setInput('');
        try {
            const { data } = await axios.post('/api/chat', { messages: next });
            setMsgs([...next, data.choices[0].message]);
        } catch {
            setMsgs([...next, { role: 'assistant', content: 'Erreur réseau' }]);
        }
    }

    return (
        <>
            <button onClick={() => setOpen(o => !o)}
                    className="lg:hidden fixed bottom-6 right-6 z-30 bg-violet-600 p-3 rounded-full shadow text-white">
                {open ? '✕' : '💬'}
            </button>

            <aside className={`fixed lg:static top-0 right-0 h-full lg:h-auto w-full lg:w-80 max-w-full card flex flex-col
                         transform ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} transition`}>
                <div className="flex items-center justify-between p-4 border-b border-[#262640]">
                    <h3 className="font-semibold">Chat&nbsp;IA</h3>
                    <button className="lg:hidden text-gray-400" onClick={() => setOpen(false)}>✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
                    {msgs.filter(m => m.role !== 'system').map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <p className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                                m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                                {m.content}
                            </p>
                        </div>
                    ))}
                    <div ref={bottom} />
                </div>

                <div className="p-3 border-t border-[#262640] bg-gray-50 flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                    rows="2" placeholder="Votre question…"
                    className="flex-1 bg-white text-gray-900 border-gray-300 rounded-md px-3 py-2 resize-none"/>
                    <button onClick={() => send()} className="btn-primary px-3 py-2">➤</button>
                </div>
            </aside>
        </>
    );
}
export default forwardRef(ChatSidebar);
