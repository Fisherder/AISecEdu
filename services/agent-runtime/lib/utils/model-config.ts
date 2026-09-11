import { useSettingsStore } from '@/lib/store/settings';
import {
  getThinkingConfigKey,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';
import { findModelById } from '@/lib/ai/model-aliases';
import { getCatalogThinkingCapability } from '@/lib/ai/model-metadata';

/**
 * Get current model configuration from settings store
 */
export function getCurrentModelConfig() {
  if (process.env.NEXT_PUBLIC_AISECEDU_INTEGRATED === 'true' && typeof window !== 'undefined') {
    const modelString = (window as Window & { __AISECEDU_CLASSROOM_MODEL__?: string }).__AISECEDU_CLASSROOM_MODEL__ || '';
    const separator = modelString.indexOf(':');
    return {
      providerId: separator >= 0 ? modelString.slice(0, separator) : '',
      modelId: separator >= 0 ? modelString.slice(separator + 1) : modelString,
      modelString,
      apiKey: '',
      baseUrl: '',
      providerType: undefined,
      requiresApiKey: false,
      isServerConfigured: Boolean(modelString),
      thinkingConfig: undefined,
    };
  }
  const { providerId, modelId, providersConfig, thinkingConfigs } = useSettingsStore.getState();
  const modelString = `${providerId}:${modelId}`;

  // Get current provider's config
  const providerConfig = providersConfig[providerId];
  const modelInfo = findModelById(providerId, providerConfig?.models, modelId);
  const thinking =
    modelInfo?.capabilities?.thinking ?? getCatalogThinkingCapability(providerId, modelId);
  const thinkingConfig = supportsConfigurableThinking(thinking)
    ? normalizeThinkingConfig(thinking, thinkingConfigs[getThinkingConfigKey(providerId, modelId)])
    : undefined;

  return {
    providerId,
    modelId,
    modelString,
    apiKey: providerConfig?.apiKey || '',
    baseUrl: providerConfig?.baseUrl || '',
    providerType: providerConfig?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
    thinkingConfig,
  };
}
