"""Voice one text with edge-tts and keep the word timings. Run with .venv-tts/bin/python (has edge_tts).

Usage: tts_timed.py <voice> <text file> <out mp3> <out words json>
Words json: [{"o": offset_s, "d": duration_s, "t": word}, ...]  (from WordBoundary events)
"""
import asyncio
import json
import sys

import edge_tts


async def run(voice, text, out_mp3, out_words):
    c = edge_tts.Communicate(text, voice, boundary="WordBoundary")
    words = []
    with open(out_mp3, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"o": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "t": ch["text"]})
    with open(out_words, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


if __name__ == "__main__":
    voice, tfile, mp3, words = sys.argv[1:5]
    with open(tfile, encoding="utf-8") as f:
        text = f.read()
    asyncio.run(run(voice, text, mp3, words))
