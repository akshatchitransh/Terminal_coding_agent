import { Command } from "commander";
export const modelCommand = new Command("model")
    .description("Select the model to use")
    .option("-m, --model <model>", "model name", "gpt")
    .action((options) => {
    console.log("Selected model:", options.model);
});
//# sourceMappingURL=model.js.map