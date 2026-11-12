import type { z } from 'zod';
import { createChatCompletion, RetryableProviderError, type ChatMessage } from '../ai/llmClient.js';
import type { DoctorRuntime, ModelTarget } from '../ai/configStore.js';

export class ConsultError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const parseJson = (content: string): unknown => {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some models wrap JSON in a markdown fence despite JSON mode
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in response');
    return JSON.parse(match[0]);
  }
};

/**
 * Calls the doctor's model and validates the JSON reply against `schema`.
 * Tries the primary model, then the fallback model (or the primary again if
 * there is no fallback) on timeouts, provider errors or unreadable output.
 */
export const completeJson = async <T extends z.ZodType>(
  runtime: DoctorRuntime,
  options: { label: string; schema: T; messages: ChatMessage[]; maxTokens: number; timeoutMs: number; temperature?: number }
): Promise<z.infer<T>> => {
  const attempts: ModelTarget[] = [runtime.primary, runtime.fallback ?? runtime.primary, runtime.primary];
  let lastError: unknown;

  for (const [index, target] of attempts.entries()) {
    // The third attempt is only for requests that never reached the provider (free to retry)
    if (index === 2 && !(lastError instanceof RetryableProviderError && lastError.message === 'Could not reach provider')) break;
    try {
      const result = await createChatCompletion(target.creds, {
        model: target.model,
        messages: options.messages,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        json: true,
        timeoutMs: options.timeoutMs,
      });
      // Server logs only (never sent to the app): usage per model for cost tracking, no patient data
      console.log(
        `[consult] ${options.label} attempt=${index + 1} model=${target.model} in=${result.usage?.prompt_tokens ?? '?'} ` +
          `out=${result.usage?.completion_tokens ?? '?'} cost=${result.usage?.cost ?? '?'} ms=${result.ms}`
      );
      const parsed = options.schema.safeParse(parseJson(result.content));
      if (parsed.success) return parsed.data;
      const issue = parsed.error.issues[0];
      console.warn(`[consult] ${options.label} attempt=${index + 1} invalid output at "${issue?.path.join('.')}": ${issue?.message}`);
      lastError = new Error('Response did not match the expected format');
    } catch (error) {
      // Provider errors, timeouts and unparseable output all move on to the next attempt
      // (a rejected key or unknown model on the primary may still work on the fallback)
      lastError = error;
    }
  }

  console.error(`[consult] ${options.label} failed:`, lastError instanceof Error ? lastError.message : lastError);
  throw new ConsultError(503, 'The doctor is not available right now. Please try again in a minute.');
};
