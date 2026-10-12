import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

const light = {
  bg: '#eaf1fb',
  road: '#cdd9ec',
  sky: '#eaf1fb',
  building: '#b9c8e0',
  board: '#ffffff',
  boardStroke: '#cbd5e1',
  post: '#9aaedf',
  signAccent: '#2563eb',
  textPrimary: '#2563eb',
  textMid: '#475569',
  textBad: '#b91c1c',
  carBody: '#2563eb',
  carCabin: '#3b82f6',
  carWindow: '#bfdbfe',
  bumper: '#1e40af',
  wheel: '#0f172a',
  taillight: '#ef4444',
  arrow: '#2563eb',
  badgeBg: '#ffffff',
  badgeStroke: '#e2e8f0',
  badgeText: '#2563eb',
  pin: '#2563eb',
  pinInner: '#ffffff',
};

const dark = {
  bg: '#13203a',
  road: '#3a4d70',
  sky: '#1b2a47',
  building: '#24365c',
  board: '#1b2a47',
  boardStroke: '#34466b',
  post: '#465a82',
  signAccent: '#3b82f6',
  textPrimary: '#a9c3ff',
  textMid: '#cbd5e1',
  textBad: '#f87171',
  carBody: '#111827',
  carCabin: '#1f2937',
  carWindow: '#3b82f6',
  bumper: '#1e3a8a',
  wheel: '#0b1220',
  taillight: '#f87171',
  arrow: '#93c5fd',
  badgeBg: '#0f172a',
  badgeStroke: '#34466b',
  badgeText: '#93c5fd',
  pin: '#60a5fa',
  pinInner: '#fbbf24',
};

const ParkingIllustration = () => {
  const { darkMode } = useTheme();
  const p = darkMode ? dark : light;

  return (
    <svg
      viewBox="0 0 520 460"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ width: '100%', height: 'auto', display: 'block', maxWidth: 440 }}
    >
      {/* backdrop */}
      <rect width="520" height="460" rx="20" fill={p.bg} />

      {/* faint road dashes */}
      <path d="M40 400 Q 220 420 440 360" stroke={p.road} strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />
      <path d="M40 412 Q 220 432 440 372" stroke={p.road} strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />

      {/* skyline */}
      <g opacity="0.4">
        {[
          [60, 320, 24, 80],
          [92, 300, 20, 100],
          [118, 330, 18, 70],
          [142, 310, 26, 90],
          [174, 320, 18, 80],
          [198, 300, 22, 100],
          [226, 318, 20, 82],
          [250, 308, 24, 92],
          [280, 322, 18, 78],
          [302, 300, 22, 100],
          [328, 320, 20, 80],
          [352, 310, 26, 90],
          [382, 324, 20, 76],
          [406, 308, 22, 92],
          [430, 324, 22, 76],
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill={p.building} />
        ))}
      </g>

      {/* parking sign post */}
      <rect x="372" y="150" width="6" height="170" fill={p.post} />

      {/* parking P sign */}
      <g>
        <rect x="322" y="118" width="112" height="92" rx="10" fill={p.signAccent} stroke={p.sky} strokeWidth="4" />
        <text
          x="378"
          y="174"
          textAnchor="middle"
          fill="#ffffff"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="800"
          fontSize="58"
          letterSpacing="-2"
        >
          P
        </text>
      </g>

      {/* directional signs */}
      <g>
        <rect x="250" y="250" width="122" height="34" rx="6" fill={p.board} stroke={p.boardStroke} strokeWidth="2" />
        <text x="311" y="272" textAnchor="middle" fill={p.textPrimary} fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="15">
          Parking
        </text>
        <rect x="368" y="256" width="6" height="22" fill={p.post} />

        <rect x="250" y="296" width="122" height="34" rx="6" fill={p.board} stroke={p.boardStroke} strokeWidth="2" />
        <text x="311" y="318" textAnchor="middle" fill={p.textMid} fontFamily="Inter, system-ui, sans-serif" fontWeight="600" fontSize="15">
          This Way
        </text>
        <rect x="368" y="302" width="6" height="22" fill={p.post} />

        <rect x="250" y="342" width="122" height="34" rx="6" fill={p.board} stroke={p.boardStroke} strokeWidth="2" />
        <text x="311" y="364" textAnchor="middle" fill={p.textBad} fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="15">
          Not Here
        </text>
        <rect x="368" y="348" width="6" height="22" fill={p.post} />
      </g>

      {/* car (rear view) with wrong-turn arrow */}
      <g transform="translate(150 360)">
        <rect x="-38" y="-30" width="76" height="30" rx="10" fill={p.carBody} />
        <path d="M-22 -30 L-14 -52 L14 -52 L22 -30 Z" fill={p.carCabin} />
        <path d="M-16 -32 L-10 -48 L10 -48 L16 -32 Z" fill={p.carWindow} />
        <rect x="-38" y="-22" width="8" height="8" rx="2" fill={p.taillight} />
        <rect x="30" y="-22" width="8" height="8" rx="2" fill={p.taillight} />
        <rect x="-38" y="-8" width="76" height="6" rx="2" fill={p.bumper} />
        <circle cx="-20" cy="2" r="8" fill={p.wheel} />
        <circle cx="20" cy="2" r="8" fill={p.wheel} />
        <g transform="translate(0 -72)">
          <path
            d="M-14 0 L14 0 L14 -12 L28 -12 L0 18 L-28 -12 L-14 -12 Z"
            fill={p.arrow}
            opacity="0.95"
          />
        </g>
      </g>

      {/* 404 badge */}
      <g transform="translate(48 48)">
        <rect x="0" y="0" width="74" height="44" rx="12" fill={p.badgeBg} stroke={p.badgeStroke} strokeWidth="2" />
        <text
          x="37"
          y="33"
          textAnchor="middle"
          fill={p.badgeText}
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="800"
          fontSize="30"
        >
          404
        </text>
      </g>

      {/* map pin accent */}
      <g transform="translate(452 408)">
        <path
          d="M0 -14 C-9.33 -14 -14 -9.33 -14 -4 C-14 7.31 0 26 0 26 C0 26 14 7.31 14 -4 C14 -9.33 9.33 -14 0 -14 Z"
          fill={p.pin}
        />
        <circle cx="0" cy="-4" r="4" fill={p.pinInner} />
      </g>
    </svg>
  );
};

