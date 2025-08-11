import { NavLink, Route, Routes } from 'react-router-dom';
import ModelList from './pages/ModelList.jsx';
import Viewer from './pages/Viewer.jsx';
import CreateEnv from './pages/CreateEnv.jsx';

export default function App() {
    return (
        <>
            {/* Barre du haut : blanche + bordure claire */}
            <header className="sticky top-0 z-20 bg-white border-b border-[--color-border]">
                <nav className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-gray-900">Alfheim 3D</h1>

                    <div className="hidden md:flex gap-2 text-sm">
                        <NavLink
                            to="/"
                            className={({isActive}) =>
                                `btn-ghost h-9 px-3 text-gray-900 ${isActive ? 'ring-1 ring-black/15' : ''}`
                            }
                        >
                            Galeries
                        </NavLink>
                        <NavLink
                            to="/new"
                            className={({isActive}) =>
                                `btn-primary h-9 px-3 text-gray-900 ${isActive ? 'outline outline-1 outline-black/20' : ''}`
                            }
                        >
                            + Nouveau
                        </NavLink>
                    </div>
                </nav>
            </header>

            <Routes>
                <Route path="/"          element={<ModelList />} />
                <Route path="/new"       element={<CreateEnv />} />
                <Route path="/model/:id" element={<Viewer />} />
            </Routes>
        </>
    );
}
