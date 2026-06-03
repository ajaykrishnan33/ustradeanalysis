import { ReferenceLine } from "recharts";

type PinnedTooltipReferenceLineProps = {
  label?: string | number;
};

function PinnedTooltipReferenceLine({ label }: PinnedTooltipReferenceLineProps) {
  if (label == null) {
    return null;
  }

  return (
    <ReferenceLine
      x={label}
      stroke="#0f172a"
      strokeDasharray="3 3"
      strokeWidth={3}
    />
  );
}

export default PinnedTooltipReferenceLine;
