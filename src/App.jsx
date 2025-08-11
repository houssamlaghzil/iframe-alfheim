import { NavLink, Route, Routes } from 'react-router-dom';
import ModelList from './pages/ModelList.jsx';
import Viewer from './pages/Viewer.jsx';
import CreateEnv from './pages/CreateEnv.jsx';
import { useState } from 'react';

function MobileNav({ closeMenu }) {
    return (
        <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm" onClick={closeMenu}>
            <nav className="fixed top-4 right-4 w-56 bg-white rounded-xl shadow-lg p-3 space-y-1 border border-gray-200">
                <NavLink to="/" className="btn-ghost w-full justify-start text-base">Galeries</NavLink>
                <NavLink to="/new" className="btn-primary w-full justify-start text-base">+ Nouveau</NavLink>
            </nav>
        </div>
    );
}

export default function App() {
    const [isMenuOpen, setMenuOpen] = useState(false);

    return (
        <>
            {isMenuOpen && <MobileNav closeMenu={() => setMenuOpen(false)} />}

            {/* Barre du haut : blanche + bordure claire */}
            <header className="sticky top-0 z-20 bg-white border-b border-[--color-border]">
                <nav className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-gray-900">Alfheim 3D</h1>

                    {/* Menu mobile (md:hidden) */}
                    <button onClick={() => setMenuOpen(true)} className="md:hidden btn-ghost p-2 -mr-2">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                    </button>

                    {/* Liens desktop (hidden md:flex) */}
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
