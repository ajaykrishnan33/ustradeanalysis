import { ReferenceLine } from "recharts";
import { eventMarkersByGranularity } from "../chartUtils";
import type { Granularity } from "../types";

type EventMarker = (typeof eventMarkersByGranularity)[Granularity][number];

type ReferenceLabelProps = {
  viewBox?: {
    x?: number;
    y?: number;
  };
};

function renderEventLabel(marker: EventMarker) {
  return ({ viewBox }: ReferenceLabelProps) => {
    if (typeof viewBox?.x !== "number" || typeof viewBox.y !== "number") {
      return null;
    }

    const isRight = marker.labelSide === "right";

    return (
      <text
        x={viewBox.x + (isRight ? 8 : -8)}
        y={viewBox.y + 16}
        fill={marker.color}
        fontSize={12}
        fontWeight={800}
        textAnchor={isRight ? "start" : "end"}
      >
        {marker.label}
      </text>
    );
  };
}

type EventReferenceLinesProps = {
  granularity: Granularity;
};

function EventReferenceLines({ granularity }: EventReferenceLinesProps) {
  return (
    <>
      {eventMarkersByGranularity[granularity].map((marker) => (
        <ReferenceLine
          key={marker.key}
          x={marker.periodLabel}
          stroke={marker.color}
          strokeDasharray="4 4"
          strokeWidth={2}
          label={renderEventLabel(marker)}
        />
      ))}
    </>
  );
}

export default EventReferenceLines;
