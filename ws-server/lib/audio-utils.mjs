export function computeRMS(audioData) {
  let sumSquares = 0
  for (let i = 0; i < audioData.length; i++) {
    sumSquares += audioData[i] * audioData[i]
  }
  return Math.sqrt(sumSquares / audioData.length)
}

export function filterHallucinations(text) {
  if (!text) return ''
  const hallucinationPatterns = [
    /^\(字幕[：:].*?\)$/,
    /^\(字幕君\)$/,
    /^字幕[：:]/,
    /^ thanks for watching/i,
    /^ subscribe/i,
    /^ thank you for watching/i,
    /^\[.*?\]$/,
    /^the output of this/,
    /^you$/,
  ]
  for (const pattern of hallucinationPatterns) {
    if (pattern.test(text)) return ''
  }
  text = text.replace(/^[\(（]字幕[：:].*?[\)）]\s*/, '')
  return text.trim()
}