const NotFound = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center px-4 sm:px-6 lg:px-8 py-12 relative overflow-hidden">
      {/* subtle background tint, behind content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          background: 'radial-gradient(circle at 80% 18%, rgba(37,99,235,0.08), transparent 55%)',
        }}
      >
        <svg
          className="w-full h-full pointer-events-none"
          viewBox="0 0 1440 900"
          fill="none"
          aria-hidden="true"
          focusable="false"
          style={{ position: 'absolute', inset: 0, opacity: 0.5 }}
        >
          <path d="M0 760 C 360 760 720 720 1440 640" stroke="rgba(37,99,235,0.10)" strokeWidth="60" strokeLinecap="round" />
          <path d="M0 810 C 360 810 720 780 1440 720" stroke="rgba(37,99,235,0.06)" strokeWidth="40" strokeLinecap="round" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 gap-10 lg:gap-16 lg:grid-cols-2 items-center">
          {/* Left: message + CTAs */}
          <div className="text-center lg:text-left max-w-xl">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary-600 dark:text-primary-400 mb-4 bg-primary-50 dark:bg-primary-900/20 px-4 py-1.5 rounded-full border border-primary-200 dark:border-primary-800/60">
              OOPS! WRONG TURN
            </span>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white leading-tight mb-4" id="not-found-title">
              Looks like you&apos;ve taken a wrong turn.
            </h1>

            <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
              We couldn&apos;t find the page you&apos;re looking for. It may have moved, or the link might be incorrect.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">
              <Link
                to="/"
                className="btn-primary inline-flex items-center justify-center gap-2 text-base min-w-[160px]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to Home
              </Link>

              <Link
                to="/parking"
                className="btn-secondary inline-flex items-center justify-center gap-2 text-base min-w-[160px]"
              >
                Explore Parking
              </Link>
            </div>
          </div>

          {/* Right: parking illustration */}
          <div className="flex justify-center lg:justify-end">
            <div
              className="relative p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-dark-border/70 bg-white/70 dark:bg-dark-card/40 backdrop-blur-sm shadow-lg"
              style={{ boxShadow: '0 20px 40px -20px rgba(0,0,0,0.25)' }}
            >
              <ParkingIllustration />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
