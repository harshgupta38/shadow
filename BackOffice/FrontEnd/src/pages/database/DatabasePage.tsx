import { useState } from "react";
import { DatabaseFill, Grid3x3GapFill, Terminal } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { TableBrowser } from "./TableBrowser";
import { SqlConsole } from "./SqlConsole";

type DbTab = "browse" | "console";

export function DatabasePage() {
  const [tab, setTab] = useState<DbTab>("browse");

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

      {tab === "browse" ? <TableBrowser /> : <SqlConsole />}
    </>
  );
}
