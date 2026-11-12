/**
 * Minimal client for OpenAI-compatible chat completions APIs. The response is
 * streamed (some providers drop long silent requests) and assembled here; the
 * caller always receives the complete text.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderCredentials {
  baseUrl: string;
  apiKey: string;
}

export interface CompletionResult {
  content: string;
  finishReason?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  ms: number;
}

/** Errors worth trying again (or on a fallback provider) */
export class RetryableProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/** Errors that will not go away by retrying (bad key, no credit, bad model) */
export class FatalProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

interface StreamChunk {
  choices?: { finish_reason?: string | null; delta?: { content?: string | null } }[];
  usage?: CompletionResult['usage'];
}

const joinUrl = (baseUrl: string, path: string) => `${baseUrl.replace(/\/+$/, '')}${path}`;

export const createChatCompletion = async (
  creds: ProviderCredentials,
  options: { model: string; messages: ChatMessage[]; maxTokens: number; temperature?: number; json?: boolean; timeoutMs: number }
): Promise<CompletionResult> => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  let content = '';
  let finishReason: string | undefined;
  let usage: CompletionResult['usage'];

  try {
    const response = await fetch(joinUrl(creds.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.2,
        stream: true,
        stream_options: { include_usage: true },
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        messages: options.messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      // Provider messages can mention model names: log them, never return them to clients
      console.error(`[llm] provider error ${response.status}: ${String(body.error?.message ?? '').slice(0, 200)}`);
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableProviderError('Provider temporarily unavailable', response.status);
      }
      throw new FatalProviderError('Provider rejected the request', response.status);
    }

    // Server-sent events: "data: {chunk}" lines, ending with "data: [DONE]"
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as StreamChunk;
          const choice = chunk.choices?.[0];
          if (choice?.delta?.content) content += choice.delta.content;
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (chunk.usage) usage = chunk.usage;
        } catch {
          // Ignore keep-alive or malformed lines
        }
      }
    }
  } catch (error) {
    if (error instanceof RetryableProviderError || error instanceof FatalProviderError) throw error;
    const timedOut = (error as { name?: string })?.name === 'AbortError';
    throw new RetryableProviderError(timedOut ? 'Provider timed out' : 'Could not reach provider');
  } finally {
    clearTimeout(timer);
  }

  if (finishReason === 'length') throw new RetryableProviderError('Response was cut short');
  return { content, finishReason, usage, ms: Date.now() - started };
};

/** Model ids offered by a provider (used by the admin panel model picker) */
export const listProviderModels = async (creds: ProviderCredentials, timeoutMs = 60_000): Promise<string[]> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(joinUrl(creds.baseUrl, '/models'), {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new FatalProviderError('Provider rejected the request', response.status);
    const body = (await response.json()) as { data?: { id?: string }[] };
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
  } catch (error) {
    if (error instanceof FatalProviderError) throw error;
    throw new RetryableProviderError('Could not reach provider');
  } finally {
    clearTimeout(timer);
  }
};
