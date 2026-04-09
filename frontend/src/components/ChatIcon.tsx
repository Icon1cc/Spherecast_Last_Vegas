interface ChatIconProps {
  onClick: () => void;
  visible: boolean;
}

const ChatIcon = ({ onClick, visible }: ChatIconProps) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-black text-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform duration-200 ring-2 ring-white/30"
      aria-label="Open chat"
    >
      <span className="text-sm font-bold tracking-wide">JR</span>
    </button>
  );
};

export default ChatIcon;
