import { MessageCircle } from "lucide-react";

interface ChatIconProps {
  onClick: () => void;
  visible: boolean;
}

const ChatIcon = ({ onClick, visible }: ChatIconProps) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform duration-200"
      aria-label="Open chat"
    >
      <MessageCircle className="w-6 h-6" aria-hidden="true" />
    </button>
  );
};

export default ChatIcon;
