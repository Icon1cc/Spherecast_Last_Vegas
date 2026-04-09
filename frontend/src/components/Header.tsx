import { Link } from "react-router-dom";
import { User, Mail, Info } from "lucide-react";

const NAV_ITEMS = [
  { label: "About Us", icon: Info, href: "/about" },
  { label: "Contact", icon: Mail, href: "/contact" },
  { label: "Profile", icon: User, href: "/profile" },
] as const;

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-header flex items-center px-6">
      <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
        <Link to="/" className="group">
          <img
            src="/gemini-svg.svg"
            alt="SupplyWise AI"
            className="h-9 w-[220px] max-w-[52vw] object-contain"
          />
        </Link>
        <nav className="flex items-center gap-4">
          {NAV_ITEMS.map(({ label, icon: Icon, href }) => (
            <Link
              key={label}
              to={href}
              className="flex items-center gap-1.5 text-header-foreground/80 hover:text-header-foreground text-sm font-medium transition-colors"
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
