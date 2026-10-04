#!/usr/bin/env node

import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runAgent } from "./agent.js";

console.log("MyAgent");
console.log('Type "exit" to quit.\n');

const rl = createInterface({
  input,
  output,
});

while (true) {
  const prompt = await rl.question("> ");

  if (prompt.trim().toLowerCase() === "exit") {
    break;
  }

  if (!prompt.trim()) {
    continue;
  }

  await runAgent(prompt);
  console.log();
}

rl.close();