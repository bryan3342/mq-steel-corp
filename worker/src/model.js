const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// Single swappable seam. Returns assistant text or throws.
export async function callModel(env, { system, messages }) {
  const res = await env.AI.run(MODEL, {
    messages: [{ role: 'system', content: system }, ...messages],
    max_tokens: 800,
    temperature: 0.3,
  });
  const text = res?.response ?? '';
  if (!text) throw new Error('empty model response');
  return text;
}
