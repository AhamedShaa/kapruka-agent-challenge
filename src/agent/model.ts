import { ChatOpenAI } from '@langchain/openai';

/**
 * Shared model construction so the main agent (bound with tools, in graph.ts)
 * and the reactive turn (bare, no tools — see reactiveTurn.ts) read the same
 * env-driven config and never drift out of sync with each other.
 */
export function createChatModel(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5',
    temperature: 0.7,
    streaming: true,
    configuration: { baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1' },
  });
}
