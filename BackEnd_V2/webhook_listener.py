from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os


class WebhookHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        # Added health check path that returns 200 without running scripts
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        # Ensure deployments only trigger on the actual webhook path
        if self.path == "/webhook" or self.path == "/":
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length) if content_length else b""

            try:
                payload = json.loads(raw_body)
            except (json.JSONDecodeError, ValueError):
                payload = {}

            ref = payload.get("ref", "")
            if ref != "refs/heads/R202609/develop":
                print(
                    f"⏭️ Push to '{ref}' ignored — only R202609/develop triggers deployment."
                )
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Ignored: not R202609/develop branch")
                return

            print("🚀 GitHub push to R202609/develop detected! Updating repository...")
            os.system(
                "cd ~/shadow/BackEnd_V2 && git fetch origin && git checkout R202609/develop && git pull origin R202609/develop && ./restart_server.sh &"
            )
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Success")
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    print("🛰️ Webhook server running on port 9000...")
    HTTPServer(("0.0.0.0", 9000), WebhookHandler).serve_forever()
