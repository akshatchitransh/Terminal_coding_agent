
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// The container's working directory should be /workspace.
const ROOT = path.resolve(process.env.WORKSPACE ?? process.cwd());

function isInsideRoot(fullPath: string): boolean {
  const relative = path.relative(ROOT, fullPath);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

// Reject paths outside the workspace and symlinks in the path.
// This is an additional safeguard, not a substitute for Docker isolation.
async function safePath(filePath: string): Promise<string> {
  const fullPath = path.resolve(ROOT, filePath);

  if (!isInsideRoot(fullPath)) {
    throw new Error("Access denied: path is outside the project");
  }

  const relative = path.relative(ROOT, fullPath);
  const parts = relative ? relative.split(path.sep) : [];
  let current = ROOT;

  for (const part of parts) {
    current = path.join(current, part);

    try {
      const stat = await fs.lstat(current);

      if (stat.isSymbolicLink()) {
        throw new Error(
          `Access denied: symbolic links are not allowed (${part})`
        );
      }
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        // The remaining path may not exist yet (e.g. a new file).
        break;
      }

      throw error;
    }
  }

  return fullPath;
}

export async function listFiles(directory = ".") {
  const dir = await safePath(directory);
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? "directory" : "file",
  }));
}

export async function readFile(filePath: string) {
  const fullPath = await safePath(filePath);
  return fs.readFile(fullPath, "utf-8");
}

export async function writeFile(filePath: string, content: string) {
  const fullPath = await safePath(filePath);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  // "wx" creates a new file and fails if it already exists.
  // This avoids accidentally overwriting an existing file.
  await fs.writeFile(fullPath, content, {
    encoding: "utf-8",
    flag: "wx",
  });

  return `File created successfully: ${filePath}`;
}

export async function editFile(
  filePath: string,
  oldText: string,
  newText: string
) {
  const fullPath = await safePath(filePath);
  const content = await fs.readFile(fullPath, "utf-8");

  if (!content.includes(oldText)) {
    throw new Error(`Could not find the specified text in ${filePath}`);
  }

  const updatedContent = content.replace(oldText, newText);

  await fs.writeFile(fullPath, updatedContent, "utf-8");

  return `File edited successfully: ${filePath}`;
}


export async function runCommand(command: string) {
  const sandboxUrl = process.env.SANDBOX_URL;
  const token = process.env.SANDBOX_TOKEN;

  if (!sandboxUrl || !token) {
    return {
      stdout: "",
      stderr: "Sandbox is not configured. Check SANDBOX_URL and SANDBOX_TOKEN.",
      exitCode: 1,
    };
  }

  try {
    const response = await fetch(`${sandboxUrl}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(35_000),
    });

    const result = (await response.json()) as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      error?: string;
    };

    if (!response.ok) {
      return {
        stdout: "",
        stderr: result.error ?? `Sandbox returned HTTP ${response.status}`,
        exitCode: 1,
      };
    }

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 1,
    };
  } catch (error: unknown) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}
