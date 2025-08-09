import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function ModelList() {
    const [envs, setEnvs] = useState([]);
    useEffect(() => { axios.get('/api/environments').then(r => setEnvs(r.data)); }, []);

    return (
        <main className="page max-w-7xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-semibold mb-8 brand-gradient-text">Galerie des environnements</h2>

            {envs.length === 0 ? (
                <p className="text-gray-400">Aucun environnement enregistré.</p>
            ) : (
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {envs.map(env => (
                        <Link key={env.id} to={`/model/${env.id}`} className="group card overflow-hidden">
                            <div className="relative h-44 bg-gradient-to-br from-[#2e2e57] to-[#1c1c38]">
                                <div className="absolute inset-0 flex items-center justify-center hover-zoom">
                                    <svg className="w-12 h-12 text-violet-400" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                                                                 d="M12 2l7 4v8l-7 4-7-4V6l7-4z"/></svg>
                                </div>
                                <div className="overlay-gradient" />
                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                    <h3 className="font-medium truncate">{env.title}</h3>
                                    <p className="text-xs text-gray-300 line-clamp-2">{env.subtitle}</p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
