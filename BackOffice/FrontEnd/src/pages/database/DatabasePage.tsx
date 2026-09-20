import { useState } from "react";
import { CloudArrowDownFill, Grid3x3GapFill, Terminal } from "react-bootstrap-icons";
import { TableBrowser } from "./TableBrowser";
import { SqlConsole } from "./SqlConsole";
import { BackupsTab } from "./BackupsTab";

type DbTab = "main" | "query" | "backups";

// No PageHeader and no shared .app-content padding/max-width here — the
// database tools (row grid, SQL console) need the full viewport to be
// usable, unlike every other page in the app. See .app-content-full /
// .db-page-full in theme.scss and the route-based switch in AppLayout.
export function DatabasePage() {
  const [tab, setTab] = useState<DbTab>("main");

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
      </div>

      <div className="db-tab-panel">
        {tab === "main" && <TableBrowser />}
        {tab === "query" && <SqlConsole />}
        {tab === "backups" && <BackupsTab />}
      </div>
    </div>
  );
}
