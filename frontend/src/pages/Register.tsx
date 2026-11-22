import React, { useState, useEffect } from 'react';
import { authService, type AuthUser } from '../services/auth';
import {
  Shield,
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Activity,
  BarChart3,
  ShieldCheck,
  Share2,
  CheckCircle2,
} from 'lucide-react';

interface RegisterProps {
  onLogin: (user: AuthUser) => void;
  onNavigateToLogin: () => void;
}

const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
  if (value <= inMin) return outMin;
  if (value >= inMax) return outMax;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
};

const PARTICLES = Array.from({ length: 150 }, (_, i) => ({
  id: i,
  angle: (i * 137.508) % 360,
  distance: 30 + (i % 60) * 1.5,
  size: 1 + (i % 3) * 0.5,
  baseOpacity: 0.2 + (i % 5) * 0.15,
}));

export const Register: React.FC<RegisterProps> = ({ onLogin, onNavigateToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = window.innerHeight * 4;
      const progress = Math.min(1, Math.max(0, window.scrollY / scrollHeight));
      setScrollProgress(progress);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      // 1. Create account (assigned 'viewer' role automatically by backend)
      await authService.register(trimmedName, trimmedEmail, password);

      // 2. Immediate login into active session
      const user = await authService.login(trimmedEmail, password);
      onLogin(user);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Registration failed. Please check your information.');
    } finally {
      setLoading(false);
    }
  };

  const particlesOpacity = mapRange(scrollProgress, 0.0, 0.1, 0, 1);
  const particlesGather = mapRange(scrollProgress, 0.1, 0.2, 1, 0.2);

  const earthOpacity = mapRange(scrollProgress, 0.1, 0.25, 0, 1);
  const earthScale = mapRange(scrollProgress, 0.15, 0.3, 0.5, 1);

  const ringsOpacity = mapRange(scrollProgress, 0.25, 0.4, 0, 1);
  const ringsScale = mapRange(scrollProgress, 0.25, 0.4, 0.6, 1);

  const shieldDraw = mapRange(scrollProgress, 0.4, 0.55, 1200, 0);
  const shieldOpacity = mapRange(scrollProgress, 0.4, 0.55, 0, 1);

  const pulseOpacity = mapRange(scrollProgress, 0.55, 0.65, 0, 1) - mapRange(scrollProgress, 0.65, 0.7, 0, 1);
  const pulseScale = mapRange(scrollProgress, 0.55, 0.7, 1, 1.3);

  const textOpacity = mapRange(scrollProgress, 0.65, 0.75, 0, 1);
  const textBlur = mapRange(scrollProgress, 0.65, 0.75, 10, 0);
  const streakLeft = mapRange(scrollProgress, 0.65, 0.75, -50, 150);
  const streakOpacity = mapRange(scrollProgress, 0.65, 0.7, 0, 1) - mapRange(scrollProgress, 0.7, 0.75, 0, 1);

  const subOpacity = mapRange(scrollProgress, 0.75, 0.85, 0, 1);
  const subY = mapRange(scrollProgress, 0.75, 0.85, 20, 0);

  const rotation = scrollProgress * 360;

  return (
    <>
      <style>{`
        body { background-color: #01030a; color: white; overflow-x: hidden; }
        
        .glass-panel {
          background: rgba(10, 15, 26, 0.6);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(59, 130, 246, 0.2);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(59, 130, 246, 0.05);
        }

        .scroll-indicator {
          animation: bounce 2s infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(10px); opacity: 1; }
        }
      `}</style>

      {/* FIXED 3D SHIELD BACKGROUND CANVAS */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <div className="relative w-[1000px] h-[1000px] flex items-center justify-center">
          {PARTICLES.map((p) => {
            const rad = (p.angle + rotation * 0.2) * (Math.PI / 180);
            const currentDist = p.distance * particlesGather;
            const x = Math.cos(rad) * currentDist;
            const y = Math.sin(rad) * currentDist;

            return (
              <div
                key={p.id}
                className="absolute rounded-full bg-cyan-400"
                style={{
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  transform: `translate(${x}px, ${y}px)`,
                  opacity: p.baseOpacity * particlesOpacity,
                  boxShadow: '0 0 8px #00f0ff',
                }}
              />
            );
          })}

          <div
            className="absolute w-[360px] h-[360px] rounded-full border border-blue-500/30 flex items-center justify-center"
            style={{
              opacity: earthOpacity,
              transform: `scale(${earthScale})`,
              boxShadow: 'inset 0 0 50px rgba(0,150,255,0.2), 0 0 30px rgba(0,100,255,0.1)',
            }}
          >
            <div
              className="absolute inset-0 rounded-full opacity-30"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), transparent 20%), radial-gradient(circle at 70% 60%, rgba(0,200,255,0.6), transparent 30%)',
              }}
            />
            <div
              className="w-full h-[1px] bg-blue-500/20 absolute"
              style={{ transform: `rotate(${rotation * 0.1}deg)` }}
            />
            <div
              className="h-full w-[1px] bg-blue-500/20 absolute"
              style={{ transform: `rotate(${rotation * 0.1}deg)` }}
            />
          </div>

          <div
            className="absolute w-[500px] h-[500px] rounded-full border border-cyan-400/20 border-dashed"
            style={{
              opacity: ringsOpacity,
              transform: `scale(${ringsScale}) rotate(${rotation * 0.4}deg)`,
            }}
          />
          <div
            className="absolute w-[620px] h-[620px] rounded-full border border-blue-600/30"
            style={{
              opacity: ringsOpacity,
              transform: `scale(${ringsScale}) rotate(${-rotation * 0.2}deg)`,
            }}
          />

          <div
            className="absolute w-[240px] h-[280px] z-10 flex items-center justify-center"
            style={{ opacity: shieldOpacity }}
          >
            <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-[0_0_25px_rgba(0,240,255,0.6)]">
              <path
                d="M 50,5 L 90,20 L 90,65 C 90,95 50,115 50,115 C 50,115 10,95 10,65 L 10,20 Z"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="2.5"
                strokeDasharray="1200"
                strokeDashoffset={shieldDraw}
              />
            </svg>
          </div>

          <div
            className="absolute w-[280px] h-[320px] rounded-full bg-cyan-400/20 blur-xl pointer-events-none"
            style={{
              opacity: pulseOpacity,
              transform: `scale(${pulseScale})`,
            }}
          />
        </div>
      </div>

      {/* TOP HEADER */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/30">
            <Shield size={20} className="text-blue-500" />
          </div>
          <span className="font-bold text-white tracking-widest text-sm uppercase">IOTShield</span>
          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30 font-mono">
            SENTINEL
          </span>
        </div>

        <button
          type="button"
          onClick={onNavigateToLogin}
          className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800"
        >
          <span>Already have an account?</span>
          <span className="text-cyan-400 font-semibold">Sign in</span>
        </button>
      </header>

      {/* SCROLLABLE HERO / INTRO AREA */}
      <div className="relative z-10 w-full flex flex-col items-center">
        <div className="h-screen w-full flex flex-col items-center justify-center text-center px-4 relative">
          <p className="text-blue-500 text-xs tracking-[0.3em] uppercase mb-4 font-semibold">
            Next-Gen Autonomous SOC
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
            Intelligent Threat Defense
          </h1>
          <p className="max-w-xl text-slate-400 text-sm leading-relaxed mb-8">
            Scroll to register and join the real-time IoT intrusion detection platform.
          </p>

          <div className="absolute bottom-12 flex flex-col items-center gap-2 text-slate-500">
            <span className="text-[10px] tracking-widest uppercase font-mono">Scroll down</span>
            <div className="w-4 h-7 rounded-full border border-slate-700 flex items-start justify-center p-1">
              <div className="w-1 h-2 rounded-full bg-blue-500 scroll-indicator" />
            </div>
          </div>
        </div>

        <div className="h-[200vh] w-full flex flex-col items-center justify-center pointer-events-none">
          <div
            className="sticky top-1/2 -translate-y-1/2 text-center px-4"
            style={{
              opacity: textOpacity,
              filter: `blur(${textBlur}px)`,
            }}
          >
            <div className="relative inline-block overflow-hidden">
              <h2 className="text-4xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-blue-500 tracking-tight">
                CREATE ACCOUNT
              </h2>
              <div
                className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-cyan-400 to-transparent skew-x-12 pointer-events-none"
                style={{
                  left: `${streakLeft}%`,
                  opacity: streakOpacity,
                }}
              />
            </div>
            <p
              className="text-cyan-400 text-sm tracking-[0.2em] uppercase font-mono mt-4"
              style={{
                opacity: subOpacity,
                transform: `translateY(${subY}px)`,
              }}
            >
              Public Self-Registration • Instant Activation
            </p>
          </div>
        </div>
      </div>

      {/* FINAL SECTION: REGISTRATION FORM */}
      <div className="relative z-20 min-h-screen w-full flex flex-col justify-center items-center px-6 py-20">
        <div className="flex w-full max-w-[1200px] mx-auto gap-16 items-center">
          {/* STATIC LEFT INFO AREA */}
          <div className="w-[45%]">
            <p className="text-blue-500 text-[11px] font-bold tracking-[0.25em] uppercase mb-4">
              Instant Platform Access
            </p>

            <h2 className="text-5xl font-bold text-white mb-6 leading-[1.2]">
              Join the front lines<br />of <span className="text-blue-500">IoT defense</span>
            </h2>

            <div className="w-10 h-0.5 bg-blue-600 mb-6" />

            <p className="text-slate-400 text-[15px] leading-relaxed mb-8">
              Register now for immediate, friction-free access to telemetry dashboards, threat indicators, and real-time network analytics.
            </p>

            <div className="space-y-3 mb-10">
              <div className="flex items-center gap-3 text-slate-300 text-xs">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>Instant activation — no email verification, OTP, or admin approval required</span>
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-xs">
                <CheckCircle2 size={16} className="text-cyan-400 shrink-0" />
                <span>Standard Viewer access provisioned automatically for safe telemetry monitoring</span>
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-xs">
                <CheckCircle2 size={16} className="text-blue-400 shrink-0" />
                <span>Protected by Argon2 password hashing and secure token rotation</span>
              </div>
            </div>

            <div className="flex gap-6 md:gap-10">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 flex items-center justify-center text-blue-500 border border-blue-500/30 rounded-xl bg-blue-500/5">
                  <Activity size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-slate-300 text-xs font-medium">Real-time</p>
                  <p className="text-slate-500 text-[11px]">Telemetry</p>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 flex items-center justify-center text-blue-500 border border-blue-500/30 rounded-xl bg-blue-500/5">
                  <Share2 size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-slate-300 text-xs font-medium">Multi-Agent</p>
                  <p className="text-slate-500 text-[11px]">Correlation</p>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 flex items-center justify-center text-blue-500 border border-blue-500/30 rounded-xl bg-blue-500/5">
                  <BarChart3 size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-slate-300 text-xs font-medium">8-Class</p>
                  <p className="text-slate-500 text-[11px]">Inference</p>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 flex items-center justify-center text-blue-500 border border-blue-500/30 rounded-xl bg-blue-500/5">
                  <ShieldCheck size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-slate-300 text-xs font-medium">Automated</p>
                  <p className="text-slate-500 text-[11px]">Defense</p>
                </div>
              </div>
            </div>
          </div>

          {/* STATIC RIGHT REGISTRATION FORM */}
          <div className="w-[55%] flex justify-center">
            <div className="glass-panel w-full max-w-[440px] rounded-3xl p-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 group-hover:bg-cyan-400/20 transition-colors duration-700 pointer-events-none" />

              <div className="text-center mb-6 relative z-10">
                <h3 className="text-2xl font-bold text-white mb-2">Create Account</h3>
                <p className="text-slate-400 text-xs mt-1">Register for instant access to IoT Shield</p>
                <div
                  className="w-10 h-0.5 mx-auto mt-3"
                  style={{ background: 'linear-gradient(90deg,#3b82f6,#38bdf8)' }}
                />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5 relative z-10">
                {errorMsg && (
                  <div className="flex items-center gap-2 p-3 rounded-lg text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20">
                    <AlertCircle size={14} className="shrink-0" /> {errorMsg}
                  </div>
                )}

                {/* Full Name */}
                <div className="space-y-1">
                  <label className="text-slate-300 text-xs font-semibold">Full name</label>
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all bg-[#050a14]/80 border border-slate-700/60 focus-within:border-cyan-500/60 focus-within:shadow-[0_0_15px_rgba(14,165,233,0.15)]">
                    <UserIcon size={16} className="text-slate-500 shrink-0" />
                    <input
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Morgan"
                      required
                      className="bg-transparent border-none outline-none w-full text-white placeholder-slate-600 text-sm"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="space-y-1">
                  <label className="text-slate-300 text-xs font-semibold">Email address</label>
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all bg-[#050a14]/80 border border-slate-700/60 focus-within:border-cyan-500/60 focus-within:shadow-[0_0_15px_rgba(14,165,233,0.15)]">
                    <Mail size={16} className="text-slate-500 shrink-0" />
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="bg-transparent border-none outline-none w-full text-white placeholder-slate-600 text-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="text-slate-300 text-xs font-semibold">Password</label>
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all bg-[#050a14]/80 border border-slate-700/60 focus-within:border-cyan-500/60 focus-within:shadow-[0_0_15px_rgba(14,165,233,0.15)]">
                    <Lock size={16} className="text-slate-500 shrink-0" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                      className="bg-transparent border-none outline-none w-full text-white placeholder-slate-600 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-1">
                  <label className="text-slate-300 text-xs font-semibold">Confirm password</label>
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all bg-[#050a14]/80 border border-slate-700/60 focus-within:border-cyan-500/60 focus-within:shadow-[0_0_15px_rgba(14,165,233,0.15)]">
                    <Lock size={16} className="text-slate-500 shrink-0" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      required
                      minLength={8}
                      className="bg-transparent border-none outline-none w-full text-white placeholder-slate-600 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Role notice - immutable */}
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-start gap-2">
                  <ShieldCheck size={14} className="shrink-0 text-cyan-400 mt-0.5" />
                  <span>
                    New accounts are assigned the <strong>Viewer</strong> role automatically with read-only access.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all overflow-hidden relative group"
                  style={{
                    background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                    boxShadow: '0 8px 25px rgba(29,78,216,0.3)',
                  }}
                >
                  <div className="absolute inset-0 w-full h-full bg-white/10 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                  {loading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <>
                      <span>Register & Launch</span> <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 text-center text-xs text-slate-400 relative z-10">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={onNavigateToLogin}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2 transition-colors ml-1"
                >
                  Sign in to your account
                </button>
              </div>

              <p className="text-center text-slate-500 text-[10px] mt-4 flex items-center justify-center gap-1.5 relative z-10">
                <Lock size={10} /> Argon2id hashed • Secure HttpOnly sessions
              </p>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 w-full text-center">
          <p className="text-slate-600 text-[10px] uppercase tracking-widest font-mono">
            © 2026 IOTShield Cybersecurity Network
          </p>
        </div>
      </div>
    </>
  );
};

