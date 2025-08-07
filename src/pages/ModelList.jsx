import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function ModelList() {
    const [envs, setEnvs] = useState([]);

    useEffect(() => {
        axios.get('/api/environments').then(r => setEnvs(r.data)).catch(console.error);
    }, []);

    if (!envs.length)
        return (
            <main className="py-20 text-center text-gray-500">
                Aucun environnement pour l’instant.
            </main>
        );

    return (
        <main className="max-w-6xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-semibold mb-8">Galerie des environnements</h2>

            {/* Grille responsive */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {envs.map(env => (
                    <Link
                        key={env.id}
                        to={`/model/${env.id}`}
                        className="group rounded-xl overflow-hidden border shadow-sm hover:shadow-lg transition"
                    >
                        <div className="bg-gray-100 h-48 flex items-center justify-center">
                            <img
                                src="/placeholder.png"
                                alt={env.title}
                                className="h-24 w-auto opacity-60 group-hover:opacity-80 transition"
                            />
                        </div>
                        <div className="p-4 space-y-1">
                            <h3 className="font-medium text-gray-800 group-hover:text-sky-600">
                                {env.title}
                            </h3>
                            <p className="text-sm text-gray-500">{env.subtitle}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </main>
    );
}
