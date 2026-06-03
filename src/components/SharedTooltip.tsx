import { useMemo } from "react";
import {
  formatTooltipDelta,
  formatNumber,
  formatTooltipGrowthPercent,
  getTooltipGrowthMetadata,
} from "../chartUtils";
import type { ChartRow } from "../types";

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: ChartRow;
};

type SharedTooltipProps = {
  active?: boolean;
  isPinned?: boolean;
  label?: string;
  onClearPinned?: () => void;
  payload?: TooltipPayloadItem[];
  valueFormatter?: (value: number) => string;
};

function SharedTooltip({
  active,
  isPinned = false,
  label,
  onClearPinned,
  payload,
  valueFormatter = formatNumber,
}: SharedTooltipProps) {
  const values = useMemo(() => {
    if (!payload) {
      return [];
    }

    return payload
      .filter((item) => typeof item.value === "number")
      .map((item) => {
        const dataKey = String(item.dataKey ?? "");
        const growth = getTooltipGrowthMetadata(item.payload)?.[dataKey];

        return {
          name: String(item.name ?? item.dataKey ?? ""),
          value: Number(item.value),
          color: item.color,
          growth,
        };
      })
      .sort((left, right) => right.value - left.value);
  }, [payload]);

  if (!active || values.length === 0) {
    return null;
  }

  return (
    <div className="tooltip">
      <div className="tooltip__header">
        <span>{label}</span>
        {isPinned && onClearPinned ? (
          <button
            type="button"
            className="tooltip__close"
            aria-label="Close pinned tooltip"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClearPinned();
            }}
          >
            x
          </button>
        ) : null}
      </div>
      <div className="tooltip__body">
        {values.map((item) => (
          <div className="tooltip__row" key={item.name}>
            <span
              className="tooltip__swatch"
              style={{ backgroundColor: item.color }}
            />
            <span className="tooltip__name">{item.name}</span>
            <span className="tooltip__value">
              <span>{valueFormatter(item.value)}</span>
              {item.growth ? (
                <span className="tooltip__growth">
                  {item.growth.label}: {formatTooltipGrowthPercent(item.growth.value)} (
                  {formatTooltipDelta(item.growth.delta)})
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SharedTooltip;
