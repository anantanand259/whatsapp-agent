export async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (['credit_balance_exhausted', 'insufficient_quota'].includes(body.error?.code)) throw new Error('OpenAI API credit or quota is exhausted. Add API credit or check the project billing limits.');
    throw new Error(`Remote service returned HTTP ${response.status}`);
  }
  return response.json();
}
