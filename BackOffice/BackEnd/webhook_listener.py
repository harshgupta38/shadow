"""BackOffice's own deploy webhook — mirrors BackEnd_V2/webhook_listener.py
exactly, pointed at BackOffice's own (separate) git repo, branch, and port.

Runs on port 9001 (BackEnd_V2's is 9000 — deliberately different so both can
run side by side on the same phone without colliding).

IMPORTANT — adjust before first use:
  - CLONE_DIR below assumes BackOffice's repo is cloned at ~/shadow-backoffice
    with the same BackEnd/FrontEnd layout it has today. Update it to wherever
    you actually `git clone` the new repo on the phone.
  - This script only pulls + restarts the BACKEND. The frontend deploys
    separately via Firebase Hosting (a manual `npm run deploy`, same as
    FrontEnd_V2 — there's no CI/webhook for that anywhere in this codebase,
    so this intentionally doesn't try to automate it either).
  - If requirements.txt changed, `pip install -r requirements.txt` still
    needs to be run by hand after a pull — same as BackEnd_V2's webhook,
    which also doesn't auto-install dependencies.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os

CLONE_DIR = "~/shadow-backoffice/BackEnd"
BRANCH = "R202609/backoffice"


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
            if ref != f"refs/heads/{BRANCH}":
                print(f"⏭️ Push to '{ref}' ignored — only {BRANCH} triggers deployment.")
                self.send_response(200)
                self.end_headers()
                self.wfile.write(f"Ignored: not {BRANCH} branch".encode())
                return

            print(f"🚀 GitHub push to {BRANCH} detected! Updating BackOffice...")
            os.system(
                f"cd {CLONE_DIR} && git fetch origin && git checkout {BRANCH} "
                f"&& git pull origin {BRANCH} && ./restart_backoffice.sh &"
            )
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Success")
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    print("🛰️ BackOffice webhook server running on port 9001...")
    HTTPServer(("0.0.0.0", 9001), WebhookHandler).serve_forever()
