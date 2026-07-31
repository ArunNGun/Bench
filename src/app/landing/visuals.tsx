/**
 * Illustrations for the public page.
 *
 * Drawn as SVG rather than captured as screenshots. They stay sharp at any
 * size, follow light and dark through the same CSS variables the rest of the
 * app uses, cost nothing to ship, and never go stale when a screen is
 * restyled. Each one shows the shape of a real feature rather than decorating
 * the space next to it.
 *
 * All of this renders on the server. There is no state and no interactivity,
 * which is what keeps the page small enough to load instantly on a phone.
 */

/** A phone showing the home screen, for the hero. Built from real markup so the type is crisp. */
export function PhoneMock() {
  return (
    <div className="relative mx-auto w-[268px] select-none" aria-hidden="true">
      <div className="overflow-hidden rounded-[40px] border-[8px] border-[#141d2a] bg-[var(--canvas)] shadow-[0_30px_70px_rgba(15,32,60,0.28)]">
        {/* Status bar */}
        <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[9px] font-semibold text-[var(--muted)]">
          <span>9:41</span>
          <span className="h-[14px] w-[62px] rounded-full bg-[#141d2a]" />
          <span className="tracking-tight">100%</span>
        </div>

        {/* App header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[15px] font-extrabold tracking-tight text-[var(--ink)]">Today</span>
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "var(--grape)" }}
          >
            A
          </span>
        </div>

        <div className="space-y-2 px-3 pb-2">
          {/* Adherence ring */}
          <div className="flex items-center gap-3 rounded-[14px] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)]">
            <svg width="46" height="46" viewBox="0 0 46 46">
              <circle cx="23" cy="23" r="18" fill="none" stroke="var(--sunken)" strokeWidth="6" />
              <circle
                cx="23"
                cy="23"
                r="18"
                fill="none"
                stroke="var(--mint)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={2 * Math.PI * 18 * 0.33}
                transform="rotate(-90 23 23)"
              />
              <text
                x="23"
                y="26.5"
                textAnchor="middle"
                className="font-mono"
                fontSize="11"
                fontWeight="700"
                fill="var(--ink)"
              >
                2/3
              </text>
            </svg>
            <div>
              <p className="text-[11px] font-bold text-[var(--ink)]">Doses today</p>
              <p className="text-[9.5px] text-[var(--muted)]">1 left, due 20:00</p>
            </div>
          </div>

          {/* Next dose */}
          <div className="rounded-[14px] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--ink)]">Retatrutide</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}
              >
                4 mg
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <span
                  key={d}
                  className="h-1.5 flex-1 rounded-full"
                  style={{ background: d < 4 ? "var(--mint)" : "var(--sunken)" }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[9.5px] text-[var(--muted)]">Week 4 of the ladder</p>
          </div>

          {/* Level curve */}
          <div className="rounded-[14px] bg-[var(--card)] p-3 shadow-[var(--shadow-xs)]">
            <p className="text-[11px] font-bold text-[var(--ink)]">Circulating now</p>
            <svg viewBox="0 0 200 54" className="mt-1.5 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="ph-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 46 C 16 46 24 12 44 12 C 64 12 68 40 88 40 C 104 40 110 8 130 8 C 150 8 156 34 176 34 C 188 34 194 28 200 26 L200 54 L0 54 Z"
                fill="url(#ph-fill)"
              />
              <path
                d="M0 46 C 16 46 24 12 44 12 C 64 12 68 40 88 40 C 104 40 110 8 130 8 C 150 8 156 34 176 34 C 188 34 194 28 200 26"
                fill="none"
                stroke="var(--mint)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle cx="200" cy="26" r="3.4" fill="var(--mint)" />
            </svg>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center justify-around border-t border-[var(--line)] bg-[var(--card)] px-2 pb-3 pt-2">
          {[true, false, false, false, false, false].map((active, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: active ? "var(--mint)" : "var(--faint)", opacity: active ? 1 : 0.4 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Shared frame so every feature illustration sits on the same footing. */
function Art({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 400 230"
      className="w-full"
      role="img"
      aria-label={label}
      style={{ maxHeight: 250 }}
    >
      {children}
    </svg>
  );
}

/** A syringe drawn to the graduations of the barrel you picked. */
export function ReconArt() {
  const ticks = Array.from({ length: 21 }, (_, i) => 62 + i * 13.5);
  return (
    <Art label="A syringe barrel with the draw point marked at 23 units">
      <defs>
        <linearGradient id="rc-fluid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--fluid-top)" />
          <stop offset="100%" stopColor="var(--fluid-bottom)" />
        </linearGradient>
      </defs>

      {/* Needle */}
      <rect x="14" y="112" width="44" height="4" rx="2" fill="var(--faint)" />
      <rect x="52" y="105" width="14" height="18" rx="3" fill="var(--line)" />

      {/* Barrel */}
      <rect x="62" y="92" width="272" height="44" rx="9" fill="var(--glass)" stroke="var(--line)" strokeWidth="2" />
      <rect x="64" y="94" width="128" height="40" rx="7" fill="url(#rc-fluid)" />

      {/* Graduations */}
      {ticks.map((x, i) => (
        <line
          key={x}
          x1={x}
          y1="92"
          x2={x}
          y2={i % 5 === 0 ? 108 : 101}
          stroke="var(--muted)"
          strokeWidth={i % 5 === 0 ? 1.8 : 1}
          opacity={i % 5 === 0 ? 0.75 : 0.4}
        />
      ))}

      {/* Plunger */}
      <rect x="188" y="90" width="7" height="48" rx="2" fill="var(--muted)" opacity="0.55" />
      <rect x="195" y="108" width="128" height="12" rx="4" fill="var(--muted)" opacity="0.28" />
      <rect x="330" y="84" width="12" height="60" rx="5" fill="var(--muted)" opacity="0.5" />

      {/* Draw marker */}
      <line x1="192" y1="46" x2="192" y2="88" stroke="var(--mint)" strokeWidth="2" strokeDasharray="4 4" />
      <rect x="146" y="22" width="92" height="28" rx="14" fill="var(--mint)" />
      <text x="192" y="41" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" className="font-mono">
        23 units
      </text>

      {/* Scale pills */}
      <rect x="62" y="164" width="88" height="30" rx="15" fill="var(--mint-soft)" />
      <text x="106" y="184" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--mint-ink)">
        U-100
      </text>
      <rect x="160" y="164" width="80" height="30" rx="15" fill="var(--sunken)" />
      <text x="200" y="184" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--faint)">
        U-40
      </text>
      <text x="256" y="184" fontSize="12.5" fill="var(--muted)">
        2.5x apart
      </text>
    </Art>
  );
}

/** The level curve, with each component of a blend on its own line. */
export function CurveArt() {
  const doses = [40, 118, 196, 274];
  return (
    <Art label="A pharmacokinetic curve with dose marks and the present moment">
      <defs>
        <linearGradient id="cv-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[46, 86, 126, 166].map((y) => (
        <line key={y} x1="24" y1={y} x2="376" y2={y} stroke="var(--line)" strokeWidth="1.4" />
      ))}

      {/* Second component of the blend, modelled separately */}
      <path
        d="M24 158 C 60 158 62 118 96 118 C 130 118 134 146 168 146 C 202 146 206 104 240 104 C 274 104 278 134 312 134 C 340 134 356 126 376 122"
        fill="none"
        stroke="var(--grape)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="7 5"
        opacity="0.75"
      />

      {/* Primary curve */}
      <path
        d="M24 166 C 60 166 62 74 96 74 C 130 74 134 132 168 132 C 202 132 206 56 240 56 C 274 56 278 116 312 116 C 340 116 356 96 376 88 L376 178 L24 178 Z"
        fill="url(#cv-fill)"
      />
      <path
        className="trace"
        d="M24 166 C 60 166 62 74 96 74 C 130 74 134 132 168 132 C 202 132 206 56 240 56 C 274 56 278 116 312 116 C 340 116 356 96 376 88"
        fill="none"
        stroke="var(--mint)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Axis and dose marks */}
      <line x1="24" y1="178" x2="376" y2="178" stroke="var(--line)" strokeWidth="2" />
      {doses.map((x) => (
        <g key={x}>
          <line x1={x} y1="178" x2={x} y2="188" stroke="var(--mint)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx={x} cy="194" r="2.6" fill="var(--mint)" opacity="0.6" />
        </g>
      ))}

      {/* Now */}
      <line x1="376" y1="34" x2="376" y2="178" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="3 4" opacity="0.35" />
      <circle cx="376" cy="88" r="5.5" fill="var(--mint)" stroke="var(--card)" strokeWidth="2.5" />
      <rect x="286" y="16" width="90" height="26" rx="13" fill="var(--mint-soft)" />
      <text x="331" y="34" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--mint-ink)">
        68% of peak
      </text>

      <text x="24" y="216" fontSize="12" fill="var(--faint)">
        each dose logged
      </text>
      <text x="376" y="216" textAnchor="end" fontSize="12" fill="var(--faint)">
        now
      </text>
    </Art>
  );
}

