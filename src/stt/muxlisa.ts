import { config, logger } from '../config.js';

/**
 * Transcribe audio using MUXLISA API (Uzbek language support)
 * @param audioBuffer - Audio file buffer (WAV format)
 * @returns Transcription text and confidence
 */
export async function transcribeWithMuxlisa(
  audioBuffer: Buffer
): Promise<{ text: string; confidence: number }> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('audio', blob, 'audio.wav');

    const response = await fetch(`${config.muxlisaBaseUrl}/api/v1/stt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.muxlisaApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`MUXLISA STT failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    logger.info({ provider: 'muxlisa', text: data.text?.substring(0, 50) }, 'MUXLISA STT success');
    
    return {
      text: data.text || '',
      confidence: data.confidence || 0.8,
    };
  } catch (error) {
    const details = error instanceof Error ? { message: error.message, status: (error as any).status } : { error };
    logger.error(details, 'MUXLISA STT failed');
    throw error;
  }
}
