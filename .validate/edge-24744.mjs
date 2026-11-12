import { streamText, tool, stepCountIs } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { z } from "zod";
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };
const finish = (r) => ({ type: "finish", finishReason: { unified: r, raw: undefined }, usage });
const textStep = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Hello" }, { type: "text-end", id: "t" }, finish("stop")];
const toolStep = [{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: "c1", toolName: "echo", input: '{"x":1}' }, finish("tool-calls")];
const withTimeout = (p, label) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(label + " timed out")), 2000))]);
async function run(name, steps, stopAt) {
  let calls = 0;
  const result = streamText({
    model: new MockLanguageModelV4({ doStream: async () => ({ stream: convertArrayToReadableStream(steps[calls++]) }) }),
    prompt: "Hi", tools: { echo: tool({ inputSchema: z.object({ x: z.number() }), execute: async ({ x }) => x }) }, stopWhen: stepCountIs(5),
    experimental_transform: ({ stopStream }) => { let n = 0; return new TransformStream({ transform(p, c) { c.enqueue(p); if (p.type === "finish-step" && ++n === stopAt) stopStream(); } }); },
  });
  const types = []; for await (const p of result.fullStream) types.push(p.type);
  const [fr, st, tx] = await withTimeout(Promise.all([result.finishReason, result.steps, result.text]), name);
  console.log(name, "| parts:", types.join(","), "| finishReason:", fr, "| steps:", st.length, "| text:", JSON.stringify(tx), "| model calls:", calls);
}
await run("single step, stop at last finish-step", [textStep], 1);
await run("tool loop, stop after step 1", [toolStep, textStep], 1);
await run("tool loop, stop at last finish-step", [toolStep, textStep], 2);
await new Promise((r) => setTimeout(r, 200));
console.log("done");
