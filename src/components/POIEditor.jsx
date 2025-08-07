import { useState, forwardRef, useImperativeHandle } from 'react';
import { Html } from '@react-three/drei';
import axios from 'axios';
import { nanoid } from 'nanoid';

/* ───────────────────── Pop-up ───────────────────── */
function Popup({ poi, editable, onSave, onIA }) {
    const [t, setT] = useState(poi.label ?? '');
    const [d, setD] = useState(poi.desc  ?? '');

    return (
        <div className="poi-popup">
            {editable ? (
                <>
                    <input  className="input" value={t} placeholder="Titre"
                            onChange={e=>setT(e.target.value)} autoFocus/>
                    <textarea className="input" rows="3" value={d} placeholder="Description"
                              onChange={e=>setD(e.target.value)} />
                    <div className="flex gap-2">
                        <button className="btn-primary flex-1" onClick={()=>onSave(t,d)}>Sauvegarder</button>
                        <button className="btn-primary px-2"  onClick={()=>onIA(t,d)}>IA</button>
                    </div>
                </>
            ) : (
                <>
                    <h4 className="font-semibold">{poi.label}</h4>
                    <p className="text-sm text-gray-700">{poi.desc}</p>
                    <button className="btn-primary w-full" onClick={()=>onIA(poi.label, poi.desc)}>IA</button>
                </>
            )}
        </div>
    );
}

/* ───────────── Sphère + pop-up + BD ───────────── */
const POIEditor = forwardRef(function POIEditor(
    { envId, initial, edit, askIA }, ref)
{
    const [pois, setPois]   = useState(initial);
    const [active, setAct]  = useState(null);

    useImperativeHandle(ref, () => ({
        add(p) {
            const draft = { id: nanoid(), label:'', desc:'', position:{x:p.x,y:p.y,z:p.z} };
            setPois(s=>[...s,draft]); setAct(draft.id);
        }
    }));

    async function persist(id, label, desc) {
        const u = pois.map(p=>p.id===id?{...p,label,desc}:p);
        setPois(u); setAct(null);
        await axios.post(`/api/environments/${envId}/pois`, u.find(p=>p.id===id));
    }

    return (
        <>
            {pois.map(p=>(
                <mesh key={p.id} position={[p.position.x,p.position.y,p.position.z]} scale={0.02}
                      onClick={e=>{e.stopPropagation(); setAct(p.id);}}>
                    <sphereGeometry args={[1,16,16]}/>
                    <meshStandardMaterial color="#e11d48"/>
                    {active===p.id && (
                        /* transform retiré → taille constante */
                        <Html>
                            <Popup poi={p} editable={edit} onSave={(t,d)=>persist(p.id,t,d)} onIA={askIA}/>
                        </Html>
                    )}
                </mesh>
            ))}
        </>
    );
});
export default POIEditor;
