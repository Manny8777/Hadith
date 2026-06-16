// Shared Arabic text normalization and word similarity — usable in both API routes and client components

export function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْٰ]/g, '')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Strip punctuation + numbers, normalize, return space-separated word string
export function prepareForComparison(text: string): string {
  return normalizeArabic(
    text
      .replace(/[0-9٠-٩]+/g, ' ')
      .replace(/[،؛؟,.;:!?()\[\]{}"'«»""'']/g, ' ')
      .replace(/[-–—]/g, ' ')
  ).replace(/\s+/g, ' ').trim()
}

// LCS-based Dice coefficient — order-aware word similarity
export function wordDice(a: string, b: string): number {
  const aw = a.split(/\s+/).filter(Boolean)
  const bw = b.split(/\s+/).filter(Boolean)
  if (aw.length === 0 && bw.length === 0) return 1
  if (aw.length === 0 || bw.length === 0) return 0
  const m = aw.length, n = bw.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aw[i - 1] === bw[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
  return (2 * dp[m][n]) / (m + n)
}

// Split display text into meaningful phrases by Arabic punctuation
export function splitIntoPhrases(text: string): string[] {
  return text
    .split(/[،؛.؟!,;?!]+/)
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).length >= 2) // keep only multi-word phrases
}
