import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { Zap, LayoutDashboard, BarChart3, LogOut } from 'lucide-react';

export function Navbar() {
  const { user, signOut } = useAuth();
  const { setShowAuthModal } = useAuthStore();
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-heading text-lg font-bold">
          <Zap className="h-5 w-5 text-primary" />
          AppForge
        </Link>
        <nav className="flex items-center gap-1">
          {user && (
            <>
              <Link to="/dashboard">
                <Button variant={pathname === '/dashboard' ? 'secondary' : 'ghost'} size="sm">
                  <LayoutDashboard className="mr-1.5 h-4 w-4" /> Projects
                </Button>
              </Link>
              <Link to="/eval">
                <Button variant={pathname === '/eval' ? 'secondary' : 'ghost'} size="sm">
                  <BarChart3 className="mr-1.5 h-4 w-4" /> Eval
                </Button>
              </Link>
            </>
          )}
          {user ? (
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sign Out
            </Button>
          ) : (
            <Button size="sm" onClick={() => setShowAuthModal(true)}>Sign In</Button>
          )}
        </nav>
      </div>
    </header>
  );
}