import type { Resolver, ResolverSuccess, ResolverError, FieldValues } from "react-hook-form";

interface ZodIssue {
  path: PropertyKey[];
  message: string;
}

interface ZodLike<T> {
  safeParse: (
    data: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: ZodIssue[] } };
}

export function makeZodResolver<T extends FieldValues>(
  schema: ZodLike<T>,
): Resolver<T> {
  return async (data: unknown) => {
    const result = schema.safeParse(data);
    if (result.success) {
      return { values: result.data, errors: {} } as ResolverSuccess<T>;
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path
        .filter(
          (p): p is string | number =>
            typeof p === "string" || typeof p === "number",
        )
        .join(".");
      if (path && !errors[path]) {
        errors[path] = { type: "validation", message: issue.message };
      }
    }
    return { values: {}, errors } as unknown as ResolverError<T>;
  };
}
