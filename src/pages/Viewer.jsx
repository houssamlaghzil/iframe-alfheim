import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import ChatSidebar from '../components/ChatSidebar.jsx';
import POIEditor from '../components/POIEditor.jsx';

function Model({ url, onClick }) {
    const { scene } = useGLTF(url, true);
    return <primitive object={scene} onClick={onClick} />;
}

export default function Viewer() {
    const { id } = useParams();
    const [qs]    = useSearchParams();
    const [env, setEnv]   = useState(null);
    const [pois, setPois] = useState([]);
    const [edit, setEdit] = useState(qs.has('edit'));

    const chatRef = useRef(null);
    const poiRef  = useRef(null);

    /* charge env + POI au montage */
    useEffect(()=>{
        (async()=>{
            const [e,p]=await Promise.all([
                axios.get(`/api/environments/${id}`),
                axios.get(`/api/environments/${id}/pois`)
            ]);
            setEnv(e.data);
            setPois(p.data);
        })();
    },[id]);

    /* fonctions utilitaires */
    const askIA = (t,d)=> chatRef.current?.send(`Peux-tu m’expliquer cela ?\n\n${t}\n${d}`);

    const handleSceneClick = e => {
        if (!edit || !e.point) return;
        poiRef.current?.add(e.point);
    };

    if (!env) return <p className="p-8">Chargement…</p>;

    return (
        <div className="page flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
            <div className="flex-1 relative">
                <Canvas onPointerMissed={()=>setEdit(false)}>
                    <ambientLight intensity={0.3}/>
                    <directionalLight position={[3,4,2]} intensity={1.1}/>
                    <hemisphereLight intensity={0.75}/>

                    <Model url={env.fileUrl} onClick={handleSceneClick}/>
                    <POIEditor ref={poiRef}
                               envId={id}
                               initial={pois}
                               edit={edit}
                               askIA={askIA}/>
                    <OrbitControls/>
                </Canvas>

                <div className="absolute top-4 inset-x-4 flex justify-between">
                    <h2 className="pointer-events-none text-xl font-semibold text-gray-900 bg-white/80 px-3 py-1 rounded-md shadow">
                        {env.title}
                    </h2>
                    <button onClick={()=>setEdit(e=>!e)} className="btn-primary">
                        {edit ? 'Quitter édition' : 'Activer édition'}
                    </button>
                </div>
            </div>

            <ChatSidebar ref={chatRef} env={env} pois={pois}/>
        </div>
    );
}
