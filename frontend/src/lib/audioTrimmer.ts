/**
 * Client-Side Audio Trimmer using Web Audio API (100% On-Device, 0đ server cost)
 * Encodes sliced audio to universal 16-bit PCM WAV (fully compatible with Android & iOS ringtones/alarms).
 */

export interface TrimOptions {
  startTime: number; // in seconds
  endTime: number; // in seconds
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM format
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  // Format chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample

  // Data chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave audio samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function decodeAudioBlob(blob: Blob): Promise<{ buffer: AudioBuffer; audioContext: AudioContext }> {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextClass();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(arrayBuffer);
  return { buffer, audioContext };
}

export function sliceAudioBuffer(
  audioContext: AudioContext,
  originalBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer {
  const sampleRate = originalBuffer.sampleRate;
  const numChannels = originalBuffer.numberOfChannels;
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = Math.min(originalBuffer.length, Math.floor(endTime * sampleRate));
  const sliceLength = Math.max(0, endSample - startSample);

  const slicedBuffer = audioContext.createBuffer(numChannels, sliceLength, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const originalChannelData = originalBuffer.getChannelData(channel);
    const slicedChannelData = slicedBuffer.getChannelData(channel);
    slicedChannelData.set(originalChannelData.subarray(startSample, endSample));
  }

  return slicedBuffer;
}

export async function renderProcessedAudio(
  originalBuffer: AudioBuffer,
  startTime: number,
  endTime: number,
  volumeMultiplier: number = 1.0,
  bassBoost: boolean = false
): Promise<AudioBuffer> {
  const sampleRate = originalBuffer.sampleRate;
  const numChannels = originalBuffer.numberOfChannels;
  const duration = Math.max(0.1, endTime - startTime);
  const frameLength = Math.max(1, Math.ceil(duration * sampleRate));

  const OfflineContextClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const offlineCtx = new OfflineContextClass(numChannels, frameLength, sampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;

  let lastNode: AudioNode = source;

  if (bassBoost) {
    const filter = offlineCtx.createBiquadFilter();
    filter.type = "lowshelf";
    filter.frequency.value = 140;
    filter.gain.value = 6; // +6dB bass boost
    lastNode.connect(filter);
    lastNode = filter;
  }

  if (volumeMultiplier !== 1.0) {
    const gain = offlineCtx.createGain();
    gain.gain.value = volumeMultiplier;
    lastNode.connect(gain);
    lastNode = gain;
  }

  lastNode.connect(offlineCtx.destination);
  source.start(0, startTime, duration);

  return await offlineCtx.startRendering();
}
