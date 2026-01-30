#include <emscripten/emscripten.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

int fixbitlength(int bit) {
    int i = 1;
    while (bit > i) i <<= 1;
    return i;
}
/**
 * 復元メイン処理です。ポインタを入力すると処理をします。
 *
 * 引数3番目に入力bit数、引数4番目に出力bit数を指定してください。
 *
 * 入力bit数は8bit、10bit、16bitを動作確認済みとします。
 *
 * 出力bitは16bit、24bit、32bitを動作確認済みとします。
 *
 * エラーは出ません。例外があっても、穴埋めされます。要注意。
 */
EMSCRIPTEN_KEEPALIVE
uint64_t* convertToOriginal(uint64_t* data, int length, int inbit, int outbit) {
    // inbitが何セットで表せるか。10bitなら1セット(16bit)。
    int inputset = (inbit + (16 - 1)) / 16;
    // inbitが入る適切な長さ。
    int inputbit = fixbitlength(inputset * 16);

    // 上記のコードはinbitから対応するbit幅を確かめる。10bitは16bitに展開しないといけないし、20bitは32bitに展開しないといけない。

    int befdepset = 0;
    int deployset = 0;
    for (int i = 0; i < 30; i++) {
        if (((inputbit * i) % inbit) == 0) {
            befdepset = i;
            deployset = (inputbit * i) / inbit;
            break;
        }
    }
    // 上記のコードは展開前の必要なまとまりと、展開後の必要なまとまりを表す。inbitが10bitならbefdepsetが5、deploysetが8となる。

    /** 音声の実データ幅です。inbitの半分を利用します。 */
    int bit = inbit / 2;
    /** marginの圧縮です。品質劣化が激しいため現時点で1です。 */
    int margincompress = 1;

    /** befdepsetを元にlengthで足りていないデータ量を確認します。 */
    int emptyVal = befdepset - (length % befdepset);

    /** 出力の長さです。 */
    int outlength = (length / befdepset) * deployset;

    /** 結果です。 */
    uint64_t* results = malloc((outlength) * sizeof(uint64_t));
    
}
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
 * 入力bit数は16bit、24bit、32bitを動作確認済みとします。
 *
 * 出力bitは8bit、10bit、16bitを動作確認済みとします。
 *
 * エラーは出ません。例外があっても、穴埋めされます。要注意。
 */
EMSCRIPTEN_KEEPALIVE
uint64_t* convertToCompress(uint64_t* data, int length, int inbit, int outbit) {}
