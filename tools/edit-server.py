#!/usr/bin/env python3
"""自己電腦上編輯地圖用的小伺服器。

用法：對專案資料夾裡的「編輯地圖.command」按兩下（或執行 python3 tools/edit-server.py）。
它做兩件事：
  1. 在 http://localhost:8141 打開地圖（只有這台電腦連得到）。
  2. 編輯面板按「發布到網站」時，把顏色寫進 data/style.js、樹和人寫進 data/trees.js，
     然後 git commit 並 push 到 GitHub。push 需要這台電腦已經存過 GitHub 的登入資訊（見 README）。
"""
import json, os, subprocess, sys, webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8141
FILES = {"style": ("data/style.js", "window.ATLAS_STYLE"), "trees": ("data/trees.js", "window.ATLAS_TREES")}


def git(*args, timeout=90):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    r = subprocess.run(["git", *args], cwd=ROOT, env=env, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr).strip()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")          # 編輯時永遠拿最新的檔案
        super().end_headers()

    def reply(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        if self.path != "/publish" or host not in ("localhost", "127.0.0.1") or self.headers.get("X-Atlas") != "1":
            return self.reply(403, {"ok": False, "message": "不接受這個請求"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 400000:
                raise ValueError("內容太大")
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            for key, (path, must) in FILES.items():                # 只寫這兩個固定的檔案，內容要像它該有的樣子
                text = data.get(key)
                if not isinstance(text, str) or must not in text:
                    raise ValueError(path + " 的內容不對")
            for key, (path, _) in FILES.items():
                with open(os.path.join(ROOT, path), "w", encoding="utf-8") as f:
                    f.write(data[key])
        except Exception as e:
            return self.reply(400, {"ok": False, "message": "沒有存成功：" + str(e)})
        git("add", *[p for p, _ in FILES.values()])
        code, _ = git("diff", "--cached", "--quiet")
        committed = False
        if code != 0:
            code, out = git("commit", "-m", "更新顏色、樹與人（從編輯面板發布）")
            if code != 0:
                return self.reply(200, {"ok": False, "saved": True, "message": "檔案存好了，但 commit 失敗：" + out[-200:]})
            committed = True
        try:
            code, out = git("push", "origin", "HEAD")
        except subprocess.TimeoutExpired:
            code, out = 1, "連線逾時"
        if code == 0:
            msg = "已發布，網站一兩分鐘後更新。" if committed or "Everything up-to-date" not in out else "沒有新的變更，網站已經是最新的。"
            return self.reply(200, {"ok": True, "saved": True, "pushed": True, "message": msg})
        return self.reply(200, {"ok": False, "saved": True, "pushed": False,
                                "message": "檔案存好也 commit 了，但推不上 GitHub（這台電腦還沒存 GitHub 的登入資訊）。請到 GitHub Desktop 按「Push origin」，或照 README 設定一次。"})

    def log_message(self, fmt, *args):
        if "/publish" in (args[0] if args else ""):
            sys.stderr.write("發布：" + fmt % args + "\n")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = "http://localhost:%d/" % PORT
    print("地圖編輯中：" + url + "\n關掉這個視窗就結束。")
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