/** Vials from sealed through reconstituted to empty, counted in mass. */
export function StockArt() {
  const vials = [
    { x: 30, fill: 1, cap: "var(--mint)", label: "Sealed", sub: "10 mg" },
    { x: 155, fill: 0.55, cap: "var(--tangerine)", label: "In use", sub: "12 d left" },
    { x: 280, fill: 0, cap: "var(--line)", label: "Empty", sub: "38 doses" },
  ];
  return (
    <Art label="Three vials showing sealed, in use and empty states">
      <defs>
        <linearGradient id="st-fluid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--fluid-top)" />
          <stop offset="100%" stopColor="var(--fluid-bottom)" />
        </linearGradient>
      </defs>

      {vials.map(({ x, fill, cap, label, sub }) => {
        const top = 46;
        const bottom = 158;
        const h = (bottom - top) * fill;
        return (
          <g key={label}>
            {/* Cap and neck */}
            <rect x={x + 22} y="24" width="46" height="16" rx="4" fill={cap} />
            <rect x={x + 28} y="38" width="34" height="10" fill="var(--line)" />
            {/* Body */}
            <rect
              x={x + 14}
              y={top}
              width="62"
              height={bottom - top}
              rx="9"
              fill="var(--glass)"
              stroke="var(--line)"
              strokeWidth="2"
            />
            {fill > 0 && (
              <rect x={x + 16} y={bottom - h} width="58" height={h} rx="7" fill="url(#st-fluid)" />
            )}
            {/* Fill line */}
            {fill > 0 && fill < 1 && (
              <line
                x1={x + 14}
                y1={bottom - h}
                x2={x + 76}
                y2={bottom - h}
                stroke="var(--tangerine)"
                strokeWidth="2"
              />
            )}
            <text x={x + 45} y="182" textAnchor="middle" fontSize="13.5" fontWeight="700" fill="var(--ink)">
              {label}
            </text>
            <text x={x + 45} y="201" textAnchor="middle" fontSize="12" fill="var(--muted)">
              {sub}
            </text>
          </g>
        );
      })}

      {/* Flow arrows */}
      {[124, 249].map((x) => (
        <path
          key={x}
          d={`M${x} 102 l 14 0 m -5 -5 l 5 5 l -5 5`}
          fill="none"
          stroke="var(--faint)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Art>
  );
}

/** Bloodwork plotted against the range from your own report. */
export function LabsArt() {
  const pts = [
    [46, 52],
    [112, 68],
    [178, 96],
    [244, 118],
    [310, 126],
    [366, 130],
  ];
  return (
    <Art label="A blood marker falling into its reference band over time">
      {/* Reference band from your own paperwork */}
      <rect x="24" y="112" width="352" height="52" rx="8" fill="var(--leaf-soft)" />
      <line x1="24" y1="112" x2="376" y2="112" stroke="var(--leaf)" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.7" />
      <line x1="24" y1="164" x2="376" y2="164" stroke="var(--leaf)" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.7" />
      <text x="368" y="106" textAnchor="end" fontSize="11.5" fontWeight="600" fill="var(--leaf-ink)">
        your lab&apos;s range
      </text>

      {/* Trend */}
      <polyline
        className="trace"
        points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--sky)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map(([x, y], i) => (
        <circle
          key={x}
          cx={x}
          cy={y}
          r={i === pts.length - 1 ? 6 : 4.5}
          fill={y > 112 ? "var(--leaf)" : "var(--tangerine)"}
          stroke="var(--card)"
          strokeWidth="2.5"
        />
      ))}

      {/* Marker chip */}
      <rect x="24" y="20" width="96" height="28" rx="14" fill="var(--sky-soft)" />
      <text x="72" y="39" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--sky-ink)">
        HbA1c
      </text>
      <text x="132" y="39" fontSize="12.5" fill="var(--muted)">
        6.8 to 5.4 over 9 months
      </text>

      {/* Dose marks underneath, the point of charting them together */}
      <line x1="24" y1="192" x2="376" y2="192" stroke="var(--line)" strokeWidth="2" />
      {[46, 90, 134, 178, 222, 266, 310, 354].map((x) => (
        <line key={x} x1={x} y1="186" x2={x} y2="198" stroke="var(--mint)" strokeWidth="2.4" strokeLinecap="round" />
      ))}
      <text x="24" y="219" fontSize="12" fill="var(--faint)">
        your doses, on the same axis
      </text>
    </Art>
  );
}

