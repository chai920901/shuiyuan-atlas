#!/bin/bash
# 對這個檔案按兩下：在自己電腦上打開可以編輯的地圖。編輯面板裡的「發布到網站」會直接存檔並上傳。
cd "$(dirname "$0")" && exec python3 tools/edit-server.py
