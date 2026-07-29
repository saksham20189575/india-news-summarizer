import fs from "fs";
import path from "path";
import { list, put } from "@vercel/blob";
import type { Briefing } from "./types";

const BLOB_PATHNAME = "latest-summary.json";
const FILE_PATH = path.join(process.cwd(), "data", "latest-summary.json");
const TMP_PATH = path.join(process.cwd(), "data", "latest-summary.json.tmp");

/** True when Vercel Blob credentials are available (token or connected store + OIDC). */
export function hasBlobStorageConfigured(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  // Connected Blob stores on Vercel use BLOB_STORE_ID + VERCEL_OIDC_TOKEN (not always BLOB_READ_WRITE_TOKEN).
  if (process.env.BLOB_STORE_ID) return true;
  return false;
}

function useBlobStorage(): boolean {
  return hasBlobStorageConfigured();
}

function assertWritableStorage(): void {
  if (useBlobStorage()) return;

  if (process.env.VERCEL) {
    throw new Error(
      "Blob storage is not configured on Vercel. Connect a Blob store to this project (Storage → Blob → Connect to Project), then redeploy."
    );
  }
}

async function readFromBlob(): Promise<Briefing | null> {
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const blob = blobs.find((entry) => entry.pathname === BLOB_PATHNAME);
  if (!blob) {
    return null;
  }

  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) {
    return null;
  }

  return (await res.json()) as Briefing;
}

function readFromFile(): Briefing | null {
  if (!fs.existsSync(FILE_PATH)) {
    return null;
  }

  const raw = fs.readFileSync(FILE_PATH, "utf8");
  return JSON.parse(raw) as Briefing;
}

async function writeToBlob(briefing: Briefing): Promise<void> {
  await put(BLOB_PATHNAME, JSON.stringify(briefing, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function writeToFileAtomic(briefing: Briefing): void {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(TMP_PATH, JSON.stringify(briefing, null, 2), "utf8");
  fs.renameSync(TMP_PATH, FILE_PATH);
}

export async function readLatest(): Promise<Briefing | null> {
  if (useBlobStorage()) {
    return readFromBlob();
  }

  return readFromFile();
}

export async function writeLatestAtomic(briefing: Briefing): Promise<void> {
  assertWritableStorage();

  if (useBlobStorage()) {
    await writeToBlob(briefing);
    return;
  }

  writeToFileAtomic(briefing);
}

export function getStorageMode(): "blob" | "file" {
  return useBlobStorage() ? "blob" : "file";
}

export function getStorageDiagnostics() {
  return {
    mode: getStorageMode(),
    hasReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasStoreId: Boolean(process.env.BLOB_STORE_ID),
    onVercel: Boolean(process.env.VERCEL),
  };
}

export { FILE_PATH as LOCAL_DATA_PATH };
