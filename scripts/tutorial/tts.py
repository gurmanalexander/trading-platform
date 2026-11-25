"""Озвучка реплик обучающего видео (так же, как первая версия обзора): edge-tts, нейронные голоса Microsoft.

    python3 scripts/tutorial/tts.py ru     # по scripts/tutorial/out/ru/lines.json → scripts/tutorial/audio/ru/<хеш>.mp3
    python3 scripts/tutorial/tts.py en

lines.json пишет `node scripts/tutorial/record.mjs --script`. Готовые файлы не переделываются: имя — хеш текста
реплики, поэтому после правки сценария озвучиваются только изменённые фразы. Субтитры остаются как в сценарии,
а голосу текст подаётся с «фонетикой» (PRONOUNCE ниже): tvx — «ти-ви-икс», Binance — «Байнэнс» и т. п.

Нужно: pip install edge-tts, ffprobe. Сервис — онлайн (speech.platform.bing.com); в среде с прокси он берётся
из HTTPS_PROXY.
"""
import asyncio, json, os, re, subprocess, sys

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES = {"ru": "ru-RU-DmitryNeural", "en": "en-US-AndrewNeural"}
RATE = {"ru": "+4%", "en": "+0%"}

# Как произносить то, что голос читает неверно. Субтитры не меняются — только текст для голоса.
PRONOUNCE = {
    "ru": [
        (r"\btvx\b", "ти-ви-икс"),
        (r"\bBinance\b", "Байнэнс"),
        (r"\bBybit\b", "Байбит"),
        (r"\bTradingView\b", "ТрейдингВью"),
        (r"\bTelegram\b", "Телеграм"),
        (r"\bTradFi\b", "традфай"),
        (r"\bEnter\b", "Энтер"),
        (r"\bShift\b", "Шифт"),
        (r"\bCtrl\b", "Контрол"),
        (r"\bAlt\b", "Альт"),
        (r"\bDelete\b", "Дилит"),
        (r"\bATR\b", "эй-ти-ар"),
        (r"\bRSI\b", "эр-эс-ай"),
        (r"\bMACD\b", "эм-эй-си-ди"),
        (r"\bVWAP\b", "ви-ви-эй-пи"),
        (r"\bCDV\b", "си-ди-ви"),
        (r"\bR/R\b", "эр к эр"),
        (r"\bQR\b", "кью-ар"),
        (r"\bAlt\+([A-Z])\b", r"Альт+\1"),
    ],
    "en": [
        (r"\btvx\b", "T V X"),
        (r"\bR/R\b", "R to R"),
        (r"\bCDV\b", "C D V"),
    ],
}
ORDINAL_RU = ["", "первая", "вторая", "третья", "четвёртая", "пятая", "шестая", "седьмая", "восьмая", "девятая", "десятая",
              "одиннадцатая", "двенадцатая", "тринадцатая", "четырнадцатая", "пятнадцатая", "шестнадцатая", "семнадцатая"]


def voice_text(lang, text):
    if lang == "ru":
        text = re.sub(r"^Часть (\d+)\.", lambda m: f"Часть {ORDINAL_RU[int(m[1])]}.", text)
    for pat, rep in PRONOUNCE[lang]:
        text = re.sub(pat, rep, text)
    return text


def probe(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())


async def one(lang, line, out_dir, failed):
    path = os.path.join(out_dir, line["hash"] + ".mp3")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return
    text = voice_text(lang, line["text"])
    for attempt in range(8):
        try:
            await edge_tts.Communicate(text, VOICES[lang], rate=RATE[lang], proxy=os.environ.get("HTTPS_PROXY")).save(path)
            # сервис иногда обрывает ответ: слишком короткий для своего текста клип — брак
            if len(text) / probe(path) > 19:
                raise RuntimeError("клип оборван")
            return
        except Exception as e:  # сеть: повторяем с паузой
            if os.path.exists(path):
                os.remove(path)
            if attempt == 7:
                failed.append(f"{line['hash']}: {e!r}")
                return
            await asyncio.sleep(4 * (attempt + 1))


async def main():
    lang = sys.argv[1] if len(sys.argv) > 1 else "ru"
    lines = json.load(open(os.path.join(HERE, "out", lang, "lines.json"), encoding="utf-8"))
    out_dir = os.path.join(HERE, "audio", lang)
    os.makedirs(out_dir, exist_ok=True)
    failed = []
    for line in lines:  # по одной: сервис не любит параллельные запросы
        await one(lang, line, out_dir, failed)
    if failed:
        sys.exit("нет озвучки:\n" + "\n".join(failed))
    total = sum(probe(os.path.join(out_dir, l["hash"] + ".mp3")) for l in lines)
    print(f"{lang}: {len(lines)} реплик, {total:.0f} с звука")


asyncio.run(main())
