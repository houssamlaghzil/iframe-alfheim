import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function CreateEnv() {
    const nav = useNavigate();
    const [form, setForm] = useState({ title: '', subtitle: '', description: '' });
    const [file, setFile] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!file) return setErr('Merci de choisir un fichier .glb');
        setErr('');
        try {
            setLoading(true);
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v));
            fd.append('file', file);
            const { data } = await axios.post('/api/environments', fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            nav(`/model/${data.id}`);
        } catch {
            setErr("Erreur d'envoi");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="max-w-xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-semibold mb-6">Créer un environnement 3D</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {['title', 'subtitle'].map(k => (
                    <div key={k}>
                        <label className="block font-medium mb-1 capitalize">{k}</label>
                        <input
                            name={k}
                            value={form[k]}
                            onChange={handleChange}
                            required
                            className="w-full border rounded px-3 py-2"
                        />
                    </div>
                ))}

                <div>
                    <label className="block font-medium mb-1">Description</label>
                    <textarea
                        name="description"
                        rows="4"
                        value={form.description}
                        onChange={handleChange}
                        required
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                <div>
                    <label className="block font-medium mb-1">Fichier GLB</label>
                    <input
                        type="file"
                        accept=".glb"
                        onChange={e => setFile(e.target.files[0])}
                        required
                        className="file:mr-4 file:px-3 file:py-2 file:border file:rounded file:bg-sky-600 file:text-white"
                    />
                </div>

                {err && <p className="text-red-600">{err}</p>}

                <button
                    disabled={loading}
                    className="bg-sky-600 text-white px-6 py-2 rounded hover:bg-sky-700 disabled:opacity-50"
                >
                    {loading ? 'Envoi…' : 'Créer'}
                </button>
            </form>
        </main>
    );
}
