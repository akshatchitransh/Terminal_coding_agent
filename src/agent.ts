import Groq from "groq-sdk";
import dotenv from "dotenv";
import { Command } from "commander";

import {
  listFiles,
  readFile,
  writeFile,
  editFile,
  runCommand,
} from "./tools.js";

dotenv.config();

/**
 * Enable detailed request/tool tracing by setting DEBUG_LLM=true in .env.
 * Be careful: tool results can contain source code, file contents, or secrets.
 */
const DEBUG_LLM = process.env.DEBUG_LLM === "true";

function debugLog(label: string, data: unknown): void {
  if (!DEBUG_LLM) return;

  console.log(`\n========== ${label} ==========`);

  console.dir(data, {
    depth: null,
    colors: true,
    maxArrayLength: null,
    maxStringLength: null,
  });

  console.log(`========== END ${label} ==========\n`);
}

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("GROQ_API_KEY is not set in .env");
}

const groq = new Groq({ apiKey });

const tools = [
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description:
        "List files and directories inside the current project.",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description:
              "Directory to list. Defaults to the project root.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the complete contents of a file.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path of the file to read.",
          },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Create a file or completely replace its contents.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path of the file.",
          },
          content: {
            type: "string",
            description: "Complete content to write.",
          },
        },
        required: ["filePath", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_file",
      description:
        "Replace an exact piece of text inside an existing file.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path of the file.",
          },
          oldText: {
            type: "string",
            description: "Exact existing text.",
          },
          newText: {
            type: "string",
            description: "Replacement text.",
          },
        },
        required: ["filePath", "oldText", "newText"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description:
        'Execute one shell command as a single string, for example "pwd" or "ls -la". Do not pass command as an array.',
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              'A single shell command string, e.g. "pwd". Never use an array.',
          },
        },
        required: ["command"],
      },
    },
  },
];

