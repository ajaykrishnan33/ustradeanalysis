import { useMemo } from "react";
import { formatNumber } from "../chartUtils";

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
};

type SharedTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  valueFormatter?: (value: number) => string;
};

function SharedTooltip({
  active,
  label,
  payload,
  valueFormatter = formatNumber,
}: SharedTooltipProps) {
  const values = useMemo(() => {
    if (!payload) {
      return [];
    }

    return payload
      .filter((item) => typeof item.value === "number")
      .map((item) => ({
        name: String(item.name ?? item.dataKey ?? ""),
        value: Number(item.value),
        color: item.color,
      }))
      .sort((left, right) => right.value - left.value);
  }, [payload]);

  if (!active || values.length === 0) {
    return null;
  }

  return (
    <div className="tooltip">
      <div className="tooltip__header">{label}</div>
      <div className="tooltip__body">
        {values.map((item) => (
          <div className="tooltip__row" key={item.name}>
            <span
              className="tooltip__swatch"
              style={{ backgroundColor: item.color }}
            />
            <span className="tooltip__name">{item.name}</span>
            <span className="tooltip__value">{valueFormatter(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SharedTooltip;
