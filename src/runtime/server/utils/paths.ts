export function readPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  if (path === "$") return source;

  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

export function readFirstPath<T = unknown>(
  source: unknown,
  paths: string[] = [],
): T | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }

  return undefined;
}

export function interpolatePath(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  return Object.entries(params).reduce((current, [key, value]) => {
    return current.replace(`:${key}`, encodeURIComponent(String(value ?? "")));
  }, path);
}
