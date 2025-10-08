import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ToastProvider from "./context/ToastContext";

export default function App() {
  const { user, login, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col text-vc_text">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
          <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
            <Link to="/" className="font-semibold tracking-tight text-lg">
              Viajes<span className="text-vc_accent">Compartidos</span>
            </Link>
            <nav className="flex gap-3 items-center">
              {pathname !== "/" && <Link className="text-sm" to="/">Inicio</Link>}
              <Link className="text-sm" to="/dashboard">Panel</Link>
              {user ? (
                <button onClick={logout} className="text-sm rounded-xl bg-vc_accent/80 px-3 py-1">
                  Salir
                </button>
              ) : (
                <button onClick={login} className="text-sm rounded-xl bg-vc_primary px-3 py-1">
                  Ingresar
                </button>
              )}
            </nav>
          </div>
        </header>

        <main className="flex-1 mx-auto max-w-md w-full px-4 py-4">
          <Outlet />
        </main>

        <footer className="mx-auto max-w-md w-full px-4 py-6 text-center text-xs text-neutral-500">
          MVP • Colores pastel • Mobile-first
        </footer>
      </div>
    </ToastProvider>
  );
}
