import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Html, useCursor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import axios from 'axios';
import { nanoid } from 'nanoid';
import * as THREE from 'three';

/* Popup d'édition / lecture */
function Popup({ poi, isEditing, onSave, onIA, onClose }) {
    const [title, setTitle] = useState(poi.label ?? '');
    const [desc, setDesc] = useState(poi.desc ?? '');
    const [size, setSize] = useState(poi.size ?? 1);

    useEffect(() => {
        setTitle(poi.label ?? '');
        setDesc(poi.desc ?? '');
        setSize(poi.size ?? 1);
    }, [poi.id, isEditing]);

    return (
        <div className="poi-popup">
            <button className="absolute top-1 right-2 text-gray-500" onClick={onClose}>✕</button>

            {isEditing ? (
                <>
                    <input className="input" value={title} placeholder="Titre" onChange={e => setTitle(e.target.value)} autoFocus />
                    <textarea className="input" rows="3" value={desc} placeholder="Description" onChange={e => setDesc(e.target.value)} />
                    <label className="block text-xs pt-1 pb-1 text-gray-700">Taille : {size}</label>
                    <input type="range" min={1} max={5} step={0.1} value={size} onChange={e => setSize(Number(e.target.value))} className="w-full" />
                    <div className="flex gap-2 pt-1">
                        <button className="btn-primary flex-1" onClick={() => onSave(title, desc, size)}>Enregistrer</button>
                        <button className="btn-primary px-2" onClick={() => onIA(title, desc)}>IA</button>
                    </div>
                </>
            ) : (
                <>
                    <h4 className="font-semibold text-gray-900">{poi.label || 'Sans titre'}</h4>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{poi.desc || '—'}</p>
                    <div className="text-xs pt-1 pb-2 text-gray-700">Taille : {poi.size ?? 1}</div>
                    <button className="btn-primary w-full mt-1" onClick={() => onIA(poi.label ?? '', poi.desc ?? '')}>IA</button>
                </>
            )}
        </div>
    );
}

/**
 * editorMode: 'NAVIGATE' | 'PLACE_POI' | 'EDIT_POI'
 * selectedPoiId: string | null
 * onSelectPoi(id|null): callback de sélection
 * onDragStateChange(bool): pour désactiver OrbitControls pendant le drag
 */
