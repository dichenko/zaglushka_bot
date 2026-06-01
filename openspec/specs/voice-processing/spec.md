# Voice Processing

## Purpose

Provides speech-to-text for Telegram voice messages using a dual-provider fallback pipeline. OpenAI STT is the primary provider; MUXLISA serves as the fallback for Uzbek language support. Transcribed text flows into the AI conversation pipeline.

## Requirements

### Requirement: Audio Format Conversion
The system SHALL convert OGG Opus voice messages from Telegram to 16kHz mono WAV using FFmpeg before transcription.

#### Scenario: Voice message received
- **WHEN** a user sends a voice message
- **THEN** the OGG file is downloaded from Telegram and converted to WAV via fluent-ffmpeg

### Requirement: Primary STT Provider (OpenAI)
The system SHALL first attempt transcription via OpenAI-compatible API at config.llmBaseUrl/audio/transcriptions using OPENAI_STT_MODEL. OpenAI results SHALL be assigned a confidence of 0.9 (hardcoded, not returned by API).

#### Scenario: Russian voice transcribed via OpenAI
- **WHEN** a Russian voice message is sent
- **THEN** OpenAI STT returns text with confidence 0.9; the transcription is accepted

### Requirement: STT Fallback to MUXLISA
If the primary provider fails OR returns confidence below STT_FALLBACK_CONFIDENCE_THRESHOLD (default 0.7), the system SHALL fall back to MUXLISA API at config.muxlisaBaseUrl/api/v1/stt.

#### Scenario: OpenAI fails, MUXLISA succeeds
- **WHEN** OpenAI STT returns an error
- **THEN** MUXLISA is called; if its response has text, that text is used

#### Scenario: Low confidence triggers fallback
- **WHEN** OpenAI returns confidence below 0.7
- **THEN** MUXLISA is attempted as fallback

### Requirement: Transcription Integration
The system SHALL feed transcribed text into the same AI conversation pipeline as text messages. This includes conversation creation or reuse, message storage with message_type=voice, and agent invocation.

#### Scenario: Voice message leads to agent response
- **WHEN** transcription succeeds and text is "What services do you offer?"
- **THEN** a conversation is created; voice message saved with audio_file_id and transcription; agent responds to the question

### Requirement: User Feedback
The system SHALL send "⏳ Распознаю голосовое сообщение..." while transcribing. On total failure, the system SHALL send: "Не удалось распознать голосовое сообщение. Пожалуйста, напишите текстом."

#### Scenario: All providers fail
- **WHEN** both OpenAI and MUXLISA fail
- **THEN** the user receives the fallback text message asking them to type instead
