import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Html, useCursor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import axios from 'axios';
import { nanoid } from 'nanoid';
import * as THREE from 'three';

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
                    <h4 className="font-semibold text-gray-900">{poi.label}</h4>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{poi.desc}</p>
                    <div className="text-xs pt-1 pb-2 text-gray-700">Taille : {poi.size ?? 1}</div>
                    <button className="btn-primary w-full mt-1" onClick={() => onIA(poi.label, poi.desc)}>IA</button>
                </>
            )}
        </div>
    );
}

const POIEditor = forwardRef(function POIEditor({ envId, initial, askIA, onChange, editMode }, ref) {
    const [pois, setPois] = useState(initial);
    const [active, setActive] = useState(null);
    const [editing, setEdit] = useState(null);
    const [sizePreview, setSizePreview] = useState(1);
    const [preview, setPreview] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const { gl, camera, scene } = useThree();

    useEffect(() => setPois(initial), [initial]);
    useEffect(() => setIsEditing(editMode), [editMode]);

    useImperativeHandle(ref, () => ({
        add(point, normal = null, size = 1) {
            let pos = { ...point };
            if (normal) {
                const scale = size * 0.2;
                pos.x += normal.x * (scale / 2);
                pos.y += normal.y * (scale / 2);
                pos.z += normal.z * (scale / 2);
            }
            const draft = { id: nanoid(), label: '', desc: '', position: pos, size };
            setPois(p => [...p, draft]);
            setActive(draft.id);
            setEdit(draft.id);
            onChange?.([...pois, draft]);
        }
    }));

    async function save(id, title, desc, size) {
        const full = pois.map(p => p.id === id ? { ...p, label: title, desc, size } : p);
        setPois(full);
        setEdit(null);
        onChange?.(full);
        try {
            await axios.post(`/api/environments/${envId}/pois`, full.find(p => p.id === id));
        } catch (e) {
            console.error('POST /pois', e);
        }
    }

    // Survol avec filtrage des faces visibles uniquement
    useEffect(() => {
        if (!isEditing) return;

        const handlePointerMove = (ev) => {
            const rect = gl.domElement.getBoundingClientRect();
            const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
            const pointer = { x, y };

            const ray = new THREE.Raycaster();
            ray.setFromCamera(pointer, camera);

            const meshes = [];
            scene.traverse(obj => {
                if (obj.isMesh && (!obj.geometry.parameters || obj.geometry.parameters.radius !== 1)) {
                    meshes.push(obj);
                }
            });

            const intersects = ray.intersectObjects(meshes, true);
            let found = null;
            for (const inter of intersects) {
                const worldNormal = inter.face.normal.clone()
                    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(inter.object.matrixWorld))
                    .normalize();
                if (worldNormal.dot(ray.ray.direction) < 0) {
                    found = { point: inter.point, normal: worldNormal };
                    break;
                }
            }

            if (found) {
                const scale = sizePreview * 0.2;
                setPreview({
                    pos: {
                        x: found.point.x + found.normal.x * (scale / 2),
                        y: found.point.y + found.normal.y * (scale / 2),
                        z: found.point.z + found.normal.z * (scale / 2)
                    },
                    normal: found.normal
                });
            } else {
                setPreview(null);
            }
        };

        gl.domElement.addEventListener('pointermove', handlePointerMove);
        return () => gl.domElement.removeEventListener('pointermove', handlePointerMove);
    }, [isEditing, gl, camera, scene, sizePreview, onChange, pois]);

    useCursor(isEditing && !!preview);

    useEffect(() => {
        if (!isEditing) return;
        const handlePointerDown = () => {
            if (preview) {
                ref.current?.add(preview.pos, preview.normal, sizePreview);
            }
        };
        gl.domElement.addEventListener('pointerdown', handlePointerDown);
        return () => gl.domElement.removeEventListener('pointerdown', handlePointerDown);
    }, [isEditing, gl, preview, sizePreview, ref]);

    return (
        <>
            {pois.map(p => (
                <mesh key={p.id} position={[p.position.x, p.position.y, p.position.z]} scale={p.size * 0.2}
                      onClick={e => { e.stopPropagation(); setActive(p.id); setEdit(null); }}>
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshStandardMaterial color="#e11d48" />
                    {active === p.id && (
                        <Html>
                            <Popup poi={p} isEditing={editing === p.id} onSave={(t, d, s) => save(p.id, t, d, s)}
                                   onIA={askIA} onClose={() => setActive(null)} />
                        </Html>
                    )}
                </mesh>
            ))}

            {isEditing && preview && (
                <mesh position={[preview.pos.x, preview.pos.y, preview.pos.z]} scale={sizePreview * 0.2}>
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshStandardMaterial color="#ef4444" transparent opacity={0.45} />
                </mesh>
            )}

            {isEditing && (
                <Html position={[0, 0, 0]} center>
                    <div className="poi-popup pointer-events-auto" style={{ width: 220 }}>
                        <label className="block text-xs pb-1 text-gray-700">
                            Taille du prochain POI : {sizePreview}
                        </label>
                        <input type="range" min={1} max={5} step={0.1} value={sizePreview}
                               onChange={e => setSizePreview(Number(e.target.value))} className="w-full" />
                    </div>
                </Html>
            )}
        </>
    );
});

export default POIEditor;
