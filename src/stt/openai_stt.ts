import { config, logger } from '../config.js';

/**
 * Transcribe audio using OpenAI STT API
 * @param audioBuffer - Audio file buffer (WAV format)
 * @param language - Optional language hint
 * @returns Transcription text and confidence
 */
export async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  language?: string
): Promise<{ text: string; confidence: number }> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', config.openaiSttModel);
    
    if (language) {
      formData.append('language', language);
    }

    const response = await fetch(`${config.llmBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OpenAI STT failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    logger.info({ provider: 'openai', text: data.text.substring(0, 50) }, 'OpenAI STT success');
    
    return {
      text: data.text,
      confidence: 0.9, // OpenAI doesn't provide confidence, assume high
    };
  } catch (error) {
    logger.error({ error, provider: 'openai' }, 'OpenAI STT failed');
    throw error;
  }
}
