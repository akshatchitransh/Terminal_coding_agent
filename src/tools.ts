import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const ROOT = process.cwd();

function safePath(filePath: string) {
  const fullPath = path.resolve(ROOT, filePath);

  if (
    fullPath !== ROOT &&
    !fullPath.startsWith(ROOT + path.sep)
  ) {
    throw new Error("Access denied: path is outside the project");
  }

  return fullPath;
}

export async function listFiles(directory = ".") {
  const dir = safePath(directory);

  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  });

  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? "directory" : "file",
  }));
}

export async function readFile(filePath: string) {
  const fullPath = safePath(filePath);

  return await fs.readFile(fullPath, "utf-8");
}

export async function writeFile(
  filePath: string,
  content: string
) {
  const fullPath = safePath(filePath);

  // IMPORTANT:
  // write_file is now CREATE-ONLY.
  // It cannot overwrite an existing file.
  try {
    await fs.access(fullPath);

    throw new Error(
      `File already exists: ${filePath}. ` +
      `Use edit_file to modify an existing file instead of write_file.`
    );
  } catch (error: any) {
    // If the file does not exist, fs.access throws ENOENT.
    // That is the expected case.
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(fullPath), {
    recursive: true,
  });

  await fs.writeFile(
    fullPath,
    content,
    "utf-8"
  );

  return `File created successfully: ${filePath}`;
}

export async function editFile(
  filePath: string,
  oldText: string,
  newText: string
) {
  const fullPath = safePath(filePath);

  const content = await fs.readFile(
    fullPath,
    "utf-8"
  );

  if (!content.includes(oldText)) {
    throw new Error(
      `Could not find the specified text in ${filePath}`
    );
  }

  const updatedContent = content.replace(
    oldText,
    newText
  );

  await fs.writeFile(
    fullPath,
    updatedContent,
    "utf-8"
  );

  return `File edited successfully: ${filePath}`;
}

export async function runCommand(command: string) {
  try {
    const { stdout, stderr } = await execAsync(
      command,
      {
        cwd: ROOT,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error: any) {
    return {
      stdout: error?.stdout ?? "",
      stderr:
        error?.stderr ??
        error?.message ??
        String(error),
      exitCode: error?.code ?? 1,
    };
  }
}