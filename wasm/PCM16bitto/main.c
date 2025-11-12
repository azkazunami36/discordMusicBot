#include <emscripten/emscripten.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

/** 入力はint(符号入り)の16bitを入れてね。内部では符号なしで処理するけど。 */
EMSCRIPTEN_KEEPALIVE
uint8_t* PCM16bitto8bit(uint16_t* samples, int length) {
    /** ここに実データのbit幅を入れます。4ならmarginは最大で3bit使えます。 */
    int bit = 4;

    /** 0を入れるな！！1-3段階でmarginの動きを変えられる。4段階以降は無意味かつ損失でしかない。 */
    int margincompress = 1;

    uint8_t* results = malloc(length * sizeof(uint8_t));
    if (!results) return NULL;
    for (int i = 0; i < length; i++) {
        uint16_t sample = samples[i];

        /** 符号データ。+0.63...とか-0.525...とか、波が上かしたかを判断する。 */
        bool sign = (sample >> 15) & 1;
        /**
         * marginが0なら一番左側のbitが1だった証拠。
         * marginが1なら一番左側から2番目のbitが1だった証拠。一番左の1bitは切り捨てできる。
         */
        uint8_t margin = 0;
        if (sign) sample = ~sample;
        /**
         * 15bitの一番右から0かどうかをチェックし、0だったら空白として記録。1が来たらその時点で終了。
         */
        int condition = (pow(2, 9 - bit) - 1) * margincompress;
        for (int i = 1; (margin < condition) && i <= 15; i++) {
            if ((sample >> (15 - i)) & 1) break;
            margin++;
        }
        /** 書き出す8bitの結果 */
        uint8_t result = 0;
        /** 符号を記録する。0なら書かず、1なら書く。 */
        if (sign) result |= 1 << 7;
        uint8_t writemargin = margin == 0 ? 0 : (((int)margin + (margincompress - 1)) / margincompress);
        /** marginデータを書き込む */
        result |= writemargin << bit;
        uint8_t movemargin = writemargin * margincompress;
        /** 使いたいbitが左側に揃ったデータ */
        uint8_t data = (sample << ((movemargin - (margincompress - 1)) + 1)) >> 8;
        /** 使いたいbitだけを書き込む */
        result |= data >> (8 - bit);

        results[i] = result;
    }
    /** 完了 */
    return results;
}

/** 入力はint(符号入り)の16bitを入れてね。内部では符号なしで処理するけど。 */
EMSCRIPTEN_KEEPALIVE
uint16_t* PCM16bitto10bit(uint16_t* samples, int length) {
    /** ここに実データのbit幅を入れます。4ならmarginは最大で3bit使えます。 */
    uint8_t bit = 5;

    /** 0を入れるな！！1-3段階でmarginの動きを変えられる。4段階以降は無意味かつ損失でしかない。 */
    uint8_t margincompress = 1;
    uint16_t* results = malloc(length * sizeof(uint16_t));
    for (int i = 0; i < length; i++) {
        uint16_t sample = samples[i];
        /** 符号データ。+0.63...とか-0.525...とか、波が上かしたかを判断する。 */
        bool sign = (sample >> 15) & 1;
        if (sign) sample = ~sample;
        /**
         * marginが0なら一番左側のbitが1だった証拠。
         * marginが1なら一番左側から2番目のbitが1だった証拠。一番左の1bitは切り捨てできる。
         */
        uint8_t margin = 0;
        /**
         * 15bitの一番右から0かどうかをチェックし、0だったら空白として記録。1が来たらその時点で終了。
         */
        int condition = (pow(2, 9 - bit) - 1) * margincompress;
        for (int i = 1; (margin < condition) && i <= 15; i++) {
            if ((sample >> (15 - i)) & 1) break;
            margin++;
        }
        /** 書き出す10bitの結果 */
        uint16_t result = 0;
        /** 符号を記録する。0なら書かず、1なら書く。 */
        if (sign) result |= 1 << 9;
        /** 保存するmargin。 */
        uint8_t writemargin = margin == 0 ? 0 : (((int)margin + (margincompress - 1)) / margincompress);
        /** marginデータを書き込む */
        result |= writemargin << bit;
        /** 移動する量。圧縮されてる分を拡張する。 */
        uint8_t movemargin = writemargin * margincompress;
        /** 使いたいbitが左側に揃ったデータ */
        uint16_t data = (sample << ((movemargin - (margincompress - 1)) + 1)) >> 6;
        /** 使いたいbitだけを書き込む */
        result |= data >> (10 - bit);
        results[i] = result;
    }
    /** 完了 */
    return results;
}
