import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function CreateEnv() {
    const nav = useNavigate();
    const [form, setForm] = useState({ title:'', subtitle:'', description:'' });
    const [file, setFile] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

    async function submit(e){
        e.preventDefault();
        if(!file) return setErr('Sélectionne un .glb');
        setErr(''); setLoading(true);
        try{
            const fd=new FormData();
            Object.entries(form).forEach(([k,v])=>fd.append(k,v));
            fd.append('file',file);
            const {data}=await axios.post('/api/environments',fd);
            nav(`/model/${data.id}?edit`);           /* arrive direct en mode édition */
        }catch{ setErr('Erreur serveur'); } finally{ setLoading(false); }
    }

    return (
        <main className="page max-w-3xl mx-auto px-4 py-10">
            <form onSubmit={submit} className="card p-8 space-y-8 animate-fade-in">
                <h2 className="text-2xl font-semibold text-center brand-gradient-text">
                    Nouvel environnement 3D
                </h2>

                <div className="grid gap-6 md:grid-cols-2">
                    {['title','subtitle'].map(k=>(
                        <div key={k} className="space-y-2">
                            <label htmlFor={k} className="block text-gray-300 capitalize">{k}</label>
                            <input id={k} name={k} required value={form[k]} onChange={handle}
                                   className="input" placeholder={k === 'title' ? 'Titre' : 'Sous-titre'} />
                        </div>
                    ))}

                    <div className="md:col-span-2 space-y-2">
                        <label htmlFor="description" className="block text-gray-300">Description</label>
                        <textarea id="description" name="description" rows="4" required value={form.description} onChange={handle}
                                  className="input" placeholder="Décris brièvement ton environnement"/>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-gray-300">Fichier GLB</label>
                    <label htmlFor="file-upload"
                           className="flex items-center justify-center px-6 py-5 rounded-lg border-2 border-dashed border-[--color-border] glass cursor-pointer hover:ring-2 hover:ring-[--color-primary]/60 transition">
                        <span className="text-sm text-gray-300">{file ? file.name : 'Clique ou dépose ton .glb ici'}</span>
                        <input id="file-upload" type="file" accept=".glb" required aria-label="Sélectionner un fichier GLB"
                               onChange={e=>setFile(e.target.files[0])} className="sr-only"/>
                    </label>
                </div>

                {err && <p className="text-red-400 text-sm">{err}</p>}
                <button disabled={loading} className="btn-primary w-full disabled:opacity-50">
                    {loading ? 'Envoi…' : 'Créer'}
                </button>
            </form>
        </main>
    );
}
