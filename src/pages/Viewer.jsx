import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import ChatSidebar from '../components/ChatSidebar.jsx';
import POIEditor from '../components/POIEditor.jsx';
import * as THREE from 'three';

function Model({ url, isEditMode }) {
    const { scene } = useGLTF(url, true);

    useEffect(() => {
        scene.traverse(obj => {
            if (obj.isMesh) {
                if (isEditMode) {
                    obj.userData._origMaterial = obj.userData._origMaterial ?? obj.material;
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

    return <primitive object={scene} />;
}

export default function Viewer() {
    const { id } = useParams();
    const [qs] = useSearchParams();
    const [env, setEnv] = useState(null);
    const [pois, setPois] = useState([]);

    // Edition globale + sous-modes
    const [edit, setEdit] = useState(qs.has('edit'));
    const MODES = { NAVIGATE: 'NAVIGATE', PLACE_POI: 'PLACE_POI', EDIT_POI: 'EDIT_POI' };
    const [editorMode, setEditorMode] = useState(MODES.NAVIGATE);
    const [selectedPoiId, setSelectedPoiId] = useState(null);
    const [dragging, setDragging] = useState(false);

    const chatRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const e = await axios.get(`/api/environments/${id}`);
                setEnv(e.data);
            } catch (err) {
                console.error('[Viewer] échec chargement environment', err);
                return;
            }
            try {
                const p = await axios.get(`/api/environments/${id}/pois`);
                setPois(p.data);
            } catch (err) {
                console.warn('[Viewer] aucun POI ou erreur de liste', err);
                setPois([]);
            }
        })();
    }, [id]);

    // (dés)activation de l’édition => reset des états
    useEffect(() => {
        console.log('[Viewer] toggle édition =>', edit);
        setEditorMode(MODES.NAVIGATE);
        setSelectedPoiId(null);
    }, [edit]);

    // Raccourcis clavier: 1/2/3/Escape
    useEffect(() => {
        const onKey = (e) => {
            if (!edit) return;
            if (e.key === '1') setEditorMode(MODES.NAVIGATE);
            else if (e.key === '2') setEditorMode(MODES.PLACE_POI);
            else if (e.key === '3') setEditorMode(MODES.EDIT_POI);
            else if (e.key === 'Escape') setSelectedPoiId(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [edit]);

    useEffect(() => {
        console.log('[Viewer] editorMode =>', editorMode, 'dragging:', dragging);
    }, [editorMode, dragging]);

    const askIA = (t, d) => chatRef.current?.send(`Peux-tu m'expliquer cela ?\n\n${t}\n${d}`);
    const onPOIs = updated => setPois(updated);

    if (!env) return <p className="p-8 text-gray-900">Chargement…</p>;

    const effectiveMode = edit ? editorMode : MODES.NAVIGATE;

    return (
        <div className="page flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
            {/* Viewer (zone 3D) */}
            <div className="flex-1 relative">
                <Canvas shadows>
                    {/* Fond blanc du rendu 3D */}
                    <color attach="background" args={['#ffffff']} />

                    <hemisphereLight intensity={0.6} />
                    <directionalLight
                        position={[3, 4, 2]}
                        intensity={1.0}
                        castShadow
                        shadow-mapSize-width={1024}
                        shadow-mapSize-height={1024}
                    />
                    <ambientLight intensity={0.3} />

                    <Model url={env.fileUrl} isEditMode={edit} />

                    <POIEditor
                        envId={id}
                        initial={pois}
                        askIA={askIA}
                        onChange={onPOIs}
                        editorMode={effectiveMode}
                        selectedPoiId={selectedPoiId}
                        onSelectPoi={setSelectedPoiId}
                        onDragStateChange={setDragging}
                    />

                    {/* OrbitControls: activé seulement en navigation et hors drag */}
                    <OrbitControls enabled={effectiveMode === MODES.NAVIGATE && !dragging} />
                </Canvas>

                {/* ===== Titre + bouton édition (en haut) ===== */}
                <div className="absolute top-4 inset-x-4 flex items-center justify-between gap-3 z-10 pointer-events-none">
                    <h2 className="pointer-events-auto text-lg font-semibold bg-white/90 text-gray-900 px-3 py-1.5 rounded-xl shadow border border-[--color-border]">
                        {env.title}
                    </h2>
                    <button
                        onClick={() => setEdit(e => !e)}
                        className="pointer-events-auto btn-primary h-9 px-3 text-gray-900"
                    >
                        {edit ? 'Quitter édition' : 'Activer édition'}
                    </button>
                </div>

                {/* ===== Toolbar éditeur (BAS-DROITE, jamais sous le chat) =====
            Positionnement géré par CSS (.editor-toolbar) avec variables CSS
            fournies par ChatSidebar (— voir ChatSidebar.jsx). */}
                {edit && (
                    <div className="editor-toolbar z-20">
                        <div className="glass rounded-xl px-1.5 py-1 flex items-center gap-1 shadow pointer-events-auto">
                            <button
                                type="button"
                                aria-label="Mode navigation (1)"
                                onClick={() => setEditorMode(MODES.NAVIGATE)}
                                className={`h-10 w-10 rounded-full border border-[--color-border] flex items-center justify-center
                ${effectiveMode === MODES.NAVIGATE ? 'ring-2 ring-sky-400/70 bg-white/60' : 'bg-black/5 hover:bg-black/10'}`}
                            >
                                {/* Icône souris */}
                                <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3l7 7-4 1-1 4-7-7 5-5z" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                aria-label="Mode placement de POI (2)"
                                onClick={() => setEditorMode(MODES.PLACE_POI)}
                                className={`h-10 w-10 rounded-full border border-[--color-border] flex items-center justify-center
                ${effectiveMode === MODES.PLACE_POI ? 'ring-2 ring-sky-400/70 bg-white/60' : 'bg-black/5 hover:bg-black/10'}`}
                            >
                                {/* Icône sphère avec point */}
                                <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <circle cx="12" cy="12" r="7" />
                                    <circle cx="15" cy="9" r="1.5" fill="currentColor" stroke="none" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                aria-label="Mode édition/déplacement (3)"
                                onClick={() => setEditorMode(MODES.EDIT_POI)}
                                className={`h-10 w-10 rounded-full border border-[--color-border] flex items-center justify-center
                ${effectiveMode === MODES.EDIT_POI ? 'ring-2 ring-sky-400/70 bg-white/60' : 'bg-black/5 hover:bg-black/10'}`}
                            >
                                {/* Icône crayon */}
                                <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5l4 4-11 11-4.5 1.5 1.5-4.5 11-11z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Panneau de chat (met à jour les variables CSS de layout) */}
            <ChatSidebar ref={chatRef} env={env} pois={pois} />
        </div>
    );
}
