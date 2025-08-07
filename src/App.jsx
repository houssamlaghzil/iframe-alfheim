import { Routes, Route, NavLink } from 'react-router-dom';
import ModelList from './pages/ModelList.jsx';
import Viewer from './pages/Viewer.jsx';
import CreateEnv from './pages/CreateEnv.jsx';

export default function App() {
    return (
        <>
            {/* Barre de navigation fixe */}
            <header className="sticky top-0 z-20 bg-white/80 backdrop-blur shadow-sm">
                <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                    <h1 className="font-bold text-lg">Alfheim 3D</h1>
                    <div className="flex gap-4">
                        <NavLink
                            to="/"
                            className={({ isActive }) =>
                                `hover:text-sky-600 ${isActive ? 'text-sky-600 font-medium' : ''}`
                            }
                        >
                            Galeries
                        </NavLink>
                        <NavLink
                            to="/new"
                            className={({ isActive }) =>
                                `hover:text-sky-600 ${isActive ? 'text-sky-600 font-medium' : ''}`
                            }
                        >
                            + Nouveau
                        </NavLink>
                    </div>
                </nav>
            </header>

            {/* Contenu routé */}
            <Routes>
                <Route path="/" element={<ModelList />} />
                <Route path="/model/:id" element={<Viewer />} />
                <Route path="/new" element={<CreateEnv />} />
            </Routes>
        </>
    );
}
