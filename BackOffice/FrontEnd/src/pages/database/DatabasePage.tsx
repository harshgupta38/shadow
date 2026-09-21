import { useState } from "react";
import { CloudArrowDownFill, DatabaseFill, Grid3x3GapFill, Terminal, XLg } from "react-bootstrap-icons";
import { TableBrowser } from "./TableBrowser";
import { SqlConsole } from "./SqlConsole";
import { BackupsTab } from "./BackupsTab";
import { BackupTableBrowser } from "./BackupTableBrowser";

type DbTab = "main" | "query" | "backups" | { kind: "backup"; filename: string };

function isBackupTab(tab: DbTab, filename?: string): tab is { kind: "backup"; filename: string } {
  if (typeof tab === "string") return false;
  return filename === undefined || tab.filename === filename;
}

// No PageHeader and no shared .app-content padding/max-width here — the
// database tools (row grid, SQL console) need the full viewport to be
// usable, unlike every other page in the app. See .app-content-full /
// .db-page-full in theme.scss and the route-based switch in AppLayout.
export function DatabasePage() {
  const [tab, setTab] = useState<DbTab>("main");
  // Filenames currently open as their own tab — separate from `tab` (which
  // of them, if any, is the active one) so a closed-but-not-active backup
  // tab's existence doesn't need its own bookkeeping.
  const [openBackups, setOpenBackups] = useState<string[]>([]);

  // Opening a backup that's already got a tab just switches to it instead
  // of adding a duplicate — the one place two tabs for the same file could
  // otherwise exist.
  function openBackupTab(filename: string) {
    setOpenBackups((prev) => (prev.includes(filename) ? prev : [...prev, filename]));
    setTab({ kind: "backup", filename });
  }

  // Closing the active tab activates whichever tab sits immediately to its
  // left — the previous backup tab, or the static "Backups" tab if this was
  // the leftmost one — rather than always bouncing back to Main DB.
  function closeBackupTab(filename: string) {
    const closedIndex = openBackups.indexOf(filename);
    setOpenBackups((prev) => prev.filter((f) => f !== filename));
    setTab((current) => {
      if (!isBackupTab(current, filename)) return current;
      return closedIndex > 0 ? { kind: "backup", filename: openBackups[closedIndex - 1] } : "backups";
    });
  }

  return (
    <div className="db-page-full">
      <div className="db-tabs db-tabs--full">
        <button
          type="button"
          className={`db-tab${tab === "main" ? " db-tab--active" : ""}`}
          onClick={() => setTab("main")}
        >
          <Grid3x3GapFill size={14} />
          Main DB
        </button>
        <button
          type="button"
          className={`db-tab${tab === "query" ? " db-tab--active" : ""}`}
          onClick={() => setTab("query")}
        >
          <Terminal size={14} />
          Query
        </button>
        <button
          type="button"
          className={`db-tab${tab === "backups" ? " db-tab--active" : ""}`}
          onClick={() => setTab("backups")}
        >
          <CloudArrowDownFill size={14} />
          Backups
        </button>

        {openBackups.map((filename) => (
          <div
            key={filename}
            className={`db-tab db-tab--dynamic${isBackupTab(tab, filename) ? " db-tab--active" : ""}`}
            role="tab"
            tabIndex={0}
            onClick={() => setTab({ kind: "backup", filename })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setTab({ kind: "backup", filename });
            }}
          >
            <DatabaseFill size={14} />
            <span className="db-tab-labels">
              <span className="db-tab-title">Backup DB</span>
              <span className="db-tab-subtitle">{filename}</span>
            </span>
            <button
              type="button"
              className="db-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeBackupTab(filename);
              }}
              aria-label={`Close ${filename}`}
            >
              <XLg size={11} />
            </button>
          </div>
        ))}
      </div>

      <div className="db-tab-panel">
        {tab === "main" && <TableBrowser />}
        {tab === "query" && <SqlConsole />}
        {tab === "backups" && <BackupsTab onOpenBackup={openBackupTab} />}
        {isBackupTab(tab) && <BackupTableBrowser filename={tab.filename} />}
      </div>
    </div>
  );
}
