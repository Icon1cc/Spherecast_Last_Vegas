interface ChatIconProps {
  onClick: () => void;
  visible: boolean;
}

const ChatIcon = ({ onClick, visible }: ChatIconProps) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform duration-200 ring-2 ring-primary/20"
      aria-label="Open chat"
    >
      <span className="text-sm font-bold tracking-wide">JR</span>
    </button>
  );
};

export default ChatIcon;
