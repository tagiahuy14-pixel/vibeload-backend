import { describe, it, expect } from "vitest";
import { audioBufferToWav } from "./audioTrimmer";

describe("audioTrimmer", () => {
  it("converts audio buffer mock into a valid RIFF WAV blob", () => {
    // Create a mock AudioBuffer
    const sampleRate = 44100;
    const length = 44100; // 1 second
    const channelData = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      channelData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const mockBuffer = {
      numberOfChannels: 1,
      sampleRate,
      length,
      duration: 1,
      getChannelData: () => channelData,
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWav(mockBuffer);
    expect(wavBlob.type).toBe("audio/wav");
    expect(wavBlob.size).toBe(44 + length * 2);
  });
});