/** Two protocols that quietly add up to one overlap. */
export function StackArt() {
  return (
    <Art label="Two protocols overlapping on the same receptor, raising one warning">
      {/* Protocol A */}
      <rect x="18" y="24" width="168" height="66" rx="16" fill="var(--card)" stroke="var(--line)" strokeWidth="2" />
      <circle cx="44" cy="57" r="11" fill="var(--mint-soft)" />
      <circle cx="44" cy="57" r="4.5" fill="var(--mint)" />
      <text x="64" y="52" fontSize="13.5" fontWeight="700" fill="var(--ink)">
        Retatrutide
      </text>
      <text x="64" y="70" fontSize="12" fill="var(--muted)">
        4 mg weekly
      </text>

      {/* Protocol B */}
      <rect x="214" y="24" width="168" height="66" rx="16" fill="var(--card)" stroke="var(--line)" strokeWidth="2" />
      <circle cx="240" cy="57" r="11" fill="var(--grape-soft)" />
      <circle cx="240" cy="57" r="4.5" fill="var(--grape)" />
      <text x="260" y="52" fontSize="13.5" fontWeight="700" fill="var(--ink)">
        Semaglutide
      </text>
      <text x="260" y="70" fontSize="12" fill="var(--muted)">
        1 mg weekly
      </text>

      {/* Converging */}
      <path
        d="M102 96 C 102 122 200 116 200 138"
        fill="none"
        stroke="var(--faint)"
        strokeWidth="2"
        strokeDasharray="5 5"
      />
      <path
        d="M298 96 C 298 122 200 116 200 138"
        fill="none"
        stroke="var(--faint)"
        strokeWidth="2"
        strokeDasharray="5 5"
      />

      {/* The one warning worth raising */}
      <rect x="52" y="142" width="296" height="64" rx="18" fill="var(--tangerine-soft)" />
      <path
        d="M84 160 l 13 24 l -26 0 Z"
        fill="none"
        stroke="var(--tangerine-ink)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="179" r="1.6" fill="var(--tangerine-ink)" />
      <line x1="84" y1="168" x2="84" y2="175" stroke="var(--tangerine-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <text x="112" y="170" fontSize="13.5" fontWeight="700" fill="var(--tangerine-ink)">
        Two GLP-1 agonists at once
      </text>
      <text x="112" y="190" fontSize="12" fill="var(--tangerine-ink)" opacity="0.85">
        Same receptor, from two protocols
      </text>
    </Art>
  );
}

