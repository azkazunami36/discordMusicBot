#include <emscripten/emscripten.h>
#include <stdbool.h>
#include <stdint.h>

/** ここに実データのbit幅を入れます。4ならmarginは最大で3bit使えます。 */
int bit = 4;

/** 0を入れるな！！1-3段階でmarginの動きを変えられる。 */
int margincompress = 1;

/** 入力は僕作バイナリ8bitを入れてね。 */
EMSCRIPTEN_KEEPALIVE
uint16_t* PCM8bitto16bit(uint8_t* raws, int length) {
    /** ここに実データのbit幅を入れます。4ならmarginは最大で3bit使えます。 */
    int bit = 4;

    /** 0を入れるな！！1-3段階でmarginの動きを変えられる。4段階以降は無意味かつ損失でしかない。 */
    int margincompress = 1;

    uint16_t* results = malloc(length * sizeof(uint16_t));
    for (int i = 0; i < length; i++) {
        uint8_t raw = raws[i];

        /** 符号データ。+0.63...とか-0.525...とか、波が上かしたかを判断する。 */
        bool sign = (raw >> 7) & 1;
        /** 実際のbitがどれだけずれているか。1つだけ先に左にずらして符号ビットをどかす。 */
        uint8_t mg = raw << 1;
        /** 実際に使うmarginデータ。実際のbitがどれだけずれているか。 */
        uint8_t margin = mg >> (bit + 1);
        /** データを16bitに合わせてずらす。 */
        uint16_t data = raw << (16 - bit);
        uint8_t movemargin = margin * margincompress;
        /** データをmargin分左にずらす。 */
        data = data >> ((movemargin - (margincompress - 1)) + 1);
        if (sign) data = ~data;
        /** データに符号情報を書き込む。 */
        if (sign) data |= 1 << 15;
        results[i] = data;
    }
    /** 完了。 */
    return results;
}

/**
 * 復元メイン処理です。ポインタを入力すると処理をします。
 * 
 * 引数3番目に入力bit数、引数4番目に出力bit数を指定してください。
 * 
 * 入力bit数は8bit、10bit、16bitを動作確認済みとします。
 * 
 * 出力bitは16bit、24bit、32bitを動作確認済みとします。
 */
uint64_t* convertToOriginal(uint64_t* data, int length, int inbit, int outbit) {

}



/** 入力は僕作バイナリ10bitを入れてね。 */
EMSCRIPTEN_KEEPALIVE
uint16_t* PCM10bitto16bit(uint16_t* raws, int length) {
    /** ここに実データのbit幅を入れます。5ならmarginは最大で4bit使えます。 */
    uint8_t bit = 5;

    /** 0を入れるな！！1-3段階でmarginの動きを変えられる。4段階以降は無意味かつ損失でしかない。 */
    uint8_t margincompress = 1;

    uint16_t* results = malloc(length * sizeof(uint16_t));
    for (int i = 0; i < length; i++) {
        uint16_t raw = raws[i];

        /** 符号データ。+0.63...とか-0.525...とか、波が上かしたかを判断する。 */
        bool sign = (raw >> 9) & 1;
        /** 実際のbitがどれだけずれているか。1つだけ先に左にずらして符号ビットをどかす。 */
        uint8_t mg = raw >> 1;
        /** 実際に使うmarginデータ。実際のbitがどれだけずれているか。 */
        uint8_t margin = mg >> (bit - 1);
        /** データを16bitに合わせてずらす。 */
        uint16_t data = raw << (16 - bit);
        /** 移動する量。圧縮されてる分を拡張する。 */
        uint8_t movemargin = margin * margincompress;
        /** データをmargin分左にずらす。 */
        data = data >> ((movemargin - (margincompress - 1)) + 1);
        if (sign) {
            data = ~data;
            /** データに符号情報を書き込む。 */
            data |= 1 << 15;
        }
        results[i] = data;
    }
    /** 完了。 */
    return results;
}


/** 入力は僕作バイナリ16bitを入れてね。 */
EMSCRIPTEN_KEEPALIVE
uint16_t* PCM16bitto16bit(uint16_t* raws, int length) {
    /** ここに実データのbit幅を入れます。5ならmarginは最大で4bit使えます。 */
    uint8_t bit = 8;

    /** 0を入れるな！！1-3段階でmarginの動きを変えられる。4段階以降は無意味かつ損失でしかない。 */
    uint8_t margincompress = 1;

    uint16_t* results = malloc(length * sizeof(uint16_t));
    for (int i = 0; i < length; i++) {
        uint16_t raw = raws[i];

        /** 符号データ。+0.63...とか-0.525...とか、波が上かしたかを判断する。 */
        bool sign = (raw >> 9) & 1;
        /** 実際のbitがどれだけずれているか。1つだけ先に左にずらして符号ビットをどかす。 */
        uint8_t mg = raw >> 1;
        /** 実際に使うmarginデータ。実際のbitがどれだけずれているか。 */
        uint8_t margin = mg >> (bit - 1);
        /** データを16bitに合わせてずらす。 */
        uint16_t data = raw << (16 - bit);
        /** 移動する量。圧縮されてる分を拡張する。 */
        uint8_t movemargin = margin * margincompress;
        /** データをmargin分左にずらす。 */
        data = data >> ((movemargin - (margincompress - 1)) + 1);
        if (sign) {
            data = ~data;
            /** データに符号情報を書き込む。 */
            data |= 1 << 15;
        }
        results[i] = data;
    }
    /** 完了。 */
    return results;
}
