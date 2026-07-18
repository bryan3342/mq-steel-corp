// Single swappable seam. To revert, restore the 70B id below.
const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
// const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';  // previous model
export async function callModel(env, { system, messages }) {
  const res = await env.AI.run(MODEL, {
    messages: [{ role: 'system', content: system }, ...messages],
    max_tokens: 1024,
    temperature: 0.3,
  });
  const text = res?.response ?? '';
  if (!text) throw new Error('empty model response');
  return text;
}
