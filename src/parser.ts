import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { makeFileName } from "./filename";

/**
 * Stream-based CAL parser and splitter
 *
 * Parsing strategy:
 * - Treat lines that start with `OBJECT <Type> <Id> <Name>` as object headers.
 * - On each header, start a new output file and write subsequent lines until the next header.
 * - Use Node.js streams and readline to handle very large files efficiently.
 * - Avoid loading the entire file into memory; write line-by-line.
 */

export interface SplitStats {
  objectCount: number;
}

export interface ObjectHeader {
  type: string;
  id: string;
  name: string;
}

function parseHeader(line: string): ObjectHeader | null {
  // Remove BOM if present and normalize whitespace
  const cleaned = line.replace(/^\uFEFF/, "").trim();
  const match = /^OBJECT\s+([A-Za-z]+)\s+(\d+)(?:\s+(.*))?$/.exec(cleaned);
  if (!match) return null;
  const type = match[1];
  const id = match[2];
  const name = (match[3] || "").trim();
  return { type, id, name };
}

/**
 * Splits a CAL export file into per-object files under `outputDir`.
 *
 * @param inputPath Absolute path to the CAL export file.
 * @param outputDir Directory to write the split files to. Will be created.
 * @param signal Optional AbortSignal for cancellation.
 */
export async function splitCalFile(
  inputPath: string,
  outputDir: string,
  signal?: AbortSignal,
  outputExtension: string = "txt"
): Promise<SplitStats> {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const readStream = fs.createReadStream(inputPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

  let current: { header: ObjectHeader; ws: fs.WriteStream } | null = null;
  let objectCount = 0;
  let aborted = false;

  const onAbort = () => {
    aborted = true;
    try { rl.close(); } catch {}
    try { readStream.destroy(); } catch {}
    if (current) {
      try { current.ws.end(); } catch {}
      current = null;
    }
  };

  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    for await (const line of rl) {
      if (aborted) break;

      const header = parseHeader(line);
      if (header) {
        // Close previous object stream if any
        if (current) {
          try { current.ws.end(); } catch {}
          current = null;
        }

        // Start a new object file
        const filename = makeFileName(
          header.type,
          header.id,
          header.name,
          outputExtension
        );
        const outPath = path.join(outputDir, filename);
        const ws = fs.createWriteStream(outPath, { encoding: "utf8" });
        current = { header, ws };
        objectCount++;

        ws.write(line + "\n");
        continue;
      }

      // Continue writing lines for current object
      if (current) {
        current.ws.write(line + "\n");
      }
    }
  } finally {
    // Ensure final stream is closed
    if (current) {
      try { current.ws.end(); } catch {}
    }

    if (signal) {
      // Best-effort remove listener; ignore type mismatch in TS
      try { signal.removeEventListener("abort", onAbort as any); } catch {}
    }
  }

  return { objectCount };
}
