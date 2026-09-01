/** Normalize CJS default exports under NodeNext / mixed ESM installs (e.g. Vercel). */
export function esmDefault<T>(mod: T | { default: T }): T {
  if (typeof mod === "function" || (mod && typeof mod !== "object")) {
    return mod as T;
  }
  const withDefault = mod as { default?: T };
  if (withDefault.default !== undefined) {
    return withDefault.default;
  }
  return mod as T;
}

export function esmDefaultFn<T extends (...args: never[]) => unknown>(
  mod: T | { default: T }
): T {
  const resolved = esmDefault(mod);
  if (typeof resolved !== "function") {
    throw new Error("Expected module default export to be a function");
  }
  return resolved as T;
}
