/**
 * Where backups actually live.
 *
 * The same seam as the health adapter: everything above this file is pure and
 * tested, and this is the one place that touches the device. In a browser it
 * reports itself unavailable and the UI says so because there is no way to write
 * to a folder unattended from a web page, the manual export button is the web
 * answer and it already exists.
 *
 * The plugin is reached through Capacitor's global registry rather than an
 * import of "@capacitor/filesystem". A bare module specifier cannot be resolved
 * in a webview at runtime, which is exactly the bug that left Health Connect
 * silently dead, so the registry is the only reliable route.
 */

import { BACKUP_DIR, listBackups, type BackupFile } from "./plan";

/** Android's shared Documents folder, so the file is reachable from Files. */
const DIRECTORY = "DOCUMENTS";
const ENCODING = "utf8";

interface FilesystemPlugin {
  writeFile(options: {
    path: string;
    data: string;
    directory?: string;
    encoding?: string;
    recursive?: boolean;
  }): Promise<{ uri: string }>;
  readFile(options: {
    path: string;
    directory?: string;
    encoding?: string;
  }): Promise<{ data: string | Blob }>;
  deleteFile(options: { path: string; directory?: string }): Promise<void>;
  readdir(options: {
    path: string;
    directory?: string;
  }): Promise<{ files: { name: string; size?: number; type?: string }[] }>;
  mkdir(options: { path: string; directory?: string; recursive?: boolean }): Promise<void>;
}

function plugin(): FilesystemPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor;
  return (cap?.Plugins?.Filesystem as FilesystemPlugin | undefined) ?? null;
}

export const backupsAvailable = () => plugin() !== null;

/** Create the folder if it is not there. Already existing is not an error. */
async function ensureDir(fs: FilesystemPlugin) {
  try {
    await fs.mkdir({ path: BACKUP_DIR, directory: DIRECTORY, recursive: true });
  } catch {
    // Almost always "already exists", which is the desired state anyway. A real
    // permission failure surfaces on the write that follows.
  }
}

/** Write one backup. Returns its filename, or null if it could not be written. */
export async function writeBackup(name: string, json: string): Promise<string | null> {
  const fs = plugin();
  if (!fs) return null;

  try {
    await ensureDir(fs);
    await fs.writeFile({
      path: `${BACKUP_DIR}/${name}`,
      data: json,
      directory: DIRECTORY,
      encoding: ENCODING,
      recursive: true,
    });
    return name;
  } catch {
    return null;
  }
}

/** Every backup in the folder, newest first. Empty when unavailable. */
export async function readBackupList(): Promise<BackupFile[]> {
  const fs = plugin();
  if (!fs) return [];

  try {
    const { files } = await fs.readdir({ path: BACKUP_DIR, directory: DIRECTORY });
    return listBackups(
      files.filter((f) => f.type !== "directory").map((f) => ({ name: f.name, size: f.size })));
  } catch {
    // No folder yet, which is indistinguishable from no backups.
    return [];
  }
}

/** The JSON text of one backup, or null. */
export async function readBackup(name: string): Promise<string | null> {
  const fs = plugin();
  if (!fs) return null;

  try {
    const { data } = await fs.readFile({
      path: `${BACKUP_DIR}/${name}`,
      directory: DIRECTORY,
      encoding: ENCODING,
    });
    // With an encoding set the plugin returns a string; without one, a Blob.
    return typeof data === "string" ? data : await data.text();
  } catch {
    return null;
  }
}

/** Delete the named backups. Returns how many went. */
export async function deleteBackups(names: string[]): Promise<number> {
  const fs = plugin();
  if (!fs) return 0;

  let gone = 0;
  for (const name of names) {
    try {
      await fs.deleteFile({ path: `${BACKUP_DIR}/${name}`, directory: DIRECTORY });
      gone++;
    } catch {
      // Leave the rest of the prune to proceed.
    }
  }
  return gone;
}
