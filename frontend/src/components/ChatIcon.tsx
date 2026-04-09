interface ChatIconProps {
  onClick: () => void;
  visible: boolean;
}

const ChatIcon = ({ onClick, visible }: ChatIconProps) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-card shadow-lg flex items-center justify-center hover:scale-110 transition-transform duration-200 ring-2 ring-primary/20"
      aria-label="Open chat"
    >
      <div className="w-12 h-12 rounded-full bg-white overflow-hidden">
        <img
          src="/logo.jpeg"
          alt="Open chat"
          className="w-full h-full object-contain scale-[2.4]"
        />
      </div>
    </button>
  );
};

export default ChatIcon;
