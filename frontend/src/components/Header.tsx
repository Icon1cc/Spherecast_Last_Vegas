import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-header flex items-center px-6">
      <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-full bg-muted-foreground/40 flex items-center justify-center text-header-foreground text-sm font-bold group-hover:bg-muted-foreground/60 transition-colors">
            SW
          </div>
          <span className="text-header-foreground font-bold text-lg tracking-tight">
            SupplyWise AI
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          {["About Us", "Contact", "Profile"].map((item) => (
            <button
              key={item}
              className="text-header-foreground/80 hover:text-header-foreground text-sm font-medium transition-colors"
            >
              {item}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
