/**
 * AgnesVoiceOrb - Sophisticated voice visualization for Agnes Demo Mode
 * Inspired by ChatGPT's voice mode animation - elegant, fluid orb with wave patterns
 */

import { memo, useEffect, useRef, useMemo } from "react";
import type { DemoPhase } from "@/types/demo";

interface AgnesVoiceOrbProps {
  phase: DemoPhase;
  size?: "sm" | "md" | "lg";
}

const sizeConfig = {
  sm: { width: 120, height: 120, baseRadius: 40 },
  md: { width: 180, height: 180, baseRadius: 60 },
  lg: { width: 240, height: 240, baseRadius: 80 },
};

// Color schemes for each phase
const phaseColors = {
  IDLE: { primary: "#6B7280", secondary: "#4B5563", glow: "rgba(107, 114, 128, 0.3)" },
  GREETING: { primary: "#22C55E", secondary: "#16A34A", glow: "rgba(34, 197, 94, 0.4)" },
  LISTENING: { primary: "#3B82F6", secondary: "#2563EB", glow: "rgba(59, 130, 246, 0.5)" },
  THINKING: { primary: "#A855F7", secondary: "#9333EA", glow: "rgba(168, 85, 247, 0.4)" },
  SPEAKING: { primary: "#22C55E", secondary: "#16A34A", glow: "rgba(34, 197, 94, 0.5)" },
  NAVIGATING: { primary: "#F59E0B", secondary: "#D97706", glow: "rgba(245, 158, 11, 0.5)" },
  COMPLETE: { primary: "#22C55E", secondary: "#16A34A", glow: "rgba(34, 197, 94, 0.6)" },
};

