import type { ChartValueMode } from "../chartUtils";

type ValueModeToggleProps = {
  valueMode: ChartValueMode;
  onChange: (valueMode: ChartValueMode) => void;
};

function ValueModeToggle({ valueMode, onChange }: ValueModeToggleProps) {
  return (
    <label className="field field--value-mode">
      <span>Units</span>
      <select
        value={valueMode}
        onChange={(event) => onChange(event.target.value as ChartValueMode)}
      >
        <option value="value">US dollars</option>
        <option value="monthlyGrowth">% growth</option>
      </select>
    </label>
  );
}

export default ValueModeToggle;
