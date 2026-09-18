import { useState } from "react";
import { DatabaseFill, Grid3x3GapFill, Terminal } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { MOCK_ROWS, type TableData } from "./schema";
import { TableBrowser } from "./TableBrowser";
import { SqlConsole } from "./SqlConsole";

type DbTab = "browse" | "console";

export function DatabasePage() {
  const [tab, setTab] = useState<DbTab>("browse");

  // Owned here (not inside TableBrowser) so edits/inserts/deletes survive
  // switching to the SQL Console tab and back, and so console queries see
  // the same "database" the Browse tab shows — otherwise the two tabs would
  // silently diverge, and tab-switching would discard the user's changes.
  const [dataByTable, setDataByTable] = useState<TableData>(
    () => structuredClone(MOCK_ROWS),
  );

  return (
    <>
      <PageHeader
        icon={<DatabaseFill size={20} />}
        title="Database"
        subtitle="Browse Shadow V2 tables, edit records, or run raw SQL against shadow.db."
      />

      <div className="db-tabs">
        <button
          type="button"
          className={`db-tab${tab === "browse" ? " db-tab--active" : ""}`}
          onClick={() => setTab("browse")}
        >
          <Grid3x3GapFill size={14} />
          Browse Tables
        </button>
        <button
          type="button"
          className={`db-tab${tab === "console" ? " db-tab--active" : ""}`}
          onClick={() => setTab("console")}
        >
          <Terminal size={14} />
          SQL Console
        </button>
      </div>

      {tab === "browse" ? (
        <TableBrowser dataByTable={dataByTable} onDataChange={setDataByTable} />
      ) : (
        <SqlConsole dataByTable={dataByTable} />
      )}
    </>
  );
}
