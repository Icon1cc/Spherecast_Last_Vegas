const Footer = () => {
  const currentYear = new Date().getFullYear();
  const links = ["About Us", "Privacy Policy", "Terms of Service", "Contact"];

  return (
    <footer className="h-12 bg-header flex items-center px-6">
      <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
        <span className="text-header-foreground/70 text-xs">
          © {currentYear} SupplyWise AI. All rights reserved.
        </span>
        <div className="flex items-center gap-4">
          {links.map((link) => (
            <button
              key={link}
              className="text-header-foreground/60 hover:text-header-foreground hover:underline text-xs transition-colors"
            >
              {link}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
