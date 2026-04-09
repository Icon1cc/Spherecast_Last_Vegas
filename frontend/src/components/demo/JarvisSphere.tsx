/**
 * JarvisSphere - Animated metallic sphere for Jarvis Demo Mode
 * Pure CSS 3D-looking sphere with state-based animations
 */

import { memo } from "react";
import type { DemoPhase } from "@/types/demo";

interface JarvisSphereProps {
  phase: DemoPhase;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-24 h-24",
  md: "w-40 h-40",
  lg: "w-56 h-56",
};

/**
 * Get animation class based on current phase
 */
function getAnimationClass(phase: DemoPhase): string {
  switch (phase) {
    case "LISTENING":
      return "animate-sphere-breathe";
    case "THINKING":
      return "animate-sphere-think";
    case "SPEAKING":
      return "animate-sphere-pulse-speak";
    case "NAVIGATING":
      return "animate-sphere-navigate";
    case "GREETING":
      return "animate-sphere-pulse-speak";
    case "COMPLETE":
      return "animate-sphere-complete";
    case "IDLE":
    default:
      return "animate-sphere-float";
  }
}

/**
 * Get glow color based on phase
 */
function getGlowStyle(phase: DemoPhase): React.CSSProperties {
  const baseGlow = "0 0 60px";
  const innerGlow = "inset -20px -20px 60px rgba(0,0,0,0.2), inset 20px 20px 60px rgba(255,255,255,0.5)";

  switch (phase) {
    case "LISTENING":
      return {
        boxShadow: `${baseGlow} rgba(59, 130, 246, 0.5), ${innerGlow}`,
      };
    case "THINKING":
      return {
        boxShadow: `${baseGlow} rgba(168, 85, 247, 0.4), ${innerGlow}`,
      };
    case "SPEAKING":
      return {
        boxShadow: `${baseGlow} rgba(34, 197, 94, 0.5), ${innerGlow}`,
      };
    case "NAVIGATING":
      return {
        boxShadow: `${baseGlow} rgba(251, 191, 36, 0.5), ${innerGlow}`,
      };
    case "COMPLETE":
      return {
        boxShadow: `${baseGlow} rgba(34, 197, 94, 0.6), ${innerGlow}`,
      };
    default:
      return {
        boxShadow: `${baseGlow} rgba(192, 192, 192, 0.4), ${innerGlow}`,
      };
  }
}

const JarvisSphere = memo(function JarvisSphere({ phase, size = "lg" }: JarvisSphereProps) {
  const animationClass = getAnimationClass(phase);
  const glowStyle = getGlowStyle(phase);

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer ring pulses for listening state */}
      {phase === "LISTENING" && (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`${sizeClasses[size]} rounded-full border-2 border-blue-400/30 animate-ring-expand`}
              style={{ animationDelay: "0s" }}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`${sizeClasses[size]} rounded-full border-2 border-blue-400/20 animate-ring-expand`}
              style={{ animationDelay: "0.5s" }}
            />
          </div>
        </>
      )}

      {/* Thinking particles */}
      {phase === "THINKING" && (
        <div className="absolute inset-0 flex items-center justify-center">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-purple-400/60 animate-orbit"
              style={{
                animationDelay: `${i * 0.3}s`,
                transform: `rotate(${i * 60}deg) translateX(${size === "lg" ? 140 : size === "md" ? 100 : 60}px)`,
              }}
            />
          ))}
        </div>
      )}

      {/* Main sphere */}
      <div
        className={`
          relative rounded-full transition-all duration-500
          ${sizeClasses[size]}
          ${animationClass}
        `}
        style={{
          background: `
            radial-gradient(ellipse 50% 50% at 30% 30%, rgba(255,255,255,0.9) 0%, transparent 50%),
            radial-gradient(ellipse 30% 30% at 70% 70%, rgba(0,0,0,0.15) 0%, transparent 50%),
            linear-gradient(
              135deg,
              #f0f0f0 0%,
              #d4d4d4 20%,
              #e8e8e8 40%,
              #b8b8b8 60%,
              #c8c8c8 80%,
              #a8a8a8 100%
            )
          `,
          ...glowStyle,
        }}
      >
        {/* Specular highlight */}
        <div
          className="absolute rounded-full"
          style={{
            width: "35%",
            height: "35%",
            top: "12%",
            left: "18%",
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 40%, transparent 70%)",
          }}
        />

        {/* Secondary highlight */}
        <div
          className="absolute rounded-full"
          style={{
            width: "15%",
            height: "10%",
            top: "55%",
            left: "60%",
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, transparent 70%)",
            transform: "rotate(-30deg)",
          }}
        />

        {/* Phase indicator icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {phase === "LISTENING" && (
            <div className="flex items-end gap-1 h-8">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-blue-500/80 rounded-full animate-sound-bar"
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    height: "100%",
                  }}
                />
              ))}
            </div>
          )}
          {phase === "THINKING" && (
            <div className="w-8 h-8 border-2 border-purple-500/60 border-t-transparent rounded-full animate-spin" />
          )}
          {phase === "SPEAKING" && (
            <div className="flex items-center gap-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-green-500/80 rounded-full animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Speaking sound waves */}
      {phase === "SPEAKING" && (
        <>
          <div
            className="absolute rounded-full border border-green-400/30 animate-sound-wave"
            style={{
              width: size === "lg" ? "280px" : size === "md" ? "200px" : "120px",
              height: size === "lg" ? "280px" : size === "md" ? "200px" : "120px",
              animationDelay: "0s",
            }}
          />
          <div
            className="absolute rounded-full border border-green-400/20 animate-sound-wave"
            style={{
              width: size === "lg" ? "280px" : size === "md" ? "200px" : "120px",
              height: size === "lg" ? "280px" : size === "md" ? "200px" : "120px",
              animationDelay: "0.3s",
            }}
          />
        </>
      )}
    </div>
  );
});

export default JarvisSphere;
