import type { ChartValueMode } from "./chartUtils";
import type { Granularity } from "./types";

export const chartStateParamName = "s";

export type EncodedSelectionDelta = {
  r: string[];
};

export type ChartUrlValue = string | string[] | EncodedSelectionDelta;

export type ChartUrlState = Record<string, ChartUrlValue>;

const granularityTokens: Record<Granularity, string> = {
  monthly: "m",
  yearly: "y",
};

const valueModeTokens: Record<ChartValueMode, string> = {
  value: "v",
  monthlyGrowth: "mg",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isChartUrlValue(value: unknown): value is ChartUrlValue {
  if (typeof value === "string") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string");
  }

  return (
    isPlainObject(value) &&
    Array.isArray(value.r) &&
    value.r.every((item) => typeof item === "string")
  );
}

function normalizeChartUrlState(value: unknown): ChartUrlState | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const state: ChartUrlState = {};

  for (const [key, item] of Object.entries(value)) {
    if (isChartUrlValue(item)) {
      state[key] = item;
    }
  }

  return state;
}

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

export function encodeChartUrlState(state?: ChartUrlState) {
  if (!state) {
    return undefined;
  }

  const entries = Object.entries(state);

  if (entries.length === 0) {
    return undefined;
  }

  return toBase64Url(JSON.stringify(Object.fromEntries(entries)));
}

export function decodeChartUrlState(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeChartUrlState(JSON.parse(fromBase64Url(value)));
  } catch {
    return undefined;
  }
}

export function getChartUrlState(search: string) {
  return decodeChartUrlState(new URLSearchParams(search).get(chartStateParamName)) ?? {};
}

export function setChartUrlState(url: URL, state?: ChartUrlState) {
  url.searchParams.delete(chartStateParamName);

  const encodedState = encodeChartUrlState(state);

  if (encodedState) {
    url.searchParams.set(chartStateParamName, encodedState);
  }
}

export function encodeGranularity(
  granularity: Granularity,
  defaultGranularity: Granularity = "monthly",
) {
  return granularity === defaultGranularity ? undefined : granularityTokens[granularity];
}

export function decodeGranularity(
  state: ChartUrlState | undefined,
  key: string,
  defaultGranularity: Granularity = "monthly",
) {
  const value = state?.[key];

  if (value === granularityTokens.yearly) {
    return "yearly";
  }

  if (value === granularityTokens.monthly) {
    return "monthly";
  }

  return defaultGranularity;
}

export function encodeValueMode(
  valueMode: ChartValueMode,
  defaultValueMode: ChartValueMode = "value",
) {
  return valueMode === defaultValueMode ? undefined : valueModeTokens[valueMode];
}

export function decodeValueMode(
  state: ChartUrlState | undefined,
  key: string,
  defaultValueMode: ChartValueMode = "value",
) {
  const value = state?.[key];

  if (value === valueModeTokens.monthlyGrowth) {
    return "monthlyGrowth";
  }

  if (value === valueModeTokens.value) {
    return "value";
  }

  return defaultValueMode;
}

export function encodeString(value: string, defaultValue = "") {
  return value === defaultValue ? undefined : value;
}

export function decodeString(
  state: ChartUrlState | undefined,
  key: string,
  defaultValue = "",
  allowedValues?: readonly string[],
) {
  const value = state?.[key];

  if (typeof value !== "string") {
    return defaultValue;
  }

  if (allowedValues && !allowedValues.includes(value)) {
    return defaultValue;
  }

  return value;
}

export function areStringArraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function encodeStringArray(values: readonly string[], defaults: readonly string[] = []) {
  return areStringArraysEqual(values, defaults) ? undefined : [...values];
}

export function decodeStringArray(
  state: ChartUrlState | undefined,
  key: string,
  defaults: readonly string[],
  allowedValues: readonly string[],
) {
  const value = state?.[key];

  if (!Array.isArray(value)) {
    return [...defaults];
  }

  const allowedSet = new Set(allowedValues);
  return value.filter((item) => allowedSet.has(item));
}

export function encodeSelection(
  selectedValues: readonly string[],
  defaultValues: readonly string[],
) {
  if (areStringArraysEqual(selectedValues, defaultValues)) {
    return undefined;
  }

  const selectedSet = new Set(selectedValues);
  const defaultSet = new Set(defaultValues);
  const removedValues = defaultValues.filter((value) => !selectedSet.has(value));
  const addedValues = selectedValues.filter((value) => !defaultSet.has(value));

  if (addedValues.length === 0 && removedValues.length < selectedValues.length) {
    return { r: removedValues };
  }

  return [...selectedValues];
}

export function decodeSelection(
  state: ChartUrlState | undefined,
  key: string,
  defaultValues: readonly string[],
  allowedValues: readonly string[],
) {
  const value = state?.[key];
  const allowedSet = new Set(allowedValues);

  if (Array.isArray(value)) {
    return value.filter((item) => allowedSet.has(item));
  }

  if (isPlainObject(value) && Array.isArray(value.r)) {
    const removedSet = new Set(
      value.r.filter((item): item is string => typeof item === "string"),
    );

    return defaultValues.filter(
      (item) => allowedSet.has(item) && !removedSet.has(item),
    );
  }

  return [...defaultValues];
}
