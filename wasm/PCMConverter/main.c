#include <emscripten/emscripten.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

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
    /** 
     * lengthはもしinbitが10bitの場合、16bitの長さにデータが入っている。
     * 
     * 例えば16bitにピッタリ10bitを入れ切るには、16bitが5つ必要。16 * 5 = 80 bit。
     * 
     * そして、80bitは8サンプル入る。入力時10バイト分(5セット)だったものが8サンプル(16バイト)になる。
     * 
     * なので入力時のlengthが5なら、(5 / 5) * 8と計算することで本当の出力値にできる。注意として、この時入れる5というlengthは5の倍数でないとならない。
     * 
     * 計算式を立てるとoutLength = (length / (inbit / 2)) * ((inbit + (16 - 1)) / 16)となる。inbitが正しくないと処理ができないので注意。
     */
    /** 音声の実データです。inbitの半分を利用します。 */
    int bit = inbit / 2;
    /** marginの圧縮です。品質劣化が激しいため現時点で1です。 */
    int margincompress = 1;
    /**
     * 中途半端なbitをまとめてバイトで管理するときに、どこのバイトで区切るかの基準です。
     * 
     * 現在16を固定値にしてますが、もしかしたらoutbitかもしれない。
     */
    int ssv = inbit % 16;
    /** ssvを元にlengthで足りていないデータ量を確認します。 */
    int emptyVal = ssv - (length % ssv);

    /** 結果です。 */
    uint64_t* results = malloc((length) * sizeof(uint64_t));
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
uint64_t* convertToCompress(uint64_t* data, int length, int inbit, int outbit) {

}
