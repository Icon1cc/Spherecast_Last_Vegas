import { Link } from "react-router-dom";

const FOOTER_LINKS = [
  { label: "About Us", href: "/about" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Contact", href: "/contact" },
] as const;

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="h-12 bg-header flex items-center px-6 mt-auto">
      <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white overflow-hidden ring-1 ring-header-foreground/20">
            <img
              src="/logo.jpeg"
              alt="SupplyWise AI logo"
              className="w-full h-full object-contain scale-[5.5]"
            />
          </div>
          <span className="text-header-foreground/70 text-xs">
            &copy; {currentYear} SupplyWise AI. All rights reserved.
          </span>
        </div>
        <nav className="flex items-center gap-4">
          {FOOTER_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              to={href}
              className="text-header-foreground/60 hover:text-header-foreground hover:underline text-xs transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
};

export default Footer;
