"""本地开发服务器：等价于 python -m http.server，但给所有响应加 Cache-Control: no-cache。

python -m http.server 不发缓存头，浏览器会按启发式规则缓存 JS 模块；
改动多个互相 import 的文件后，浏览器可能混用新旧版本（比如旧 app.js 配上
新的 src/*.js），整个模块图加载失败、页面卡在初始文案。加 no-cache 后
浏览器每次都会回源校验（未修改的文件走 304，不会重复下载大文件）。
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler)
    print(f"Serving at http://localhost:{PORT}/ (browser caching disabled)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
