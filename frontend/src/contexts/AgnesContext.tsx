/**
 * AgnesProvider - Global context for Agnes voice assistant
 * Keeps Agnes state persistent across route navigation
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import AgnesDemoOverlay from "@/components/demo/AgnesDemoOverlay";

interface AgnesContextType {
  isOpen: boolean;
  openAgnes: () => void;
  closeAgnes: () => void;
}

const AgnesContext = createContext<AgnesContextType | null>(null);

export function useAgnes() {
  const context = useContext(AgnesContext);
  if (!context) {
    throw new Error("useAgnes must be used within AgnesProvider");
  }
  return context;
}

interface AgnesProviderProps {
  children: ReactNode;
}

export function AgnesProvider({ children }: AgnesProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const openAgnes = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeAgnes = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <AgnesContext.Provider value={{ isOpen, openAgnes, closeAgnes }}>
      {children}
      {/* Agnes overlay is rendered at the provider level - persists across routes */}
      <AgnesDemoOverlay isOpen={isOpen} onClose={closeAgnes} />
    </AgnesContext.Provider>
  );
}
