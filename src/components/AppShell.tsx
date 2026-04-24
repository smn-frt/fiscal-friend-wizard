import { NavLink, Outlet } from "react-router-dom";
import { BookUser, Briefcase, ReceiptText } from "lucide-react";
import logoSf from "@/assets/logo-sf.jpg";

const navItems = [
  { to: "/", label: "Contabilità", icon: ReceiptText },
  { to: "/dati", label: "Dati", icon: BookUser },
  { to: "/lavori-futuri", label: "Lavori futuri", icon: Briefcase },
];

const AppShell = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface-raised/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src={logoSf} alt="Logo Ing. Simone Fratoni" className="h-12 w-12 rounded-md object-contain" />
            <div className="leading-tight">
              <p className="font-display text-base font-bold sm:text-lg">Ing. Simone Fratoni</p>
              <p className="text-xs text-muted-foreground">Civil Engineer · Studio</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-foreground hover:bg-surface-tint"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
};

export default AppShell;
