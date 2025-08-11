import { NavLink, Route, Routes } from 'react-router-dom';
import ModelList from './pages/ModelList.jsx';
import Viewer from './pages/Viewer.jsx';
import CreateEnv from './pages/CreateEnv.jsx';

export default function App() {
    return (
        <>
            {/* Top app bar with glass effect */}
            <header className="sticky top-0 z-20 glass backdrop-blur shadow-[0_8px_30px_-20px_rgba(0,0,0,0.6)]">
                <nav className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold brand-gradient-text">Alfheim 3D</h1>
                    <div className="hidden md:flex gap-2 text-sm">
                        <NavLink to="/" className={({isActive})=>`btn-ghost h-9 px-3 ${isActive? 'ring-1 ring-white/20': ''}`}>Galeries</NavLink>
                        <NavLink to="/new" className={({isActive})=>`btn-primary h-9 px-3 ${isActive? 'opacity-90': ''}`}>+ Nouveau</NavLink>
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
