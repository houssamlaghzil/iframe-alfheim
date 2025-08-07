import { NavLink, Route, Routes } from 'react-router-dom';
import ModelList from './pages/ModelList.jsx';
import Viewer from './pages/Viewer.jsx';
import CreateEnv from './pages/CreateEnv.jsx';

export default function App() {
    return (
        <>
            <header className="sticky top-0 z-20 bg-white/80 backdrop-blur shadow-sm">
                <nav className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-violet-600">Alfheim 3D</h1>
                    <div className="hidden md:flex gap-6 text-sm">
                        <NavLink to="/"    className={({isActive})=>isActive?'text-violet-500':'hover:text-violet-500'}>Galeries</NavLink>
                        <NavLink to="/new" className={({isActive})=>isActive?'text-violet-500':'hover:text-violet-500'}>+ Nouveau</NavLink>
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
