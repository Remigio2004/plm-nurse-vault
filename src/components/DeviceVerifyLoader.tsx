import seal from "@/assets/Nursing logo.png";

export function DeviceVerifyLoader({ label = "Verifying device…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface px-4"
    >
      <div className="relative h-52 w-52">
        {/* soft halo sa likod ng logo */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card shadow-lift"
        />

        {/* outer arc: gold, mabagal, clockwise */}
        <svg
          viewBox="0 0 208 208"
          aria-hidden
          className="nv-spin-slow absolute inset-0 h-full w-full"
        >
          <circle
            cx="104"
            cy="104"
            r="100"
            fill="none"
            className="stroke-gold/15"
            strokeWidth="2"
          />
          <circle
            cx="104"
            cy="104"
            r="100"
            fill="none"
            pathLength={100}
            strokeDasharray="30 70"
            strokeLinecap="round"
            strokeWidth="3"
            className="stroke-gold"
          />
        </svg>

        {/* middle arc: deep green, mabilis, counter-clockwise */}
        <svg
          viewBox="0 0 208 208"
          aria-hidden
          className="nv-spin-reverse absolute inset-0 h-full w-full"
        >
          <circle
            cx="104"
            cy="104"
            r="86"
            fill="none"
            className="stroke-primary/10"
            strokeWidth="2"
          />
          <circle
            cx="104"
            cy="104"
            r="86"
            fill="none"
            pathLength={100}
            strokeDasharray="22 78"
            strokeLinecap="round"
            strokeWidth="3"
            className="stroke-primary"
          />
        </svg>

        {/* inner arc: light green, katamtaman, clockwise */}
        <svg
          viewBox="0 0 208 208"
          aria-hidden
          className="nv-spin-medium absolute inset-0 h-full w-full"
        >
          <circle
            cx="104"
            cy="104"
            r="72"
            fill="none"
            className="stroke-accent/15"
            strokeWidth="2"
          />
          <circle
            cx="104"
            cy="104"
            r="72"
            fill="none"
            pathLength={100}
            strokeDasharray="16 84"
            strokeLinecap="round"
            strokeWidth="2.5"
            className="stroke-accent"
          />
        </svg>

        {/* logo */}
        <img
          src={seal}
          alt="PLM College of Nursing seal"
          className="nv-pulse absolute inset-0 m-auto h-24 w-24 object-contain"
        />
      </div>

      <p className="text-sm font-medium tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
