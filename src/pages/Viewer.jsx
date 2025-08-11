import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import ChatSidebar from '../components/ChatSidebar.jsx';
import POIEditor from '../components/POIEditor.jsx';
import * as THREE from 'three';

function Model({ url, onClick, isEditMode }) {
    const { scene } = useGLTF(url, true);

    useEffect(() => {
        scene.traverse(obj => {
            if (obj.isMesh) {
                if (isEditMode) {
                    obj.userData._origMaterial = obj.material;
                    obj.material = new THREE.MeshStandardMaterial({ color: 0x777777 });
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                } else {
                    if (obj.userData._origMaterial) {
                        obj.material = obj.userData._origMaterial;
                        delete obj.userData._origMaterial;
                    }
                    obj.castShadow = false;
                }
            }
        });
    }, [isEditMode, scene]);

    return <primitive object={scene} onClick={onClick} />;
}

export default function Viewer() {
    const { id } = useParams();
    const [qs] = useSearchParams();
    const [env, setEnv] = useState(null);
    const [pois, setPois] = useState([]);
    const [edit, setEdit] = useState(qs.has('edit'));
    const chatRef = useRef(null);
    const poiRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const e = await axios.get(`/api/environments/${id}`);
                setEnv(e.data);
            } catch { return; }
            try {
                const p = await axios.get(`/api/environments/${id}/pois`);
                setPois(p.data);
            } catch { setPois([]); }
        })();
    }, [id]);

    const askIA = (t, d) => chatRef.current?.send(`Peux-tu m'expliquer cela ?\n\n${t}\n${d}`);
    const onPOIs = updated => setPois(updated);
    const addPOI = e => { if (edit && e.point) poiRef.current?.add(e.point, e.face?.normal); };

    if (!env) return <p className="p-8">Chargement…</p>;

    return (
        <div className="page flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
            <div className="flex-1 relative">
                <Canvas shadows>
                    <hemisphereLight intensity={0.6} />
                    <directionalLight
                        position={[3, 4, 2]}
                        intensity={1.0}
                        castShadow
                        shadow-mapSize-width={1024}
                        shadow-mapSize-height={1024}
                    />
                    <ambientLight intensity={0.3} />

                    <Model url={env.fileUrl} onClick={addPOI} isEditMode={edit} />
                    <POIEditor ref={poiRef} envId={id} initial={pois} askIA={askIA} onChange={onPOIs} editMode={edit} />

                    <OrbitControls />
                </Canvas>

                <div className="absolute top-4 inset-x-4 flex items-center justify-between gap-3 z-10">
                    <h2 className="pointer-events-none text-lg font-semibold glass px-3 py-1.5 rounded-xl shadow brand-gradient-text">
                        {env.title}
                    </h2>
                    <button onClick={() => setEdit(e => !e)} className="btn-primary h-9 px-3">
                        {edit ? 'Quitter édition' : 'Activer édition'}
                    </button>
                </div>
            </div>

            <ChatSidebar ref={chatRef} env={env} pois={pois} />
        </div>
    );
}
