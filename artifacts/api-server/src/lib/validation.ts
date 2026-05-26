const UINT_REGEX = /^(0|[1-9][0-9]{0,77})$/;

export function isUnsignedIntegerString(value: unknown): value is string {
  return typeof value === "string" && UINT_REGEX.test(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

