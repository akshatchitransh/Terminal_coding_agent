
const http = require("node:http");
const { execFile } = require("node:child_process");

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.SANDBOX_TOKEN;

if (!TOKEN) {
  throw new Error("SANDBOX_TOKEN is required");
}

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401);
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  let body = "";

  req.on("data", (chunk) => {
    body += chunk;

    if (body.length > 16384) {
      res.writeHead(413);
      res.end(JSON.stringify({ error: "Request too large" }));
      req.destroy();
    }
  });

  req.on("end", () => {
    let payload;

    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "Invalid JSON" }));
    }

    if (
      typeof payload.command !== "string" ||
      payload.command.trim().length === 0
    ) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "command is required" }));
    }

    execFile(
      "/bin/sh",
      ["-lc", payload.command],
      {
        cwd: "/workspace",
        timeout: 30000,
        maxBuffer: 1000000,
        windowsHide: true,
        env: {
          PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          HOME: "/tmp",
          TMPDIR: "/tmp",
        },
      },
      (error, stdout, stderr) => {
        const exitCode =
          typeof error?.code === "number"
            ? error.code
            : error?.killed
              ? 124
              : error
                ? 1
                : 0;

        if (res.destroyed) return;

        res.writeHead(200);
        res.end(
          JSON.stringify({
            stdout: stdout || "",
            stderr: stderr || (error ? error.message : ""),
            exitCode,
          })
        );
      }
    );
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sandbox executor listening on port ${PORT}`);
});
