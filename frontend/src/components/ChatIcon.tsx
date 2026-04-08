import { MessageCircle } from "lucide-react";

interface Props {
  onClick: () => void;
  visible: boolean;
}

const ChatIcon = ({ onClick, visible }: Props) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform duration-200"
    >
      <MessageCircle className="w-6 h-6" />
    </button>
  );
};

export default ChatIcon;
