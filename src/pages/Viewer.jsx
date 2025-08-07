import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import axios from 'axios';
import ChatSidebar from '../components/ChatSidebar.jsx';

/* ---------- store Zustand ------------------------------------------------- */
const useStore = create(set => ({
    pois: [],
    setPois: arr => set({ pois: arr }),
    addPoi: poi => set(s => ({ pois: [...s.pois, poi] }))
}));

/* ---------- 3D Model ------------------------------------------------------ */
function Model({ url }) {
    const { scene } = useGLTF(url, true);
    return <primitive object={scene} />;
}

/* ---------- POI markers --------------------------------------------------- */
function POIMarkers() {
    const pois = useStore(s => s.pois);
    return pois.map(poi =>
        poi.position ? (
            <mesh
                key={poi.id}
                position={[poi.position.x, poi.position.y, poi.position.z]}
                scale={0.02}
            >
                <sphereGeometry args={[1, 16, 16]} />
                <meshStandardMaterial color="#e11d48" />
                <Html>{poi.label}</Html>
            </mesh>
        ) : null
    );
}

/* ---------- Viewer page --------------------------------------------------- */
export default function Viewer() {
    const { id } = useParams();
    const [env, setEnv] = useState(null);
    const [edit, setEdit] = useState(false);

    /* fetch env + POI */
    useEffect(() => {
        (async () => {
            try {
                const [eRes, pRes] = await Promise.all([
                    axios.get(`/api/environments/${id}`),
                    axios.get(`/api/environments/${id}/pois`)
                ]);
                setEnv(eRes.data);
                useStore.getState().setPois(pRes.data);
            } catch (err) {
                console.error(err);
            }
        })();
    }, [id]);

    /* add POI */
    function onPointerDown(e) {
        if (!edit) return;
        const label = prompt('Nom du POI ?');
        if (!label) return;
        const { x, y, z } = e.point;
        const poi = { id: crypto.randomUUID(), label, position: { x, y, z } };
        useStore.getState().addPoi(poi);
        axios.post(`/api/environments/${id}/pois`, poi).catch(console.error);
    }

    if (!env) return <p className="p-8">Chargement…</p>;

    return (
        <div className="flex h-screen">
            {/* zone 3D */}
            <div className="flex-1 relative bg-gray-50">
                <Canvas onPointerDown={onPointerDown}>
                    {/* éclairage amélioré */}
                    <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#bcbcbc" />
                    <directionalLight position={[3, 5, 2]} intensity={1} castShadow />
                    <ambientLight intensity={0.4} />
                    <Model url={env.fileUrl} />
                    <POIMarkers />
                    <OrbitControls makeDefault />
                </Canvas>

                {/* overlay titre + bouton édition */}
                <div className="absolute top-4 inset-x-0 flex justify-between px-4 pointer-events-none">
                    <h2 className="text-xl font-semibold bg-white/70 px-3 py-1 rounded shadow pointer-events-auto">
                        {env.title}
                    </h2>
                    <button
                        onClick={() => setEdit(e => !e)}
                        className="pointer-events-auto bg-sky-600 text-white px-4 py-1 rounded shadow hover:bg-sky-700"
                    >
                        {edit ? 'Quitter édition' : 'Activer édition'}
                    </button>
                </div>
            </div>

            {/* chat */}
            <ChatSidebar modelId={id} />
        </div>
    );
}
