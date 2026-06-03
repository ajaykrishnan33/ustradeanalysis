import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PinnedTooltipIndex = number | string;

type PinnedTooltipState = {
  index: PinnedTooltipIndex;
  label: string | number;
};

type ChartClickState = {
  activeTooltipIndex?: PinnedTooltipIndex | null;
  activeIndex?: PinnedTooltipIndex | null;
  activeLabel?: string | number;
  isTooltipActive?: boolean;
};

type UsePinnedTooltipOptions = {
  initialPinnedLabel?: string;
  rows: readonly { periodLabel: string }[];
  stateKey?: string;
};

const tooltipPosition = { y: 16 };

function getPinnedTooltipFromLabel(
  rows: readonly { periodLabel: string }[],
  label?: string,
): PinnedTooltipState | null {
  if (!label) {
    return null;
  }

  const rowIndex = rows.findIndex((row) => row.periodLabel === label);

  return rowIndex >= 0
    ? {
        index: rowIndex,
        label,
      }
    : null;
}

function usePinnedTooltip({
  initialPinnedLabel,
  rows,
  stateKey,
}: UsePinnedTooltipOptions) {
  const [pinnedTooltip, setPinnedTooltip] = useState<PinnedTooltipState | null>(
    () => getPinnedTooltipFromLabel(rows, initialPinnedLabel),
  );
  const dismissedStateKeyRef = useRef<string | null>(null);
  const isPinned = pinnedTooltip !== null;

  useEffect(() => {
    if (dismissedStateKeyRef.current !== (stateKey ?? null)) {
      dismissedStateKeyRef.current = null;
    }

    const nextPinnedTooltip = getPinnedTooltipFromLabel(rows, initialPinnedLabel);

    if (!nextPinnedTooltip) {
      setPinnedTooltip(null);
      return;
    }

    if (stateKey && dismissedStateKeyRef.current === stateKey) {
      return;
    }

    setPinnedTooltip(nextPinnedTooltip);
  }, [initialPinnedLabel, rows, stateKey]);

  const handleChartClick = useCallback(
    (nextState: ChartClickState) => {
      if (isPinned || !nextState.isTooltipActive) {
        return;
      }

      const index = nextState.activeTooltipIndex ?? nextState.activeIndex;

      if (index == null || nextState.activeLabel == null) {
        return;
      }

      setPinnedTooltip({
        index,
        label: nextState.activeLabel,
      });
      dismissedStateKeyRef.current = null;
    },
    [isPinned],
  );

  const clearPinnedTooltip = useCallback(() => {
    setPinnedTooltip(null);
    dismissedStateKeyRef.current = stateKey ?? null;
  }, [stateKey]);

  const tooltipProps = useMemo(
    () => ({
      position: tooltipPosition,
      ...(isPinned
        ? {
            active: true,
            defaultIndex: pinnedTooltip.index,
            trigger: "click" as const,
          }
        : {}),
    }),
    [isPinned, pinnedTooltip],
  );

  const getChartWrapperClassName = useCallback(
    (className: string) =>
      isPinned ? `${className} chart-wrap--tooltip-pinned` : className,
    [isPinned],
  );

  return {
    clearPinnedTooltip,
    getChartWrapperClassName,
    handleChartClick,
    isPinned,
    pinnedLabel: pinnedTooltip?.label,
    tooltipProps,
  };
}

export default usePinnedTooltip;