const POIEditor = forwardRef(function POIEditor({
                                                    envId,
                                                    initial,
                                                    askIA,
                                                    onChange,
                                                    editorMode,
                                                    selectedPoiId,
                                                    onSelectPoi,
                                                    onDragStateChange
                                                }, ref) {
    const [pois, setPois] = useState(initial);
    const [sizePreview, setSizePreview] = useState(1);

    // Prévisualisation (ghost) intangible
    const [preview, setPreview] = useState(null); // { pos, normal }
    const draggingPoiIdRef = useRef(null);
    const dragStartPosRef = useRef(null);
    const { gl, camera, scene } = useThree();

    useEffect(() => setPois(initial), [initial]);

    useImperativeHandle(ref, () => ({
        add(point, normal = null, size = 1) {
            const offset = (size * 0.2) / 2;
            const pos = {
                x: point.x + (normal ? normal.x * offset : 0),
                y: point.y + (normal ? normal.y * offset : 0),
                z: point.z + (normal ? normal.z * offset : 0)
            };
            const draft = { id: nanoid(), label: '', desc: '', position: pos, size };
            setPois(p => {
                const next = [...p, draft];
                onChange?.(next);
                return next;
            });
            onSelectPoi?.(draft.id);
            console.log('[POIEditor] création POI (API)', draft);
            void axios.post(`/api/environments/${envId}/pois`, draft).catch((e) => {
                console.error('[POIEditor] échec persist création, rollback', e);
                setPois(p => {
                    const next = p.filter(x => x.id !== draft.id);
                    onChange?.(next);
                    return next;
                });
                onSelectPoi?.(null);
            });
        }
    }));

    /**
     * Raycast SUR LE MODELE UNIQUEMENT :
     * - ignore les POIs (`userData.__poi`)
     * - ignore la prévisualisation (`userData.__poiPreview`)
     * - garde les faces orientées vers la caméra
     */
    const intersectVisible = (clientX, clientY) => {
        const rect = gl.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(pointer, camera);

        const meshes = [];
        scene.traverse(obj => {
            if (obj.isMesh && obj.visible && !obj.userData.__poi && !obj.userData.__poiPreview) {
                meshes.push(obj);
            }
        });

        const hits = ray.intersectObjects(meshes, true);
        for (const inter of hits) {
            if (!inter.face) continue;
            const worldNormal = inter.face.normal.clone()
                .applyMatrix3(new THREE.Matrix3().getNormalMatrix(inter.object.matrixWorld))
                .normalize();
            if (worldNormal.dot(ray.ray.direction) < 0) {
                return { point: inter.point, normal: worldNormal };
            }
        }
        return null;
    };

    /* =================== MODE: PLACE_POI =================== */
    useEffect(() => {
        if (editorMode !== 'PLACE_POI') { setPreview(null); return; }

        const handleMove = (ev) => {
            const hit = intersectVisible(ev.clientX, ev.clientY);
            if (!hit) { setPreview(null); return; }
            const offset = (sizePreview * 0.2) / 2;
            setPreview({
                pos: {
                    x: hit.point.x + hit.normal.x * offset,
                    y: hit.point.y + hit.normal.y * offset,
                    z: hit.point.z + hit.normal.z * offset
                },
                normal: hit.normal
            });
        };

        // Re-raycast au clic (précision max) — on n'utilise pas preview.pos
        const handleDown = (ev) => {
            const hit = intersectVisible(ev.clientX, ev.clientY);
            if (!hit) {
                console.log('[POIEditor] clic sans hit en PLACE_POI → ignore');
                return;
            }
            ev.stopPropagation();
            const offset = (sizePreview * 0.2) / 2;
            const pos = {
                x: hit.point.x + hit.normal.x * offset,
                y: hit.point.y + hit.normal.y * offset,
                z: hit.point.z + hit.normal.z * offset
            };
            const draft = { id: nanoid(), label: '', desc: '', position: pos, size: sizePreview };
            console.log('[POIEditor] PLACE_POI: clic → création', { click: { x: ev.clientX, y: ev.clientY }, pos });

            setPois(p => {
                const next = [...p, draft];
                onChange?.(next);
                return next;
            });
            onSelectPoi?.(draft.id);

            axios.post(`/api/environments/${envId}/pois`, draft).catch((e) => {
                console.error('[POIEditor] échec persist placement, rollback', e);
                setPois(p => {
                    const next = p.filter(x => x.id !== draft.id);
                    onChange?.(next);
                    return next;
                });
                onSelectPoi?.(null);
            });
        };

        gl.domElement.addEventListener('pointermove', handleMove);
        gl.domElement.addEventListener('pointerdown', handleDown);
        return () => {
            gl.domElement.removeEventListener('pointermove', handleMove);
            gl.domElement.removeEventListener('pointerdown', handleDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorMode, gl, camera, scene, sizePreview]);

    // Curseur main uniquement quand une preview existe
    useCursor(editorMode === 'PLACE_POI' && !!preview);

    /* =================== MODE: EDIT_POI (drag & select) =================== */
    useEffect(() => {
        if (editorMode !== 'EDIT_POI') return;

        const onMove = (ev) => {
            const movingId = draggingPoiIdRef.current;
            if (!movingId) return;
            const hit = intersectVisible(ev.clientX, ev.clientY);
            if (!hit) return;
            setPois(prev => {
                const next = prev.map(p => {
                    if (p.id !== movingId) return p;
                    const offset = (p.size * 0.2) / 2;
                    return {
                        ...p,
                        position: {
                            x: hit.point.x + hit.normal.x * offset,
                            y: hit.point.y + hit.normal.y * offset,
                            z: hit.point.z + hit.normal.z * offset
                        }
                    };
                });
                onChange?.(next);
                return next;
            });
        };

        const onUp = async () => {
            const movingId = draggingPoiIdRef.current;
            if (!movingId) return;
            draggingPoiIdRef.current = null;
            onDragStateChange?.(false);

            const poi = pois.find(p => p.id === movingId);
            if (!poi) return;

            const before = dragStartPosRef.current;
            try {
                console.log('[POIEditor] drop POI => persist', poi);
                await axios.post(`/api/environments/${envId}/pois`, poi);
            } catch (e) {
                console.error('[POIEditor] échec persist déplacement, rollback', e);
                setPois(prev => {
                    const next = prev.map(p => p.id === movingId ? { ...p, position: before } : p);
                    onChange?.(next);
                    return next;
                });
            } finally {
                dragStartPosRef.current = null;
            }
        };

        gl.domElement.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            gl.domElement.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorMode, pois, envId]);

    // Sauvegarde depuis le popup (label/desc/size)
    async function saveFields(id, title, desc, size) {
        const prev = pois;
        const next = pois.map(p => p.id === id ? { ...p, label: title, desc, size } : p);
        setPois(next);
        onChange?.(next);
        try {
            console.log('[POIEditor] save fields', { id, title, size });
            await axios.post(`/api/environments/${envId}/pois`, next.find(p => p.id === id));
        } catch (e) {
            console.error('[POIEditor] échec persist édition, rollback', e);
            setPois(prev);
            onChange?.(prev);
        }
    }

    return (
        <>
            {pois.map(p => {
                const isActiveEdit = selectedPoiId === p.id && editorMode !== 'NAVIGATE';
                const isActiveRead = selectedPoiId === p.id && editorMode === 'NAVIGATE'; // <-- NEW: pop-up lecture seule quand éditeur OFF
                const scale = p.size * 0.2;

                return (
                    <group key={p.id} position={[p.position.x, p.position.y, p.position.z]}>
                        {/* Halo uniquement en mode édition */}
                        {isActiveEdit && (
                            <mesh scale={scale * 1.35}>
                                <sphereGeometry args={[1, 16, 16]} />
                                <meshBasicMaterial color="#3b82f6" transparent opacity={0.35} />
                            </mesh>
                        )}

                        <mesh
                            position={[0, 0, 0]}
                            scale={scale}
                            onPointerDown={(e) => {
                                // Drag uniquement en EDIT_POI
                                if (editorMode !== 'EDIT_POI') {
                                    if (editorMode !== 'NAVIGATE') e.stopPropagation();
                                    return;
                                }
                                e.stopPropagation();
                                onSelectPoi?.(p.id);
                                draggingPoiIdRef.current = p.id;
                                dragStartPosRef.current = { ...p.position };
                                onDragStateChange?.(true);
                                console.log('[POIEditor] start drag', { id: p.id, from: dragStartPosRef.current });
                            }}
                            onClick={(e) => {
                                // NAVIGATE: afficher pop-up LECTURE SEULE (et empêcher la caméra de partir)
                                if (editorMode === 'NAVIGATE') {
                                    e.stopPropagation();
                                    onSelectPoi?.(p.id);
                                    console.log('[POIEditor] NAVIGATE → open read-only popup', p.id);
                                    return;
                                }
                                // Autres modes: simple sélection
                                e.stopPropagation();
                                onSelectPoi?.(p.id);
                                console.log('[POIEditor] select POI', p.id);
                            }}
                            userData={{ __poi: true }}
                        >
                            <sphereGeometry args={[1, 16, 16]} />
                            <meshStandardMaterial color={isActiveEdit ? '#0ea5e9' : '#64748b'} />

                            {/* Pop-up d'édition (éditeur ON) */}
                            {isActiveEdit && (
                                <Html>
                                    <Popup
                                        poi={p}
                                        isEditing={true}
                                        onSave={(t, d, s) => saveFields(p.id, t, d, s)}
                                        onIA={askIA}
                                        onClose={() => onSelectPoi?.(null)}
                                    />
                                </Html>
                            )}

                            {/* Pop-up lecture seule (éditeur OFF) */}
                            {isActiveRead && (
                                <Html>
                                    <Popup
                                        poi={p}
                                        isEditing={false}
                                        onSave={() => {}}
                                        onIA={askIA}
                                        onClose={() => onSelectPoi?.(null)}
                                    />
                                </Html>
                            )}
                        </mesh>
                    </group>
                );
            })}

            {/* Prévisualisation du placement — intangible */}
            {editorMode === 'PLACE_POI' && preview && (
                <mesh
                    position={[preview.pos.x, preview.pos.y, preview.pos.z]}
                    scale={sizePreview * 0.2}
                    userData={{ __poiPreview: true }}
                >
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshStandardMaterial color="#3b82f6" transparent opacity={0.45} />
                </mesh>
            )}

            {/* UI taille du prochain POI (en mode placement seulement) */}
            {editorMode === 'PLACE_POI' && (
                <Html position={[0, 0, 0]} center>
                    <div className="poi-popup pointer-events-auto" style={{ width: 220 }}>
                        <label className="block text-xs pb-1 text-gray-700">
                            Taille du prochain POI : {sizePreview}
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={5}
                            step={0.1}
                            value={sizePreview}
                            onChange={e => setSizePreview(Number(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </Html>
            )}
        </>
    );
});

export default POIEditor;
