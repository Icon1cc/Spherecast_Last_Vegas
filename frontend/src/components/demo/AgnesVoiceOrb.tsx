/**
 * AgnesVoiceOrb - Elegant voice visualization for Agnes Demo Mode
 * Inspired by Siri/ChatGPT - smooth, subtle, professional orb animation
 */

import { memo, useEffect, useRef } from "react";
import type { DemoPhase } from "@/types/demo";

interface AgnesVoiceOrbProps {
  phase: DemoPhase;
  size?: "sm" | "md" | "lg";
}

const sizeConfig = {
  sm: { width: 140, height: 140, baseRadius: 45 },
  md: { width: 200, height: 200, baseRadius: 65 },
  lg: { width: 260, height: 260, baseRadius: 85 },
};

// Elegant color schemes for each phase
const phaseColors = {
  IDLE: {
    gradient: ["#4B5563", "#374151", "#1F2937"],
    glow: "rgba(75, 85, 99, 0.3)",
    accent: "#6B7280",
  },
  GREETING: {
    gradient: ["#34D399", "#10B981", "#059669"],
    glow: "rgba(16, 185, 129, 0.4)",
    accent: "#10B981",
  },
  LISTENING: {
    gradient: ["#60A5FA", "#3B82F6", "#2563EB"],
    glow: "rgba(59, 130, 246, 0.5)",
    accent: "#3B82F6",
  },
  THINKING: {
    gradient: ["#C084FC", "#A855F7", "#9333EA"],
    glow: "rgba(168, 85, 247, 0.4)",
    accent: "#A855F7",
  },
  SPEAKING: {
    gradient: ["#34D399", "#10B981", "#059669"],
    glow: "rgba(16, 185, 129, 0.5)",
    accent: "#10B981",
  },
  NAVIGATING: {
    gradient: ["#FBBF24", "#F59E0B", "#D97706"],
    glow: "rgba(245, 158, 11, 0.5)",
    accent: "#F59E0B",
  },
  COMPLETE: {
    gradient: ["#34D399", "#10B981", "#059669"],
    glow: "rgba(16, 185, 129, 0.6)",
    accent: "#10B981",
  },
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

    // Animation parameters based on phase - MUCH subtler
    const getParams = () => {
      switch (phase) {
        case "LISTENING":
          return {
            waveAmp: 3,        // Very subtle wave
            waveSpeed: 0.015,
            pulseAmp: 0.03,
            pulseSpeed: 0.025,
            glowPulse: 0.15,
            rings: 3,
          };
        case "THINKING":
          return {
            waveAmp: 2,
            waveSpeed: 0.025,
            pulseAmp: 0.02,
            pulseSpeed: 0.04,
            glowPulse: 0.1,
            rings: 0,
          };
        case "SPEAKING":
        case "GREETING":
          return {
            waveAmp: 5,        // Slightly more active when speaking
            waveSpeed: 0.02,
            pulseAmp: 0.04,
            pulseSpeed: 0.035,
            glowPulse: 0.2,
            rings: 2,
          };
        case "NAVIGATING":
          return {
            waveAmp: 3,
            waveSpeed: 0.03,
            pulseAmp: 0.025,
            pulseSpeed: 0.05,
            glowPulse: 0.12,
            rings: 1,
          };
        default:
          return {
            waveAmp: 1,
            waveSpeed: 0.008,
            pulseAmp: 0.015,
            pulseSpeed: 0.015,
            glowPulse: 0.05,
            rings: 0,
          };
      }
    };

    const params = getParams();

    const animate = () => {
      timeRef.current += 1;
      const t = timeRef.current;

      // Clear canvas
      ctx.clearRect(0, 0, config.width, config.height);

      // Calculate subtle pulse
      const pulse = 1 + Math.sin(t * params.pulseSpeed) * params.pulseAmp;
      const baseR = config.baseRadius * pulse;

      // Draw soft outer glow (multiple layers for smooth falloff)
      const glowLayers = 5;
      for (let i = glowLayers; i >= 1; i--) {
        const glowR = baseR + (i * 12);
        const glowIntensity = Math.sin(t * 0.02) * params.glowPulse + 0.5;
        const alpha = (0.08 / i) * glowIntensity;

        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fillStyle = colors.glow.replace(/[\d.]+\)$/, `${alpha})`);
        ctx.fill();
      }

      // Draw expanding rings for listening/speaking
      if (params.rings > 0) {
        for (let i = 0; i < params.rings; i++) {
          const ringProgress = ((t * 0.008) + i * (1 / params.rings)) % 1;
          const ringRadius = baseR + ringProgress * 35;
          const ringAlpha = (1 - ringProgress) * 0.25;

          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = colors.accent + Math.round(ringAlpha * 255).toString(16).padStart(2, '0');
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Create main gradient
      const gradient = ctx.createRadialGradient(
        centerX - baseR * 0.25,
        centerY - baseR * 0.25,
        0,
        centerX,
        centerY,
        baseR * 1.1
      );
      gradient.addColorStop(0, colors.gradient[0]);
      gradient.addColorStop(0.5, colors.gradient[1]);
      gradient.addColorStop(1, colors.gradient[2]);

      // Draw smooth orb with VERY subtle wave distortion
      ctx.beginPath();
      const points = 180;  // More points for smoother curve
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;

        // Very gentle, smooth wave - single sine wave, not multiple
        const wave = Math.sin(angle * 3 + t * params.waveSpeed) * params.waveAmp;

        const r = baseR + wave;
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

      // Add subtle inner shadow for depth
      const innerShadow = ctx.createRadialGradient(
        centerX,
        centerY + baseR * 0.1,
        baseR * 0.7,
        centerX,
        centerY,
        baseR
      );
      innerShadow.addColorStop(0, "rgba(0, 0, 0, 0)");
      innerShadow.addColorStop(1, "rgba(0, 0, 0, 0.15)");

      ctx.beginPath();
      ctx.arc(centerX, centerY, baseR, 0, Math.PI * 2);
      ctx.fillStyle = innerShadow;
      ctx.fill();

      // Draw elegant highlight (glass-like reflection)
      const highlightGradient = ctx.createRadialGradient(
        centerX - baseR * 0.3,
        centerY - baseR * 0.35,
        0,
        centerX - baseR * 0.15,
        centerY - baseR * 0.2,
        baseR * 0.5
      );
      highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.6)");
      highlightGradient.addColorStop(0.4, "rgba(255, 255, 255, 0.15)");
      highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.beginPath();
      ctx.ellipse(
        centerX - baseR * 0.2,
        centerY - baseR * 0.25,
        baseR * 0.35,
        baseR * 0.25,
        -0.4,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = highlightGradient;
      ctx.fill();

      // Small secondary highlight
      ctx.beginPath();
      ctx.ellipse(
        centerX + baseR * 0.25,
        centerY + baseR * 0.3,
        baseR * 0.1,
        baseR * 0.06,
        0.5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fill();

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [phase, config, colors]);

  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        style={{
          width: config.width,
          height: config.height,
        }}
        className="transition-opacity duration-500"
      />
    </div>
  );
});

export default AgnesVoiceOrb;
