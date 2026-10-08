/**
 * What each Claude model we have used costs, and what a call to it cost.
 *
 * One table, read by everything that turns tokens into money: the scanner's
 * own log, the extraction bench and the usage console. It used to be a single
 * pair of numbers in the scanner, which priced every run at whatever the
 * current model cost — so the day the model changed, every earlier run would
 * have been shown at the new price.
 *
 * Models stay in the table after they are replaced. Old usage rows name them,
 * and an unpriced model would quietly count as free.
 *
 * Prices are USD per million tokens, from the published Anthropic price list.
 */

export interface ModelPrice {
  /** Human name, shown in the console. Product names are not translated. */
  label: string;
  input: number;
  output: number;
  /**
   * Some models charge more once a prompt passes a length. Haiku 5.5 does at
   * 100,000 input tokens: the whole request is billed at the higher rate, not
   * only the part above the line.
   */
  longPrompt?: { overInputTokens: number; input: number; output: number };
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-haiku-5-5': {
    label: 'Claude Haiku 5.5',
    input: 0.1,
    output: 0.5,
    longPrompt: { overInputTokens: 100_000, input: 0.5, output: 2.5 },
  },
  'claude-haiku-4-5': { label: 'Claude Haiku 4.5', input: 1, output: 5 },
};

/** The display name for a model id, or the id itself when it is not listed. */
export function modelLabel(model: string): string {
  return MODEL_PRICES[model]?.label ?? model;
}

/** Whether a model has a price, so the console can flag one that does not. */
export function isPriced(model: string): boolean {
  return model in MODEL_PRICES;
}

/**
 * What one call cost, in USD.
 *
 * An unlisted model returns 0 rather than throwing: the call has already
 * happened, and a missing price must not lose the record of it. The console
 * marks such rows so the gap is seen rather than summed as free.
 */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES[model];
  if (!price) return 0;

  const rates =
    price.longPrompt && inputTokens > price.longPrompt.overInputTokens
      ? price.longPrompt
      : price;

  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}
