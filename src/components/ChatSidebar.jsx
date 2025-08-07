import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

export default function ChatSidebar({ modelId }) {
    const [open, setOpen] = useState(window.innerWidth >= 768); // ouvert sur desktop
    const [msgs, setMsgs] = useState([
        { role: 'system', content: `Answer questions about model ${modelId}.` }
    ]);
    const [input, setInput] = useState('');
    const bottom = useRef(null);

    useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [msgs]);

    async function send() {
        if (!input.trim()) return;
        const next = [...msgs, { role: 'user', content: input }];
        setMsgs(next);
        setInput('');
        try {
            const { data } = await axios.post('/api/chat', { messages: next });
            setMsgs([...next, data.choices[0].message]);
        } catch {
            setMsgs([...next, { role: 'assistant', content: 'Erreur réseau' }]);
        }
    }

    return (
        <>
            {/* bouton mobile */}
            <button
                onClick={() => setOpen(o => !o)}
                className="md:hidden fixed bottom-4 right-4 z-30 bg-sky-600 p-3 rounded-full shadow-lg text-white"
            >
                {open ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            d="M12 20l9-5-9-5-9 5 9 5zM12 4v6M12 14v6"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                        />
                    </svg>
                )}
            </button>

            {/* sidebar */}
            <aside
                className={`${
                    open ? 'translate-x-0' : 'translate-x-full'
                } md:translate-x-0 transition-transform duration-300 
                   w-80 shrink-0 border-l bg-white flex flex-col z-20`}
            >
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {msgs
                        .filter(m => m.role !== 'system')
                        .map((m, i) => (
                            <p
                                key={i}
                                className={`whitespace-pre-wrap ${
                                    m.role === 'user' ? 'text-right text-sky-600' : ''
                                }`}
                            >
                                {m.content}
                            </p>
                        ))}
                    <div ref={bottom} />
                </div>

                <div className="p-3 border-t flex gap-2">
          <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
              rows="2"
              placeholder="Votre question…"
              className="flex-1 border rounded px-2 resize-none"
          />
                    <button
                        onClick={send}
                        className="bg-sky-600 text-white px-3 rounded flex-shrink-0 disabled:opacity-50"
                    >
                        ➤
                    </button>
                </div>
            </aside>
        </>
    );
}
