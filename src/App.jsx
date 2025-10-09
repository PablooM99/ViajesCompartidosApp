import { Routes, Route, Link, NavLink, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Home from "./pages/Home.jsx";
import Dashboard from "./pages/Dashboard.jsx";

// Guard simple para /panel (sin archivo extra)
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-4 text-sm text-neutral-500">Cargando…</div>;
  if (!user) return <Navigate to="/" replace state={{ from: loc }} />;
  return children;
}

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const { pathname } = useLocation();

  const Item = ({ to, children }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "text-sm px-2 py-1 rounded-xl",
          isActive ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Barra superior (antes la tenías dentro de App.jsx) */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-3 h-14 flex items-center gap-3">
          <Link to="/" className="font-semibold">
            <span className="text-neutral-800">Viajes</span>
            <span className="text-rose-300">Compartidos</span>
          </Link>

          <nav className="ml-2 flex items-center gap-2">
            <Item to="/">Inicio</Item>
            <Item to="/panel">Panel</Item>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {loading ? (
              <span className="text-xs text-neutral-500">Cargando…</span>
            ) : user ? (
              <>
                <img
                  src={user.photoURL || "/user.png"}
                  alt="avatar"
                  className="h-8 w-8 rounded-full border object-cover"
                />
                <button
                  onClick={logout}
                  className="text-sm rounded-2xl border px-3 py-1.5"
                  title={user.email || ""}
                >
                  Salir
                </button>
              </>
            ) : (
              <button
                onClick={login}
                className={[
                  "text-sm rounded-2xl px-3 py-1.5",
                  pathname === "/" ? "bg-cyan-300/70 text-neutral-800" : "bg-cyan-200/70 text-neutral-800",
                ].join(" ")}
              >
                Ingresar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/panel"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      <footer className="py-6 text-center text-xs text-neutral-500">
        MVP • Colores pastel • Mobile-first
      </footer>
    </div>
  );
}
