cd wasm

cd PCM16bitto
emcc main.c -O3 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT="web,node" \
  -s 'EXPORTED_FUNCTIONS=[_malloc,_free,"_PCM16bitto8bit","_PCM16bitto10bit"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap",HEAPU8,HEAPU16,HEAP32]' \
  -o main.js

cd ..
cd PCM8bitto
emcc main.c -O3 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT="web,node" \
  -s 'EXPORTED_FUNCTIONS=[_malloc,_free,"_PCM8bitto16bit","_PCM8bitto16bit"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap",HEAPU8,HEAPU16,HEAP32]' \
  -o main.js
