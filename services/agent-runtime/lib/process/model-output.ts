import { Output } from 'ai';

/** Ask the provider for JSON, but leave validation to the process repair loop.
 * The SDK's eager JSON parser otherwise throws before parseCinematicJson can
 * report a precise, repairable error. This envelope is not an accepted scene.
 * Consumers must use response.text and validate the complete process package.
 */
export function processModelOutput() {
  return {
    ...Output.json(),
    parseCompleteOutput: async ({ text }: { text: string }) => ({ rawText: text }),
  };
}
