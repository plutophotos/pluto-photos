// ============================================================
// CLIP BPE Tokenizer for Pluto Photos
// ============================================================
// Implements the byte-pair encoding (BPE) tokenizer used by
// OpenAI's CLIP model. Encodes text into token IDs for the
// CLIP text encoder.
//
// Requires: vocab.json + merges.txt from the CLIP model repo.
// ============================================================

/**
 * Build the byte-to-unicode encoder mapping.
 * Maps byte values (0-255) to unicode characters, ensuring
 * all bytes map to visible/printable characters.
 */
function buildByteEncoder() {
  const bs = []
  const cs = []

  // Printable ASCII and extended Latin characters
  for (let i = 33; i <= 126; i++) { bs.push(i); cs.push(i) }
  for (let i = 161; i <= 172; i++) { bs.push(i); cs.push(i) }
  for (let i = 174; i <= 255; i++) { bs.push(i); cs.push(i) }

  // Map remaining bytes (control chars, etc.) to unicode above 255
  let n = 0
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b)
      cs.push(256 + n)
      n++
    }
  }

  const encoder = {}
  for (let i = 0; i < bs.length; i++) {
    encoder[bs[i]] = String.fromCharCode(cs[i])
  }
  return encoder
}

export class CLIPTokenizer {
  /**
   * @param {Object} vocab - Token-to-ID mapping from vocab.json
   * @param {string[]} merges - BPE merge rules (from merges.txt, excluding header)
   */
  constructor(vocab, merges) {
    this.vocab = vocab
    this.bpeRanks = new Map()
    for (let i = 0; i < merges.length; i++) {
      this.bpeRanks.set(merges[i], i)
    }

    this.sotToken = vocab['<|startoftext|>'] ?? 49406
    this.eotToken = vocab['<|endoftext|>'] ?? 49407
    this.contextLength = 77

    this.byteEncoder = buildByteEncoder()
    this.cache = new Map()

    // CLIP's text splitting pattern
    this.pat = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/giu
  }

  /**
   * Apply BPE to a single byte-encoded word token.
   * The word should already have bytes mapped to unicode chars.
   */
  bpe(token) {
    if (this.cache.has(token)) return this.cache.get(token)

    // CLIP appends </w> to the last character before merging
    let word = [...token.slice(0, -1), token.slice(-1) + '</w>']

    if (word.length === 1) {
      const result = word[0]
      this.cache.set(token, result)
      return result
    }

    while (word.length > 1) {
      let minRank = Infinity
      let minIdx = -1

      // Find the highest-priority merge pair
      for (let i = 0; i < word.length - 1; i++) {
        const pair = word[i] + ' ' + word[i + 1]
        const rank = this.bpeRanks.get(pair)
        if (rank !== undefined && rank < minRank) {
          minRank = rank
          minIdx = i
        }
      }

      if (minIdx === -1) break

      // Apply the merge
      const merged = word[minIdx] + word[minIdx + 1]
      const newWord = []
      for (let i = 0; i < word.length; i++) {
        if (i === minIdx) {
          newWord.push(merged)
          i++ // skip next element (already merged)
        } else {
          newWord.push(word[i])
        }
      }
      word = newWord
    }

    const result = word.join(' ')
    this.cache.set(token, result)
    return result
  }

  /**
   * Encode text into CLIP token IDs.
   * @param {string} text - Input text
   * @returns {number[]} Array of token IDs, padded to 77
   */
  encode(text) {
    const tokens = [this.sotToken]
    text = text.toLowerCase().trim().replace(/\s+/g, ' ')

    const matches = text.match(this.pat) || []
    for (const match of matches) {
      // Convert each byte of the match to its unicode representation
      const bytes = new TextEncoder().encode(match)
      const encoded = Array.from(bytes).map(b => this.byteEncoder[b]).join('')

      // Apply BPE merges
      const bpeResult = this.bpe(encoded)
      const bpeTokens = bpeResult.split(' ')

      for (const t of bpeTokens) {
        const id = this.vocab[t]
        if (id !== undefined) {
          tokens.push(id)
        }
      }
    }

    tokens.push(this.eotToken)

    // Truncate if needed
    if (tokens.length > this.contextLength) {
      tokens.length = this.contextLength
      tokens[this.contextLength - 1] = this.eotToken
    }

    // Pad to context length
    while (tokens.length < this.contextLength) {
      tokens.push(0)
    }

    return tokens
  }
}
