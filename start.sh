#!/usr/bin/env bash
# create by chatgpt.
# npm run start を常時再起動。終了後に3秒の停止受付（Ctrl+C）を用意。

DELAY="${RESTART_DELAY:-1}"   # 環境変数 RESTART_DELAY で秒数を変更可

while :; do
  # 親プロセスは Ctrl+C を一時無視（子の npm には届きます）
  trap '' INT
  npm run start
  exit_code=$?

  echo ""
  echo "[INFO] npm run start が終了しました（exit=${exit_code}）。"

  # 停止受付ウィンドウ：Ctrl+C でこのスクリプトを終了
  STOP=0
  trap 'STOP=1' INT

  for ((i=DELAY; i>0; i--)); do
    printf "\r[INFO] %2ds後に再起動します。停止するには Ctrl+C を押してください..." "$i"
    sleep 1
    if [[ $STOP -eq 1 ]]; then
      echo -e "\n[INFO] ユーザー操作により停止します。"
      exit 0
    fi
  done

  # 次のループへ（再起動）
  trap - INT
  echo -e "\n[INFO] 再起動します…"
done
