System / Health — app/api/system.py (no auth)
Method	Path	Description
GET	/	Root info — name, version, status.
GET	/health	Control server's own liveness.
GET	/health/main	Pings BackEnd_V2's /health — returns ok / degraded / down.
GET	/health/backoffice	Same probe against BackOffice.
GET	/health/all	Combined status of control server + both managed services in one call.


Control — app/api/control.py (prefix /control)
Method	Path	Body	Description
POST	/control/main/restart	—	Kills + relaunches BackEnd_V2 via restart_server.sh. No git pull.
POST	/control/main/deploy	{"branch"?: str}	git fetch + checkout + pull (current branch if omitted) + restart BackEnd_V2.
POST	/control/main/rollback	{"commit_sha": str}	Checks out a specific commit (detached HEAD) + restarts BackEnd_V2. No pull — temporary, for emergency recovery.
POST	/control/backoffice/restart	—	Same restart, for BackOffice.
POST	/control/backoffice/deploy	{"branch"?: str}	Same deploy, for BackOffice.


Logs — app/api/logs.py (prefix /logs)
Method	Path	Description
GET	/logs/main?tail=500	Tail of BackEnd_V2's server.log as plain text.
GET	/logs/main/download	Download the full server.log file.
GET	/logs/backoffice?tail=500	Tail of BackOffice's backoffice.log.
GET	/logs/backoffice/download	Download the full backoffice.log file.
GET	/logs/control?tail=200	Tail of the control server's own control.log.


Database — app/api/database.py (prefix /db)
Method	Path	Body	Description
GET	/db/main/download	—	Consistent snapshot download of shadow.db (SQLite online backup, not a raw file copy).
POST	/db/main/query	{"query": str}	Runs one SQL statement against shadow.db, returns rowcount/columns/rows.
GET	/db/backoffice/download	—	Same snapshot download for backoffice.db.
POST	/db/backoffice/query	{"query": str}	Same SQL execution against backoffice.db.


Git — app/api/git.py (prefix /git)
Method	Path	Body	Description
POST	/git/main	{"args": [str, ...]}	Runs a whitelisted git subcommand in BackEnd_V2's repo. Allowed: pull, fetch, status, log, diff, branch, show, rev-parse. Anything else is rejected.
POST	/git/backoffice	{"args": [str, ...]}	Same, in BackOffice's repo.
Total: 21 endpoints (confirmed against the app's actual OpenAPI schema, not just the source).