/** Rotation across sites, with the recent ones resting. */
export function RotationArt() {
  const sites: { x: number; y: number; state: "next" | "resting" | "free" }[] = [
    { x: 176, y: 96, state: "resting" },
    { x: 224, y: 96, state: "free" },
    { x: 176, y: 126, state: "next" },
    { x: 224, y: 126, state: "free" },
    // Deltoids sit on the shoulder itself, inside the outline, not beside it.
    { x: 154, y: 80, state: "resting" },
    { x: 246, y: 80, state: "free" },
    { x: 166, y: 186, state: "free" },
    { x: 234, y: 186, state: "resting" },
  ];
  const colour = {
    next: "var(--mint)",
    resting: "var(--tangerine)",
    free: "var(--faint)",
  } as const;

  return (
    <Art label="A body map with injection sites, showing which are resting and which is next">
      {/* Body */}
      <circle cx="200" cy="34" r="19" fill="var(--sunken)" stroke="var(--line)" strokeWidth="2" />
      <path
        d="M200 56 C 178 56 150 62 142 74 L136 116 L152 120 L156 96 L156 150 C 156 162 160 172 164 210 L188 210 L192 150 L208 150 L212 210 L236 210 C 240 172 244 162 244 150 L244 96 L248 120 L264 116 L258 74 C 250 62 222 56 200 56 Z"
        fill="var(--sunken)"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {sites.map(({ x, y, state }) => (
        <g key={`${x}-${y}`}>
          {state === "next" && (
            <circle cx={x} cy={y} r="16" fill="none" stroke="var(--mint)" strokeWidth="2" opacity="0.4" />
          )}
          <circle
            cx={x}
            cy={y}
            r="9"
            fill={state === "free" ? "var(--card)" : colour[state]}
            stroke={colour[state]}
            strokeWidth="2.4"
            opacity={state === "free" ? 0.55 : 1}
          />
          {state === "next" && (
            <path
              d={`M${x - 4} ${y} l 3 3.5 l 5.5 -6.5`}
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      ))}

      {/* Key */}
      {[
        { cx: 300, cy: 60, c: "var(--mint)", t: "suggested next" },
        { cx: 300, cy: 92, c: "var(--tangerine)", t: "resting" },
        { cx: 300, cy: 124, c: "var(--faint)", t: "available" },
      ].map(({ cx, cy, c, t }) => (
        <g key={t}>
          <circle cx={cx} cy={cy} r="7" fill={c} opacity={c === "var(--faint)" ? 0.5 : 1} />
          <text x={cx + 15} y={cy + 5} fontSize="12.5" fill="var(--muted)">
            {t}
          </text>
        </g>
      ))}
    </Art>
  );
}

/** Data staying put, for the privacy panel. */
export function PrivacyArt() {
  return (
    <svg viewBox="0 0 340 150" className="w-full" role="img" aria-label="Data held on the device, with nothing leaving it">
      {/* Device */}
      <rect x="18" y="26" width="86" height="112" rx="14" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
      <rect x="30" y="42" width="62" height="8" rx="4" fill="rgba(255,255,255,0.55)" />
      <rect x="30" y="58" width="44" height="8" rx="4" fill="rgba(255,255,255,0.35)" />
      <rect x="30" y="74" width="54" height="8" rx="4" fill="rgba(255,255,255,0.35)" />
      <rect x="30" y="90" width="36" height="8" rx="4" fill="rgba(255,255,255,0.35)" />

      {/* Blocked route */}
      <path d="M116 82 L 216 82" stroke="rgba(255,255,255,0.5)" strokeWidth="2.4" strokeDasharray="7 7" strokeLinecap="round" />
      <circle cx="166" cy="82" r="22" fill="rgba(255,255,255,0.16)" />
      <line x1="155" y1="71" x2="177" y2="93" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <line x1="177" y1="71" x2="155" y2="93" stroke="#fff" strokeWidth="3" strokeLinecap="round" />

      {/* Server, unreached */}
      <g opacity="0.4">
        <rect x="238" y="50" width="84" height="26" rx="7" fill="none" stroke="#fff" strokeWidth="2" />
        <rect x="238" y="88" width="84" height="26" rx="7" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="252" cy="63" r="3.4" fill="#fff" />
        <circle cx="252" cy="101" r="3.4" fill="#fff" />
      </g>
      <text x="280" y="136" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.65)">
        no server to reach
      </text>
    </svg>
  );
}
