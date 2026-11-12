import { streamText } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";

process.on("unhandledRejection", (error) => console.log("unhandled:", error));

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

const result = streamText({
  model: new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Hello" },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
      ]),
    }),
  }),
  prompt: "Hi",
  experimental_transform: ({ stopStream }) =>
    new TransformStream({
      transform(part, controller) {
        controller.enqueue(part);
        if (part.type === "finish-step") stopStream();
      },
    }),
  onStepEnd: () => console.log("onStepEnd"),
  onEnd: () => console.log("onEnd"),
});

for await (const part of result.fullStream) console.log(part.type);