const AgnesVoiceOrb = memo(function AgnesVoiceOrb({
  phase,
  size = "lg"
}: AgnesVoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef(0);

  const config = sizeConfig[size];
  const colors = phaseColors[phase] || phaseColors.IDLE;

  // Animation parameters based on phase
  const animParams = useMemo(() => {
    switch (phase) {
      case "LISTENING":
        return {
          waveAmplitude: 12,
          waveFrequency: 4,
          pulseSpeed: 0.03,
          rotationSpeed: 0.005,
          particleCount: 8,
          glowIntensity: 1.2,
        };
      case "THINKING":
        return {
          waveAmplitude: 6,
          waveFrequency: 6,
          pulseSpeed: 0.05,
          rotationSpeed: 0.02,
          particleCount: 12,
          glowIntensity: 1.0,
        };
      case "SPEAKING":
      case "GREETING":
        return {
          waveAmplitude: 18,
          waveFrequency: 3,
          pulseSpeed: 0.04,
          rotationSpeed: 0.01,
          particleCount: 6,
          glowIntensity: 1.4,
        };
      case "NAVIGATING":
        return {
          waveAmplitude: 8,
          waveFrequency: 5,
          pulseSpeed: 0.06,
          rotationSpeed: 0.015,
          particleCount: 4,
          glowIntensity: 1.1,
        };
      default:
        return {
          waveAmplitude: 4,
          waveFrequency: 2,
          pulseSpeed: 0.01,
          rotationSpeed: 0.003,
          particleCount: 0,
          glowIntensity: 0.6,
        };
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up high DPI canvas
    const dpr = window.devicePixelRatio || 1;
    canvas.width = config.width * dpr;
    canvas.height = config.height * dpr;
    ctx.scale(dpr, dpr);

    const centerX = config.width / 2;
    const centerY = config.height / 2;

    const animate = () => {
      timeRef.current += 1;
      const t = timeRef.current;

      // Clear canvas
      ctx.clearRect(0, 0, config.width, config.height);

      // Calculate dynamic radius with pulsing
      const pulse = Math.sin(t * animParams.pulseSpeed) * 0.08 + 1;
      const baseR = config.baseRadius * pulse;

      // Draw outer glow rings (multiple layers for depth)
      for (let i = 3; i >= 1; i--) {
        const glowR = baseR + (i * 15);
        const alpha = (0.15 / i) * animParams.glowIntensity;

        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fillStyle = colors.glow.replace(/[\d.]+\)$/, `${alpha})`);
        ctx.fill();
      }

      // Draw the main orb with gradient
      const gradient = ctx.createRadialGradient(
        centerX - baseR * 0.3,
        centerY - baseR * 0.3,
        0,
        centerX,
        centerY,
        baseR
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.3, colors.primary);
      gradient.addColorStop(0.7, colors.secondary);
      gradient.addColorStop(1, colors.secondary);

      // Draw wave-distorted circle (organic blob shape)
      ctx.beginPath();
      const points = 120;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;

        // Multiple wave layers for organic feel
        const wave1 = Math.sin(angle * animParams.waveFrequency + t * 0.03) * animParams.waveAmplitude;
        const wave2 = Math.sin(angle * (animParams.waveFrequency + 2) - t * 0.02) * (animParams.waveAmplitude * 0.5);
        const wave3 = Math.cos(angle * 3 + t * 0.04) * (animParams.waveAmplitude * 0.3);

        const r = baseR + wave1 + wave2 + wave3;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw inner highlight (glass-like effect)
      const highlightGradient = ctx.createRadialGradient(
        centerX - baseR * 0.35,
        centerY - baseR * 0.35,
        0,
        centerX - baseR * 0.2,
        centerY - baseR * 0.2,
        baseR * 0.6
      );
      highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
      highlightGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
      highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.beginPath();
      ctx.ellipse(
        centerX - baseR * 0.25,
        centerY - baseR * 0.25,
        baseR * 0.4,
        baseR * 0.3,
        -0.5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = highlightGradient;
      ctx.fill();

      // Draw orbiting particles for THINKING phase
      if (animParams.particleCount > 0 && (phase === "THINKING" || phase === "LISTENING")) {
        for (let i = 0; i < animParams.particleCount; i++) {
          const particleAngle = (i / animParams.particleCount) * Math.PI * 2 + t * animParams.rotationSpeed;
          const orbitRadius = baseR + 25 + Math.sin(t * 0.02 + i) * 5;
          const px = centerX + Math.cos(particleAngle) * orbitRadius;
          const py = centerY + Math.sin(particleAngle) * orbitRadius;
          const particleSize = 3 + Math.sin(t * 0.05 + i * 0.5) * 1.5;

          ctx.beginPath();
          ctx.arc(px, py, particleSize, 0, Math.PI * 2);
          ctx.fillStyle = colors.primary;
          ctx.globalAlpha = 0.7;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Draw sound wave rings for SPEAKING/GREETING
      if (phase === "SPEAKING" || phase === "GREETING") {
        for (let i = 0; i < 3; i++) {
          const ringProgress = ((t * 0.02) + i * 0.33) % 1;
          const ringRadius = baseR + ringProgress * 40;
          const ringAlpha = (1 - ringProgress) * 0.4;

          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = colors.primary.replace(")", `, ${ringAlpha})`).replace("rgb", "rgba");
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Draw pulsing dots for LISTENING
      if (phase === "LISTENING") {
        const dotsCount = 4;
        for (let i = 0; i < dotsCount; i++) {
          const dotPhase = (t * 0.1 + i * (Math.PI / 2)) % (Math.PI * 2);
          const dotY = centerY + baseR + 20 + Math.sin(dotPhase) * 8;
          const dotX = centerX + (i - 1.5) * 12;
          const dotSize = 3 + Math.abs(Math.sin(dotPhase)) * 3;

          ctx.beginPath();
          ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
          ctx.fillStyle = colors.primary;
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [phase, config, colors, animParams]);

  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        style={{
          width: config.width,
          height: config.height,
        }}
        className="transition-opacity duration-300"
      />

      {/* Status indicator below orb */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
        {phase === "LISTENING" && (
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1 bg-blue-400 rounded-full animate-sound-bar"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  height: "12px"
                }}
              />
            ))}
          </div>
        )}
        {phase === "THINKING" && (
          <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
});

export default AgnesVoiceOrb;
