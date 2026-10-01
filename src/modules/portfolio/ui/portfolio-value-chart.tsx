import type { PortfolioHistoryPoint } from "@/modules/portfolio/application/get-portfolio-overview";
import { formatBrl, formatMonth } from "@/modules/portfolio/presentation/portfolio-format";

const WIDTH = 760;
const HEIGHT = 220;
const PADDING_X = 10;
const PADDING_Y = 18;

export function PortfolioValueChart({ history }: { history: PortfolioHistoryPoint[] }) {
  const points = history.slice(-12);
  const values = points.map((point) => point.totalBrl);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, 1);
  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1
        ? WIDTH / 2
        : PADDING_X + (index / (points.length - 1)) * (WIDTH - PADDING_X * 2);
    const y =
      PADDING_Y +
      (1 - (point.totalBrl - minimum) / spread) * (HEIGHT - PADDING_Y * 2);

    return { ...point, x, y };
  });
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${coordinates.at(-1)?.x ?? WIDTH} ${HEIGHT} L ${coordinates[0]?.x ?? 0} ${HEIGHT} Z`;
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return (
    <div>
      <div className="h-[230px] w-full">
        <svg
          aria-label={`Evolução do patrimônio de ${formatBrl(minimum)} a ${formatBrl(maximum)}`}
          className="h-full w-full overflow-visible"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <linearGradient id="portfolio-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.2, 0.5, 0.8].map((position) => (
            <line
              key={position}
              x1="0"
              x2={WIDTH}
              y1={HEIGHT * position}
              y2={HEIGHT * position}
              stroke="var(--border)"
              strokeDasharray="3 7"
            />
          ))}
          <path d={areaPath} fill="url(#portfolio-area)" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.25"
          />
          {coordinates.map((point, index) => (
            <circle
              key={point.date.toISOString()}
              cx={point.x}
              cy={point.y}
              fill={index === coordinates.length - 1 ? "var(--primary)" : "var(--card)"}
              r={index === coordinates.length - 1 ? 4.5 : 2.25}
              stroke="var(--primary)"
              strokeWidth="1.5"
            >
              <title>{`${formatMonth(point.date)}: ${formatBrl(point.totalBrl)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
        {labelIndexes.map((index) => (
          <span key={points[index]?.date.toISOString()}>{formatMonth(points[index].date, true)}</span>
        ))}
      </div>
    </div>
  );
}