async function executeTool(
  name: string,
  args: any,
): Promise<unknown> {
  console.log(`\n[tool] ${name}`);
  debugLog("TOOL ARGUMENTS", { name, arguments: args });

  switch (name) {
    case "list_files":
      return await listFiles(args.directory ?? ".");

    case "read_file":
      return await readFile(args.filePath);

    case "write_file":
      return await writeFile(args.filePath, args.content);

    case "edit_file":
      return await editFile(
        args.filePath,
        args.oldText,
        args.newText,
      );

    case "run_command":
      return await runCommand(args.command);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Calls Groq with retry support.
 * Each successful API response is logged when DEBUG_LLM=true.
 */
async function callGroqWithRetry(messages: any[]) {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n[LLM] Attempt ${attempt}/${maxRetries}`);

      const startedAt = Date.now();

      const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0,
      });

      const message = response.choices[0]?.message;

      debugLog("LLM RESPONSE", {
        durationMs: Date.now() - startedAt,
        content: message?.content,
        tool_calls: message?.tool_calls?.map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        })),
        finish_reason: response.choices[0]?.finish_reason,
      });

      return response;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        `\n[LLM ERROR] Attempt ${attempt}/${maxRetries}`,
      );
      console.error(errorMessage);

      debugLog("LLM REQUEST FAILURE", {
        attempt,
        maxRetries,
        error: errorMessage,
      });

      if (attempt === maxRetries) {
        throw new Error(
          `LLM failed after ${maxRetries} attempts: ${errorMessage}`,
        );
      }

      messages.push({
        role: "user",
        content: `
The previous LLM request failed.

Error:
${errorMessage}

The request did not complete successfully.
Do not assume that the failed operation happened.
Check the current project state with tools if necessary.
Continue from whatever work has actually been completed.
`,
      });

      const delay = attempt * 2000;
      console.log(`[LLM] Retrying in ${delay / 1000}s...`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unexpected retry failure.");
}

export async function runAgent(prompt: string) {
  console.log("Agent:", prompt);

  const messages: any[] = [
    {
      role: "system",
      content: `
You are an autonomous terminal coding agent.

You work directly on the user's project.

Rules:
- Inspect the project before making changes.
- Use tools instead of merely describing code.
- Read relevant files before editing them.
- Make the requested changes yourself.
- Run commands when necessary to verify your work.
- If a command produces an error, inspect the error and fix it.
- Continue working until the user's task is complete.
- Do not claim that you created or modified something unless you actually used a tool to do it.

IMPORTANT FILE MODIFICATION RULES:
- Never overwrite an existing file unless the user explicitly asks you to completely replace it.
- Before modifying an existing file, always read it first.
- Use edit_file when modifying an existing file.
- Use write_file only when creating a new file.
- If write_file reports that a file already exists, use read_file and then edit_file.
- Preserve existing code and configuration that is unrelated to the user's request.
- When adding something to an existing file, make the smallest necessary change.
- Never remove existing environment variables from .env unless the user explicitly asks you to remove them.
- Never remove existing dependencies, configuration, routes, functions, or code unless the user explicitly asks for their removal.
- When adding an environment variable, preserve all existing environment variables.
- When modifying package.json, preserve existing dependencies and scripts unless the user explicitly asks to change them.
- Do not recreate an existing project from scratch.
- Prefer incremental modifications over replacing complete files.

For every task:
1. Inspect the relevant project files.
2. Understand the existing implementation.
3. Make the smallest necessary changes.
4. Run relevant commands/tests.
5. Inspect errors if anything fails.
6. Fix the errors.
7. Verify the final result.
`,
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const maxIterations = 15;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(
      `\n[AGENT] Iteration ${iteration + 1}/${maxIterations}`,
    );

    const response = await callGroqWithRetry(messages);
    const message = response.choices[0]?.message;

    if (!message) {
      throw new Error("Groq returned no message.");
    }

    // Preserve the assistant response, including tool-call metadata,
    // in the conversation sent to Groq on the next iteration.
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log("\nGroq:\n");
      console.log(message.content ?? "");
      debugLog("AGENT FINISHED", {
        iteration: iteration + 1,
        finishReason: response.choices[0]?.finish_reason,
      });
      return;
    }

    for (const toolCall of message.tool_calls) {
      const functionName = toolCall.function.name;
      let args: any;

      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const result = {
          error: `Invalid JSON tool arguments: ${errorMessage}`,
          is_error: true,
        };

        debugLog("TOOL ARGUMENT PARSE ERROR", {
          name: functionName,
          rawArguments: toolCall.function.arguments,
          error: errorMessage,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify(result),
        });

        continue;
      }

      const toolStartedAt = Date.now();
      let result: unknown;

      debugLog("TOOL EXECUTION STARTED", {
        id: toolCall.id,
        name: functionName,
        arguments: args,
      });

      try {
        result = await executeTool(functionName, args);

        debugLog("TOOL RESULT", {
          id: toolCall.id,
          name: functionName,
          durationMs: Date.now() - toolStartedAt,
          result,
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        result = {
          error: errorMessage,
          is_error: true,
        };

        debugLog("TOOL ERROR", {
          id: toolCall.id,
          name: functionName,
          durationMs: Date.now() - toolStartedAt,
          error: errorMessage,
        });
      }

      // This is the exact result returned to the LLM.
      const toolResultContent = JSON.stringify(result);

      debugLog("TOOL RESULT SENT TO LLM", {
        tool_call_id: toolCall.id,
        name: functionName,
        content: toolResultContent,
      });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: functionName,
        content: toolResultContent,
      });
    }
  }

  console.log("\nAgent stopped: maximum iterations reached.");
  debugLog("AGENT STOPPED", { reason: "maximum iterations reached" });
}

export const agentCommand = new Command("agent")
  .description("Run the coding agent")
  .requiredOption("-p, --prompt <prompt>", "Prompt for the agent")
  .action(async (options) => {
    await runAgent(options.prompt);
  });
