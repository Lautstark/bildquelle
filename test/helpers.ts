import { openDB } from 'idb';

/** A File as a directory picker would hand it over, complete with its relative path. */
export function fileAt(path: string, bytes = 'png-bytes'): File {
  const file = new File([bytes], path.split('/').pop() ?? path, { type: 'image/png' });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

/** Every value the package has persisted, keyed by store. */
export async function dumpDatabase(): Promise<Record<string, unknown[]>> {
  const db = await openDB('bildquelle');
  const out: Record<string, unknown[]> = {};
  for (const name of Array.from(db.objectStoreNames)) {
    out[name] = await db.getAll(name);
  }
  db.close();
  return out;
}

/**
 * Paths to anything that looks like image data. Used to assert that a METACOM
 * session leaves no pixels behind.
 */
export function findBytes(value: unknown, path = '$'): string[] {
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return [path];
  }
  if (typeof value === 'string' && /^(data:|blob:)/i.test(value)) return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => findBytes(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => findBytes(v, `${path}.${k}`));
  }
  return [];
}
