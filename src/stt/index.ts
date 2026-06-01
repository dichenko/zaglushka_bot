import { config, logger } from '../config.js';
import { transcribeWithOpenAI } from './openai_stt.js';
import { transcribeWithMuxlisa } from './muxlisa.js';
import ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';

/**
 * Convert OGG audio buffer to WAV using FFmpeg
 * @param oggBuffer - OGG Opus audio buffer from Telegram
 * @returns WAV audio buffer
 */
function convertOggToWav(oggBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    ffmpeg(Readable.from(oggBuffer))
      .inputOptions('-f ogg')
      .outputOptions('-f wav')
      .outputOptions('-ar 16000') // 16kHz sample rate
      .outputOptions('-ac 1') // Mono
      .on('end', () => {
        const wavBuffer = Buffer.concat(chunks);
        resolve(wavBuffer);
      })
      .on('error', (err) => {
        reject(err);
      })
      .pipeToStream()
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
  });
}

/**
 * Transcribe voice message with fallback strategy
 * 1. Try OpenAI first (for Russian/English)
 * 2. If confidence < threshold or error, try MUXLISA (for Uzbek)
 * 
 * @param audioFileId - Telegram file ID
 * @param bot - Grammy bot instance
 * @returns Transcription text
 */
export async function transcribeVoice(
  audioFileId: string,
  bot: any
): Promise<string> {
  try {
    // Download file from Telegram
    const file = await bot.api.getFile(audioFileId);
    const fileUrl = file.url(bot.api.token);
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }
    
    const oggBuffer = Buffer.from(await response.arrayBuffer());
    
    // Convert OGG to WAV
    logger.info('Converting OGG to WAV...');
    const wavBuffer = await convertOggToWav(oggBuffer);
    logger.info({ size: wavBuffer.length }, 'Conversion complete');
    
    // Try primary provider (OpenAI)
    try {
      logger.info('Trying OpenAI STT...');
      const result = await transcribeWithOpenAI(wavBuffer);
      
      if (result.confidence >= config.sttFallbackConfidenceThreshold) {
        logger.info({ confidence: result.confidence }, 'OpenAI STT succeeded with high confidence');
        return result.text;
      }
      
      logger.warn({ confidence: result.confidence }, 'OpenAI confidence too low, trying MUXLISA');
    } catch (error) {
      logger.warn({ error }, 'OpenAI STT failed, trying MUXLISA');
    }
    
    // Fallback to MUXLISA
    logger.info('Trying MUXLISA STT (fallback)...');
    const muxlisaResult = await transcribeWithMuxlisa(wavBuffer);
    
    if (muxlisaResult.text) {
      logger.info('MUXLISA STT succeeded');
      return muxlisaResult.text;
    }
    
    throw new Error('All STT providers failed');
  } catch (error) {
    logger.error({ error }, 'Voice transcription failed');
    throw new Error('Не удалось распознать голосовое сообщение. Пожалуйста, напишите текстом.');
  }
}
