/**
 * AgnesVoiceWave - Elegant flowing wave visualization for Agnes
 * Inspired by the ethereal blue wave with particles and glow effects
 */

import { memo, useEffect, useRef } from "react";
import type { DemoPhase } from "@/types/demo";

interface AgnesVoiceWaveProps {
  phase: DemoPhase;
  size?: "sm" | "md" | "lg";
}

const sizeConfig = {
  sm: { width: 280, height: 120 },
  md: { width: 340, height: 150 },
  lg: { width: 400, height: 180 },
};

// Phase-specific colors
const phaseColors = {
  IDLE: { primary: "100, 120, 150", glow: "80, 100, 130" },
  GREETING: { primary: "50, 200, 150", glow: "30, 180, 130" },
  LISTENING: { primary: "80, 160, 255", glow: "60, 140, 255" },
  THINKING: { primary: "180, 120, 255", glow: "160, 100, 235" },
  SPEAKING: { primary: "80, 200, 160", glow: "60, 180, 140" },
  NAVIGATING: { primary: "255, 180, 80", glow: "235, 160, 60" },
  COMPLETE: { primary: "80, 200, 160", glow: "60, 180, 140" },
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const AgnesVoiceWave = memo(function AgnesVoiceWave({
  phase,
  size = "lg"
}: AgnesVoiceWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);

  const config = sizeConfig[size];
  const colors = phaseColors[phase] || phaseColors.IDLE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High DPI setup
    const dpr = window.devicePixelRatio || 1;
    canvas.width = config.width * dpr;
    canvas.height = config.height * dpr;
    ctx.scale(dpr, dpr);

    const centerY = config.height / 2;
    const waveWidth = config.width * 0.85;
    const startX = (config.width - waveWidth) / 2;

    // Animation parameters based on phase
    const getParams = () => {
      switch (phase) {
        case "LISTENING":
          return { amplitude: 25, speed: 0.03, waves: 4, particleRate: 0.3, intensity: 1.2 };
        case "THINKING":
          return { amplitude: 15, speed: 0.05, waves: 5, particleRate: 0.2, intensity: 0.9 };
        case "SPEAKING":
        case "GREETING":
          return { amplitude: 35, speed: 0.04, waves: 3, particleRate: 0.5, intensity: 1.4 };
        case "NAVIGATING":
          return { amplitude: 20, speed: 0.06, waves: 4, particleRate: 0.25, intensity: 1.0 };
        default:
          return { amplitude: 10, speed: 0.015, waves: 3, particleRate: 0.1, intensity: 0.6 };
      }
    };

    const params = getParams();

    // Initialize particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 20; i++) {
        particlesRef.current.push({
          x: startX + Math.random() * waveWidth,
          y: centerY + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.3,
          life: Math.random() * 100,
          maxLife: 100 + Math.random() * 50,
          size: 1 + Math.random() * 2,
        });
      }
    }

    const animate = () => {
      timeRef.current += 1;
      const t = timeRef.current;

      // Clear with fade effect for trails
      ctx.fillStyle = "rgba(15, 23, 42, 0.15)";
      ctx.fillRect(0, 0, config.width, config.height);

      // Draw outer glow ellipse
      const glowGradient = ctx.createRadialGradient(
        config.width / 2, centerY, 0,
        config.width / 2, centerY, waveWidth / 2
      );
      glowGradient.addColorStop(0, `rgba(${colors.glow}, ${0.15 * params.intensity})`);
      glowGradient.addColorStop(0.5, `rgba(${colors.glow}, ${0.05 * params.intensity})`);
      glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.ellipse(config.width / 2, centerY, waveWidth / 2, config.height / 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw multiple wave layers
      for (let layer = 0; layer < params.waves; layer++) {
        const layerOffset = layer * 0.5;
        const layerAlpha = (1 - layer / params.waves) * 0.6 * params.intensity;
        const layerAmplitude = params.amplitude * (1 - layer * 0.15);

        // Draw wave mesh/grid effect
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${colors.primary}, ${layerAlpha * 0.3})`;
        ctx.lineWidth = 0.5;

        // Horizontal wave lines
        for (let line = -2; line <= 2; line++) {
          const lineY = centerY + line * 8;
          ctx.beginPath();
          for (let x = 0; x <= waveWidth; x += 2) {
            const px = startX + x;
            const progress = x / waveWidth;
            const envelope = Math.sin(progress * Math.PI); // Fade at edges

            // Multiple sine waves combined
            const wave1 = Math.sin(progress * Math.PI * 3 + t * params.speed + layerOffset) * layerAmplitude * 0.5;
            const wave2 = Math.sin(progress * Math.PI * 5 - t * params.speed * 0.7 + layerOffset) * layerAmplitude * 0.3;
            const wave3 = Math.sin(progress * Math.PI * 7 + t * params.speed * 0.5 + layerOffset) * layerAmplitude * 0.2;

            const y = lineY + (wave1 + wave2 + wave3) * envelope;

            if (x === 0) {
              ctx.moveTo(px, y);
            } else {
              ctx.lineTo(px, y);
            }
          }
          ctx.stroke();
        }

        // Main flowing wave
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${colors.primary}, ${layerAlpha})`;
        ctx.lineWidth = 2 - layer * 0.3;

        for (let x = 0; x <= waveWidth; x += 1) {
          const px = startX + x;
          const progress = x / waveWidth;
          const envelope = Math.sin(progress * Math.PI);

          // Flowing wave calculation
          const wave1 = Math.sin(progress * Math.PI * 2.5 + t * params.speed + layerOffset) * layerAmplitude;
          const wave2 = Math.sin(progress * Math.PI * 4 - t * params.speed * 0.8 + layerOffset * 2) * layerAmplitude * 0.4;
          const wave3 = Math.cos(progress * Math.PI * 6 + t * params.speed * 0.6) * layerAmplitude * 0.2;

          const y = centerY + (wave1 + wave2 + wave3) * envelope;

          if (x === 0) {
            ctx.moveTo(px, y);
          } else {
            ctx.lineTo(px, y);
          }
        }
        ctx.stroke();

        // Glowing core wave
        if (layer === 0) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 * params.intensity})`;
          ctx.lineWidth = 1;

          for (let x = 0; x <= waveWidth; x += 1) {
            const px = startX + x;
            const progress = x / waveWidth;
            const envelope = Math.sin(progress * Math.PI);

            const wave1 = Math.sin(progress * Math.PI * 2.5 + t * params.speed) * layerAmplitude;
            const wave2 = Math.sin(progress * Math.PI * 4 - t * params.speed * 0.8) * layerAmplitude * 0.4;

            const y = centerY + (wave1 + wave2) * envelope;

            if (x === 0) {
              ctx.moveTo(px, y);
            } else {
              ctx.lineTo(px, y);
            }
          }
          ctx.stroke();
        }
      }

      // Update and draw particles
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Update particle
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;

        // Calculate wave position for this x
        const progress = (p.x - startX) / waveWidth;
        if (progress >= 0 && progress <= 1) {
          const envelope = Math.sin(progress * Math.PI);
          const waveY = centerY + Math.sin(progress * Math.PI * 2.5 + t * params.speed) * params.amplitude * envelope;
          // Attract particle to wave
          p.vy += (waveY - p.y) * 0.02;
        }

        // Apply friction
        p.vx *= 0.99;
        p.vy *= 0.98;

        // Reset particle if dead or out of bounds
        if (p.life > p.maxLife || p.x < startX - 20 || p.x > startX + waveWidth + 20) {
          p.x = startX + Math.random() * waveWidth;
          p.y = centerY + (Math.random() - 0.5) * 30;
          p.vx = (Math.random() - 0.5) * 0.8;
          p.vy = (Math.random() - 0.5) * 0.5;
          p.life = 0;
          p.maxLife = 80 + Math.random() * 60;
          p.size = 1 + Math.random() * 2.5;
        }

        // Draw particle with glow
        const lifeRatio = 1 - p.life / p.maxLife;
        const alpha = lifeRatio * params.intensity * 0.8;

        // Outer glow
        const glowSize = p.size * 4;
        const particleGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
        particleGlow.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
        particleGlow.addColorStop(0.3, `rgba(${colors.primary}, ${alpha * 0.5})`);
        particleGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = particleGlow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Add new particles occasionally
      if (Math.random() < params.particleRate * 0.1) {
        particles.push({
          x: startX + Math.random() * waveWidth,
          y: centerY + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 1,
          vy: (Math.random() - 0.5) * 0.5,
          life: 0,
          maxLife: 80 + Math.random() * 60,
          size: 1.5 + Math.random() * 2,
        });

        // Keep particle count reasonable
        if (particles.length > 35) {
          particles.shift();
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
  }, [phase, config, colors]);

  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        style={{
          width: config.width,
          height: config.height,
          borderRadius: "12px",
        }}
        className="transition-opacity duration-500"
      />
    </div>
  );
});

export default AgnesVoiceWave;
